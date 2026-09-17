import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["../../packages/server-core/test/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
