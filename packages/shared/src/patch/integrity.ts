import type { LayoutSpec } from "../schemas/layout-spec.ts";
import type { MenuDocument } from "../schemas/menu-document.ts";

export interface IntegrityReport {
  /** Structural problems that make a document invalid (duplicate ids, broken config). */
  errors: string[];
  /** References from the spec to content that no longer exists. Renderers skip them. */
  danglingRefs: string[];
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}

export function documentIntegrity(document: MenuDocument): string[] {
  const errors: string[] = [];
  for (const id of duplicates(document.sections.map((s) => s.id))) errors.push(`Duplicate section id ${id}`);
  const itemIds = document.sections.flatMap((s) => s.items.map((i) => i.id));
  for (const id of duplicates(itemIds)) errors.push(`Duplicate item id ${id}`);
  for (const section of document.sections) {
    for (const item of section.items) {
      if (duplicates(item.dietaryTags).length) errors.push(`Item ${item.id} repeats a dietary tag`);
      if (duplicates(item.allergens).length) errors.push(`Item ${item.id} repeats an allergen`);
      if (duplicates(item.inferredFields).length) errors.push(`Item ${item.id} repeats an inferred field`);
      const spicy = item.dietaryTags.filter((t) => t.startsWith("spicy_"));
      if (spicy.length > 1) errors.push(`Item ${item.id} has more than one spice level`);
      if (item.dietaryTags.includes("veg") && item.dietaryTags.includes("non_veg")) {
        errors.push(`Item ${item.id} cannot be both veg and non_veg`);
      }
    }
  }
  return errors;
}

export function specIntegrity(spec: LayoutSpec, document: MenuDocument): IntegrityReport {
  const errors: string[] = [];
  const danglingRefs: string[] = [];
  const sectionIds = new Set(document.sections.map((s) => s.id));
  const itemIds = new Set(document.sections.flatMap((s) => s.items.map((i) => i.id)));

  for (const id of duplicates(spec.pages.map((p) => p.id))) errors.push(`Duplicate page id ${id}`);
  const blocks = spec.pages.flatMap((p) => p.blocks);
  for (const id of duplicates(blocks.map((b) => b.id))) errors.push(`Duplicate block id ${id}`);

  for (const block of blocks) {
    if (block.sectionRef && !sectionIds.has(block.sectionRef)) {
      danglingRefs.push(`Block ${block.id} references missing section ${block.sectionRef}`);
    }
    for (const ref of block.itemRefs ?? []) {
      if (!itemIds.has(ref)) danglingRefs.push(`Block ${block.id} references missing item ${ref}`);
    }
    if (typeof block.noteRef === "number" && block.noteRef >= document.footerNotes.length) {
      danglingRefs.push(`Block ${block.id} references missing footer note ${block.noteRef}`);
    }
    if (block.gridArea.colSpan > 6 || block.gridArea.col + block.gridArea.colSpan - 1 > 6) {
      errors.push(`Block ${block.id} spans past the 6-column grid`);
    }
  }

  if (spec.matrix) {
    for (const id of duplicates(spec.matrix.placements.map((p) => p.itemId))) {
      errors.push(`Item ${id} is placed on the matrix more than once`);
    }
    for (const placement of spec.matrix.placements) {
      if (!itemIds.has(placement.itemId)) danglingRefs.push(`Matrix placement references missing item ${placement.itemId}`);
    }
  }
  for (const step of spec.journey?.steps ?? []) {
    for (const ref of step.itemRefs) {
      if (!itemIds.has(ref)) danglingRefs.push(`Journey step "${step.label}" references missing item ${ref}`);
    }
  }
  return { errors, danglingRefs };
}
