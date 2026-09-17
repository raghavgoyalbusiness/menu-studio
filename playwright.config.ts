import { defineConfig, devices } from "@playwright/test";

const WEB = process.env.WEB_URL ?? "http://127.0.0.1:5223";
const API = process.env.API_URL ?? "http://127.0.0.1:5323";
const MENU = process.env.MENU_URL ?? "http://127.0.0.1:5224";
const WORKER_HEALTH = Number(process.env.WORKER_HEALTH_PORT ?? 5324);
const ci = Boolean(process.env.CI);

/**
 * End-to-end tests run against the real local stack: embedded Postgres, API, worker, owner app and
 * the published-menu server. `reuseExistingServer` means a stack you already have running (pnpm dev)
 * is used as-is.
 *
 * Visual baselines are generated only in the Linux Playwright image, so the visual project is
 * skipped elsewhere (see e2e/visual.spec.ts).
 */
export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.artifacts",
  globalSetup: "./e2e/global-setup.ts",
  // One stack, one database: tests share seeded projects and must not race each other.
  workers: 1,
  fullyParallel: false,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
  reporter: ci ? [["github"], ["html", { open: "never", outputFolder: "playwright-report" }]] : [["list"]],
  snapshotPathTemplate: "e2e/baselines/{testFileName}/{arg}-{platform}{ext}",
  use: {
    baseURL: WEB,
    trace: "on-first-retry",
    video: ci ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "owner", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /qr-menu\.spec\.ts/ },
    // A phone-sized Chromium. For real iOS Safari coverage add a WebKit project after
    // `pnpm exec playwright install webkit`; the CI image already carries it.
    { name: "diner", use: { ...devices["Pixel 7"] }, testMatch: /qr-menu\.spec\.ts/ },
  ],
  webServer: [
    { command: "pnpm db:start", port: Number(process.env.LOCAL_DB_PORT ?? 54329), reuseExistingServer: true, timeout: 120_000, stdout: "pipe" },
    { command: "pnpm --filter @menu-studio/api dev", url: `${API}/health`, reuseExistingServer: true, timeout: 120_000, stdout: "pipe" },
    { command: "pnpm --filter @menu-studio/web dev", url: WEB, reuseExistingServer: true, timeout: 120_000 },
    // The menu server only knows published slugs, so "/" is a 404 and Playwright must wait on the
    // port rather than on a 2xx.
    { command: "pnpm --filter @menu-studio/menu dev", port: Number(new URL(MENU).port || 80), reuseExistingServer: true, timeout: 120_000 },
    { command: "pnpm --filter @menu-studio/worker dev", url: `http://127.0.0.1:${WORKER_HEALTH}/health`, reuseExistingServer: true, timeout: 180_000, stdout: "pipe" },
  ],
});
