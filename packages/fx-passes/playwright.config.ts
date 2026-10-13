import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Each test renders on the headless GPU; parallel contexts can be lost.
  workers: 1,
  webServer: {
    command: "pnpm --dir ../../examples/vite-passes dev --host 127.0.0.1 --port 5179",
    url: "http://127.0.0.1:5179/?test",
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://127.0.0.1:5179"
  }
});
