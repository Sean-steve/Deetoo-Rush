import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  testMatch: /customer-visual-audit\.spec\.ts/,
  workers: 1,
  retries: 0,
  timeout: 120000,
  use: { ...devices["Desktop Chrome"], viewport: {width:1672,height:941}, reducedMotion:"reduce", trace:"retain-on-failure" },
  webServer: [
    {command:"pnpm dev:api",url:"http://127.0.0.1:3000/health",reuseExistingServer:false,timeout:60000,env:{APP_ENV:"development",NODE_ENV:"development",DEETOO_STORAGE_MODE:"memory",DEETOO_FIXTURES:"true",PORT:"3000"}},
    {command:"pnpm dev:customer --host 127.0.0.1",url:"http://127.0.0.1:5173",reuseExistingServer:false,timeout:60000}
  ]
});