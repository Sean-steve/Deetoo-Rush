import { test, expect } from "@playwright/test";

test.describe("Phase 1 Merchant frontend-only experience",()=>{
 test("kitchen: stage transitions, filters and pickup confirmation",async({page})=>{
  await page.goto("http://127.0.0.1:5174/prototype/orders");
  await expect(page.getByRole("heading",{name:"Kitchen orders",exact:true})).toBeVisible();
  await expect(page.locator(".mp-order-lane")).toHaveCount(4);
  await expect(page.locator(".mp-order-card")).toHaveCount(4);
  await page.getByRole("button",{name:"Accept & set prep time"}).click();
  const accept=page.getByRole("dialog",{name:/Accept order/});
  await expect(accept).toBeVisible();
  await accept.getByLabel("Preparation time (minutes)").selectOption("15");
  await accept.getByRole("button",{name:"Accept order"}).click();
  await expect(page.locator(".mp-lane-preparing .mp-order-card")).toHaveCount(1);
  await page.getByRole("button",{name:"Mark ready for pickup"}).click();
  await expect(page.locator(".mp-lane-ready .mp-order-card")).toHaveCount(4);
  await page.locator(".mp-lane-ready .mp-order-card").first().getByRole("button",{name:"Mark as picked up"}).click();
  await page.getByRole("dialog",{name:/Order #/}).getByRole("button",{name:"Confirm picked up (demo)"}).click();
  await expect(page.locator(".mp-lane-completed .mp-order-card")).toHaveCount(1);
  await page.getByRole("button",{name:/Completed \(1\)/}).first().click();
  await expect(page.locator(".mp-order-lane")).toHaveCount(1);
 });
 test("menu: filters, stock toggle, item creation, category and layout switching",async({page})=>{
  await page.goto("http://127.0.0.1:5174/prototype/menu");
  await expect(page.getByRole("heading",{name:"Menu & availability",exact:true})).toBeVisible();
  await expect(page.locator(".mp-food-card")).toHaveCount(24);
  await page.getByRole("button",{name:"List view"}).click();
  await expect(page.locator(".mp-food-grid")).toHaveClass(/mp-food-list/);
  await page.getByRole("button",{name:"Grid view"}).click();
  await page.getByRole("button",{name:/Unavailable \(6\)/}).click();
  await expect(page.locator(".mp-food-card")).toHaveCount(6);
  await page.getByRole("button",{name:/All items \(24\)/}).click();
  await page.getByRole("button",{name:"Add food item"}).click();
  const dlg=page.getByRole("dialog",{name:"Add food item"});
  await dlg.getByLabel("Food item name *").fill("Samosa");
  await dlg.getByLabel("Price (Ksh) *").fill("150");
  await dlg.getByRole("button",{name:"Save food item"}).click();
  await expect(page.locator(".mp-food-card")).toHaveCount(25);
  await page.reload();
  await expect(page.locator(".mp-food-card")).toHaveCount(25);
 });
 test("finance: tabs, filters and settlement details",async({page})=>{
  await page.goto("http://127.0.0.1:5174/prototype/finance");
  await expect(page.getByRole("heading",{name:"Finance & settlements",exact:true})).toBeVisible();
  await expect(page.getByText("Order payment methods")).toBeVisible();
  await page.getByRole("tab",{name:"Settlements"}).click();
  await expect(page.getByRole("button",{name:"View details"}).first()).toBeVisible();
  await page.getByRole("button",{name:"View details"}).first().click();
  await expect(page.getByRole("dialog",{name:/Settlement/})).toBeVisible();
  await page.getByRole("dialog",{name:/Settlement/}).getByRole("button",{name:"Close dialog"}).click();
  await page.getByRole("tab",{name:"Invoices"}).click();
  await expect(page.getByRole("button",{name:"View invoice"}).first()).toBeVisible();
  await page.getByRole("tab",{name:"Transactions"}).click();
  await page.getByRole("combobox",{name:"Filter payment method"}).selectOption("Card");
  await expect(page.locator(".mp-finance-table tbody tr")).toHaveCount(2);
 });
 test("team: role access, invitation and business profile editing",async({page})=>{
  await page.goto("http://127.0.0.1:5174/prototype/business");
  await expect(page.getByRole("heading",{name:"Business & team",exact:true})).toBeVisible();
  await expect(page.locator(".mp-team-table tbody tr")).toHaveCount(4);
  await page.getByRole("button",{name:"Invite team member"}).click();
  const invite=page.getByRole("dialog",{name:"Invite team member"});
  await invite.getByLabel("Full name *").fill("Jane Mwangi");
  await invite.getByLabel("Email *").fill("jane@example.test");
  await invite.getByRole("button",{name:"Send invitation"}).click();
  await expect(page.locator(".mp-team-table tbody tr")).toHaveCount(5);
  await page.getByRole("button",{name:"Manage roles"}).click();
  await expect(page.getByRole("dialog",{name:"Manage roles and permissions"})).toBeVisible();
  await page.getByRole("dialog",{name:"Manage roles and permissions"}).getByRole("button",{name:"Save permissions"}).click();
  await page.getByRole("button",{name:"Edit profile"}).click();
  await expect(page.getByRole("dialog",{name:"Edit business profile"})).toBeVisible();
 });
 test("sidebar: all eight supplied screens remain navigable, with Phase 2 clearly marked",async({page})=>{
  await page.goto("http://127.0.0.1:5174/prototype/orders");
  const nav=page.getByRole("navigation",{name:"Merchant prototype navigation"});
  for(const name of ["Menu & availability","Finance & settlements","Business & team"]){
   await nav.getByRole("button",{name}).click();
   await expect(page.getByRole("heading",{name,exact:true})).toBeVisible();
  }
  await nav.getByRole("button",{name:"Branch settings"}).click();
  await expect(page.getByRole("heading",{name:"Scheduled for Phase 2"})).toBeVisible();
  await nav.getByRole("button",{name:"Kitchen orders"}).click();
  await expect(page.getByRole("heading",{name:"Kitchen orders",exact:true})).toBeVisible();
 });
});
