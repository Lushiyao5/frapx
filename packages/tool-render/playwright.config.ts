import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // render() launches its own browser, and GPU contexts can be lost under load.
  workers: 1,
  timeout: 60_000,
  // Builds examples/vite-capture, which the tests render from its dist/.
  globalSetup: "./e2e/global-setup.ts"
});
