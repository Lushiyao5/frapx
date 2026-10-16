import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@frapx/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@frapx/glsl-noise": path.resolve(__dirname, "../../packages/glsl-noise/src/index.ts")
    }
  },
  test: {
    include: ["test/**/*.test.ts"]
  }
});
