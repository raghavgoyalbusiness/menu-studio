import { GLASSWARE_TYPES } from "@menu-studio/design-system/catalog";
import {
  ABV_TIERS,
  ALLERGENS,
  CAFFEINE_LEVELS,
  DIETARY_TAGS,
  documentIntegrity,
  MenuDocument,
  parseMoney,
  SERVING_TEMPS,
  shortId,
  VENUE_TYPES,
  type ExtractionWarning,
  type InferrableField,
  type MenuItem,
  type MenuSection,
} from "@menu-studio/shared";
import { z } from "zod";
import type { Conversion } from "../services/anthropic.ts";

/**
 * Drafting a menu from a description is the one place the model proposes content rather than
 * reading it. Two things keep that honest, and both are enforced here rather than only asked for
 * in the prompt:
 *
 *   1. There is no price field on the wire, and any amount smuggled into a name or description is
 *      rejected. The owner prices their own food.
 *   2. Every field the model produced is marked inferred, so the review screen makes the owner
 *      confirm or reject each one before it can reach a printed or published menu.
 */

const DraftItemWire = z.strictObject({
  name: z.string(),
  description: z.string().nullable(),
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
});

export const DraftWire = z.strictObject({
  venueType: z.enum(VENUE_TYPES),
  primaryLanguage: z.string(),
  sections: z.array(
    z.strictObject({
      title: z.string(),
      subtitle: z.string().nullable(),
      items: z.array(DraftItemWire),
    }),
  ),
  notes: z.array(z.string()),
});
export type DraftWire = z.infer<typeof DraftWire>;

export interface DraftConversionContext {
  projectId: string;
  venueName: string;
  currency: string;
  locale: string;
  /** The owner's own words, kept so the review screen can show what was asked for. */
  description: string;
}

export interface DraftResult {
  document: MenuDocument;
  warnings: ExtractionWarning[];
  notes: string[];
}

const clamp = (n: number) => Math.max(-1, Math.min(1, Math.round(n * 100) / 100));
const trimOrUndefined = (s: string | null | undefined) => (s && s.trim() ? s.trim() : undefined);

/** A number with a currency symbol, or a bare decimal that reads as money. */
function looksPriced(text: string, currency: string): boolean {
  if (/[$£€¥₹₩฿]|\b(?:USD|GBP|EUR|INR|JPY|AED|SGD|AUD|CAD)\b/i.test(text)) return true;
  return /(?:^|\s)\d+[.,]\d{2}(?:\s|$)/.test(text) && parseMoney(text, currency) !== null;
}

export function convertDraft(wire: DraftWire, ctx: DraftConversionContext): Conversion<DraftResult> {
  const warnings: ExtractionWarning[] = [];
  const issues: string[] = [];
  const takenIds = new Set<string>();
  const mint = (prefix: "sec" | "itm") => {
    let id = shortId(prefix);
    while (takenIds.has(id)) id = shortId(prefix);
    takenIds.add(id);
    return id;
  };

  // A refusal is a legitimate answer here: the description was too thin to draft honestly.
  if (!wire.sections.length) {
    const empty = MenuDocument.safeParse(baseDocument(ctx, wire, []));
    if (!empty.success) return { ok: false, issues: empty.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    const notes = wire.notes.length ? wire.notes : ["That description was too general to draft a menu from. Say what you cook, roughly how many dishes you want, and anything that has to be on it."];
    return { ok: true, value: { document: empty.data, warnings, notes } };
  }

  const sections: MenuSection[] = wire.sections.map((s) => {
    const items: MenuItem[] = s.items.map((item) => {
      const name = item.name.trim();
      const description = trimOrUndefined(item.description);
      if (looksPriced(name, ctx.currency)) issues.push(`sections item "${name}": a price appears in the name. Never include prices; the owner sets them.`);
      if (description && looksPriced(description, ctx.currency)) issues.push(`sections item "${name}": a price appears in the description. Never include prices; the owner sets them.`);

      // Everything here came from the model, so everything here is marked as a guess.
      const inferred: InferrableField[] = ["name"];
      if (description) inferred.push("description");
      if (item.ingredients.length) inferred.push("ingredients");
      if (item.dietaryTags.length) inferred.push("dietaryTags");
      if (item.allergens.length) inferred.push("allergens");

      const attributes: MenuItem["attributes"] = {};
      if (item.attributes.baseSpirit) {
        attributes.baseSpirit = item.attributes.baseSpirit;
        inferred.push("attributes.baseSpirit");
      }
      if (item.attributes.glassware) {
        attributes.glassware = item.attributes.glassware;
        inferred.push("attributes.glassware");
      }
      if (item.attributes.colorHex && /^#[0-9a-fA-F]{6}$/.test(item.attributes.colorHex)) {
        attributes.colorHex = item.attributes.colorHex.toUpperCase();
        inferred.push("attributes.colorHex");
      }
      if (item.attributes.abvTier) {
        attributes.abvTier = item.attributes.abvTier;
        inferred.push("attributes.abvTier");
      }
      if (item.attributes.flavor) {
        attributes.flavor = { sweetBitter: clamp(item.attributes.flavor.sweetBitter), refreshingBoozy: clamp(item.attributes.flavor.refreshingBoozy) };
        inferred.push("attributes.flavor");
      }
      if (item.attributes.servingTemp) {
        attributes.servingTemp = item.attributes.servingTemp;
        inferred.push("attributes.servingTemp");
      }
      if (item.attributes.caffeine) {
        attributes.caffeine = item.attributes.caffeine;
        inferred.push("attributes.caffeine");
      }

      const id = mint("itm");
      warnings.push({ code: "missing_price", message: `${name} has no price yet.`, itemId: id });
      return {
        id,
        name,
        ...(description ? { description } : {}),
        price: null,
        priceVariants: [],
        ingredients: item.ingredients.map((i) => i.trim()).filter(Boolean),
        dietaryTags: item.dietaryTags,
        allergens: item.allergens,
        attributes,
        featured: false,
        isNew: false,
        isSignature: false,
        inferredFields: inferred,
        available: true,
      } satisfies MenuItem;
    });

    if (!items.length) issues.push(`section "${s.title}" has no items.`);
    const sectionId = mint("sec");
    return { id: sectionId, title: s.title.trim(), ...(trimOrUndefined(s.subtitle) ? { subtitle: trimOrUndefined(s.subtitle) } : {}), items } satisfies MenuSection;
  });

  const parsed = MenuDocument.safeParse(baseDocument(ctx, wire, sections));
  if (!parsed.success) return { ok: false, issues: [...issues, ...parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)] };
  issues.push(...documentIntegrity(parsed.data));
  if (issues.length) return { ok: false, issues };

  return { ok: true, value: { document: parsed.data, warnings, notes: wire.notes.map((n) => n.trim()).filter(Boolean).slice(0, 6) } };
}

function baseDocument(ctx: DraftConversionContext, wire: DraftWire, sections: MenuSection[]): unknown {
  return {
    schemaVersion: 1,
    id: `doc-${ctx.projectId}`,
    projectId: ctx.projectId,
    venueName: ctx.venueName.slice(0, 80),
    venueType: wire.venueType,
    currency: ctx.currency,
    locale: ctx.locale,
    primaryLanguage: /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(wire.primaryLanguage) ? wire.primaryLanguage : "en",
    additionalLanguages: [],
    footerNotes: [],
    sections,
  };
}
