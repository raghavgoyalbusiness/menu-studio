/**
 * Drives the running local stack like an owner would and saves screenshots.
 *   node scripts/walkthrough.ts <outDir> [steps...]
 * Requires: pnpm db:start && pnpm db:seed, API on 5323, web on 5223, worker, menu site on 5224.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const WEB = process.env.WEB_URL ?? "http://127.0.0.1:5223";
const API = process.env.API_URL ?? "http://127.0.0.1:5323";
const outDir = process.argv[2] ?? "walkthrough";
const steps = new Set(process.argv.slice(3));
const all = steps.size === 0;
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
const shot = async (name: string, p: Page = page, fullPage = false) => {
  await p.screenshot({ path: join(outDir, `${name}.png`), fullPage });
  process.stdout.write(`shot ${name}\n`);
};

// Sign in through the real UI (local magic link shown on screen in development).
await page.goto(`${WEB}/auth/sign-in`);
await page.getByLabel("Email").fill(process.env.EMAIL ?? "demo@menu-studio.local");
await page.getByRole("button", { name: "Email me a sign-in link" }).click();
if (all || steps.has("signin")) await shot("01-sign-in-link");
await page.getByTestId("dev-magic-link").click();
await page.waitForURL(`${WEB}/`);
await page.getByText("Your menus").waitFor();
await page.waitForTimeout(600);
if (all || steps.has("dashboard")) await shot("02-dashboard");

const token = await page.evaluate(() => JSON.parse(localStorage.getItem("menu-studio.session") ?? "{}").token as string);
const projects = (await (await fetch(`${API}/projects`, { headers: { authorization: `Bearer ${token}` } })).json()) as { id: string; name: string }[];
const bistro = projects.find((p) => p.name === "Parisian bistro");
const bar = projects.find((p) => p.name === "Japanese-inspired cocktail bar");
if (!bistro || !bar) throw new Error("Seed projects missing; run pnpm db:seed");

if (all || steps.has("editor")) {
  await page.goto(`${WEB}/projects/${bistro.id}/editor`);
  await page.locator("[data-ms-page]").first().waitFor();
  await page.waitForTimeout(1500);
  await shot("03-editor");

  // Inline edit an item name, then undo it.
  const name = page.locator(".ms-item__name", { hasText: "Steak Frites" }).first();
  await name.click();
  await page.locator("[contenteditable=plaintext-only]").waitFor();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Steak Frites Maison");
  await page.keyboard.press("Enter");
  await page.getByText("Saved · version").waitFor();
  await page.waitForTimeout(800);
  const edited = await page.locator(".ms-item__name", { hasText: "Steak Frites Maison" }).count();
  await shot("04-inline-edit");
  await page.keyboard.press("ControlOrMeta+Z");
  await page.waitForTimeout(1200);
  const undone = await page.locator(".ms-item__name", { hasText: "Steak Frites Maison" }).count();
  process.stdout.write(`inline edit visible=${edited} after undo=${undone}\n`);

  const size = await page.locator("[data-ms-page] .ms-page__trim").first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    const zoom = Number(getComputedStyle(el.closest("[style*='zoom']") ?? el).zoom || 1);
    return { widthMm: Math.round(((r.width / zoom) * 25.4) / 96), heightMm: Math.round(((r.height / zoom) * 25.4) / 96) };
  });
  process.stdout.write(`trim size ${JSON.stringify(size)}\n`);

  await page.getByRole("tab", { name: "Design" }).click();
  await page.waitForTimeout(400);
  await shot("05-inspector");
}

if (all || steps.has("matrix")) {
  await page.goto(`${WEB}/projects/${bar.id}/editor`);
  await page.locator(".ms-matrix__label").first().waitFor();
  await page.waitForTimeout(2000);
  await shot("06-matrix-editor");
}

if (all || steps.has("export")) {
  const detail = (await (await fetch(`${API}/projects/${bistro.id}`, { headers: { authorization: `Bearer ${token}` } })).json()) as { head: { id: string } };
  const created = (await (await fetch(`${API}/projects/${bistro.id}/exports`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ versionId: detail.head.id, kind: "print_pack" }) })).json()) as { id: string };
  let status = "queued";
  let body: { status: string; error: string | null; files: { name: string; url: string; bytes: number }[] } = { status, error: null, files: [] };
  for (let i = 0; i < 90 && (status === "queued" || status === "rendering"); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    body = (await (await fetch(`${API}/exports/${created.id}`, { headers: { authorization: `Bearer ${token}` } })).json()) as typeof body;
    status = body.status;
  }
  process.stdout.write(`export ${status} ${body.error ?? ""} ${body.files.map((f) => `${f.name}:${f.bytes}`).join(", ")}\n`);
  if (body.files[0]) {
    const zip = await fetch(body.files[0].url);
    const buf = Buffer.from(await zip.arrayBuffer());
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(outDir, body.files[0].name), buf);
  }
}

if (all || steps.has("publish")) {
  const detail = (await (await fetch(`${API}/projects/${bar.id}`, { headers: { authorization: `Bearer ${token}` } })).json()) as { head: { id: string }; venue: { slug: string } };
  const published = (await (await fetch(`${API}/projects/${bar.id}/publish`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ versionId: detail.head.id, themeMode: "match_print" }) })).json()) as { url: string };
  process.stdout.write(`published ${published.url}\n`);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const qr = await phone.newPage();
  for (let i = 0; i < 30; i++) {
    const res = await qr.goto(published.url);
    if (res?.status() === 200) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  await qr.waitForTimeout(1200);
  await shot("07-qr-menu", qr);
  await qr.getByPlaceholder("Search the menu").fill("gin");
  await qr.waitForTimeout(300);
  await shot("08-qr-search", qr);
  await page.goto(`${WEB}/projects/${bar.id}/publish`);
  await page.waitForTimeout(2500);
  await shot("09-publish-page");
  await phone.close();
}

process.stdout.write(`console errors: ${errors.length}\n${errors.slice(0, 10).join("\n")}\n`);
await browser.close();
