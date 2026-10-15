import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    // Resolve @frapx packages to source so the example reflects edits
    // without a rebuild.
    alias: [
      { find: /^@frapx\/core$/, replacement: resolve(__dirname, "../../packages/core/src/index.ts") },
      { find: /^@frapx\/core\/(.*)$/, replacement: resolve(__dirname, "../../packages/core/src/$1.ts") },
      { find: /^@frapx\/fx-canvas$/, replacement: resolve(__dirname, "../../packages/fx-canvas/src/index.ts") },
      { find: /^@frapx\/fx-canvas\/(.*)$/, replacement: resolve(__dirname, "../../packages/fx-canvas/src/$1.ts") },
      { find: /^@frapx\/glsl-sdf$/, replacement: resolve(__dirname, "../../packages/glsl-sdf/src/index.ts") },
      { find: /^@frapx\/tool-dev$/, replacement: resolve(__dirname, "../../packages/tool-dev/src/index.ts") }
    ]
  }
});
