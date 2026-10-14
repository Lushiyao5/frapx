import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  dts: { entry: "src/index.ts" },
  sourcemap: true,
  clean: true,
  minify: false
});
