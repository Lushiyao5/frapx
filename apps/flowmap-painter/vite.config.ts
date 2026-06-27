import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/frapx/",
  plugins: [react()],
  resolve: {
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
        replacement: resolve(
          __dirname,
          "../../packages/shader-flowmap/src/index.ts"
        )
      },
      {
        find: /^@frapx\/shader-react$/,
        replacement: resolve(
          __dirname,
          "../../packages/shader-react/src/index.ts"
        )
      }
    ]
  }
});
