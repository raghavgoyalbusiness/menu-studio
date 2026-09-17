import type { PaletteColors } from "./palettes.ts";

const HEX = /^#([0-9a-fA-F]{6})$/;

export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = HEX.exec(hex);
  if (!match?.[1]) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export const AA_TEXT = 4.5;

export interface ContrastIssue {
  role: keyof PaletteColors;
  against: "background" | "surface";
  ratio: number;
}

/**
 * WCAG AA check for every text-bearing role. accent/accent2 are only checked when
 * the palette allows them to colour text.
 */
export function paletteContrastIssues(
  colors: PaletteColors,
  options: { accentForText: boolean; accent2ForText: boolean },
): ContrastIssue[] {
  const roles: (keyof PaletteColors)[] = ["text", "muted"];
  if (options.accentForText) roles.push("accent");
  if (options.accent2ForText) roles.push("accent2");
  const issues: ContrastIssue[] = [];
  for (const role of roles) {
    for (const against of ["background", "surface"] as const) {
      const ratio = contrastRatio(colors[role], colors[against]);
      if (ratio < AA_TEXT) issues.push({ role, against, ratio: Math.round(ratio * 100) / 100 });
    }
  }
  return issues;
}

/** Pick black-ish or white-ish ink for text placed on an arbitrary fill. */
export function inkOn(fill: string, dark = "#111111", light = "#FFFFFF"): string {
  return contrastRatio(fill, dark) >= contrastRatio(fill, light) ? dark : light;
}
