import {test,expect} from "@playwright/test";
import fs from "node:fs";
const output="visual-output/admin-next";
test.beforeEach(async({page})=>{
 await page.route("**/api/**", route=>{throw new Error("Design-first Admin attempted DeeToo API: "+route.request().url());});
 await page.goto("/#/command");
});
test("captures four approved Phase 2 workspaces at 1536x1024",async({page})=>{
 fs.mkdirSync(output,{recursive:true});
 const screens:[string,string,string][]=[
  ["incidents","Incident Management","05-incident-management"],
  ["support","Support & Conversations","06-support-conversations"],
  ["merchants","Merchant Management","07-merchant-management"],
  ["customers","Customer Management","08-customer-management"],
 ];
 for(const [route,title,filename] of screens){
  await page.goto("/#/"+route);
  await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
  await expect(page.locator('[data-testid="screen-'+route+'"]')).toBeVisible();
  await page.screenshot({path:output+"/"+filename+".png",fullPage:true,animations:"disabled"});
 }
});
test("incident lifecycle: report, assign, investigate, resolve and persist history",async({page})=>{
 await page.goto("/#/incidents");
 await page.getByRole("button",{name:"Report Incident"}).click();
 const dialog=page.getByRole("dialog",{name:"Report new incident"});
 await dialog.getByLabel("Incident title").fill("Test vehicle issue at pickup");
 await dialog.getByLabel("Description").fill("Demo incident requires dispatch coordinator investigation.");
 await dialog.getByLabel("Severity").selectOption("HIGH");
 await dialog.getByRole("button",{name:"Report incident"}).click();
 await expect(page.locator(".dn-incident-table tbody tr").first()).toContainText("Test vehicle issue at pickup");
 await page.locator(".dn-incident-table tbody tr").first().click();
 await page.getByLabel("Assign investigator").selectOption("James K.");
 await page.getByRole("button",{name:"Change Status"}).click();
 const status=page.getByRole("dialog",{name:"Update incident lifecycle"});
 await status.getByLabel("Status").selectOption("INVESTIGATING");
 await status.getByLabel("Required investigation note").fill("Assigned to James K for follow-up.");
 await status.getByRole("button",{name:"Save status"}).click();
 await expect(page.locator(".dn-incident-title")).toContainText("investigating",{ignoreCase:true});
 await page.getByRole("button",{name:"Add Internal Note"}).click();
 await page.getByLabel("Investigation note").fill("Confirmed the rider is safe and vehicle needs service.");
 await page.getByRole("button",{name:"Save internal note"}).click();
 await page.getByRole("tab",{name:"Investigation"}).click();
 await expect(page.getByText("Confirmed the rider is safe and vehicle needs service.")).toBeVisible();
 await page.reload();
 await page.getByRole("tab",{name:/All \(/}).click();
 await expect(page.locator(".dn-incident-table tbody tr").first()).toContainText("Test vehicle issue at pickup");
});
test("support conversations separate public replies, private notes and admin resolution",async({page})=>{
 await page.goto("/#/support");
 await page.getByPlaceholder("Search conversations...").fill("SUP-1042");
 await expect(page.locator(".dn-support-item").first()).toBeVisible();
 await page.locator(".dn-support-item").first().click();
 await page.getByRole("tab",{name:"Internal Note",exact:true}).click();
 await page.getByRole("textbox",{name:"Private internal note"}).fill("Escalate traffic delay to shift lead.");
 await page.getByRole("button",{name:"Save Note"}).click();
 await page.getByRole("tab",{name:/Internal Notes/}).click();
 await expect(page.getByText("Escalate traffic delay to shift lead.")).toBeVisible();
 await page.getByRole("tab",{name:"Conversation"}).click();
 await expect(page.getByText("Escalate traffic delay to shift lead.")).toHaveCount(0);
 await page.getByRole("tab",{name:"Reply",exact:true}).click();
 await page.getByRole("textbox",{name:"Reply message"}).fill("Your order is being investigated. We will update you shortly.");
 await page.getByRole("button",{name:"Send",exact:true}).click();
 await expect(page.locator(".dn-chat-history").getByText("Your order is being investigated. We will update you shortly.")).toBeVisible();
 await page.getByRole("button",{name:"Escalate / Resolve"}).click();
 const resolution=page.getByRole("dialog",{name:"Admin case resolution"});
 await resolution.getByLabel("New status").selectOption("RESOLVED");
 await resolution.getByLabel("Resolution / audit note").fill("Driver and customer have been contacted and replacement confirmed.");
 await resolution.getByRole("button",{name:"Save case status"}).click();
 await expect(page.getByText("Simulate whether the participant is satisfied:")).toBeVisible();
 await page.getByRole("button",{name:"Still needs help"}).click();
 await expect(page.locator(".dn-conversation-heading")).toContainText("in progress",{ignoreCase:true});
 await page.reload();
 await page.getByPlaceholder("Search conversations...").fill("SUP-1042");
 await expect(page.locator(".dn-chat-history").getByText("Your order is being investigated. We will update you shortly.")).toBeVisible();
});
test("merchant onboarding, approval, branch and pause flow",async({page})=>{
 await page.goto("/#/merchants");
 await page.getByRole("button",{name:"Add Merchant"}).click();
 const create=page.getByRole("dialog",{name:"Add merchant"});
 await create.getByLabel("Business name").fill("Demo Westlands Bistro");
 await create.getByLabel("Owner").fill("Test Owner");
 await create.getByLabel("Email").fill("testowner@example.com");
 await create.getByLabel("Phone").fill("+254712345678");
 await create.getByRole("button",{name:"Create merchant"}).click();
 await expect(page.locator(".dn-merchant-table tbody tr").first()).toContainText("Demo Westlands Bistro");
 await page.locator(".dn-merchant-table tbody tr").first().click();
 await page.getByRole("button",{name:"Approve Merchant"}).click();
 const review=page.getByRole("dialog",{name:"Merchant approval / restriction"});
 await review.getByLabel("Required audit note").fill("KYC and demo documents reviewed.");
 await review.getByRole("button",{name:"Confirm merchant action"}).click();
 await expect(page.locator(".dn-merchant-top")).toContainText("active",{ignoreCase:true});
 await page.getByRole("tab",{name:/Branches \(/}).click();
 await page.getByRole("button",{name:"Add Branch"}).click();
 const branch=page.getByRole("dialog",{name:"Add merchant branch"});
 await branch.getByLabel("Branch name").fill("Westlands flagship");
 await branch.getByLabel("Area").fill("Westlands");
 await branch.getByLabel("Address").fill("Westlands Road");
 await branch.getByRole("button",{name:"Save branch"}).click();
 await expect(page.getByText("Westlands flagship",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Pause"}).click();
 await expect(page.locator(".dn-merchant-detail")).toContainText("paused",{ignoreCase:true});
});
test("customer creation, restriction, role gate and persisted profile",async({page})=>{
 await page.goto("/#/customers");
 await page.getByRole("button",{name:"Add Customer"}).click();
 const create=page.getByRole("dialog",{name:"Add customer"});
 await create.getByLabel("Name").fill("Demo Customer One");
 await create.getByLabel("Phone").fill("+254712345678");
 await create.getByLabel("Email").fill("demo.customer.one@example.com");
 await create.getByRole("button",{name:"Create customer"}).click();
 await page.getByPlaceholder("Search customers by name, phone, email...").fill("Demo Customer One");
 await expect(page.locator(".dn-customer-table tbody tr").first()).toContainText("Demo Customer One");
 await page.locator(".dn-customer-table tbody tr").first().click();
 await page.getByRole("button",{name:"Restrict Account"}).click();
 const status=page.getByRole("dialog",{name:"Change customer account status"});
 await status.getByLabel("Reason (required)").fill("Demo verification needs confirmation.");
 await status.getByRole("button",{name:"Confirm status change"}).click();
 await expect(page.locator(".dn-customer-top")).toContainText("restricted",{ignoreCase:true});
 await page.reload();
 await page.getByPlaceholder("Search customers by name, phone, email...").fill("Demo Customer One");
 await expect(page.locator(".dn-customer-table tbody tr").first()).toContainText("restricted",{ignoreCase:true});
 await page.locator(".dn-profile").click();
 await page.getByLabel("Simulated role").selectOption("SUPPORT");
 await page.locator(".dn-profile").click();
 await expect(page.getByRole("button",{name:"Add Customer"})).toBeDisabled();
});
