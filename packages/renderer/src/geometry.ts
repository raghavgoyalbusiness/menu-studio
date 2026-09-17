import { CONTENT_INSET_MM, CROP_SLUG_MM, FORMATS, pageSizeMm, type LayoutSpec } from "@menu-studio/shared";

export type RenderMode = "editor" | "print" | "png" | "qr";

export interface PageGeometry {
  /** Trim size of one page, mm. */
  trim: { width: number; height: number };
  bleed: number;
  /** Extra margin outside the bleed for crop marks, mm. */
  slug: number;
  /** Full box the page element occupies, mm. */
  sheet: { width: number; height: number };
  /** Offset of the trim box inside the sheet, mm. */
  trimOffset: number;
  safe: number;
  /** Distance from trim edge to content, mm. */
  contentInset: number;
  panels: readonly number[] | null;
  horizontalFolds: readonly number[] | null;
  isScreen: boolean;
}

export function pageGeometry(spec: Pick<LayoutSpec, "format" | "orientation">, mode: RenderMode, cropMarks = false): PageGeometry {
  const format = FORMATS[spec.format];
  const trim = pageSizeMm(spec.format, spec.orientation);
  const isScreen = format.kind === "screen";
  // PNG exports and screens are trimmed; print and editor show bleed.
  const bleed = mode === "print" || mode === "editor" ? format.bleedMm : 0;
  const slug = mode === "print" && cropMarks && bleed > 0 ? CROP_SLUG_MM : 0;
  const trimOffset = bleed + slug;
  return {
    trim,
    bleed,
    slug,
    sheet: { width: trim.width + trimOffset * 2, height: trim.height + trimOffset * 2 },
    trimOffset,
    safe: format.safeMm,
    contentInset: format.safeMm + (isScreen && spec.format === "MOBILE" ? 0 : CONTENT_INSET_MM),
    panels: format.panelsMm ?? null,
    horizontalFolds: format.horizontalFoldsMm ?? null,
    isScreen,
  };
}

export const PX_PER_MM = 96 / 25.4;
export const pxToMm = (px: number) => px / PX_PER_MM;
