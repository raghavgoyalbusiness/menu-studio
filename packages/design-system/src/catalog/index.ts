export * from "./fonts.ts";
export * from "./palettes.ts";
export * from "./contrast.ts";
export * from "./dietary.ts";

export const GLASSWARE_TYPES = [
  "coupe",
  "martini",
  "nick_and_nora",
  "rocks",
  "double_rocks",
  "highball",
  "collins",
  "wine",
  "flute",
  "tiki",
  "copper_mug",
  "shot",
  "teacup",
  "coffee_cup",
  "beer_pint",
] as const;
export type GlasswareType = (typeof GLASSWARE_TYPES)[number];

export const FOOD_ICONS = ["bowl", "plate", "bread", "dessert", "leaf", "chili", "fish", "meat"] as const;
export type FoodIcon = (typeof FOOD_ICONS)[number];

export const ORNAMENT_STYLES = ["none", "hairline", "double_rule", "geometric", "botanical", "deco"] as const;
export type OrnamentStyle = (typeof ORNAMENT_STYLES)[number];

export const BACKGROUND_TEXTURES = ["none", "paper", "linen", "kraft"] as const;
export type BackgroundTexture = (typeof BACKGROUND_TEXTURES)[number];

export const VIBE_KEYWORDS = [
  "japanese_minimal",
  "art_deco",
  "rustic",
  "modern_indian",
  "parisian_bistro",
  "brutalist",
  "botanical",
  "retro_diner",
  "luxury_hotel",
  "street_food",
  "speakeasy",
  "coastal",
] as const;
export type VibeKeyword = (typeof VIBE_KEYWORDS)[number];
