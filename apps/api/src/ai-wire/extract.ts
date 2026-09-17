import { GLASSWARE_TYPES } from "@menu-studio/design-system/catalog";
import {
  ABV_TIERS,
  ALLERGENS,
  CAFFEINE_LEVELS,
  DIETARY_TAGS,
  documentIntegrity,
  INFERRABLE_FIELDS,
  MenuDocument,
  parseMoney,
  SERVING_TEMPS,
  shortId,
  VENUE_TYPES,
  WEEKDAYS,
  type ExtractionWarning,
  type InferrableField,
  type MenuItem,
  type MenuSection,
} from "@menu-studio/shared";
import { z } from "zod";
import type { Conversion } from "../services/anthropic.ts";

const PriceVariantWire = z.strictObject({
  label: z.string(),
  priceText: z.string().nullable(),
  priceMinor: z.number().nullable(),
});

const ItemWire = z.strictObject({
  name: z.string(),
  description: z.string().nullable(),
  priceText: z.string().nullable(),
  priceMinor: z.number().nullable(),
  priceVariants: z.array(PriceVariantWire),
  ingredients: z.array(z.string()),
  dietaryTags: z.array(z.enum(DIETARY_TAGS)),
  allergens: z.array(z.enum(ALLERGENS)),
  attributes: z.strictObject({
    baseSpirit: z.string().nullable(),
    glassware: z.enum(GLASSWARE_TYPES).nullable(),
    colorHex: z.string().nullable(),
    abvTier: z.enum(ABV_TIERS).nullable(),
    flavor: z.strictObject({ sweetBitter: z.number(), refreshingBoozy: z.number() }).nullable(),
    servingTemp: z.enum(SERVING_TEMPS).nullable(),
    caffeine: z.enum(CAFFEINE_LEVELS).nullable(),
  }),
  featured: z.boolean(),
  isNew: z.boolean(),
  isSignature: z.boolean(),
  inferredFields: z.array(z.enum(INFERRABLE_FIELDS)),
  unreadable: z.boolean(),
});

export const ExtractWire = z.strictObject({
  venueName: z.string(),
  venueType: z.enum(VENUE_TYPES),
  currency: z.string().nullable(),
  primaryLanguage: z.string(),
  taxNote: z.string().nullable(),
  footerNotes: z.array(z.string()),
  sections: z.array(
    z.strictObject({
      title: z.string(),
      subtitle: z.string().nullable(),
      description: z.string().nullable(),
      availability: z.strictObject({ days: z.array(z.enum(WEEKDAYS)), startTime: z.string(), endTime: z.string() }).nullable(),
      items: z.array(ItemWire),
    }),
  ),
  notes: z.array(z.string()),
});
export type ExtractWire = z.infer<typeof ExtractWire>;

export interface ExtractConversionContext {
  projectId: string;
  venueName: string;
  fallbackCurrency: string;
  locale: string;
  /** Raw source text when extracting from pasted text; used to verify item names. */
  sourceText: string | null;
}

export interface ExtractResult {
  document: MenuDocument;
  warnings: ExtractionWarning[];
}

const clamp = (n: number) => Math.max(-1, Math.min(1, Math.round(n * 100) / 100));
const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const trimOrUndefined = (s: string | null | undefined) => (s && s.trim() ? s.trim() : undefined);

/**
 * Prices are cross-checked in code: the printed text is parsed deterministically and wins
 * over the model's own minor-unit arithmetic. Disagreements are flagged for review.
 */
function resolvePrice(text: string | null, minor: number | null, currency: string, inferred: Set<InferrableField>): number | null {
  const parsed = text ? parseMoney(text, currency) : null;
  if (parsed !== null) {
    if (minor !== null && Number.isInteger(minor) && minor !== parsed) inferred.add("price");
    return parsed;
  }
  if (minor !== null && Number.isInteger(minor) && minor >= 0) {
    if (text) inferred.add("price");
    return minor;
  }
  return null;
}

export function convertExtraction(wire: ExtractWire, ctx: ExtractConversionContext): Conversion<ExtractResult> {
  const warnings: ExtractionWarning[] = [];
  const issues: string[] = [];
  const currency = wire.currency && /^[A-Z]{3}$/.test(wire.currency.trim().toUpperCase()) ? wire.currency.trim().toUpperCase() : null;
  if (!currency) {
    warnings.push({ code: "currency_unknown", message: `The currency was not clear, so ${ctx.fallbackCurrency} from your venue settings was used.` });
  }
  const docCurrency = currency ?? ctx.fallbackCurrency;
  const source = ctx.sourceText ? normalize(ctx.sourceText) : null;
  const takenIds = new Set<string>();
  const mint = (prefix: "sec" | "itm") => {
    let id = shortId(prefix);
    while (takenIds.has(id)) id = shortId(prefix);
    takenIds.add(id);
    return id;
  };

  if (!wire.sections.length) issues.push("sections is empty: return every section on the menu.");

  const sections: MenuSection[] = wire.sections.map((s, si) => {
    const sectionId = mint("sec");
    if (!s.items.length) warnings.push({ code: "empty_section", message: `"${s.title}" has no items.`, sectionId });
    const seenNames = new Map<string, number>();
    const items: MenuItem[] = s.items.map((it, ii) => {
      const inferred = new Set<InferrableField>(it.inferredFields);
      const itemId = mint("itm");
      const name = it.name.trim() || `Item ${ii + 1}`;
      if (it.unreadable) {
        inferred.add("name");
        warnings.push({ code: "unreadable", message: `"${name}" in ${s.title} was hard to read. Please check it.`, itemId, sectionId });
      }
      if (source && !source.includes(normalize(name))) {
        inferred.add("name");
        warnings.push({ code: "unreadable", message: `"${name}" does not appear in the pasted text. Please check it.`, itemId, sectionId });
      }
      const key = normalize(name);
      seenNames.set(key, (seenNames.get(key) ?? 0) + 1);
      if ((seenNames.get(key) ?? 0) === 2) warnings.push({ code: "duplicate_name", message: `"${name}" appears more than once in ${s.title}.`, itemId, sectionId });

      const priceVariants = it.priceVariants
        .map((v) => ({ label: v.label.trim(), price: resolvePrice(v.priceText, v.priceMinor, docCurrency, inferred) }))
        .filter((v): v is { label: string; price: number } => v.label.length > 0 && v.price !== null)
        .slice(0, 6);
      let price = resolvePrice(it.priceText, it.priceMinor, docCurrency, inferred);
      if (price === null && priceVariants[0]) price = priceVariants[0].price;
      if (price === null) warnings.push({ code: "missing_price", message: `"${name}" has no price.`, itemId, sectionId });

      const a = it.attributes;
      const attributes: MenuItem["attributes"] = {};
      if (trimOrUndefined(a.baseSpirit)) attributes.baseSpirit = a.baseSpirit?.trim().slice(0, 40) ?? "";
      if (a.glassware) attributes.glassware = a.glassware;
      if (a.colorHex && /^#[0-9a-fA-F]{6}$/.test(a.colorHex)) {
        attributes.colorHex = a.colorHex.toUpperCase();
        inferred.add("attributes.colorHex");
      }
      if (a.abvTier) attributes.abvTier = a.abvTier;
      if (a.flavor) {
        attributes.flavor = { sweetBitter: clamp(a.flavor.sweetBitter), refreshingBoozy: clamp(a.flavor.refreshingBoozy) };
        inferred.add("attributes.flavor");
      }
      if (a.servingTemp) attributes.servingTemp = a.servingTemp;
      if (a.caffeine) attributes.caffeine = a.caffeine;

      const item: MenuItem = {
        id: itemId,
        name: name.slice(0, 120),
        price,
        priceVariants,
        ingredients: [...new Set(it.ingredients.map((x) => x.trim()).filter(Boolean))].slice(0, 30).map((x) => x.slice(0, 60)),
        dietaryTags: [...new Set(it.dietaryTags)],
        allergens: [...new Set(it.allergens)],
        attributes,
        featured: it.featured,
        isNew: it.isNew,
        isSignature: it.isSignature,
        inferredFields: [...inferred].filter((f) => f !== "priceVariants" || priceVariants.length > 0),
        available: true,
      };
      const description = trimOrUndefined(it.description);
      if (description) item.description = description.slice(0, 400);
      // Keep only one spice level and never veg + non_veg together.
      const spice = item.dietaryTags.filter((t) => t.startsWith("spicy_"));
      if (spice.length > 1) item.dietaryTags = item.dietaryTags.filter((t) => !t.startsWith("spicy_") || t === spice[spice.length - 1]);
      if (item.dietaryTags.includes("veg") && item.dietaryTags.includes("non_veg")) {
        issues.push(`sections[${si}].items[${ii}] (${name}): dietaryTags cannot contain both veg and non_veg.`);
      }
      return item;
    });

    const section: MenuSection = { id: sectionId, title: (s.title.trim() || "Menu").slice(0, 80), items };
    if (trimOrUndefined(s.subtitle)) section.subtitle = s.subtitle?.trim().slice(0, 160) ?? "";
    if (trimOrUndefined(s.description)) section.description = s.description?.trim().slice(0, 400) ?? "";
    if (s.availability && s.availability.days.length) {
      const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (hhmm.test(s.availability.startTime) && hhmm.test(s.availability.endTime)) {
        section.availability = { days: [...new Set(s.availability.days)], startTime: s.availability.startTime, endTime: s.availability.endTime };
      } else {
        issues.push(`sections[${si}].availability: times must be 24-hour HH:MM.`);
      }
    }
    return section;
  });

  const document: MenuDocument = {
    schemaVersion: 1,
    id: `doc-${ctx.projectId}`,
    projectId: ctx.projectId,
    venueName: (wire.venueName.trim() || ctx.venueName).slice(0, 80),
    venueType: wire.venueType,
    currency: docCurrency,
    locale: ctx.locale,
    primaryLanguage: /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(wire.primaryLanguage) ? wire.primaryLanguage : "en",
    additionalLanguages: [],
    footerNotes: wire.footerNotes.map((n) => n.trim()).filter(Boolean).slice(0, 8).map((n) => n.slice(0, 200)),
    sections,
  };
  if (trimOrUndefined(wire.taxNote)) document.taxNote = wire.taxNote?.trim().slice(0, 200) ?? "";
  for (const note of wire.notes.slice(0, 5)) {
    if (note.trim()) warnings.push({ code: "unreadable", message: note.trim().slice(0, 300) });
  }

  const parsed = MenuDocument.safeParse(document);
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  } else {
    issues.push(...documentIntegrity(parsed.data));
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { document: parsed.success ? parsed.data : document, warnings } };
}
