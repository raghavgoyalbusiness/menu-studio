import { describe, expect, it } from "vitest";
import {
  catalogFamilies,
  contrastRatio,
  FONT_PAIRING_IDS,
  FONT_PAIRINGS,
  PALETTE_IDS,
  PALETTES,
  paletteContrastIssues,
} from "./index.ts";

describe("font pairings", () => {
  it("has 12 pairings whose ids match their keys", () => {
    expect(FONT_PAIRING_IDS).toHaveLength(12);
    for (const id of FONT_PAIRING_IDS) expect(FONT_PAIRINGS[id].id).toBe(id);
  });

  it("covers the scripts the spec requires", () => {
    const scripts = new Set(Object.values(FONT_PAIRINGS).flatMap((p) => p.scripts));
    expect([...scripts].sort()).toEqual(["arabic", "devanagari", "japanese", "latin"]);
    expect(Object.values(FONT_PAIRINGS).every((p) => p.scripts.includes("latin"))).toBe(true);
  });

  it("lists every family once for mirroring", () => {
    const families = catalogFamilies();
    expect(new Set(families.map((f) => f.family)).size).toBe(families.length);
    expect(families.find((f) => f.family === "EB Garamond")?.weights).toEqual([400, 500, 600]);
  });
});

describe("palettes", () => {
  it("has 12 palettes whose ids match their keys", () => {
    expect(PALETTE_IDS).toHaveLength(12);
    for (const id of PALETTE_IDS) expect(PALETTES[id].id).toBe(id);
  });

  it.each(PALETTE_IDS)("%s passes WCAG AA for every text-bearing role", (id) => {
    const palette = PALETTES[id];
    expect(paletteContrastIssues(palette.colors, palette)).toEqual([]);
  });

  it("computes the textbook black/white ratio", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
  });
});
