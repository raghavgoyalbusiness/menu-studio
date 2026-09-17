export const PALETTE_IDS = [
  "washi",
  "sumi-night",
  "deco-noir",
  "bistro-cream",
  "botanical",
  "coastal",
  "kraft",
  "saffron",
  "chalkboard",
  "concrete",
  "diner",
  "espresso",
] as const;
export type PaletteId = (typeof PALETTE_IDS)[number];

export interface PaletteColors {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
}

export interface Palette {
  id: PaletteId;
  name: string;
  moodTags: readonly string[];
  dark: boolean;
  colors: PaletteColors;
  /**
   * Whether accent / accent2 may colour text (prices, section titles).
   * Decorative-only accents are used for rules, ornaments and fills.
   */
  accentForText: boolean;
  accent2ForText: boolean;
}

export const PALETTES: Record<PaletteId, Palette> = {
  washi: {
    id: "washi",
    name: "Washi",
    moodTags: ["japanese_minimal", "calm", "light"],
    dark: false,
    colors: {
      background: "#F4EFE6",
      surface: "#EBE4D8",
      text: "#1E1B18",
      muted: "#5E564D",
      accent: "#A83626",
      accent2: "#2F4A3A",
    },
    accentForText: true,
    accent2ForText: true,
  },
  "sumi-night": {
    id: "sumi-night",
    name: "Sumi Night",
    moodTags: ["japanese_minimal", "speakeasy", "dark", "premium"],
    dark: true,
    colors: {
      background: "#16140F",
      surface: "#221F19",
      text: "#EFE8DA",
      muted: "#A89F8E",
      accent: "#C9A45C",
      accent2: "#9C3B2E",
    },
    accentForText: true,
    accent2ForText: false,
  },
  "deco-noir": {
    id: "deco-noir",
    name: "Deco Noir",
    moodTags: ["art_deco", "luxury_hotel", "speakeasy", "dark"],
    dark: true,
    colors: {
      background: "#0E0E10",
      surface: "#1A1A1E",
      text: "#F2E9D0",
      muted: "#A69F8C",
      accent: "#D4B26A",
      accent2: "#2F7A62",
    },
    accentForText: true,
    accent2ForText: false,
  },
  "bistro-cream": {
    id: "bistro-cream",
    name: "Bistro Cream",
    moodTags: ["parisian_bistro", "classic", "warm", "light"],
    dark: false,
    colors: {
      background: "#F6EFE0",
      surface: "#EDE3CF",
      text: "#1F2433",
      muted: "#555866",
      accent: "#7A1F2B",
      accent2: "#1F3A5F",
    },
    accentForText: true,
    accent2ForText: true,
  },
  botanical: {
    id: "botanical",
    name: "Botanical",
    moodTags: ["botanical", "fresh", "cafe", "light"],
    dark: false,
    colors: {
      background: "#EEF0E6",
      surface: "#E2E6D6",
      text: "#1D2B22",
      muted: "#4C5A50",
      accent: "#94462A",
      accent2: "#3E6B48",
    },
    accentForText: true,
    accent2ForText: true,
  },
  coastal: {
    id: "coastal",
    name: "Coastal",
    moodTags: ["coastal", "fresh", "light", "casual"],
    dark: false,
    colors: {
      background: "#F3EEE4",
      surface: "#E4ECEE",
      text: "#14304A",
      muted: "#4A5D6C",
      accent: "#A3402A",
      accent2: "#2C6E8F",
    },
    accentForText: true,
    accent2ForText: true,
  },
  kraft: {
    id: "kraft",
    name: "Kraft",
    moodTags: ["rustic", "street_food", "warm", "casual"],
    dark: false,
    colors: {
      background: "#D9C4A0",
      surface: "#CDB58D",
      text: "#231F1A",
      muted: "#4A4033",
      accent: "#7E2016",
      accent2: "#2F4F3E",
    },
    accentForText: true,
    accent2ForText: true,
  },
  saffron: {
    id: "saffron",
    name: "Saffron",
    moodTags: ["modern_indian", "warm", "festive", "light"],
    dark: false,
    colors: {
      background: "#FBF4E6",
      surface: "#F3E6CC",
      text: "#2A1512",
      muted: "#664C42",
      accent: "#8C1D2E",
      accent2: "#E39B1B",
    },
    accentForText: true,
    accent2ForText: false,
  },
  chalkboard: {
    id: "chalkboard",
    name: "Chalkboard",
    moodTags: ["chalkboard", "rustic", "dark", "casual"],
    dark: true,
    colors: {
      background: "#1F2624",
      surface: "#2A3230",
      text: "#F1EFE6",
      muted: "#B9C0B8",
      accent: "#F2D27A",
      accent2: "#E9A7A0",
    },
    accentForText: true,
    accent2ForText: true,
  },
  concrete: {
    id: "concrete",
    name: "Concrete",
    moodTags: ["brutalist", "modern", "bold", "light"],
    dark: false,
    colors: {
      background: "#D8D6D1",
      surface: "#C9C6C0",
      text: "#111111",
      muted: "#3C3C3A",
      accent: "#8F2F00",
      accent2: "#FF5A1F",
    },
    accentForText: true,
    accent2ForText: false,
  },
  diner: {
    id: "diner",
    name: "Diner",
    moodTags: ["retro_diner", "playful", "casual", "light"],
    dark: false,
    colors: {
      background: "#FBF3E4",
      surface: "#F1E4CB",
      text: "#1B2A2F",
      muted: "#526069",
      accent: "#B0202A",
      accent2: "#1E8C8A",
    },
    accentForText: true,
    accent2ForText: false,
  },
  espresso: {
    id: "espresso",
    name: "Espresso",
    moodTags: ["cafe", "warm", "bakery", "light"],
    dark: false,
    colors: {
      background: "#EFE4D6",
      surface: "#E4D3BF",
      text: "#2B1D14",
      muted: "#65503F",
      accent: "#834620",
      accent2: "#C58A4A",
    },
    accentForText: true,
    accent2ForText: false,
  },
};
