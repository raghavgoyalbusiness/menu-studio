import { z } from "zod";
import { GLASSWARE_TYPES } from "@menu-studio/design-system/catalog";
import {
  CurrencyCode,
  HexColor,
  ItemId,
  LangCode,
  MinorUnits,
  SectionId,
  TimeOfDay,
} from "./common.ts";

export const VENUE_TYPES = ["restaurant", "cafe", "bar", "bakery", "cloud_kitchen"] as const;
export const VenueType = z.enum(VENUE_TYPES);
export type VenueType = z.infer<typeof VenueType>;

export const DIETARY_TAGS = [
  "veg",
  "non_veg",
  "egg",
  "vegan",
  "gluten_free",
  "dairy_free",
  "contains_nuts",
  "spicy_1",
  "spicy_2",
  "spicy_3",
  "jain",
  "halal",
] as const;
export const DietaryTag = z.enum(DIETARY_TAGS);
export type DietaryTag = z.infer<typeof DietaryTag>;

/** The 14 allergens that EU/UK law requires to be declared. */
export const ALLERGENS = [
  "celery",
  "cereals_gluten",
  "crustaceans",
  "eggs",
  "fish",
  "lupin",
  "milk",
  "molluscs",
  "mustard",
  "tree_nuts",
  "peanuts",
  "sesame",
  "soybeans",
  "sulphites",
] as const;
export const Allergen = z.enum(ALLERGENS);
export type Allergen = z.infer<typeof Allergen>;

export const ABV_TIERS = ["zero", "low", "mid", "high"] as const;
export const SERVING_TEMPS = ["hot", "warm", "room", "chilled", "iced", "frozen"] as const;
export const CAFFEINE_LEVELS = ["none", "low", "medium", "high"] as const;
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const MARGIN_TIERS = ["high", "mid", "low"] as const;
export const POPULARITY_LEVELS = ["high", "low"] as const;
export const QUADRANTS = ["star", "plowhorse", "puzzle", "dog"] as const;
export type Quadrant = (typeof QUADRANTS)[number];

/** Item-relative field paths the extractor may mark as inferred. */
export const INFERRABLE_FIELDS = [
  "name",
  "description",
  "price",
  "priceVariants",
  "ingredients",
  "dietaryTags",
  "allergens",
  "attributes.baseSpirit",
  "attributes.glassware",
  "attributes.colorHex",
  "attributes.abvTier",
  "attributes.flavor",
  "attributes.servingTemp",
  "attributes.caffeine",
] as const;
export const InferrableField = z.enum(INFERRABLE_FIELDS);
export type InferrableField = z.infer<typeof InferrableField>;

export const Flavor = z.strictObject({
  sweetBitter: z.number().min(-1).max(1),
  refreshingBoozy: z.number().min(-1).max(1),
});
export type Flavor = z.infer<typeof Flavor>;

export const ItemAttributes = z.strictObject({
  baseSpirit: z.string().min(1).max(40).optional(),
  glassware: z.enum(GLASSWARE_TYPES).optional(),
  colorHex: HexColor.optional(),
  abvTier: z.enum(ABV_TIERS).optional(),
  flavor: Flavor.optional(),
  servingTemp: z.enum(SERVING_TEMPS).optional(),
  caffeine: z.enum(CAFFEINE_LEVELS).optional(),
});
export type ItemAttributes = z.infer<typeof ItemAttributes>;

export const PriceVariant = z.strictObject({
  label: z.string().min(1).max(40),
  price: MinorUnits,
});
export type PriceVariant = z.infer<typeof PriceVariant>;

export const ItemEngineering = z.strictObject({
  costPrice: MinorUnits.optional(),
  unitsSold: z.int().min(0).optional(),
  marginTier: z.enum(MARGIN_TIERS).optional(),
  popularity: z.enum(POPULARITY_LEVELS).optional(),
  quadrant: z.enum(QUADRANTS).optional(),
});
export type ItemEngineering = z.infer<typeof ItemEngineering>;

export const ItemTranslation = z.strictObject({
  name: z.string().min(1).max(160),
  description: z.string().max(500).optional(),
});

export const MenuItem = z.strictObject({
  id: ItemId,
  name: z.string().min(1).max(120),
  description: z.string().max(400).optional(),
  /** Null when the source menu shows no price (market price, "ask your server"). */
  price: MinorUnits.nullable(),
  priceVariants: z.array(PriceVariant).max(6),
  ingredients: z.array(z.string().min(1).max(60)).max(30),
  dietaryTags: z.array(DietaryTag).max(12),
  allergens: z.array(Allergen).max(14),
  attributes: ItemAttributes,
  featured: z.boolean(),
  isNew: z.boolean(),
  isSignature: z.boolean(),
  engineering: ItemEngineering.optional(),
  translations: z.record(LangCode, ItemTranslation).optional(),
  inferredFields: z.array(InferrableField),
  /** 86'd items stay in the data but are hidden on the QR menu. */
  available: z.boolean(),
});
export type MenuItem = z.infer<typeof MenuItem>;

export const SectionAvailability = z.strictObject({
  days: z.array(z.enum(WEEKDAYS)).min(1).max(7),
  startTime: TimeOfDay,
  endTime: TimeOfDay,
});
export type SectionAvailability = z.infer<typeof SectionAvailability>;

export const SectionTranslation = z.strictObject({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});

export const MenuSection = z.strictObject({
  id: SectionId,
  title: z.string().min(1).max(80),
  subtitle: z.string().max(160).optional(),
  description: z.string().max(400).optional(),
  availability: SectionAvailability.optional(),
  translations: z.record(LangCode, SectionTranslation).optional(),
  items: z.array(MenuItem).max(200),
});
export type MenuSection = z.infer<typeof MenuSection>;

export const DEFAULT_ALLERGEN_DISCLAIMER =
  "Please inform staff of any allergies before ordering.";

export const MenuDocument = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(64),
  projectId: z.string().min(1).max(64),
  venueName: z.string().min(1).max(80),
  venueType: VenueType,
  currency: CurrencyCode,
  locale: z.string().min(2).max(35),
  primaryLanguage: LangCode,
  additionalLanguages: z.array(LangCode).max(8),
  taxNote: z.string().max(200).optional(),
  allergenDisclaimer: z.string().max(200).optional(),
  footerNotes: z.array(z.string().min(1).max(200)).max(8),
  sections: z.array(MenuSection).max(40),
});
export type MenuDocument = z.infer<typeof MenuDocument>;
