import {
  applyEdits,
  contentFieldsChanged,
  EDIT_TARGETS,
  limitSentences,
  type Docs,
  type Edit,
  type JsonPatchOp,
  type LayoutSpec,
  type MenuDocument,
} from "@menu-studio/shared";
import { z } from "zod";
import type { Conversion } from "../services/anthropic.ts";
import { menuSummary } from "./menu-summary.ts";

export const EditWire = z.strictObject({
  summary: z.string(),
  clarifyingQuestion: z.string().nullable(),
  unsupported: z.string().nullable(),
  patches: z.array(
    z.strictObject({
      target: z.enum(EDIT_TARGETS),
      ops: z.array(
        z.strictObject({
          op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
          path: z.string(),
          from: z.string().nullable(),
          valueJson: z.string().nullable(),
        }),
      ),
    }),
  ),
});
export type EditWire = z.infer<typeof EditWire>;

export interface EditSelection {
  blockIds: string[];
  itemIds: string[];
}

/** Pointer index so the model never has to count array positions. */
export function pointerIndex(document: MenuDocument, spec: LayoutSpec | null): string {
  const lines = ["Document (target \"document\"):"];
  document.sections.forEach((section, si) => {
    lines.push(`/sections/${si}  ${section.id}  "${section.title}"`);
    section.items.forEach((item, ii) => lines.push(`/sections/${si}/items/${ii}  ${item.id}  "${item.name}"`));
  });
  if (spec) {
    const sectionTitle = new Map(document.sections.map((s) => [s.id, s.title]));
    const itemName = new Map(document.sections.flatMap((s) => s.items.map((i) => [i.id, i.name] as const)));
    lines.push("", "Layout (target \"spec\"):");
    spec.pages.forEach((page, pi) => {
      lines.push(`/pages/${pi}  ${page.id}`);
      page.blocks.forEach((block, bi) => {
        const ref = block.sectionRef
          ? ` → ${block.sectionRef} "${sectionTitle.get(block.sectionRef) ?? "?"}"`
          : block.itemRefs?.length
            ? ` → ${block.itemRefs.map((r) => `"${itemName.get(r) ?? r}"`).join(", ")}`
            : block.noteRef !== undefined
              ? ` → note ${String(block.noteRef)}`
              : "";
        lines.push(`/pages/${pi}/blocks/${bi}  ${block.id}  ${block.type} emphasis=${block.emphasis} col=${block.gridArea.col} row=${block.gridArea.row}${ref}`);
      });
    });
    spec.matrix?.placements.forEach((p, i) => {
      lines.push(`/matrix/placements/${i}  ${p.itemId}  "${itemName.get(p.itemId) ?? "?"}" x=${p.x} y=${p.y}${p.locked ? " locked" : ""}`);
    });
  }
  return lines.join("\n");
}

export function editUserText(input: { document: MenuDocument; spec: LayoutSpec | null; instruction: string; selection: EditSelection }): string {
  return [
    `Instruction: ${input.instruction}`,
    `Selection: blocks [${input.selection.blockIds.join(", ")}], items [${input.selection.itemIds.join(", ")}]`,
    "",
    "Index:",
    pointerIndex(input.document, input.spec),
    "",
    "Menu content summary:",
    menuSummary(input.document),
    "",
    "Current LayoutSpec JSON:",
    JSON.stringify(input.spec),
    "",
    "Current MenuDocument JSON:",
    JSON.stringify(input.document),
  ].join("\n");
}

const ASKS_FOR_CONTENT = /\b(price|prices|cost|costs|cheaper|expensive|£|\$|₹|€|rename|renamed|name|names|call it|title|description|descriptions|describe|wording|word|text|typo|spell|spelling|translate|menu item|add item|remove item|delete item)\b|[£$₹€]/i;

export type EditOutcome =
  | { kind: "clarify"; question: string }
  | { kind: "unsupported"; message: string }
  | { kind: "edits"; edits: Edit[]; docs: Docs; summary: string };

export function convertEdit(wire: EditWire, ctx: { docs: Docs; instruction: string }): Conversion<EditOutcome> {
  if (wire.clarifyingQuestion?.trim() && wire.patches.length === 0) {
    return { ok: true, value: { kind: "clarify", question: limitSentences(wire.clarifyingQuestion, 2) } };
  }
  if (wire.unsupported?.trim() && wire.patches.length === 0) {
    return { ok: true, value: { kind: "unsupported", message: limitSentences(wire.unsupported, 2) } };
  }
  const issues: string[] = [];
  if (!wire.patches.length) issues.push("patches is empty but neither clarifyingQuestion nor unsupported is set.");

  const edits: Edit[] = [];
  wire.patches.forEach((patch, pi) => {
    const ops: JsonPatchOp[] = [];
    patch.ops.forEach((op, oi) => {
      const where = `patches[${pi}].ops[${oi}]`;
      let value: unknown;
      if (op.op === "add" || op.op === "replace" || op.op === "test") {
        if (op.valueJson === null) {
          issues.push(`${where}: ${op.op} needs valueJson.`);
          return;
        }
        try {
          value = JSON.parse(op.valueJson);
        } catch {
          issues.push(`${where}: valueJson is not valid JSON: ${op.valueJson.slice(0, 80)}`);
          return;
        }
      }
      if ((op.op === "move" || op.op === "copy") && !op.from) {
        issues.push(`${where}: ${op.op} needs from.`);
        return;
      }
      switch (op.op) {
        case "add":
        case "replace":
        case "test":
          ops.push({ op: op.op, path: op.path, value });
          break;
        case "remove":
          ops.push({ op: "remove", path: op.path });
          break;
        case "move":
        case "copy":
          ops.push({ op: op.op, from: op.from ?? "", path: op.path });
          break;
      }
    });
    if (ops.length) edits.push({ target: patch.target, ops });
  });
  if (issues.length) return { ok: false, issues };

  const changed = contentFieldsChanged(edits);
  if ((changed.prices || changed.names || changed.descriptions) && !ASKS_FOR_CONTENT.test(ctx.instruction)) {
    const fields = [changed.prices ? "prices" : "", changed.names ? "names" : "", changed.descriptions ? "descriptions" : ""].filter(Boolean).join(", ");
    return { ok: false, issues: [`The instruction did not ask to change ${fields}. Do not change them.`] };
  }

  const result = applyEdits(ctx.docs, edits, { strictRefs: true });
  if (!result.ok) {
    const e = result.error;
    return {
      ok: false,
      issues: [`patches[${e.editIndex}]${e.opIndex !== undefined ? `.ops[${e.opIndex}]` : ""}: ${e.message}`, ...e.issues.slice(0, 15)],
    };
  }
  const summary = limitSentences(wire.summary, 2) || "Updated the menu.";
  return { ok: true, value: { kind: "edits", edits, docs: result.docs, summary } };
}
