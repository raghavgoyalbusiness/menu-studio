import { archetypeEligibility } from "./archetypes.ts";
import { resolveOrientation } from "./formats.ts";
import { specIntegrity } from "./patch/integrity.ts";
import type { DesignBrief } from "./schemas/design-brief.ts";
import type { LayoutSpec } from "./schemas/layout-spec.ts";
import type { MenuDocument } from "./schemas/menu-document.ts";

export const CONCEPT_COUNT = 3;

/**
 * Semantic checks on a concept batch, beyond what Zod can express. Every message is
 * written so it can be fed back to the model verbatim on the retry.
 */
export function conceptSetIssues(
  specs: readonly LayoutSpec[],
  document: MenuDocument,
  brief: DesignBrief,
  allowedArchetypes: readonly string[],
): string[] {
  const issues: string[] = [];
  if (specs.length !== CONCEPT_COUNT) issues.push(`Return exactly ${CONCEPT_COUNT} concepts (got ${specs.length}).`);
  const orientation = resolveOrientation(brief.format, brief.orientation);

  specs.forEach((spec, i) => {
    const label = `concepts[${i}] (${spec.conceptName})`;
    if (spec.format !== brief.format) issues.push(`${label}: format must be ${brief.format}.`);
    if (spec.orientation !== orientation) issues.push(`${label}: orientation must be ${orientation}.`);
    if (!allowedArchetypes.includes(spec.archetype)) {
      issues.push(`${label}: archetype ${spec.archetype} is not allowed for this menu. Allowed: ${allowedArchetypes.join(", ")}.`);
    } else {
      const eligibility = archetypeEligibility(spec.archetype, document, brief.format);
      if (!eligibility.eligible) issues.push(`${label}: ${eligibility.reason}.`);
    }
    const report = specIntegrity(spec, document);
    for (const e of [...report.errors, ...report.danglingRefs]) issues.push(`${label}: ${e}.`);
    const sectionIds = new Set(document.sections.filter((s) => s.items.length).map((s) => s.id));
    const shown = new Set<string>();
    for (const b of spec.pages.flatMap((p) => p.blocks)) {
      if (b.sectionRef) shown.add(b.sectionRef);
      for (const ref of b.itemRefs ?? []) {
        const section = document.sections.find((s) => s.items.some((it) => it.id === ref));
        if (section && spec.archetype === "by_base_spirit") shown.add(section.id);
      }
    }
    if (spec.archetype === "tasting_journey" && spec.journey) {
      for (const step of spec.journey.steps) {
        for (const ref of step.itemRefs) {
          const section = document.sections.find((s) => s.items.some((it) => it.id === ref));
          if (section) shown.add(section.id);
        }
      }
    }
    const missing = [...sectionIds].filter((id) => !shown.has(id));
    if (missing.length && spec.archetype !== "flavor_matrix") {
      issues.push(`${label}: every section must appear; missing ${missing.join(", ")}.`);
    }
  });

  for (let a = 0; a < specs.length; a++) {
    for (let b = a + 1; b < specs.length; b++) {
      const x = specs[a];
      const y = specs[b];
      if (!x || !y || x.archetype !== y.archetype) continue;
      const same: string[] = [];
      if (x.tokens.fontPairingId === y.tokens.fontPairingId) same.push("font pairing");
      if (x.tokens.paletteId === y.tokens.paletteId) same.push("palette");
      if (x.tokens.density === y.tokens.density) same.push("density");
      if (same.length) {
        issues.push(
          `concepts[${a}] and concepts[${b}] share archetype ${x.archetype}, so they must differ in font pairing, palette and density; they share ${same.join(", ")}.`,
        );
      }
    }
  }
  return issues;
}
