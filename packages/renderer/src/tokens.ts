import { FONT_PAIRINGS, PALETTES, type PaletteColors } from "@menu-studio/design-system/catalog";
import { BODY_PT, MIN_BODY_PT_PRINT, MIN_BODY_PX_MOBILE, type Density, type LayoutSpec } from "@menu-studio/shared";
import type { RenderMode } from "./geometry.ts";

export interface ResolvedTokens {
  colors: PaletteColors;
  dark: boolean;
  accentForText: boolean;
  vars: Record<string, string>;
  displayFamily: string;
  bodyFamily: string;
}

const GAPS_MM: Record<Density, { item: number; section: number; line: number }> = {
  airy: { item: 4.2, section: 9, line: 1.45 },
  balanced: { item: 2.8, section: 6.5, line: 1.38 },
  dense: { item: 1.6, section: 4.5, line: 1.3 },
};

const GAPS_PX: Record<Density, { item: number; section: number }> = {
  airy: { item: 18, section: 36 },
  balanced: { item: 14, section: 28 },
  dense: { item: 10, section: 20 },
};

function luminanceIsDark(hex: string): boolean {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

export function resolveTokens(spec: LayoutSpec, mode: RenderMode): ResolvedTokens {
  const t = spec.tokens;
  const palette = PALETTES[t.paletteId];
  const colors = t.customPalette ?? palette.colors;
  const dark = t.customPalette ? luminanceIsDark(t.customPalette.background) : palette.dark;
  const accentForText = t.customPalette ? false : palette.accentForText;
  const pairing = FONT_PAIRINGS[t.fontPairingId];
  const displayFamily = `"${pairing.display.family}", ${pairing.displayFallback}`;
  const bodyFamily = `"${pairing.body.family}", ${pairing.bodyFallback}`;
  const screen = mode === "qr";
  const gaps = GAPS_MM[t.density];
  const bodySize = screen
    ? `${Math.max(MIN_BODY_PX_MOBILE, Math.round(15 * t.bodyScale * 10) / 10)}px`
    : `${Math.max(MIN_BODY_PT_PRINT, Math.round(BODY_PT[t.density] * t.bodyScale * 100) / 100)}pt`;

  const vars: Record<string, string> = {
    "--ms-bg": colors.background,
    "--ms-surface": colors.surface,
    "--ms-text": colors.text,
    "--ms-muted": colors.muted,
    "--ms-accent": colors.accent,
    "--ms-accent2": colors.accent2,
    "--ms-accent-text": accentForText ? colors.accent : colors.text,
    "--ms-font-display": displayFamily,
    "--ms-font-body": bodyFamily,
    "--ms-display-weight": String(pairing.displayWeight),
    "--ms-display-scale": String(pairing.displayScale),
    "--ms-display-tracking": `${pairing.displayTracking}em`,
    "--ms-display-case": pairing.displayAllCaps ? "uppercase" : "none",
    "--ms-body-size": bodySize,
    "--ms-line": String(gaps.line),
    "--ms-gap-item": screen ? `${GAPS_PX[t.density].item}px` : `${gaps.item}mm`,
    "--ms-gap-section": screen ? `${GAPS_PX[t.density].section}px` : `${gaps.section}mm`,
  };
  return { colors, dark, accentForText, vars, displayFamily, bodyFamily };
}

/** Font families a spec needs loaded before measuring or capturing. */
export function specFontFamilies(spec: LayoutSpec): string[] {
  const pairing = FONT_PAIRINGS[spec.tokens.fontPairingId];
  return [...new Set([pairing.display.family, pairing.body.family])];
}
