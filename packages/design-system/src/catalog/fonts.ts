export const SCRIPTS = ["latin", "devanagari", "arabic", "japanese"] as const;
export type Script = (typeof SCRIPTS)[number];

export const FONT_PAIRING_IDS = [
  "zen-minimal",
  "deco-limelight",
  "modern-serif",
  "geometric",
  "chalk-hand",
  "editorial",
  "bistro-garamond",
  "luxe-didone",
  "street-bold",
  "devanagari-modern",
  "devanagari-classic",
  "arabic-kufi",
] as const;
export type FontPairingId = (typeof FONT_PAIRING_IDS)[number];

export interface FontFaceSpec {
  family: string;
  weights: readonly number[];
  italic: boolean;
}

export interface FontPairing {
  id: FontPairingId;
  name: string;
  moodTags: readonly string[];
  scripts: readonly Script[];
  display: FontFaceSpec;
  body: FontFaceSpec;
  displayFallback: string;
  bodyFallback: string;
  /** Weight used for section titles and item names. */
  displayWeight: number;
  /** Multiplier applied to display sizes; compensates for faces with unusual x-heights. */
  displayScale: number;
  /** Some display faces only have capitals (e.g. Bebas Neue). */
  displayAllCaps: boolean;
  /** Body face ships real small caps (OpenType smcp). */
  smallCaps: boolean;
  /** Letter spacing for display text, in em. */
  displayTracking: number;
}

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "system-ui, -apple-system, 'Segoe UI', sans-serif";

export const FONT_PAIRINGS: Record<FontPairingId, FontPairing> = {
  "zen-minimal": {
    id: "zen-minimal",
    name: "Zen Minimal",
    moodTags: ["japanese_minimal", "calm", "refined", "speakeasy"],
    scripts: ["latin", "japanese"],
    display: { family: "Shippori Mincho", weights: [500, 700], italic: false },
    body: { family: "Zen Kaku Gothic New", weights: [400, 500, 700], italic: false },
    displayFallback: `'Hiragino Mincho ProN', ${SERIF}`,
    bodyFallback: `'Hiragino Sans', ${SANS}`,
    displayWeight: 500,
    displayScale: 1,
    displayAllCaps: false,
    smallCaps: false,
    displayTracking: 0.02,
  },
  "deco-limelight": {
    id: "deco-limelight",
    name: "Deco Limelight",
    moodTags: ["art_deco", "speakeasy", "glamorous", "luxury_hotel"],
    scripts: ["latin"],
    display: { family: "Limelight", weights: [400], italic: false },
    body: { family: "Josefin Sans", weights: [400, 600, 700], italic: true },
    displayFallback: SERIF,
    bodyFallback: SANS,
    displayWeight: 400,
    displayScale: 0.92,
    displayAllCaps: false,
    smallCaps: false,
    displayTracking: 0.04,
  },
  "modern-serif": {
    id: "modern-serif",
    name: "Modern Serif",
    moodTags: ["modern", "warm", "botanical", "mid"],
    scripts: ["latin"],
    display: { family: "Fraunces", weights: [500, 700], italic: true },
    body: { family: "Instrument Sans", weights: [400, 500, 600], italic: false },
    displayFallback: SERIF,
    bodyFallback: SANS,
    displayWeight: 500,
    displayScale: 1,
    displayAllCaps: false,
    smallCaps: false,
    displayTracking: 0,
  },
  geometric: {
    id: "geometric",
    name: "Geometric",
    moodTags: ["geometric", "clean", "brutalist", "coastal", "cafe"],
    scripts: ["latin"],
    display: { family: "Outfit", weights: [500, 700], italic: false },
    body: { family: "DM Sans", weights: [400, 500, 700], italic: true },
    displayFallback: SANS,
    bodyFallback: SANS,
    displayWeight: 500,
    displayScale: 1,
    displayAllCaps: false,
    smallCaps: false,
    displayTracking: -0.01,
  },
  "chalk-hand": {
    id: "chalk-hand",
    name: "Chalk Hand",
    moodTags: ["chalkboard", "handwritten", "rustic", "street_food", "casual"],
    scripts: ["latin"],
    display: { family: "Cabin Sketch", weights: [400, 700], italic: false },
    body: { family: "Patrick Hand", weights: [400], italic: false },
    displayFallback: SANS,
    bodyFallback: SANS,
    displayWeight: 700,
    displayScale: 1.05,
    displayAllCaps: false,
    smallCaps: false,
    displayTracking: 0.01,
  },
  editorial: {
    id: "editorial",
    name: "Editorial",
    moodTags: ["editorial", "magazine", "fine_dining", "parisian_bistro"],
    scripts: ["latin"],
    display: { family: "Playfair Display", weights: [500, 700], italic: true },
    body: { family: "Source Serif 4", weights: [400, 600], italic: true },
    displayFallback: SERIF,
    bodyFallback: SERIF,
    displayWeight: 500,
    displayScale: 1,
    displayAllCaps: false,
    smallCaps: false,
    displayTracking: 0,
  },
  "bistro-garamond": {
    id: "bistro-garamond",
    name: "Bistro Garamond",
    moodTags: ["parisian_bistro", "classic", "wine", "fine_dining"],
    scripts: ["latin"],
    display: { family: "EB Garamond", weights: [400, 500, 600], italic: true },
    body: { family: "EB Garamond", weights: [400, 500, 600], italic: true },
    displayFallback: SERIF,
    bodyFallback: SERIF,
    displayWeight: 500,
    displayScale: 1.08,
    displayAllCaps: false,
    smallCaps: true,
    displayTracking: 0.01,
  },
  "luxe-didone": {
    id: "luxe-didone",
    name: "Luxe Didone",
    moodTags: ["luxury_hotel", "premium", "art_deco", "fine_dining"],
    scripts: ["latin"],
    display: { family: "Bodoni Moda", weights: [500, 700], italic: true },
    body: { family: "Jost", weights: [400, 500], italic: false },
    displayFallback: SERIF,
    bodyFallback: SANS,
    displayWeight: 500,
    displayScale: 1,
    displayAllCaps: false,
    smallCaps: false,
    displayTracking: 0.01,
  },
  "street-bold": {
    id: "street-bold",
    name: "Street Bold",
    moodTags: ["street_food", "retro_diner", "loud", "casual", "brutalist"],
    scripts: ["latin"],
    display: { family: "Bebas Neue", weights: [400], italic: false },
    body: { family: "Barlow", weights: [400, 500, 600], italic: false },
    displayFallback: `Impact, ${SANS}`,
    bodyFallback: SANS,
    displayWeight: 400,
    displayScale: 1.25,
    displayAllCaps: true,
    smallCaps: false,
    displayTracking: 0.03,
  },
  "devanagari-modern": {
    id: "devanagari-modern",
    name: "Devanagari Modern",
    moodTags: ["modern_indian", "bold", "warm"],
    scripts: ["latin", "devanagari"],
    display: { family: "Rozha One", weights: [400], italic: false },
    body: { family: "Hind", weights: [400, 500, 600], italic: false },
    displayFallback: SERIF,
    bodyFallback: SANS,
    displayWeight: 400,
    displayScale: 1,
    displayAllCaps: false,
    smallCaps: false,
    displayTracking: 0.005,
  },
  "devanagari-classic": {
    id: "devanagari-classic",
    name: "Devanagari Classic",
    moodTags: ["modern_indian", "traditional", "classic", "mid"],
    scripts: ["latin", "devanagari"],
    display: { family: "Tiro Devanagari Hindi", weights: [400], italic: true },
    body: { family: "Mukta", weights: [400, 500, 700], italic: false },
    displayFallback: SERIF,
    bodyFallback: SANS,
    displayWeight: 400,
    displayScale: 1.04,
    displayAllCaps: false,
    smallCaps: false,
    displayTracking: 0,
  },
  "arabic-kufi": {
    id: "arabic-kufi",
    name: "Arabic Kufi",
    moodTags: ["geometric", "modern", "coastal", "premium"],
    scripts: ["latin", "arabic"],
    display: { family: "Reem Kufi", weights: [500, 700], italic: false },
    body: { family: "IBM Plex Sans Arabic", weights: [400, 500, 600], italic: false },
    displayFallback: SANS,
    bodyFallback: SANS,
    displayWeight: 500,
    displayScale: 1,
    displayAllCaps: false,
    smallCaps: false,
    displayTracking: 0,
  },
};

export function pairingSupportsScript(id: FontPairingId, script: Script): boolean {
  return FONT_PAIRINGS[id].scripts.includes(script);
}

/** Every distinct family across the catalog, with the union of weights and italics. */
export function catalogFamilies(): { family: string; weights: number[]; italic: boolean }[] {
  const byFamily = new Map<string, { weights: Set<number>; italic: boolean }>();
  for (const pairing of Object.values(FONT_PAIRINGS)) {
    for (const face of [pairing.display, pairing.body]) {
      const entry = byFamily.get(face.family) ?? { weights: new Set<number>(), italic: false };
      for (const w of face.weights) entry.weights.add(w);
      entry.italic = entry.italic || face.italic;
      byFamily.set(face.family, entry);
    }
  }
  return [...byFamily.entries()]
    .map(([family, e]) => ({ family, weights: [...e.weights].sort((a, b) => a - b), italic: e.italic }))
    .sort((a, b) => a.family.localeCompare(b.family));
}
