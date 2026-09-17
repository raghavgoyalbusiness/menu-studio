import { getExport, getVenue, requireVersion, updateExportStatus, type Db, type Logger, type Storage } from "@menu-studio/server-core";
import { pageGeometry, PX_PER_MM, type RenderState } from "@menu-studio/renderer/pure";
import { signPrintToken, type ExportFileDto, type LayoutSpec, type OverflowReport } from "@menu-studio/shared";
import type { Browser, Page } from "playwright";
import yazl from "yazl";
import { printPackReadme, setPrintBoxes } from "../print.ts";

export interface ExportDeps {
  db: Db;
  storage: Storage;
  browser: () => Promise<Browser>;
  logger: Logger;
  webUrl: string;
  printSecret: string;
}

export class RenderError extends Error {}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "menu";
}

async function waitForRender(page: Page): Promise<RenderState> {
  await page.waitForFunction(() => (window as unknown as { __MENU_RENDER__?: { status: string } }).__MENU_RENDER__?.status === "ready", null, { timeout: 90_000 });
  const state = await page.evaluate(() => (window as unknown as { __MENU_RENDER__: unknown }).__MENU_RENDER__);
  return state as RenderState;
}

function assertPrintable(state: RenderState): void {
  const report: OverflowReport | null = state.report;
  if (!state.fontsLoaded) throw new RenderError("Fonts did not load, so the export was stopped rather than printing with fallback fonts.");
  if (report?.message && !report.pages.length) throw new RenderError(report.message);
  if (report && !report.fits) {
    const worst = report.pages.filter((p) => p.overflowMm > 0).map((p, i) => `page ${i + 1} by ${p.overflowMm} mm`);
    throw new RenderError(`The layout overflows (${worst.join(", ")}). Use Auto-fit in the editor, then export again.`);
  }
}

async function renderPdf(deps: ExportDeps, url: string, spec: LayoutSpec, cropMarks: boolean): Promise<Uint8Array> {
  const browser = await deps.browser();
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    await page.goto(`${url}&mode=print${cropMarks ? "&crop=1" : ""}`, { waitUntil: "networkidle" });
    assertPrintable(await waitForRender(page));
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    return cropMarks ? setPrintBoxes(new Uint8Array(pdf), spec, true) : setPrintBoxes(new Uint8Array(pdf), spec, false);
  } finally {
    await context.close();
  }
}

async function renderPngs(deps: ExportDeps, url: string, spec: LayoutSpec): Promise<{ name: string; body: Uint8Array }[]> {
  const g = pageGeometry(spec, "png");
  const widthPx = g.sheet.width * PX_PER_MM;
  const out: { name: string; body: Uint8Array }[] = [];
  const browser = await deps.browser();
  for (const variant of [
    { suffix: "300dpi", scale: 300 / 96 },
    { suffix: "1080px", scale: 1080 / widthPx },
  ]) {
    const context = await browser.newContext({ deviceScaleFactor: variant.scale, viewport: { width: Math.ceil(widthPx) + 20, height: 1200 } });
    try {
      const page = await context.newPage();
      await page.goto(`${url}&mode=png`, { waitUntil: "networkidle" });
      assertPrintable(await waitForRender(page));
      const pages = await page.locator("[data-ms-page]").all();
      for (const [i, element] of pages.entries()) {
        const body = await element.screenshot({ type: "png" });
        out.push({ name: `page-${i + 1}-${variant.suffix}.png`, body: new Uint8Array(body) });
      }
    } finally {
      await context.close();
    }
  }
  return out;
}

function zip(files: { name: string; body: Uint8Array | string }[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const archive = new yazl.ZipFile();
    for (const f of files) archive.addBuffer(Buffer.from(f.body), f.name);
    archive.end();
    const chunks: Buffer[] = [];
    archive.outputStream.on("data", (c: Buffer) => chunks.push(c));
    archive.outputStream.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    archive.outputStream.on("error", reject);
  });
}

export async function runExport(deps: ExportDeps, exportId: string): Promise<void> {
  const logger = deps.logger.child({ exportId });
  const row = await deps.db.asService((q) => getExport(q, exportId));
  if (!row) throw new Error(`Export ${exportId} not found`);
  if (row.status === "done") return;

  try {
    await deps.db.asService((q) => updateExportStatus(q, exportId, { status: "rendering" }));
    const context = await deps.db.asService(async (q) => {
      const version = await requireVersion(q, row.projectId, row.versionId);
      const { rows } = await q.query<{ venue_id: string; org_white_label: { brandName?: string } }>(
        `select p.venue_id, o.white_label as org_white_label from projects p join venues v on v.id = p.venue_id join organizations o on o.id = v.org_id where p.id = $1`,
        [row.projectId],
      );
      const venue = rows[0] ? await getVenue(q, rows[0].venue_id) : null;
      return { version, venue, brandName: rows[0]?.org_white_label?.brandName ?? null };
    });
    const spec = context.version.spec;
    if (!spec) throw new RenderError("This version has no layout to export.");
    if (spec.format === "MOBILE" && row.kind !== "png") throw new RenderError("Phone layouts export as PNG images. Choose PNG, or publish them as a QR menu.");

    const token = await signPrintToken({ projectId: row.projectId, versionId: row.versionId, purpose: "print" }, deps.printSecret, 900);
    const url = `${deps.webUrl.replace(/\/$/, "")}/print/${row.projectId}/${row.versionId}?token=${encodeURIComponent(token)}&wm=${row.watermarked ? 1 : 0}`;
    const base = `${slug(context.venue?.name ?? "menu")}-v${context.version.seq}`;
    const outputs: { name: string; body: Uint8Array; contentType: string }[] = [];

    if (row.kind === "pdf" || row.kind === "print_pack") outputs.push({ name: `${base}-bleed.pdf`, body: await renderPdf(deps, url, spec, false), contentType: "application/pdf" });
    if (row.kind === "pdf_crop_marks" || (row.kind === "print_pack" && spec.format !== "CHALKBOARD_WIDE")) {
      outputs.push({ name: `${base}-crop-marks.pdf`, body: await renderPdf(deps, url, spec, true), contentType: "application/pdf" });
    }
    if (row.kind === "png" || row.kind === "print_pack") {
      for (const png of await renderPngs(deps, url, spec)) outputs.push({ name: `${base}-${png.name}`, body: png.body, contentType: "image/png" });
    }

    let files: { name: string; body: Uint8Array; contentType: string }[] = outputs;
    if (row.kind === "print_pack") {
      const readme = printPackReadme({ venueName: context.venue?.name ?? "Menu", spec, brandName: context.brandName, files: outputs.map((o) => o.name), versionSeq: context.version.seq });
      files = [{ name: `${base}-print-pack.zip`, body: await zip([...outputs, { name: "README.txt", body: readme }]), contentType: "application/zip" }];
    }

    const stored: ExportFileDto[] = [];
    for (const file of files) {
      const key = `${row.projectId}/${exportId}/${file.name}`;
      await deps.storage.put("exports", key, file.body, file.contentType);
      stored.push({ name: file.name, path: `exports:${key}`, bytes: file.body.byteLength, contentType: file.contentType });
    }
    await deps.db.asService((q) => updateExportStatus(q, exportId, { status: "done", files: stored, storagePath: stored[0]?.path ?? null, error: null }));
    logger.info("export done", { kind: row.kind, files: stored.length });
  } catch (error) {
    const message = error instanceof RenderError ? error.message : "The export failed while rendering. Please try again.";
    logger.error("export failed", { error });
    await deps.db.asService((q) => updateExportStatus(q, exportId, { status: "failed", error: message }));
    if (!(error instanceof RenderError)) throw error;
  }
}
