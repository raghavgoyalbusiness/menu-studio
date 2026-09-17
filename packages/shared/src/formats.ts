import { z } from "zod";
import type { Orientation } from "./schemas/common.ts";

export const FORMAT_IDS = [
  "A4",
  "A3",
  "A5",
  "US_LETTER",
  "US_LEGAL",
  "DL_TRIFOLD",
  "BIFOLD_A4",
  "TABLE_TENT",
  "POSTER_A2",
  "CHALKBOARD_WIDE",
  "MOBILE",
] as const;
export const FormatId = z.enum(FORMAT_IDS);
export type FormatId = z.infer<typeof FormatId>;

export interface FormatSpec {
  id: FormatId;
  label: string;
  kind: "print" | "screen";
  /** Trim size of one sheet side, in the format's natural orientation. */
  trimMm: { width: number; height: number };
  /** "any" lets the brief choose; otherwise orientation is locked. */
  orientation: "any" | Orientation;
  /** "flow" pages grow with content; a number fixes the page count. */
  pages: "flow" | number;
  /** Panel widths across the sheet (folds), mm. */
  panelsMm?: readonly number[];
  /** Horizontal fold positions from the top edge (table tents), mm. */
  horizontalFoldsMm?: readonly number[];
  bleedMm: number;
  safeMm: number;
  /** Screen formats render at a fixed CSS pixel width. */
  cssWidthPx?: number;
  description: string;
}

export const BLEED_MM = 3;
export const SAFE_MM = 5;
export const CROP_SLUG_MM = 10;

export const FORMATS: Record<FormatId, FormatSpec> = {
  A4: {
    id: "A4",
    label: "A4",
    kind: "print",
    trimMm: { width: 210, height: 297 },
    orientation: "any",
    pages: "flow",
    bleedMm: BLEED_MM,
    safeMm: SAFE_MM,
    description: "210 × 297 mm, the standard single-sheet menu.",
  },
  A3: {
    id: "A3",
    label: "A3",
    kind: "print",
    trimMm: { width: 297, height: 420 },
    orientation: "any",
    pages: "flow",
    bleedMm: BLEED_MM,
    safeMm: SAFE_MM,
    description: "297 × 420 mm, large single sheet.",
  },
  A5: {
    id: "A5",
    label: "A5",
    kind: "print",
    trimMm: { width: 148, height: 210 },
    orientation: "any",
    pages: "flow",
    bleedMm: BLEED_MM,
    safeMm: SAFE_MM,
    description: "148 × 210 mm, compact card or booklet page.",
  },
  US_LETTER: {
    id: "US_LETTER",
    label: "US Letter",
    kind: "print",
    trimMm: { width: 215.9, height: 279.4 },
    orientation: "any",
    pages: "flow",
    bleedMm: BLEED_MM,
    safeMm: SAFE_MM,
    description: "8.5 × 11 in.",
  },
  US_LEGAL: {
    id: "US_LEGAL",
    label: "US Legal",
    kind: "print",
    trimMm: { width: 215.9, height: 355.6 },
    orientation: "any",
    pages: "flow",
    bleedMm: BLEED_MM,
    safeMm: SAFE_MM,
    description: "8.5 × 14 in, tall single sheet.",
  },
  DL_TRIFOLD: {
    id: "DL_TRIFOLD",
    label: "DL trifold",
    kind: "print",
    trimMm: { width: 297, height: 210 },
    orientation: "landscape",
    pages: 2,
    panelsMm: [100, 100, 97],
    bleedMm: BLEED_MM,
    safeMm: SAFE_MM,
    description: "A4 landscape folded into three DL panels (100/100/97 mm roll fold), two sides.",
  },
  BIFOLD_A4: {
    id: "BIFOLD_A4",
    label: "A4 bifold",
    kind: "print",
    trimMm: { width: 420, height: 297 },
    orientation: "landscape",
    pages: 2,
    panelsMm: [210, 210],
    bleedMm: BLEED_MM,
    safeMm: SAFE_MM,
    description: "A3 sheet folded to A4 (four A4 pages), two sides.",
  },
  TABLE_TENT: {
    id: "TABLE_TENT",
    label: "Table tent",
    kind: "print",
    trimMm: { width: 148, height: 210 },
    orientation: "portrait",
    pages: 1,
    horizontalFoldsMm: [105],
    bleedMm: BLEED_MM,
    safeMm: SAFE_MM,
    description: "A5 folded into two A6 landscape faces; the top face prints upside down.",
  },
  POSTER_A2: {
    id: "POSTER_A2",
    label: "A2 poster",
    kind: "print",
    trimMm: { width: 420, height: 594 },
    orientation: "any",
    pages: 1,
    bleedMm: BLEED_MM,
    safeMm: SAFE_MM,
    description: "420 × 594 mm wall poster.",
  },
  CHALKBOARD_WIDE: {
    id: "CHALKBOARD_WIDE",
    label: "Wide board",
    kind: "screen",
    trimMm: { width: 600, height: 337.5 },
    orientation: "landscape",
    pages: 1,
    bleedMm: 0,
    safeMm: SAFE_MM,
    cssWidthPx: 1920,
    description: "16:9 digital menu board (1920 × 1080).",
  },
  MOBILE: {
    id: "MOBILE",
    label: "Mobile",
    kind: "screen",
    trimMm: { width: 103.19, height: 223.4 },
    orientation: "portrait",
    pages: 1,
    bleedMm: 0,
    safeMm: 0,
    cssWidthPx: 390,
    description: "Phone-width scrolling menu for QR codes.",
  },
};

export function resolveOrientation(format: FormatId, requested: Orientation): Orientation {
  const locked = FORMATS[format].orientation;
  return locked === "any" ? requested : locked;
}

/** Trim size of one page for a format + orientation. */
export function pageSizeMm(format: FormatId, orientation: Orientation): { width: number; height: number } {
  const spec = FORMATS[format];
  const { width, height } = spec.trimMm;
  const effective = resolveOrientation(format, orientation);
  if (spec.orientation !== "any") return { width, height };
  const isLandscape = width > height;
  if ((effective === "landscape") === isLandscape) return { width, height };
  return { width: height, height: width };
}

export function isPrintFormat(format: FormatId): boolean {
  return FORMATS[format].kind === "print";
}

/** mm → CSS px at 96 dpi. */
export function mmToPx(mm: number): number {
  return (mm * 96) / 25.4;
}

export function ptToMm(pt: number): number {
  return (pt * 25.4) / 72;
}
