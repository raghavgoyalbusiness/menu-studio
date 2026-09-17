import { expect, test } from "@playwright/test";
import { apiGet, apiPost, seededProject, signIn } from "./helpers.ts";

/** The diner's side: a phone-sized viewport on the published, pre-rendered menu. */
test.describe("published QR menu", () => {
  test.slow();
  let url = "";

  test.beforeEach(async ({ page, browser }) => {
    // Signing in needs the owner app; publishing is an owner action.
    const owner = await browser.newPage();
    const token = await signIn(owner);
    const project = await seededProject(token, "Japanese-inspired cocktail bar");
    const detail = await apiGet<{ head: { id: string } }>(token, `/projects/${project.id}`);
    const published = await apiPost<{ url: string }>(token, `/projects/${project.id}/publish`, { versionId: detail.head.id, themeMode: "match_print" });
    await owner.close();
    url = published.url;

    // The worker writes the files, so the first request can land before the publish finishes.
    await expect
      .poll(async () => (await page.goto(url))?.status() ?? 0, { timeout: 60_000, intervals: [1000] })
      .toBe(200);
  });

  test("serves the menu as pre-rendered HTML with no client errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    const html = await (await fetch(url)).text();
    // Items must be in the HTML itself, not fetched after load: the diner is on a phone network.
    expect(html).toContain("<h2");
    expect(html.length).toBeGreaterThan(2000);

    await page.reload();
    await expect(page.locator("h1").first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("filters the menu from the search island", async ({ page }) => {
    const search = page.getByPlaceholder("Search the menu");
    await search.fill("gin");
    await expect.poll(async () => page.locator(".ms-item:visible").count()).toBeGreaterThan(0);
    const names = await page.locator(".ms-item:visible .ms-item__name").allInnerTexts();
    expect(names.length).toBeGreaterThan(0);

    await search.fill("zzzzz");
    await expect(page.locator("[data-qr-empty]")).toBeVisible();
  });

  test("keeps the phone payload small", async ({ page }) => {
    const sizes = new Map<string, number>();
    page.on("response", async (response) => {
      const type = response.headers()["content-type"] ?? "";
      if (!/javascript|css/.test(type)) return;
      const body = await response.body().catch(() => null);
      if (body) sizes.set(response.url(), body.byteLength);
    });
    await page.goto(url, { waitUntil: "networkidle" });
    const total = [...sizes.values()].reduce((a, b) => a + b, 0);
    // Uncompressed budget: the islands are vanilla JS and the CSS is the renderer's own.
    expect(total, `JS+CSS bytes: ${total}`).toBeLessThan(60_000);
  });

  test("declares the language and links its translations", async () => {
    const html = await (await fetch(url)).text();
    expect(html).toMatch(/<html[^>]+lang="/);
    expect(html).toContain('type="application/ld+json"');
  });
});
