import {
  BACKGROUND_TEXTURES,
  FONT_PAIRING_IDS,
  FONT_PAIRINGS,
  ORNAMENT_STYLES,
  PALETTE_IDS,
  PALETTES,
} from "@menu-studio/design-system/catalog";
import {
  ARCHETYPES,
  DENSITIES,
  EMPHASES,
  ICON_SETS,
  PRICE_PLACEMENTS,
  PRICE_STYLES,
  TEXT_CASES,
  type ArchetypeId,
} from "@menu-studio/shared";

/** Static catalog text. Kept byte-stable so it sits inside the cached system prompt. */
export function fontCatalogText(): string {
  return FONT_PAIRING_IDS.map((id) => {
    const p = FONT_PAIRINGS[id];
    return `- ${id}: ${p.name} (${p.display.family} / ${p.body.family}); moods: ${p.moodTags.join(", ")}; scripts: ${p.scripts.join(", ")}`;
  }).join("\n");
}

export function paletteCatalogText(): string {
  return PALETTE_IDS.map((id) => {
    const p = PALETTES[id];
    return `- ${id}: ${p.name}, ${p.dark ? "dark" : "light"}; moods: ${p.moodTags.join(", ")}`;
  }).join("\n");
}

export function archetypeCatalogText(ids: readonly ArchetypeId[]): string {
  return ids
    .map((id) => {
      const a = ARCHETYPES[id];
      return `- ${id}: ${a.summary} Rules: ${a.rules.join("; ")}.`;
    })
    .join("\n");
}

export function tokenEnumsText(): string {
  return [
    `ornamentStyle: ${ORNAMENT_STYLES.join(" | ")}`,
    `density: ${DENSITIES.join(" | ")}`,
    `iconSet: ${ICON_SETS.join(" | ")} (glassware draws a glass icon for drinks with glassware; dietary_only shows dietary marks only)`,
    `pricePlacement: ${PRICE_PLACEMENTS.join(" | ")}`,
    `priceStyle: ${PRICE_STYLES.join(" | ")}`,
    `textCase: ${TEXT_CASES.join(" | ")}`,
    `backgroundTexture: ${BACKGROUND_TEXTURES.join(" | ")}`,
    `bodyScale: number from 0.9 to 1.1 (usually 1)`,
    `emphasis (blocks): ${EMPHASES.join(" | ")}`,
  ].join("\n");
}
