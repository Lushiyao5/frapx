import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@frapx/runtime": path.resolve(__dirname, "../../packages/runtime/src/index.ts")
    }
  },
  test: {
    include: ["test/**/*.test.ts"]
  }
});
