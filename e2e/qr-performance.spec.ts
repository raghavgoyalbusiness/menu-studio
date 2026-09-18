import { expect, test } from "@playwright/test";
import { apiGet, apiPost, seededProject, signIn } from "./helpers.ts";

/**
 * The diner's real conditions: a phone on a restaurant's patchy 4G, holding a paper QR code.
 * The page is pre-rendered HTML with two small vanilla islands, so this asserts the thing that
 * actually matters — how long until they can read the menu.
 *
 * Throttling is CDP-level, so it applies to localhost too. Numbers are the Lighthouse "good"
 * thresholds with headroom for a CI runner.
 */
const FOUR_G = { offline: false, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8, latency: 70 };
const CPU_SLOWDOWN = 4; // a mid-range Android next to the CI runner's CPU

interface Vitals {
  lcpMs: number;
  fcpMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  transferredBytes: number;
  requests: number;
}

test.describe("QR menu performance", () => {
  test.slow();

  test("is readable within 2.5 s on a throttled 4G phone", async ({ page, browser }) => {
    const owner = await browser.newPage();
    const token = await signIn(owner);
    const project = await seededProject(token, "Japanese-inspired cocktail bar");
    const detail = await apiGet<{ head: { id: string } }>(token, `/projects/${project.id}`);
    const published = await apiPost<{ url: string }>(token, `/projects/${project.id}/publish`, { versionId: detail.head.id, themeMode: "match_print" });
    await owner.close();

    await expect.poll(async () => (await page.goto(published.url))?.status() ?? 0, { timeout: 60_000, intervals: [1000] }).toBe(200);

    const client = await page.context().newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", FOUR_G);
    await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });

    let transferredBytes = 0;
    let requests = 0;
    page.on("response", (response) => {
      requests++;
      const length = Number(response.headers()["content-length"] ?? 0);
      transferredBytes += Number.isFinite(length) ? length : 0;
    });

    // LCP is delivered to a PerformanceObserver only — it is not in the performance timeline —
    // so the observer has to exist before the document starts loading.
    await page.addInitScript(() => {
      (window as unknown as { __lcp: number }).__lcp = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) (window as unknown as { __lcp: number }).__lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });

    await page.goto(published.url, { waitUntil: "load" });
    // LCP is only final once the page settles; give the observer a beat after load.
    await page.waitForTimeout(1500);

    const vitals = await page.evaluate<Omit<Vitals, "transferredBytes" | "requests">>(() => {
      const paint = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint");
      const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return {
        lcpMs: (window as unknown as { __lcp: number }).__lcp,
        fcpMs: paint?.startTime ?? 0,
        domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
        loadMs: navigation?.loadEventEnd ?? 0,
      };
    });

    const measured: Vitals = { ...vitals, transferredBytes, requests };
    test.info().annotations.push({
      type: "vitals",
      description: `LCP ${Math.round(measured.lcpMs)} ms · FCP ${Math.round(measured.fcpMs)} ms · DCL ${Math.round(measured.domContentLoadedMs)} ms · load ${Math.round(measured.loadMs)} ms · ${measured.requests} requests`,
    });

    expect(measured.lcpMs, `LCP was ${Math.round(measured.lcpMs)} ms`).toBeGreaterThan(0);
    expect(measured.lcpMs, `LCP was ${Math.round(measured.lcpMs)} ms`).toBeLessThan(2500);
    expect(measured.fcpMs, `FCP was ${Math.round(measured.fcpMs)} ms`).toBeLessThan(1800);
  });

  test("shows the menu even when its JavaScript never arrives", async ({ page, browser }) => {
    const owner = await browser.newPage();
    const token = await signIn(owner);
    const project = await seededProject(token, "Japanese-inspired cocktail bar");
    const detail = await apiGet<{ head: { id: string } }>(token, `/projects/${project.id}`);
    const published = await apiPost<{ url: string }>(token, `/projects/${project.id}/publish`, { versionId: detail.head.id, themeMode: "match_print" });
    await owner.close();

    await expect.poll(async () => (await page.goto(published.url))?.status() ?? 0, { timeout: 60_000, intervals: [1000] }).toBe(200);

    // The islands are an enhancement; the menu itself is server-rendered HTML.
    await page.route("**/*.js", (route) => route.abort());
    await page.goto(published.url, { waitUntil: "domcontentloaded" });

    await expect(page.locator("h1").first()).toBeVisible();
    expect(await page.locator(".ms-item__name").count()).toBeGreaterThan(5);
  });
});
