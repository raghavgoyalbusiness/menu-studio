import type { Edit } from "../schemas/edit.ts";
import type { LayoutSpec } from "../schemas/layout-spec.ts";
import type { MenuDocument } from "../schemas/menu-document.ts";
import { allItems } from "../menu-helpers.ts";

/**
 * Menu engineering may change emphasis only: never content, never remove anything.
 * Returns human-readable violations (empty when the edits are acceptable).
 */
export function engineeringEditViolations(
  edits: readonly Edit[],
  before: { document: MenuDocument; spec: LayoutSpec },
  after: { document: MenuDocument; spec: LayoutSpec },
): string[] {
  const violations: string[] = [];
  const allowedDocumentPath = /^\/sections\/\d+\/items\/\d+\/(featured|isSignature)$/;
  const allowedSpecPath = /^\/(engineeringApplied|pages\/\d+\/blocks(\/\d+(\/(emphasis|styleOverrides(\/[a-zA-Z]+)?|gridArea(\/[a-zA-Z]+)?))?|\/-)?)$/;

  for (const edit of edits) {
    for (const op of edit.ops) {
      if (op.op === "test") continue;
      const allowed = edit.target === "document" ? allowedDocumentPath : allowedSpecPath;
      if (!allowed.test(op.path)) violations.push(`${edit.target} path ${op.path} is not an emphasis change`);
      if (op.op === "remove" && edit.target === "document") violations.push(`Removing ${op.path} is not allowed`);
      if (op.op === "remove" && /^\/pages\/\d+\/blocks\/\d+$/.test(op.path)) {
        violations.push(`Removing block ${op.path} is not allowed`);
      }
    }
  }

  const beforeItems = new Set(allItems(before.document).map((i) => i.id));
  const afterItems = new Set(allItems(after.document).map((i) => i.id));
  for (const id of beforeItems) if (!afterItems.has(id)) violations.push(`Item ${id} was removed`);

  const referenced = (spec: LayoutSpec) =>
    new Set(spec.pages.flatMap((p) => p.blocks.flatMap((b) => [b.sectionRef ?? "", ...(b.itemRefs ?? [])])).filter(Boolean));
  const beforeRefs = referenced(before.spec);
  const afterRefs = referenced(after.spec);
  for (const ref of beforeRefs) if (!afterRefs.has(ref)) violations.push(`${ref} is no longer shown`);
  return violations;
}

/** Content edits must not change prices, names or descriptions unless the instruction asks. */
export function contentFieldsChanged(edits: readonly Edit[]): { prices: boolean; names: boolean; descriptions: boolean } {
  const ops = edits.filter((e) => e.target === "document").flatMap((e) => e.ops).filter((op) => op.op !== "test");
  const hit = (re: RegExp) => ops.some((op) => re.test(op.path) || ("from" in op && re.test(op.from)));
  return {
    prices: hit(/\/(price|priceVariants)(\/|$)/),
    names: hit(/\/items\/\d+\/name$/),
    descriptions: hit(/\/items\/\d+\/description$/),
  };
}
