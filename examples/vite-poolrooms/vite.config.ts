import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    // Resolve all @frapx packages to source so the example reflects edits
    // without a rebuild. Wildcard avoids per-export drift.
    alias: [
      {
        find: /^@frapx\/core$/,
        replacement: resolve(__dirname, "../../packages/core/src/index.ts")
      },
      {
        find: /^@frapx\/core\/(.*)$/,
        replacement: resolve(__dirname, "../../packages/core/src/$1.ts")
      },
      {
        find: /^@frapx\/fx-passes$/,
        replacement: resolve(__dirname, "../../packages/fx-passes/src/index.ts")
      },
      {
        find: /^@frapx\/glsl-raymarch$/,
        replacement: resolve(__dirname, "../../packages/glsl-raymarch/src/index.ts")
      },
      {
        find: /^@frapx\/glsl-sdf$/,
        replacement: resolve(__dirname, "../../packages/glsl-sdf/src/index.ts")
      },
      {
        find: /^@frapx\/tool-capture$/,
        replacement: resolve(__dirname, "../../packages/tool-capture/src/index.ts")
      }
    ]
  }
});
