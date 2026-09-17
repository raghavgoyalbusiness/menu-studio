import { expect, test } from "@playwright/test";
import { apiGet, seededProject, signIn, type ProjectSummary } from "./helpers.ts";

test.describe("owner happy path", () => {
  let token = "";
  let bistro: ProjectSummary;

  test.beforeEach(async ({ page }) => {
    token = await signIn(page);
    bistro = await seededProject(token, "Parisian bistro");
  });

  test("signs in and lists the venues with their menus", async ({ page }) => {
    await expect(page.getByText("Your menus")).toBeVisible();
    // The name also shows up in the recent-exports list, so match the menu's own card link.
    await expect(page.getByRole("link", { name: /Parisian bistro/ }).first()).toBeVisible();
  });

  test("renders an A4 page at exactly 210 x 297 mm", async ({ page }) => {
    await page.goto(`/projects/${bistro.id}/editor`);
    const trim = page.locator("[data-ms-page] .ms-page__trim").first();
    await trim.waitFor();
    // The canvas scales the page with CSS zoom, so undo the zoom before converting px to mm.
    const size = await trim.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const zoomed = el.closest<HTMLElement>("[style*='zoom']") ?? el;
      const zoom = Number(getComputedStyle(zoomed).zoom || 1);
      return { widthMm: ((rect.width / zoom) * 25.4) / 96, heightMm: ((rect.height / zoom) * 25.4) / 96 };
    });
    expect(size.widthMm).toBeCloseTo(210, 0);
    expect(size.heightMm).toBeCloseTo(297, 0);
  });

  test("commits an inline rename as a new version and undoes it", async ({ page }) => {
    // Read the name from the document rather than hard-coding it, and put it back at the end:
    // the seeded menus are shared by every test in this file.
    const before = await apiGet<{ head: { seq: number; document: { sections: { title: string; items: { name: string }[] }[] } } }>(token, `/projects/${bistro.id}`);
    const original = before.head.document.sections.flatMap((s) => s.items)[0]?.name;
    if (!original) throw new Error("The seeded bistro menu has no items");
    const renamed = `${original} Maison`;

    await page.goto(`/projects/${bistro.id}/editor`);
    const name = page.locator(".ms-item__name", { hasText: original }).first();
    await name.waitFor();
    await name.click();
    // The overlay is uncontrolled and plain text. Select through the DOM: a select-all shortcut
    // behaves differently per platform inside contenteditable.
    const editing = page.locator("[contenteditable=plaintext-only]");
    await editing.waitFor();
    await editing.selectText();
    await page.keyboard.type(renamed);
    await page.keyboard.press("Enter");

    await expect(page.locator(".ms-item__name", { hasText: renamed })).toBeVisible();
    await expect.poll(async () => (await apiGet<{ head: { seq: number } }>(token, `/projects/${bistro.id}`)).head.seq).toBeGreaterThan(before.head.seq);

    // Undo moves the project's head back along the version chain, so the menu reads as it did.
    await page.keyboard.press("ControlOrMeta+Z");
    await expect(page.locator(".ms-item__name", { hasText: renamed })).toHaveCount(0);
    await expect(page.locator(".ms-item__name", { hasText: original }).first()).toBeVisible();
    const after = await apiGet<{ head: { document: { sections: { items: { name: string }[] }[] } } }>(token, `/projects/${bistro.id}`);
    expect(after.head.document.sections.flatMap((s) => s.items)[0]?.name).toBe(original);
  });

  test("never renders owner text through innerHTML", async ({ page }) => {
    await page.goto(`/projects/${bistro.id}/editor`);
    await page.locator("[data-ms-page]").first().waitFor();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // A script tag in a menu item must stay text; if it were injected as HTML it would execute.
    const injected = await page.evaluate(() => document.querySelectorAll("[data-ms-page] script").length);
    expect(injected).toBe(0);
    expect(errors).toEqual([]);
  });

  test("shows the flavor matrix for the cocktail bar", async ({ page }) => {
    const bar = await seededProject(token, "Japanese-inspired cocktail bar");
    await page.goto(`/projects/${bar.id}/editor`);
    const labels = page.locator(".ms-matrix__label");
    await labels.first().waitFor();
    expect(await labels.count()).toBeGreaterThanOrEqual(6);

    // Labels are placed by the collision pass, so none of them may overlap.
    const boxes = await labels.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
    const overlaps = boxes.flatMap((a, i) =>
      boxes.slice(i + 1).filter((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h),
    );
    expect(overlaps).toHaveLength(0);
  });
});
