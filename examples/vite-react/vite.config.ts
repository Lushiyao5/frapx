import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@frapx\/fx-canvas$/,
        replacement: resolve(__dirname, "../../packages/fx-canvas/src/index.ts")
      },
      {
        find: /^@frapx\/fx-canvas\/(.*)$/,
        replacement: resolve(__dirname, "../../packages/fx-canvas/src/$1.ts")
      },
      {
        find: /^@frapx\/react-canvas$/,
        replacement: resolve(__dirname, "../../packages/react-canvas/src/index.ts")
      }
    ]
  }
});
