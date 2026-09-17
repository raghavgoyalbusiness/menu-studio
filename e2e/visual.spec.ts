import { expect, test } from "@playwright/test";
import { apiGet, signIn, type ProjectSummary } from "./helpers.ts";

/**
 * Renderer snapshots. Text metrics differ between macOS and Linux, so baselines are generated
 * only in the Linux Playwright image (the same one CI uses) and the suite is skipped elsewhere.
 * Regenerate with: pnpm e2e --update-snapshots
 */
test.describe("renderer appearance", () => {
  test.skip(process.platform !== "linux", "Visual baselines are Linux-only; see docs/RUNBOOK.md");
  test.slow();

  test("each seeded menu matches its baseline", async ({ page }) => {
    const token = await signIn(page);
    const projects = await apiGet<ProjectSummary[]>(token, "/projects");
    expect(projects.length).toBeGreaterThanOrEqual(4);

    for (const project of projects) {
      await page.goto(`/projects/${project.id}/editor`);
      const firstPage = page.locator("[data-ms-page]").first();
      await firstPage.waitFor();
      // The editor does not publish the print route's ready signal, so wait for the same two
      // things it waits on: the menu fonts, and every flavor matrix finishing its placement pass.
      await page.waitForFunction(() => document.fonts.status === "loaded" && !document.querySelector('[data-ms-matrix-ready="false"]'), undefined, { timeout: 30_000 });
      await expect(firstPage).toHaveScreenshot(`${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`, { animations: "disabled" });
    }
  });
});
