import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // e2e/ holds Playwright specs that launch a browser.
    include: ["test/**/*.test.ts"]
  }
});
