import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Each test renders on the headless GPU; parallel contexts can be lost.
  workers: 1,
  webServer: {
    command: "pnpm --dir ../../examples/vite-capture dev --host 127.0.0.1 --port 5178",
    url: "http://127.0.0.1:5178",
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://127.0.0.1:5178"
  }
});
