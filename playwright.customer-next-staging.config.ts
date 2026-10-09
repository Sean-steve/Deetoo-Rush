import {defineConfig,devices} from "@playwright/test";
const raw=process.env.STAGING_CUSTOMER_BASE_URL;
if(!raw||!raw.startsWith("https://"))throw new Error("An HTTPS STAGING_CUSTOMER_BASE_URL is required for external staging acceptance.");
const u=new URL(raw);
if(["localhost","127.0.0.1"].includes(u.hostname))throw new Error("Local UI is not production staging.");
export default defineConfig({
 testDir:"./tests/browser",
 testMatch:"customer-next-staging.spec.ts",
 timeout:75000,
 expect:{timeout:10000},
 retries:0,
 workers:1,
 use:{...devices["Desktop Chrome"],baseURL:u.origin,trace:"retain-on-failure",screenshot:"only-on-failure"},
 reporter:"list",
});
