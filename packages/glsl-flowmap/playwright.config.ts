import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  webServer: {
    command: "../../node_modules/.bin/vite ../../examples/vite-flowmap --host 127.0.0.1 --port 5175",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: true
  },
  use: {
    baseURL: "http://127.0.0.1:5175"
  }
});
