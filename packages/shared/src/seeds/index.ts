import { buildDefaultSpec, sequentialIds } from "../layout/default-spec.ts";
import { defaultBrief, type DesignBrief } from "../schemas/design-brief.ts";
import type { LayoutSpec } from "../schemas/layout-spec.ts";
import type { MenuDocument } from "../schemas/menu-document.ts";
import { bistroParis } from "./bistro-paris.ts";
import { cafeBangalore } from "./cafe-bangalore.ts";
import { cocktailBarLondon } from "./cocktail-bar-london.ts";
import { restaurantDelhi } from "./restaurant-delhi.ts";

export const SEED_IDS = ["cocktail-bar-london", "cafe-bangalore", "restaurant-delhi", "bistro-paris"] as const;
export type SeedId = (typeof SEED_IDS)[number];

export interface Seed {
  id: SeedId;
  label: string;
  city: string;
  country: string;
  timezone: string;
  document: MenuDocument;
  brief: DesignBrief;
  spec: LayoutSpec;
}

function seed(
  id: SeedId,
  label: string,
  place: { city: string; country: string; timezone: string },
  document: MenuDocument,
  brief: DesignBrief,
  spec: Omit<Parameters<typeof buildDefaultSpec>[0], "document" | "format" | "orientation" | "ids">,
  idTag: string,
): Seed {
  return {
    id,
    label,
    ...place,
    document,
    brief,
    spec: buildDefaultSpec({
      ...spec,
      document,
      format: brief.format,
      orientation: brief.orientation,
      pageCountPreference: brief.pageCountPreference,
      ids: sequentialIds(idTag),
      specId: `seed-spec-${id}`,
    }),
  };
}

export const SEEDS: Record<SeedId, Seed> = {
  "cocktail-bar-london": seed(
    "cocktail-bar-london",
    "Japanese-inspired cocktail bar",
    { city: "London", country: "GB", timezone: "Europe/London" },
    cocktailBarLondon,
    defaultBrief({ vibeKeywords: ["japanese_minimal", "speakeasy"], minimalToMaximal: 30, classicToExperimental: 70, priceTier: "premium" }),
    {
      archetype: "flavor_matrix",
      tokens: { fontPairingId: "zen-minimal", paletteId: "sumi-night", iconSet: "glassware", ornamentStyle: "hairline", density: "balanced", priceStyle: "no_decimals" },
      conceptName: "Night Garden Map",
      rationale: "Guests find a drink by taste before they read a name. Glassware and colour make the list feel like the bar itself.",
    },
    "ya",
  ),
  "cafe-bangalore": seed(
    "cafe-bangalore",
    "Specialty cafe",
    { city: "Bangalore", country: "IN", timezone: "Asia/Kolkata" },
    cafeBangalore,
    defaultBrief({ vibeKeywords: ["botanical", "modern_indian"], minimalToMaximal: 45, classicToExperimental: 50, priceTier: "mid" }),
    {
      archetype: "grid_cards",
      tokens: { fontPairingId: "geometric", paletteId: "espresso", iconSet: "dietary_only", ornamentStyle: "none", density: "balanced", priceStyle: "no_decimals" },
      conceptName: "Morning Cards",
      rationale: "Short lists read fastest as cards. Veg and egg marks sit where guests look first.",
    },
    "fb",
  ),
  "restaurant-delhi": seed(
    "restaurant-delhi",
    "North Indian restaurant",
    { city: "Delhi", country: "IN", timezone: "Asia/Kolkata" },
    restaurantDelhi,
    defaultBrief({ vibeKeywords: ["modern_indian"], minimalToMaximal: 55, classicToExperimental: 35, priceTier: "mid" }),
    {
      archetype: "two_column",
      tokens: { fontPairingId: "devanagari-modern", paletteId: "saffron", iconSet: "dietary_only", ornamentStyle: "geometric", density: "balanced", priceStyle: "no_decimals" },
      conceptName: "Haveli Columns",
      rationale: "Two balanced columns keep a long menu on one page. Veg and non-veg marks follow the familiar square symbols.",
    },
    "hr",
  ),
  "bistro-paris": seed(
    "bistro-paris",
    "Parisian bistro",
    { city: "London", country: "GB", timezone: "Europe/London" },
    bistroParis,
    defaultBrief({ vibeKeywords: ["parisian_bistro"], minimalToMaximal: 35, classicToExperimental: 20, priceTier: "mid" }),
    {
      archetype: "classic_list",
      tokens: { fontPairingId: "bistro-garamond", paletteId: "bistro-cream", iconSet: "dietary_only", ornamentStyle: "double_rule", density: "balanced", priceStyle: "dot_leaders", textCase: "small_caps_sections" },
      conceptName: "Carte Classique",
      rationale: "A single column with dot leaders reads like a Paris chalk card. Small caps give the sections quiet authority.",
    },
    "cl",
  ),
};

export { bistroParis, cafeBangalore, cocktailBarLondon, restaurantDelhi };
