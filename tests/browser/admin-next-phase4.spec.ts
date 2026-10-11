import {test,expect} from "@playwright/test";
import fs from "node:fs";
const out="visual-output/admin-next";
test.beforeEach(async({page})=>{
 await page.route("**/api/**",route=>{throw new Error("Frontend-only Admin attempted DeeToo backend request: "+route.request().url());});
 await page.goto("/#/command");
});
test("screens 13–16 render and capture 1536x1024 reference screenshots",async({page})=>{
 fs.mkdirSync(out,{recursive:true});
 for(const [route,heading,file] of [
  ["analytics","Analytics & Reports","13-analytics-reports"],
  ["notifications","Notifications & Communications","14-notifications-communications"],
  ["security","Identity, Access & Security","15-identity-access-security"],
  ["system","System Health & Configuration","16-system-health-configuration"]
 ]){
  await page.goto("/#/"+route);
  await expect(page.getByRole("heading",{name:heading,exact:true})).toBeVisible();
  await expect(page.locator('[data-testid="screen-'+route+'"]')).toBeVisible();
  await page.screenshot({path:out+"/"+file+".png",animations:"disabled",fullPage:true});
 }
 await expect(page.locator(".dn-nav-link")).toHaveCount(16);
});
test("analytics filters, CSV export and saved report persist across navigation",async({page})=>{
 await page.goto("/#/analytics");
 await page.getByLabel("Analytics metric").selectOption("REVENUE");
 await page.getByLabel("Analytics date range").selectOption("7D");
 await page.getByRole("button",{name:"Save Report"}).click();
 const dialog=page.getByRole("dialog",{name:"Save analytical report"});
 await dialog.getByLabel("Report name").fill("Nairobi Test Revenue");
 await dialog.getByLabel("Cadence preference").selectOption("WEEKLY");
 await dialog.getByRole("button",{name:"Save report view"}).click();
 await expect(page.getByRole("tab",{name:/Saved Reports/})).toHaveAttribute("aria-selected","true");
 await expect(page.locator(".dn-p4-saved")).toContainText("Nairobi Test Revenue");
 await page.reload();
 await page.getByRole("tab",{name:/Saved Reports/}).click();
 await page.getByRole("row").filter({hasText:"Nairobi Test Revenue"}).getByRole("button",{name:"Open"}).click();
 await expect(page.getByLabel("Analytics metric")).toHaveValue("REVENUE");
 await expect(page.getByLabel("Analytics date range")).toHaveValue("7D");
 await page.getByRole("button",{name:"Export CSV"}).click();
 await expect(page.getByText(/Filtered demo report exported/)).toBeVisible();
});
test("notification workflow: drafts, approval, inbox read state and templates",async({page})=>{
 await page.goto("/#/notifications");
 await page.getByRole("button",{name:"Compose Message"}).click();
 let dialog=page.getByRole("dialog",{name:"Compose communication"});
 await dialog.getByLabel("Message title").fill("Demo Coverage Bulletin");
 await dialog.getByLabel("Message body").fill("This is an operational coverage bulletin for testing the admin user experience.");
 await dialog.getByLabel("Audience").selectOption("CUSTOMERS");
 await dialog.getByLabel("Channel").selectOption("IN_APP");
 await dialog.getByRole("button",{name:"Save draft"}).click();
 await expect(page.locator(".dn-p4-campaign-head")).toContainText("Demo Coverage Bulletin");
 await page.getByRole("button",{name:"Approve Simulated Send"}).click();
 dialog=page.getByRole("dialog",{name:"Approve simulated send"});
 await dialog.getByLabel("Approval reason").fill("Demo communication content reviewed by Super Admin.");
 await dialog.getByRole("button",{name:"Mark sent in demo"}).click();
 await expect(page.locator(".dn-p4-campaign-head")).toContainText("sent",{ignoreCase:true});
 await page.getByRole("tab",{name:/Notification Center/}).click();
 await expect(page.locator(".dn-notification-events")).toContainText("Simulated communication sent");
 await page.getByRole("button",{name:"Mark all read"}).click();
 await expect(page.getByRole("button",{name:/Unread Alerts \(0\)/})).toBeVisible();
 await page.reload();
 await expect(page.getByRole("button",{name:/Unread Alerts \(0\)/})).toBeVisible();
 await page.getByRole("tab",{name:/Message Templates/}).click();
 await page.getByRole("button",{name:"Create Template"}).click();
 dialog=page.getByRole("dialog",{name:"Create communication template"});
 await dialog.getByLabel("Template name").fill("Nairobi Safety Update");
 await dialog.getByLabel("Subject").fill("Safety during deliveries");
 await dialog.getByLabel("Content").fill("Please follow safety guidelines when navigating public roads in Nairobi.");
 await dialog.getByRole("button",{name:"Save template"}).click();
 await expect(page.locator(".dn-p4-templates")).toContainText("Nairobi Safety Update");
});
test("security: prevents last Super Admin lockout and supports invitations and sessions",async({page})=>{
 await page.goto("/#/security");
 await expect(page.locator(".dn-p4-user-details")).toContainText("last active Super Admin");
 await expect(page.getByRole("button",{name:"Suspend / Restrict"})).toBeDisabled();
 await page.getByRole("button",{name:"Invite Admin"}).click();
 let dialog=page.getByRole("dialog",{name:"Invite administrator"});
 await dialog.getByLabel("Full name").fill("Security Test Admin");
 await dialog.getByLabel("Email").fill("security.qa@example.com");
 await dialog.getByLabel("Role").selectOption("OPERATIONS");
 await dialog.getByLabel("Required justification").fill("Added by Super Admin for the internal review test.");
 await dialog.getByRole("button",{name:"Create demo invite"}).click();
 await page.getByPlaceholder("Search administrators...").fill("Security Test Admin");
 await page.locator(".dn-p4-users tbody tr").first().click();
 await expect(page.locator(".dn-p4-user-details")).toContainText("Security Test Admin");
 await expect(page.locator(".dn-p4-user-details")).toContainText("invited",{ignoreCase:true});
 await page.getByRole("button",{name:"Change Role"}).click();
 dialog=page.getByRole("dialog",{name:"Change administrator role"});
 await dialog.getByLabel("New role").selectOption("FINANCE");
 await dialog.getByLabel("Required audit reason").fill("Internal finance team access changed for demo review.");
 await dialog.getByRole("button",{name:"Save role"}).click();
 await expect(page.locator(".dn-p4-user-details")).toContainText("FINANCE");
 await page.reload();
 await page.getByPlaceholder("Search administrators...").fill("Security Test Admin");
 await expect(page.locator(".dn-p4-users tbody")).toContainText("FINANCE");
 await page.getByRole("tab",{name:"Active Sessions"}).click();
 await page.getByRole("button",{name:"Revoke Session"}).first().click();
 dialog=page.getByRole("dialog",{name:"Revoke demo administrator session"});
 await dialog.getByLabel("Revocation reason").fill("Test session revoked as a mock security response.");
 await dialog.getByRole("button",{name:"Revoke simulated session"}).click();
 await expect(page.locator(".dn-p4-security-layout")).toContainText("revoked",{ignoreCase:true});
});
test("system controls: service health, configuration, audit and permissions persist",async({page})=>{
 await page.goto("/#/system");
 await page.locator(".dn-p4-service").first().click();
 await page.getByRole("button",{name:"Update Demo Health Status"}).click();
 let dialog=page.getByRole("dialog",{name:"Simulate component health"});
 await dialog.getByLabel("New component status").selectOption("DEGRADED");
 await dialog.getByLabel("Required note").fill("Latency elevated in simulated acceptance test.");
 await dialog.getByRole("button",{name:"Save demo health status"}).click();
 await expect(page.locator(".dn-p4-system-detail")).toContainText("degraded",{ignoreCase:true});
 await page.getByRole("tab",{name:"Platform Configuration"}).click();
 await page.getByRole("switch",{name:"Platform maintenance banner"}).click();
 dialog=page.getByRole("dialog",{name:"Change simulated configuration"});
 await dialog.getByLabel("Required approval reason").fill("Planned maintenance window for design test only.");
 await dialog.getByRole("button",{name:"Save simulated setting"}).click();
 await expect(page.getByRole("switch",{name:"Platform maintenance banner"})).toHaveAttribute("aria-checked","true");
 await page.getByRole("tab",{name:"System Audit Log"}).click();
 await expect(page.getByText("Demo configuration changed")).toBeVisible();
 await page.reload();
 await page.getByRole("tab",{name:"Platform Configuration"}).click();
 await expect(page.getByRole("switch",{name:"Platform maintenance banner"})).toHaveAttribute("aria-checked","true");
 await page.locator(".dn-profile").click();
 await page.getByLabel("Simulated role").selectOption("VIEWER");
 await page.locator(".dn-profile").click();
 await expect(page.getByRole("switch",{name:"Platform maintenance banner"})).toBeDisabled();
 await page.goto("/#/security");
 await expect(page.getByRole("button",{name:"Invite Admin"})).toBeDisabled();
});
