import { pageGeometry } from "@menu-studio/renderer/pure";
import { FORMATS, type LayoutSpec } from "@menu-studio/shared";
import { PDFDocument } from "pdf-lib";

const PT_PER_MM = 72 / 25.4;

/**
 * Chromium rounds the page to whole CSS pixels (216 mm becomes 215.9 mm) and writes only a
 * MediaBox. Scale the content by that sub-0.1% difference so the MediaBox is exact, then set
 * TrimBox and BleedBox from the same geometry the renderer used.
 */
export async function setPrintBoxes(pdfBytes: Uint8Array, spec: Pick<LayoutSpec, "format" | "orientation">, cropMarks: boolean): Promise<Uint8Array> {
  const g = pageGeometry(spec, "print", cropMarks);
  const pdf = await PDFDocument.load(pdfBytes);
  pdf.setProducer("Menu Studio");
  pdf.setCreator("Menu Studio renderer");
  const targetWidth = g.sheet.width * PT_PER_MM;
  const targetHeight = g.sheet.height * PT_PER_MM;
  for (const page of pdf.getPages()) {
    const media = page.getMediaBox();
    if (Math.abs(media.width - targetWidth) > 0.01 || Math.abs(media.height - targetHeight) > 0.01) {
      page.scaleContent(targetWidth / media.width, targetHeight / media.height);
      page.setMediaBox(0, 0, targetWidth, targetHeight);
      page.setCropBox(0, 0, targetWidth, targetHeight);
    }
    const bleedOffset = g.slug * PT_PER_MM;
    const trimOffset = g.trimOffset * PT_PER_MM;
    page.setBleedBox(bleedOffset, bleedOffset, (g.trim.width + g.bleed * 2) * PT_PER_MM, (g.trim.height + g.bleed * 2) * PT_PER_MM);
    page.setTrimBox(trimOffset, trimOffset, g.trim.width * PT_PER_MM, g.trim.height * PT_PER_MM);
  }
  return pdf.save();
}

export interface PdfInspection {
  pages: number;
  mediaBoxMm: { width: number; height: number }[];
  trimBoxMm: { width: number; height: number }[];
  /**
   * Fonts referenced by page resources. `embedded` means a real font program (FontFile*) is in
   * the file; Type3 fonts draw glyphs as procedures and are reported with embedded false.
   */
  fonts: { name: string; subtype: string; embedded: boolean }[];
}

/** Used by tests and the export job's own sanity check: exact size, embedded fonts. */
export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  const { PDFName, PDFDict, PDFRef } = await import("pdf-lib");
  const pdf = await PDFDocument.load(bytes);
  const round = (pt: number) => Math.round((pt / PT_PER_MM) * 10) / 10;
  const fonts = new Map<string, { name: string; subtype: string; embedded: boolean }>();
  const lookup = (value: unknown) => (value instanceof PDFRef ? pdf.context.lookup(value) : value);
  const hasProgram = (descriptor: unknown) =>
    descriptor instanceof PDFDict && ["FontFile", "FontFile2", "FontFile3"].some((key) => descriptor.get(PDFName.of(key)) !== undefined);

  for (const page of pdf.getPages()) {
    const resources = lookup(page.node.get(PDFName.of("Resources")));
    if (!(resources instanceof PDFDict)) continue;
    const fontDict = lookup(resources.get(PDFName.of("Font")));
    if (!(fontDict instanceof PDFDict)) continue;
    for (const [, ref] of fontDict.entries()) {
      const font = lookup(ref);
      if (!(font instanceof PDFDict)) continue;
      const key = ref instanceof PDFRef ? ref.toString() : String(fonts.size);
      const subtype = String(font.get(PDFName.of("Subtype")) ?? "/Unknown").replace(/^\//, "");
      const baseFont = font.get(PDFName.of("BaseFont"));
      const name = baseFont ? String(baseFont).replace(/^\//, "") : `${subtype} font`;
      let embedded = hasProgram(lookup(font.get(PDFName.of("FontDescriptor"))));
      const descendants = lookup(font.get(PDFName.of("DescendantFonts")));
      if (!embedded && descendants && typeof descendants === "object" && "asArray" in descendants) {
        for (const child of (descendants as { asArray(): unknown[] }).asArray()) {
          const cid = lookup(child);
          if (cid instanceof PDFDict && hasProgram(lookup(cid.get(PDFName.of("FontDescriptor"))))) embedded = true;
        }
      }
      if (subtype === "Type3") embedded = false;
      fonts.set(key, { name, subtype, embedded });
    }
  }

  return {
    pages: pdf.getPageCount(),
    mediaBoxMm: pdf.getPages().map((p) => ({ width: round(p.getMediaBox().width), height: round(p.getMediaBox().height) })),
    trimBoxMm: pdf.getPages().map((p) => ({ width: round(p.getTrimBox().width), height: round(p.getTrimBox().height) })),
    fonts: [...fonts.values()],
  };
}

export function printPackReadme(input: { venueName: string; spec: LayoutSpec; brandName: string | null; files: string[]; versionSeq: number }): string {
  const format = FORMATS[input.spec.format];
  const g = pageGeometry(input.spec, "print");
  const lines = [
    `${input.venueName}: print pack`,
    "=".repeat(40),
    "",
    `Prepared with ${input.brandName ?? "Menu Studio"} · version ${input.versionSeq}`,
    "",
    "PAPER",
    `  Format: ${format.label} (${format.description})`,
    `  Trim size: ${g.trim.width} × ${g.trim.height} mm, ${input.spec.orientation}`,
    `  Pages: ${input.spec.pages.length}`,
    format.panelsMm ? `  Folds: panels of ${format.panelsMm.join(" / ")} mm` : "",
    format.horizontalFoldsMm ? `  Fold: horizontal at ${format.horizontalFoldsMm.join(", ")} mm from the top` : "",
    "",
    "BLEED AND MARKS",
    `  Bleed: ${g.bleed} mm on every edge (document size ${g.sheet.width} × ${g.sheet.height} mm).`,
    "  Safe zone: keep 5 mm inside the trim; all text sits inside it.",
    "  The crop-marks PDF adds a 10 mm slug with trim marks and sets TrimBox and BleedBox.",
    "",
    "COLOUR",
    "  Files are RGB. CMYK conversion is not included in this version:",
    "  ask your printer to convert, and request a proof if colours are critical.",
    "",
    "FONTS",
    "  All fonts are embedded in the PDFs. They are licensed under the SIL Open Font License.",
    "",
    "FILES",
    ...input.files.map((f) => `  ${f}`),
    "",
  ];
  return lines.filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n");
}
