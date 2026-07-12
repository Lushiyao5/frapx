import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/frapx/",
  plugins: [react()],
  resolve: {
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
        find: /^@frapx\/fx-canvas$/,
        replacement: resolve(__dirname, "../../packages/fx-canvas/src/index.ts")
      },
      {
        find: /^@frapx\/fx-canvas\/(.*)$/,
        replacement: resolve(__dirname, "../../packages/fx-canvas/src/$1.ts")
      },
      {
        find: /^@frapx\/glsl-flowmap$/,
        replacement: resolve(
          __dirname,
          "../../packages/glsl-flowmap/src/index.ts"
        )
      },
      {
        find: /^@frapx\/react-canvas$/,
        replacement: resolve(
          __dirname,
          "../../packages/react-canvas/src/index.ts"
        )
      }
    ]
  }
});
