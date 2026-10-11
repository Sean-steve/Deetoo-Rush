import {test,expect} from "@playwright/test";
import fs from "node:fs";
const output="visual-output/admin-next";
test.beforeEach(async ({page})=>{
  await page.route("**/api/**", route=>{throw new Error("Admin frontend preview attempted a backend API call: "+route.request().url());});
  await page.goto("/#/command");
});
test("captures all four approved desktop workflows without contacting DeeToo APIs",async ({page})=>{
  fs.mkdirSync(output,{recursive:true});
  const screens:[string,string,string][]=[
    ["command","Good morning, Admin","01-command-center"],
    ["dispatch","Live Dispatch & Tracking","02-live-dispatch"],
    ["orders","Orders & Deliveries","03-orders-deliveries"],
    ["riders","Riders & Fleet","04-riders-fleet"],
  ];
  for(const [route,title,file] of screens){
    await page.goto("/#/"+route);
    await expect(page.locator("[data-testid='screen-"+route+"']")).toBeVisible();
    await expect(page.getByRole("heading",{name:title,exact:route!=="command"})).toBeVisible();
    await page.screenshot({path:output+"/"+file+".png",fullPage:true,animations:"disabled"});
  }
  await expect(page.locator(".dn-sidebar")).toBeVisible();
  await expect(page.locator(".dn-topbar")).toBeVisible();
});
test("assigning a rider updates order, rider availability and command metrics after refresh",async ({page})=>{
  await page.goto("/#/dispatch");
  await expect(page.getByRole("heading",{name:"Live Dispatch & Tracking"})).toBeVisible();
  const before=await page.locator(".dn-inline-kpis .dn-stat").first().locator("strong").textContent();
  await page.getByRole("tab",{name:/Unassigned/}).click();
  await page.locator(".dn-list-order").first().click();
  const selected=await page.locator(".dn-order-heading h2").innerText();
  await page.getByRole("button",{name:"Assign Rider",exact:true}).click();
  await expect(page.getByRole("dialog",{name:"Assign an eligible rider"})).toBeVisible();
  await page.getByLabel("Eligible rider",{exact:true}).selectOption({index:1});
  const rider=await page.getByLabel("Eligible rider",{exact:true}).inputValue();
  await page.getByRole("button",{name:"Confirm assignment"}).click();
  await expect(page.getByText(/Rider .* assigned to/)).toBeVisible();
  await page.goto("/#/orders");
  await page.getByPlaceholder("Search orders...").fill(selected.replace("#",""));
  await expect(page.locator(".dn-order-line").first()).toContainText("rider assigned",{ignoreCase:true});
  await page.goto("/#/riders");
  await page.getByPlaceholder("Search riders...").fill(rider);
  await expect(page.locator(".dn-rider-table tbody tr").first()).toContainText("on delivery",{ignoreCase:true});
  await page.reload();
  await page.getByPlaceholder("Search riders...").fill(rider);
  await expect(page.locator(".dn-rider-table tbody tr").first()).toContainText("on delivery",{ignoreCase:true});
  await page.goto("/#/dispatch");
  await expect(page.locator(".dn-inline-kpis .dn-stat").first().locator("strong")).not.toHaveText(before||"—");
});
test("supports order notes, cancellation, rider onboarding and role restrictions",async ({page})=>{
  await page.goto("/#/orders");
  await page.getByRole("tab",{name:/In Progress/}).click();
  const first=page.locator(".dn-order-line").first();
  await first.click();
  await page.getByRole("button",{name:"+ Add internal note"}).click();
  await page.getByLabel("Internal note",{exact:true}).fill("Driver called the customer to confirm delivery details");
  await page.getByRole("button",{name:"Save note"}).click();
  await expect(page.getByText("Driver called the customer to confirm delivery details")).toBeVisible();
  await page.getByRole("button",{name:"Cancel Order"}).click();
  await page.getByLabel("Cancellation reason",{exact:true}).fill("Test cancellation for visual acceptance");
  await page.getByRole("button",{name:"Confirm cancellation"}).click();
  await page.getByRole("tab",{name:/Cancelled/}).click();
  await expect(page.locator(".dn-order-line").first()).toBeVisible();
  await page.goto("/#/riders");
  await page.getByRole("button",{name:"Add Rider"}).click();
  await page.getByLabel("Rider full name").fill("Test Rider");
  await page.getByLabel("Rider phone number").fill("+254712345678");
  await page.getByLabel("Rider operating area").selectOption("Westlands");
  await page.getByRole("button",{name:"Create rider application"}).click();
  await page.getByPlaceholder("Search riders...").fill("Test Rider");
  await expect(page.locator(".dn-rider-table tbody tr").first()).toContainText("Test Rider");
  await page.locator(".dn-rider-table tbody tr").first().click();
  await page.getByRole("button",{name:"Approve"}).click();
  await page.getByLabel("Rider action reason",{exact:true}).fill("Identity and vehicle demo review approved");
  await page.getByRole("button",{name:"Save rider action"}).click();
  await page.locator(".dn-profile").click();
  await page.getByLabel("Simulated role").selectOption("SUPPORT");
  await page.locator(".dn-profile").click();
  await expect(page.getByRole("button",{name:"Add Rider"})).toBeDisabled();
  await expect(page.getByRole("button",{name:"+ Add internal note"})).toHaveCount(0);
});
test("supports selective filters and explicit reset without server activity",async ({page})=>{
  await page.goto("/#/riders");
  await page.getByRole("tab",{name:/Applications/}).click();
  await page.getByPlaceholder("Search riders...").fill("does-not-exist-xyz");
  await expect(page.getByText("No riders in this view")).toBeVisible();
  await page.locator(".dn-demo-banner button").click();
  await expect(page.getByRole("dialog",{name:"Reset demo workspace?"})).toBeVisible();
  await page.getByRole("button",{name:"Reset local demo"}).click();
  await expect(page.locator(".dn-toast")).toContainText("Demo restored");
  await page.reload();
  await expect(page.getByRole("tablist",{name:"Rider sections"})).toBeVisible();
});
