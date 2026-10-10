import {defineConfig,devices} from "@playwright/test";
export default defineConfig({
  testDir:"./tests/browser",
  testMatch:/admin-next-phase1\.spec\.ts/,
  workers:1,
  retries:0,
  timeout:60000,
  use:{
    ...devices["Desktop Chrome"],
    viewport:{width:1536,height:1024},
    reducedMotion:"reduce",
    baseURL:"http://127.0.0.1:5178",
    trace:"retain-on-failure",
  },
  webServer:{
    command:"pnpm dev:admin-next",
    url:"http://127.0.0.1:5178",
    reuseExistingServer:!process.env.CI,
    timeout:90000,
  },
});
