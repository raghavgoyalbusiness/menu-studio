import { z } from "zod";
import { FONT_PAIRING_IDS, VIBE_KEYWORDS } from "@menu-studio/design-system/catalog";
import { FormatId } from "../formats.ts";
import { HexColor, Orientation } from "./common.ts";

export const PRICE_TIERS = ["casual", "mid", "premium", "fine_dining"] as const;
export const PriceTier = z.enum(PRICE_TIERS);

export const PageCountPreference = z.union([
  z.literal("single"),
  z.literal("fit_content"),
  z.int().min(1).max(24),
]);
export type PageCountPreference = z.infer<typeof PageCountPreference>;

export const TYPOGRAPHY_MOODS = ["classic_serif", "modern_serif", "geometric_sans", "humanist_sans", "handwritten", "display_bold", "calligraphic"] as const;
export const PALETTE_MOODS = ["light_neutral", "dark_moody", "warm_earthy", "cool_fresh", "bold_contrast", "pastel"] as const;
export const DENSITY_MOODS = ["airy", "balanced", "dense"] as const;
export const LAYOUT_PATTERNS = ["single_column", "two_column", "grid", "editorial_asymmetric", "poster", "board"] as const;

/** Style descriptors extracted from owner reference images. Enums only: never a copyable layout. */
export const StyleDescriptors = z.strictObject({
  typographyMood: z.enum(TYPOGRAPHY_MOODS),
  paletteMood: z.enum(PALETTE_MOODS),
  density: z.enum(DENSITY_MOODS),
  layoutPattern: z.enum(LAYOUT_PATTERNS),
  ornamentLevel: z.enum(["none", "subtle", "rich"]),
  vibeKeywords: z.array(z.enum(VIBE_KEYWORDS)).max(4),
});
export type StyleDescriptors = z.infer<typeof StyleDescriptors>;

export const BrandAssets = z.strictObject({
  logoUrl: z.string().max(500).optional(),
  brandColors: z.array(HexColor).max(6),
  brandFonts: z.array(z.enum(FONT_PAIRING_IDS)).max(3),
});

export const DesignBrief = z.strictObject({
  schemaVersion: z.literal(1),
  format: FormatId,
  orientation: Orientation,
  pageCountPreference: PageCountPreference,
  minimalToMaximal: z.int().min(0).max(100),
  classicToExperimental: z.int().min(0).max(100),
  vibeKeywords: z.array(z.enum(VIBE_KEYWORDS)).max(6),
  cuisine: z.string().max(60).optional(),
  priceTier: PriceTier,
  brandAssets: BrandAssets.optional(),
  mustInclude: z.string().max(500).optional(),
  avoid: z.string().max(500).optional(),
  referenceImageUrls: z.array(z.string().max(500)).max(6),
  referenceStyle: StyleDescriptors.optional(),
});
export type DesignBrief = z.infer<typeof DesignBrief>;

export function defaultBrief(overrides: Partial<DesignBrief> = {}): DesignBrief {
  return {
    schemaVersion: 1,
    format: "A4",
    orientation: "portrait",
    pageCountPreference: "fit_content",
    minimalToMaximal: 40,
    classicToExperimental: 40,
    vibeKeywords: [],
    priceTier: "mid",
    referenceImageUrls: [],
    ...overrides,
  };
}
