import jsonPatch, { type Operation } from "fast-json-patch";
import type { z } from "zod";
import { Edit, type EditTarget, type JsonPatchOp } from "../schemas/edit.ts";
import { LayoutSpec } from "../schemas/layout-spec.ts";
import { MenuDocument } from "../schemas/menu-document.ts";
import { documentIntegrity, specIntegrity } from "./integrity.ts";

export interface Docs {
  document: MenuDocument;
  spec: LayoutSpec | null;
}

export type EditErrorCode =
  | "invalid_edit"
  | "forbidden_path"
  | "patch_failed"
  | "test_failed"
  | "schema"
  | "integrity"
  | "no_spec";

export interface EditError {
  code: EditErrorCode;
  message: string;
  editIndex: number;
  opIndex?: number;
  issues: string[];
}

export type EditResult = { ok: true; docs: Docs; danglingRefs: string[] } | { ok: false; error: EditError };

export interface ApplyOptions {
  /**
   * Reject spec edits that leave references to missing content. Content edits never
   * fail on dangling refs: deleting an item must not require touching the spec.
   */
  strictRefs: boolean;
}

const FORBIDDEN: Record<EditTarget, RegExp[]> = {
  document: [/^\/schemaVersion$/, /^\/id$/, /^\/projectId$/, /^\/sections\/[^/]+\/id$/, /^\/sections\/[^/]+\/items\/[^/]+\/id$/],
  spec: [/^\/schemaVersion$/, /^\/id$/, /^\/pages\/[^/]+\/id$/, /^\/pages\/[^/]+\/blocks\/[^/]+\/id$/],
};

function touchedPaths(op: JsonPatchOp): string[] {
  if (op.op === "test") return [];
  if (op.op === "move") return [op.from, op.path];
  return [op.path];
}

export function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`);
}

function fail(code: EditErrorCode, message: string, editIndex: number, issues: string[] = [], opIndex?: number): EditResult {
  const error: EditError = { code, message, editIndex, issues };
  if (opIndex !== undefined) error.opIndex = opIndex;
  return { ok: false, error };
}

/**
 * Apply edits atomically. Every edit targets one document; the result is re-validated
 * with Zod and checked for integrity before it is returned. Inputs are never mutated.
 */
export function applyEdits(docs: Docs, edits: readonly unknown[], options: ApplyOptions = { strictRefs: false }): EditResult {
  let document: unknown = docs.document;
  let spec: unknown = docs.spec;
  let specTouched = false;

  for (const [editIndex, raw] of edits.entries()) {
    const parsed = Edit.safeParse(raw);
    if (!parsed.success) return fail("invalid_edit", "Edit is not a valid JSON Patch envelope", editIndex, zodIssues(parsed.error));
    const edit = parsed.data;
    if (edit.target === "spec" && spec === null) return fail("no_spec", "There is no layout to edit yet", editIndex);

    for (const [opIndex, op] of edit.ops.entries()) {
      for (const path of touchedPaths(op)) {
        if (FORBIDDEN[edit.target].some((re) => re.test(path))) {
          return fail("forbidden_path", `Ids and schema versions cannot be edited (${path})`, editIndex, [], opIndex);
        }
      }
    }

    const current = edit.target === "document" ? document : spec;
    try {
      const result = jsonPatch.applyPatch(current, edit.ops as Operation[], true, false, true);
      if (edit.target === "document") document = result.newDocument;
      else {
        spec = result.newDocument;
        specTouched = true;
      }
    } catch (err) {
      const e = err as { name?: string; message?: string; index?: number };
      const isTest = e.name === "TEST_OPERATION_FAILED" || /Test operation failed/i.test(e.message ?? "");
      return fail(
        isTest ? "test_failed" : "patch_failed",
        isTest ? "The document changed since this edit was made" : (e.message ?? "Patch failed").split("\n")[0] ?? "Patch failed",
        editIndex,
        [],
        e.index,
      );
    }
  }

  const docResult = MenuDocument.safeParse(document);
  if (!docResult.success) return fail("schema", "The menu content is no longer valid", edits.length - 1, zodIssues(docResult.error));
  const docErrors = documentIntegrity(docResult.data);
  if (docErrors.length) return fail("integrity", "The menu content has conflicting ids or tags", edits.length - 1, docErrors);

  let nextSpec: LayoutSpec | null = null;
  let danglingRefs: string[] = [];
  if (spec !== null) {
    const specResult = LayoutSpec.safeParse(spec);
    if (!specResult.success) return fail("schema", "The layout is no longer valid", edits.length - 1, zodIssues(specResult.error));
    const report = specIntegrity(specResult.data, docResult.data);
    if (report.errors.length) return fail("integrity", "The layout has conflicting ids", edits.length - 1, report.errors);
    if (options.strictRefs && specTouched && report.danglingRefs.length) {
      return fail("integrity", "The layout references content that does not exist", edits.length - 1, report.danglingRefs);
    }
    danglingRefs = report.danglingRefs;
    nextSpec = specResult.data;
  }
  return { ok: true, docs: { document: docResult.data, spec: nextSpec }, danglingRefs };
}

/**
 * The edit that reverts `after` back to `before` for one target, guarded by `test`
 * ops so it refuses to apply if a later edit changed the same values.
 */
export function inverseEdit(before: unknown, after: unknown, target: EditTarget): Edit | null {
  const ops = jsonPatch.compare(after as object, before as object) as JsonPatchOp[];
  if (!ops.length) return null;
  const guarded: JsonPatchOp[] = [];
  for (const op of ops) {
    if (op.op === "replace" || op.op === "remove") {
      guarded.push({ op: "test", path: op.path, value: jsonPatch.getValueByPointer(after, op.path) });
    }
    guarded.push(op);
  }
  return { target, ops: guarded };
}

export function diffEdit(before: unknown, after: unknown, target: EditTarget): Edit | null {
  const ops = jsonPatch.compare(before as object, after as object) as JsonPatchOp[];
  return ops.length ? { target, ops } : null;
}

export function getByPointer(document: unknown, pointer: string): unknown {
  try {
    return jsonPatch.getValueByPointer(document, pointer);
  } catch {
    return undefined;
  }
}

export function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
