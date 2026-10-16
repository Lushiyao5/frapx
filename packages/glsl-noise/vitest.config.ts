import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // e2e/ holds Playwright specs that run on a real GPU.
    include: ["test/**/*.test.ts"]
  }
});
