/**
 * Screenshot pages with headless Chromium for visual checks.
 *   node scripts/shots.ts <outDir> <name>=<url> [<name>=<url> ...]
 * Waits for the renderer's ready signal when present, and prints console errors.
 */
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const [outDir = "shots", ...targets] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const width = Number(process.env.SHOT_WIDTH ?? 1400);
const height = Number(process.env.SHOT_HEIGHT ?? 1000);
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: Number(process.env.SHOT_SCALE ?? 1) });

for (const target of targets) {
  const eq = target.indexOf("=");
  const name = target.slice(0, eq);
  const url = target.slice(eq + 1);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") errors.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.goto(url, { waitUntil: "networkidle" });
  await page
    .waitForFunction(() => (window as { __MENU_RENDER__?: { status: string } }).__MENU_RENDER__?.status === "ready", null, { timeout: 8000 })
    .catch(() => undefined);
  await page.waitForTimeout(Number(process.env.SHOT_DELAY ?? 800));
  const file = join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: process.env.SHOT_FULL !== "0" });
  const state = await page.evaluate(() => (window as { __MENU_RENDER__?: unknown }).__MENU_RENDER__ ?? null);
  process.stdout.write(`${file}${state ? ` ${JSON.stringify(state).slice(0, 300)}` : ""}\n`);
  for (const e of errors.slice(0, 8)) process.stdout.write(`  ${e}\n`);
  await page.close();
}
await browser.close();
