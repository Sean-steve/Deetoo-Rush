import {test,expect} from "@playwright/test";
import fs from "node:fs";
const dir="visual-output/admin-next";
test.beforeEach(async({page})=>{
 await page.route("**/api/**",route=>{throw new Error("Frontend-only Admin attempted backend request: "+route.request().url());});
 await page.goto("/#/command");
});
test("approved Phase 3 screenshots render at the 1536×1024 reference viewport",async({page})=>{
 fs.mkdirSync(dir,{recursive:true});
 const screens:[string,string,string][]=[
  ["geography","Geography & Service Coverage","09-geography-coverage"],
  ["payments","Payments & Refunds","10-payments-refunds"],
  ["settlements","Settlements & Payouts","11-settlements-payouts"],
  ["financial","Financial Control Center","12-financial-control"],
 ];
 for(const [route,heading,file] of screens){
  await page.goto("/#/"+route);
  await expect(page.getByRole("heading",{name:heading,exact:true})).toBeVisible();
  await expect(page.locator('[data-testid="screen-'+route+'"]')).toBeVisible();
  await page.screenshot({path:dir+"/"+file+".png",animations:"disabled",fullPage:true});
 }
});
test("geography: county switch, new zone, policy and existing-order safety persist",async({page})=>{
 await page.goto("/#/geography");
 await expect(page.getByText("47 counties",{exact:false}).first()).toBeVisible();
 await page.getByRole("switch",{name:"Enable Nairobi deliveries"}).click();
 let modal=page.getByRole("dialog",{name:"Pause county coverage"});
 await modal.getByLabel("Required reason").fill("Temporary simulated operational suspension");
 await modal.getByRole("button",{name:"Pause county"}).click();
 await expect(page.locator(".dn-geo-selected")).toContainText("paused",{ignoreCase:true});
 await expect(page.locator(".dn-geo-detail")).toContainText("in-progress orders were already created");
 await page.getByRole("button",{name:"Edit Delivery Rules"}).click();
 modal=page.getByRole("dialog",{name:"Edit county delivery rules"});
 await modal.getByLabel("Base fee (KES)").fill("275");
 await modal.getByLabel("Estimated delivery (minutes)").fill("52");
 await modal.getByLabel("Required reason").fill("Demo pricing policy update");
 await modal.getByRole("button",{name:"Save rules"}).click();
 await expect(page.locator(".dn-geo-detail")).toContainText("KES 275");
 await page.getByRole("button",{name:"Add Zone to Nairobi"}).click();
 modal=page.getByRole("dialog",{name:"Add service zone"});
 await modal.getByLabel("Zone name").fill("Nairobi Industrial Area");
 await modal.getByRole("button",{name:"Create zone"}).click();
 await expect(page.locator(".dn-geo-zones")).toContainText("Nairobi Industrial Area");
 await page.reload();
 await expect(page.locator(".dn-geo-detail")).toContainText("KES 275");
 await expect(page.locator(".dn-geo-zones")).toContainText("Nairobi Industrial Area");
 await page.goto("/#/orders");
 await expect(page.locator(".dn-order-line").first()).toBeVisible();
});
test("payment lifecycle: refund request, approval, independent ledger and reconciliation",async({page})=>{
 await page.goto("/#/payments");
 await expect(page.getByRole("heading",{name:"Payments & Refunds"})).toBeVisible();
 await page.getByRole("button",{name:"Request Refund"}).click();
 let modal=page.getByRole("dialog",{name:"Request customer refund"});
 await modal.getByLabel("Refund amount (KES)").fill("150");
 await modal.getByLabel("Reason (required)").fill("Sample missing item adjustment for acceptance");
 await modal.getByRole("button",{name:"Submit refund request"}).click();
 await expect(page.locator(".dn-fin-table tbody")).toContainText("150");
 await page.locator(".dn-fin-table tbody").getByRole("button",{name:"Approve"}).first().click();
 modal=page.getByRole("dialog",{name:"Approve refund"});
 await modal.getByLabel("Required audit explanation").fill("Supervisor reviewed request and authorized demo refund.");
 await modal.getByRole("button",{name:"Confirm decision"}).click();
 await expect(page.locator(".dn-fin-table tbody")).toContainText("approved",{ignoreCase:true});
 await page.goto("/#/financial");
 await page.getByRole("tab",{name:/Financial Ledger/}).click();
 await page.getByRole("combobox",{name:"Ledger entry type"}).selectOption("Refund");
 await expect(page.locator(".dn-fin-table tbody tr").first()).toContainText("150");
 await page.reload();
 await page.getByRole("combobox",{name:"Ledger entry type"}).selectOption("Refund");
 await expect(page.locator(".dn-fin-table tbody tr").first()).toContainText("150");
});
test("payout draft approval and paid marker flow appears in financial ledger",async({page})=>{
 await page.goto("/#/settlements");
 await page.getByRole("button",{name:"Create Payout Batch"}).click();
 let modal=page.getByRole("dialog",{name:"Create payout batch"});
 await modal.getByLabel("Batch scope").selectOption("sample");
 await expect(modal).toContainText("Eligible orders");
 await modal.getByRole("button",{name:"Create draft batch"}).click();
 await expect(page.locator(".dn-settlement-table tbody tr").first()).toContainText("draft",{ignoreCase:true});
 await page.getByRole("button",{name:"Approve Batch"}).click();
 modal=page.getByRole("dialog",{name:"Approve payout batch"});
 await modal.getByLabel("Required review note").fill("Simulated merchant eligibility and allocations were reviewed.");
 await modal.getByRole("button",{name:"Approve batch"}).click();
 await expect(page.locator(".dn-settlement-selected")).toContainText("approved",{ignoreCase:true});
 await page.getByRole("button",{name:"Mark Paid (Demo)"}).click();
 modal=page.getByRole("dialog",{name:"Mark payout as paid (simulation)"});
 await modal.getByLabel("Unique demo settlement reference").fill("SIM-PAYOUT-90001");
 await modal.getByLabel("Required audit evidence").fill("Mock provider acknowledgement entered for frontend testing.");
 await modal.getByRole("button",{name:"Save simulated paid marker"}).click();
 await expect(page.locator(".dn-settlement-selected")).toContainText("paid",{ignoreCase:true});
 await page.goto("/#/financial");
 await page.getByRole("combobox",{name:"Ledger entry type"}).selectOption("Merchant payout");
 await expect(page.locator(".dn-fin-table tbody")).toContainText("SIM-PAYOUT-90001");
 await page.reload();
 await page.getByRole("combobox",{name:"Ledger entry type"}).selectOption("Merchant payout");
 await expect(page.locator(".dn-fin-table tbody")).toContainText("SIM-PAYOUT-90001");
});
test("rider allocations, policy snapshot and simulated role restrictions",async({page})=>{
 await page.goto("/#/settlements");
 await page.getByRole("tab",{name:"Rider Payouts"}).click();
 await page.getByRole("button",{name:"Create Payout Batch"}).click();
 const modal=page.getByRole("dialog",{name:"Create payout batch"});
 await expect(modal.getByText("Eligible orders")).toBeVisible();
 await modal.getByRole("button",{name:"Create draft batch"}).click();
 await expect(page.locator(".dn-settlement-selected")).toContainText("RIDER");
 await page.goto("/#/financial");
 await page.getByRole("button",{name:"Commercial Controls"}).click();
 const policy=page.getByRole("dialog",{name:"Edit commercial controls"});
 await policy.getByLabel("Merchant commission (%)").fill("16");
 await policy.getByLabel("Rider delivery share (%)").fill("82");
 await policy.getByLabel("Merchant reserve (%)").fill("2");
 await policy.getByLabel("Required approval note").fill("Demo commercial policy signed off for the new review period.");
 await policy.getByRole("button",{name:"Save commercial policy"}).click();
 await expect(page.locator('[data-testid="screen-financial"]')).toContainText("16%");
 await page.locator(".dn-profile").click();
 await page.getByLabel("Simulated role").selectOption("SUPPORT");
 await page.locator(".dn-profile").click();
 await expect(page.getByRole("button",{name:"Commercial Controls"})).toBeDisabled();
 await page.goto("/#/settlements");
 await expect(page.getByRole("button",{name:"Create Payout Batch"})).toBeDisabled();
});
test("geographic county coverage is all 47 and no real provider call is made",async({page})=>{
 await page.goto("/#/geography");
 await expect(page.locator(".dn-geo-county")).toHaveCount(47);
 await page.getByPlaceholder("Search a county...").fill("Kisumu");
 await expect(page.locator(".dn-geo-county")).toHaveCount(1);
 await page.locator(".dn-geo-county").first().click();
 await expect(page.locator(".dn-geo-selected")).toContainText("Kisumu");
 await page.getByRole("switch",{name:"Enable Kisumu deliveries"}).click();
 const modal=page.getByRole("dialog",{name:"Enable county coverage"});
 await modal.getByLabel("Required reason").fill("Launch approval for simulated Kisumu operations");
 await modal.getByRole("button",{name:"Enable county"}).click();
 await expect(page.locator(".dn-geo-selected")).toContainText("enabled",{ignoreCase:true});
});
