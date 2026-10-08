import {defineConfig,devices} from "@playwright/test";
export default defineConfig({
 testDir:"./tests/browser",
 testMatch:/customer-next-connected(?:-orders)?\.spec\.ts/,
 workers:1,retries:0,timeout:60000,
 use:{...devices["Desktop Chrome"],viewport:{width:1672,height:941},baseURL:"http://127.0.0.1:5174",reducedMotion:"reduce"},
 webServer:{command:"VITE_CUSTOMER_NEXT_BACKEND_MODE=connected pnpm dev:customer-next",url:"http://127.0.0.1:5174",reuseExistingServer:!process.env.CI,timeout:90000},
});
