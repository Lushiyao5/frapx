import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    // Resolve all @frapx packages to source so the example reflects edits
    // without a rebuild. Wildcard avoids per-export drift.
    alias: [
      {
        find: /^@frapx\/runtime$/,
        replacement: resolve(__dirname, "../../packages/runtime/src/index.ts")
      },
      {
        find: /^@frapx\/runtime\/(.*)$/,
        replacement: resolve(__dirname, "../../packages/runtime/src/$1.ts")
      },
      {
        find: /^@frapx\/shader$/,
        replacement: resolve(__dirname, "../../packages/shader/src/index.ts")
      },
      {
        find: /^@frapx\/shader\/(.*)$/,
        replacement: resolve(__dirname, "../../packages/shader/src/$1.ts")
      },
      {
        find: /^@frapx\/shader-flowmap$/,
        replacement: resolve(__dirname, "../../packages/shader-flowmap/src/index.ts")
      }
    ]
  }
});
