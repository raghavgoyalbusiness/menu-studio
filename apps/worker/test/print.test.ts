import { SEEDS } from "@menu-studio/shared/seeds";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { fontCssFor } from "../src/jobs/publish.ts";
import { inspectPdf, printPackReadme, setPrintBoxes } from "../src/print.ts";

const MM = 72 / 25.4;

describe("print boxes", () => {
  it("keeps the bleed media box and sets trim and bleed boxes", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([216 * MM, 303 * MM]);
    const out = await setPrintBoxes(await pdf.save(), { format: "A4", orientation: "portrait" }, false);
    const info = await inspectPdf(out);
    expect(info.mediaBoxMm).toEqual([{ width: 216, height: 303 }]);
    expect(info.trimBoxMm).toEqual([{ width: 210, height: 297 }]);
  });

  it("offsets the trim box by the slug on crop-mark PDFs", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([236 * MM, 323 * MM]);
    const out = await setPrintBoxes(await pdf.save(), { format: "A4", orientation: "portrait" }, true);
    const loaded = await PDFDocument.load(out);
    const trim = loaded.getPage(0).getTrimBox();
    expect(Math.round(trim.x / MM)).toBe(13);
    expect(Math.round(trim.width / MM)).toBe(210);
  });
});

describe("print pack README", () => {
  it("states paper size, bleed and the RGB limitation", () => {
    const readme = printPackReadme({ venueName: "Chez Lucette", spec: SEEDS["bistro-paris"].spec, brandName: null, files: ["a.pdf"], versionSeq: 3 });
    expect(readme).toContain("210 × 297 mm");
    expect(readme).toContain("Bleed: 3 mm");
    expect(readme).toContain("RGB");
  });
});

describe("QR font subsetting", () => {
  it("publishes only the families a menu uses", async () => {
    const { css, files } = await fontCssFor(["EB Garamond"]);
    expect(css).toContain("EB Garamond");
    expect(css).not.toContain("Shippori Mincho");
    expect(files.every((f) => f.key.startsWith("fonts/eb-garamond"))).toBe(true);
  });
});
