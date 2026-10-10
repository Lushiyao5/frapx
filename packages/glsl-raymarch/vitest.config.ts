import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      // Test against source so the collision check runs without a build.
      "@frapx/glsl-sdf": path.resolve(__dirname, "../../packages/glsl-sdf/src/index.ts")
    }
  },
  test: {
    environment: "node",
    // e2e/ holds Playwright specs that run on a real GPU.
    include: ["test/**/*.test.ts"]
  }
});
