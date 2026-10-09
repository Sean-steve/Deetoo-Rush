import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: /customer-next-preview\.spec\.ts/,
  workers: 1,
  retries: 0,
  timeout: 60000,
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1672, height: 941 },
    reducedMotion: "reduce",
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev:customer-next",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 90000,
  },
});
