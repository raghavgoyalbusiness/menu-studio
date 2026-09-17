import { FONT_PAIRING_IDS, FONT_PAIRINGS, type FontPairingId, type Script } from "@menu-studio/design-system/catalog";
import { scriptForLanguage } from "@menu-studio/i18n";
import {
  diffEdit,
  limitChars,
  MenuDocument,
  StyleDescriptors,
  type Edit,
  type LayoutSpec,
  type QuadrantResult,
} from "@menu-studio/shared";
import { z } from "zod";
import type { Conversion } from "../services/anthropic.ts";

// ---------------------------------------------------------------------------
// Translate
// ---------------------------------------------------------------------------

export const TranslateWire = z.strictObject({
  items: z.array(z.strictObject({ itemId: z.string(), lang: z.string(), name: z.string(), description: z.string().nullable() })),
  sections: z.array(z.strictObject({ sectionId: z.string(), lang: z.string(), title: z.string(), subtitle: z.string().nullable() })),
});
export type TranslateWire = z.infer<typeof TranslateWire>;

export function translateUserText(document: MenuDocument, languages: string[]): string {
  const source = {
    sourceLanguage: document.primaryLanguage,
    targetLanguages: languages,
    venueType: document.venueType,
    sections: document.sections.map((s) => ({
      sectionId: s.id,
      title: s.title,
      subtitle: s.subtitle ?? null,
      items: s.items.map((i) => ({ itemId: i.id, name: i.name, description: i.description ?? null })),
    })),
  };
  return `Translate this menu.\n${JSON.stringify(source)}`;
}

export function convertTranslation(wire: TranslateWire, ctx: { document: MenuDocument; languages: string[] }): Conversion<{ document: MenuDocument; edit: Edit | null }> {
  const issues: string[] = [];
  const next = structuredClone(ctx.document);
  const items = new Map(next.sections.flatMap((s) => s.items.map((i) => [i.id, i] as const)));
  const sections = new Map(next.sections.map((s) => [s.id, s] as const));
  const seenItems = new Set<string>();
  const seenSections = new Set<string>();

  for (const entry of wire.items) {
    const item = items.get(entry.itemId);
    if (!item || !ctx.languages.includes(entry.lang)) continue;
    if (!entry.name.trim()) {
      issues.push(`items: ${entry.itemId} (${entry.lang}) has an empty name.`);
      continue;
    }
    item.translations = { ...item.translations, [entry.lang]: entry.description?.trim() ? { name: limitChars(entry.name.trim(), 160), description: limitChars(entry.description.trim(), 500) } : { name: limitChars(entry.name.trim(), 160) } };
    seenItems.add(`${entry.itemId}:${entry.lang}`);
  }
  for (const entry of wire.sections) {
    const section = sections.get(entry.sectionId);
    if (!section || !ctx.languages.includes(entry.lang) || !entry.title.trim()) continue;
    section.translations = { ...section.translations, [entry.lang]: entry.subtitle?.trim() ? { title: limitChars(entry.title.trim(), 120), subtitle: limitChars(entry.subtitle.trim(), 200) } : { title: limitChars(entry.title.trim(), 120) } };
    seenSections.add(`${entry.sectionId}:${entry.lang}`);
  }
  for (const lang of ctx.languages) {
    const missingItems = [...items.keys()].filter((id) => !seenItems.has(`${id}:${lang}`));
    const missingSections = [...sections.keys()].filter((id) => !seenSections.has(`${id}:${lang}`));
    if (missingItems.length) issues.push(`Missing ${lang} translations for items: ${missingItems.join(", ")}.`);
    if (missingSections.length) issues.push(`Missing ${lang} translations for sections: ${missingSections.join(", ")}.`);
  }
  next.additionalLanguages = [...new Set([...next.additionalLanguages, ...ctx.languages])].filter((l) => l !== next.primaryLanguage).slice(0, 8);
  const parsed = MenuDocument.safeParse(next);
  if (!parsed.success) issues.push(...parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  if (issues.length) return { ok: false, issues };
  const document = parsed.success ? parsed.data : next;
  return { ok: true, value: { document, edit: diffEdit(ctx.document, document, "document") } };
}

/** Warn when the chosen pairing cannot render a target language's script, and suggest ones that can. */
export function fontWarningFor(spec: LayoutSpec | null, languages: string[]): { message: string; suggestedPairingIds: FontPairingId[] } | null {
  if (!spec) return null;
  const needed = [...new Set(languages.map(scriptForLanguage))].filter((s): s is Script => s !== "latin");
  const pairing = FONT_PAIRINGS[spec.tokens.fontPairingId];
  const missing = needed.filter((s) => !pairing.scripts.includes(s));
  if (!missing.length) return null;
  const suggestions = FONT_PAIRING_IDS.filter((id) => missing.every((s) => FONT_PAIRINGS[id].scripts.includes(s)));
  return {
    message: `${pairing.name} does not include ${missing.join(" or ")} characters. Switch to a pairing that does so translated text renders correctly.`,
    suggestedPairingIds: suggestions,
  };
}

// ---------------------------------------------------------------------------
// Engineering
// ---------------------------------------------------------------------------

export const EngineeringWire = z.strictObject({
  suggestions: z.array(z.strictObject({ itemId: z.string(), message: z.string() })),
});
export type EngineeringWire = z.infer<typeof EngineeringWire>;

export function engineeringUserText(results: QuadrantResult[], currency: string): string {
  return `Currency: ${currency} (margins in minor units).\nItems:\n${results
    .map((r) => `- ${r.itemId} "${r.name}": ${r.quadrant}, margin ${r.contributionMargin} (${r.marginTier}), popularity ${r.popularity}`)
    .join("\n")}`;
}

const REMOVAL_WORDS = /\b(remove|delete|drop|discontinue|cut it|take it off|eliminate|86 it)\b/i;

export function convertEngineering(wire: EngineeringWire, results: QuadrantResult[]): Conversion<{ itemId: string; message: string }[]> {
  const known = new Set(results.map((r) => r.itemId));
  const issues: string[] = [];
  const out: { itemId: string; message: string }[] = [];
  for (const s of wire.suggestions) {
    if (!known.has(s.itemId)) continue;
    if (REMOVAL_WORDS.test(s.message)) {
      issues.push(`Suggestion for ${s.itemId} recommends removing the item. Rewrite it without removal.`);
      continue;
    }
    out.push({ itemId: s.itemId, message: limitChars(s.message.trim(), 220) });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: out };
}

// ---------------------------------------------------------------------------
// Describe reference
// ---------------------------------------------------------------------------

export const DescribeWire = StyleDescriptors;
