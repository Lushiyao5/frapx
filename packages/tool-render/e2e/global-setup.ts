import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default function globalSetup() {
  execFileSync("pnpm", ["--dir", fileURLToPath(new URL("../../../examples/vite-capture", import.meta.url)), "build"], {
    stdio: "inherit"
  });
}
