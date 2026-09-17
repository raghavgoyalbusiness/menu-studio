import { expect, test } from "@playwright/test";
import { inspectPdf } from "../apps/worker/src/print.ts";
import { apiGet, apiPost, seededProject, signIn, waitForExport } from "./helpers.ts";

/**
 * Print output is the part of the product a mistake cannot be recalled from, so this checks the
 * real bytes the owner downloads: exact page size, the trim box a printer cuts to, and fonts that
 * are actually embedded (a Type3 fallback would print as outlines and is treated as a failure).
 */
test.describe("print geometry", () => {
  test.slow();

  async function exportPdf(page: Parameters<typeof signIn>[0], kind: "pdf" | "pdf_crop_marks") {
    const token = await signIn(page);
    const project = await seededProject(token, "Parisian bistro");
    const detail = await apiGet<{ head: { id: string } }>(token, `/projects/${project.id}`);
    const created = await apiPost<{ id: string }>(token, `/projects/${project.id}/exports`, { versionId: detail.head.id, kind });
    const result = await waitForExport(token, created.id);
    expect(result.error).toBeNull();
    expect(result.status).toBe("done");
    const file = result.files[0];
    if (!file) throw new Error("Export produced no files");
    const response = await fetch(file.url);
    expect(response.ok).toBe(true);
    return inspectPdf(new Uint8Array(await response.arrayBuffer()));
  }

  test("a bleed PDF is trim plus 3 mm on every side", async ({ page }) => {
    const pdf = await exportPdf(page, "pdf");
    expect(pdf.pages).toBeGreaterThan(0);
    for (const box of pdf.mediaBoxMm) {
      expect(box.width).toBeCloseTo(216, 1); // 210 + 3 + 3
      expect(box.height).toBeCloseTo(303, 1); // 297 + 3 + 3
    }
    for (const trim of pdf.trimBoxMm) {
      expect(trim.width).toBeCloseTo(210, 1);
      expect(trim.height).toBeCloseTo(297, 1);
    }
  });

  test("a crop-mark PDF adds a 10 mm slug and keeps the same trim box", async ({ page }) => {
    const pdf = await exportPdf(page, "pdf_crop_marks");
    for (const box of pdf.mediaBoxMm) {
      expect(box.width).toBeCloseTo(236, 1); // 216 + 10 + 10
      expect(box.height).toBeCloseTo(323, 1);
    }
    for (const trim of pdf.trimBoxMm) {
      expect(trim.width).toBeCloseTo(210, 1);
      expect(trim.height).toBeCloseTo(297, 1);
    }
  });

  test("every font is embedded as a real font program", async ({ page }) => {
    const pdf = await exportPdf(page, "pdf");
    expect(pdf.fonts.length).toBeGreaterThan(0);
    const notEmbedded = pdf.fonts.filter((f) => !f.embedded);
    expect(notEmbedded, `Not embedded: ${notEmbedded.map((f) => `${f.name} (${f.subtype})`).join(", ")}`).toHaveLength(0);
    expect(pdf.fonts.every((f) => f.subtype !== "Type3")).toBe(true);
  });
});
