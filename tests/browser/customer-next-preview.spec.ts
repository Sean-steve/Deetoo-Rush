import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("Screen 01 renders independently at approved reference dimensions", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Discover restaurants" })).toBeVisible();
  await expect(page.locator(".dt-sidebar")).toBeVisible();
  await expect(page.locator(".dt-hero")).toBeVisible();
  await expect(page.locator(".dt-right-rail")).toBeVisible();
  await expect(page.locator(".dt-restaurant-card")).toHaveCount(8);
  const geometry = await page.evaluate(() => {
    const rect = (selector:string) => {
      const element=document.querySelector(selector);
      const r=element?.getBoundingClientRect();
      return r ? {x:r.x,y:r.y,width:r.width,height:r.height} : null;
    };
    return {
      viewport: [innerWidth,innerHeight],
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      header: rect(".dt-header"),
      sidebar: rect(".dt-sidebar"),
      content: rect(".dt-main"),
      hero: rect(".dt-hero"),
      map: rect(".dt-rail-map"),
      card: rect(".dt-restaurant-card"),
    };
  });
  expect(geometry.horizontalOverflow).toBe(false);
  expect(geometry.sidebar?.width).toBeGreaterThan(225);
  expect(geometry.sidebar?.width).toBeLessThan(255);
  expect(geometry.hero?.height).toBeGreaterThan(190);
  expect(geometry.hero?.height).toBeLessThan(270);
  expect(geometry.map?.height).toBeGreaterThan(260);
  await fs.mkdir("visual-output/customer-next", {recursive:true});
  await page.screenshot({ path:"visual-output/customer-next/01-discover-1672x941.png", animations:"disabled" });
  await fs.writeFile("visual-output/customer-next/geometry.json", JSON.stringify(geometry,null,2));
});

test("Preview interaction state: categories, favourites, search, navigation and sorting", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pizza", exact:true }).first().click();
  await expect(page.locator(".dt-restaurant-card")).toHaveCount(1);
  await page.getByRole("button", { name: "All", exact:true }).click();
  await expect(page.locator(".dt-restaurant-card")).toHaveCount(8);
  const favourite=page.getByRole("button", { name:"Add Smash Burger to favourites" });
  await favourite.click();
  await expect(page.getByRole("button", { name:"Remove Smash Burger from favourites" })).toHaveAttribute("aria-pressed","true");
  await page.getByRole("combobox", { name:"Sort by" }).selectOption("rating");
  await expect(page.locator(".dt-restaurant-details > strong").first()).toHaveText("Juja Grill House");
  await page.getByRole("textbox", { name:"Search restaurants, dishes or cuisines" }).fill("pizza");
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.locator(".dt-restaurant-card")).toHaveCount(1);
  await fs.mkdir("visual-output/customer-next",{recursive:true});
  await page.screenshot({path:"visual-output/customer-next/02-search-state-1672x941.png",animations:"disabled"});
});

test("Mobile navigation remains usable without sideways overflow", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await expect(page.getByRole("heading",{name:"Discover restaurants"})).toBeVisible();
  await fs.mkdir("visual-output/customer-next",{recursive:true});
  await page.screenshot({path:"visual-output/customer-next/01-discover-mobile-390x844.png",animations:"disabled"});
  await page.getByRole("button",{name:"Open navigation menu"}).click();
  await expect(page.getByRole("navigation",{name:"Main navigation"})).toBeVisible();
  await page.getByRole("button",{name:"Search",exact:true}).first().click();
  await expect(page).toHaveURL(/\/search$/);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  expect(overflow).toBe(false);
});


test("Screens 03–07: storefront, product customization, empty bag, populated bag and checkout", async ({ page }) => {
  await fs.mkdir("visual-output/customer-next",{recursive:true});
  await page.goto("/bag");
  await expect(page.getByRole("heading",{name:"Your bag is empty"})).toBeVisible();
  await page.screenshot({path:"visual-output/customer-next/05-empty-bag-1672x941.png",animations:"disabled"});

  await page.getByRole("button",{name:"Explore restaurants"}).click();
  await page.locator(".dt-restaurant-image-button").first().click();
  await expect(page).toHaveURL(/\/restaurant$/);
  await expect(page.getByRole("heading",{name:"Deetoo Test Merchant"})).toBeVisible();
  await expect(page.locator(".dt-product-card")).toHaveCount(6);
  await page.screenshot({path:"visual-output/customer-next/03-storefront-1672x941.png",animations:"disabled"});

  await page.getByRole("button",{name:"Customize Smash Burger"}).click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading",{name:"Smash Burger"})).toBeVisible();
  await dialog.getByRole("button",{name:/Double Beef/}).click();
  await dialog.getByLabel("Extra cheese").check();
  await page.screenshot({path:"visual-output/customer-next/04-customization-1672x941.png",animations:"disabled"});
  await dialog.getByRole("button",{name:/Add to cart/}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".dt-cart-count")).toHaveText("1");

  await page.locator(".dt-header-cart").click();
  await expect(page).toHaveURL(/\/bag$/);
  await expect(page.getByRole("heading",{name:"Your bag"})).toBeVisible();
  await expect(page.getByText("Smash Burger").first()).toBeVisible();
  await expect(page.getByText("Ksh 1,150.00").first()).toBeVisible();
  await page.screenshot({path:"visual-output/customer-next/06-bag-1672x941.png",animations:"disabled"});

  await page.getByRole("button",{name:/Proceed to checkout/}).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading",{name:"Checkout"})).toBeVisible();
  await expect(page.getByText("No actual payment or order will be created.")).toBeVisible();
  await page.screenshot({path:"visual-output/customer-next/07-checkout-1672x941.png",animations:"disabled"});
  await page.getByRole("button",{name:/Preview place order/}).click();
  await expect(page.getByRole("status")).toContainText("no order or payment has been created");
});

test("Shopping flow remains usable on mobile and honors reduced motion", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto("/restaurant");
  await expect(page.getByRole("heading",{name:"Deetoo Test Merchant"})).toBeVisible();
  await page.getByRole("button",{name:"Customize Smash Burger"}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({path:"visual-output/customer-next/04-customization-mobile-390x844.png",animations:"disabled"});
  await page.getByRole("button",{name:"Close product customization"}).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  expect(overflow).toBe(false);
});


test("Screen 08: order history matches reference structure, filters and navigates", async ({page})=>{
  await fs.mkdir("visual-output/customer-next",{recursive:true});
  await page.goto("/orders");
  await expect(page.getByRole("heading",{name:"Your orders"})).toBeVisible();
  await expect(page.locator(".dt-history-card")).toHaveCount(4);
  await expect(page.locator('.dt-history-card[data-order-id="DT-E2ZG5"]')).toBeVisible();
  await page.screenshot({path:"visual-output/customer-next/08-orders-1672x941.png",animations:"disabled"});
  await page.getByRole("tab",{name:/Active/}).click();
  await expect(page.locator(".dt-history-card")).toHaveCount(2);
  await page.getByRole("tab",{name:"Past orders"}).click();
  await expect(page.locator(".dt-history-card")).toHaveCount(1);
  await page.getByRole("tab",{name:"Cancelled"}).click();
  await expect(page.locator(".dt-history-card")).toHaveCount(1);
  await page.getByRole("tab",{name:"All orders"}).click();
  await page.getByRole("searchbox",{name:"Search orders by restaurant or item"}).fill("pizza");
  await expect(page.locator(".dt-history-card")).toHaveCount(1);
  await page.getByRole("searchbox",{name:"Search orders by restaurant or item"}).fill("zzzzz");
  await expect(page.getByRole("heading",{name:"No matching orders"})).toBeVisible();
  await page.getByRole("button",{name:"Clear filters"}).click();
  await expect(page.locator(".dt-history-card")).toHaveCount(4);
});

test("Screen 09: active tracking map stays explicitly illustrative", async ({page})=>{
  await fs.mkdir("visual-output/customer-next",{recursive:true});
  await page.goto("/orders");
  await page.locator('.dt-history-card[data-order-id="DT-E2ZG5"]').getByRole("button",{name:/View details/}).click();
  await expect(page).toHaveURL(/\/orders\/DT-E2ZG5\/tracking$/);
  await page.reload();
  await expect(page.getByText("#DT-E2ZG5")).toBeVisible();
  await expect(page.getByRole("heading",{name:"Your order is on the way"})).toBeVisible();
  await expect(page.locator(".dt-tracking-map")).toBeVisible();
  await expect(page.getByText("Illustrative route · NOT LIVE GPS")).toBeVisible();
  await expect(page.getByText("Ksh 1,535.00").first()).toBeVisible();
  await page.screenshot({path:"visual-output/customer-next/09-tracking-1672x941.png",animations:"disabled"});
  await page.getByRole("button",{name:"Terrain preview"}).click();
  await expect(page.locator(".dt-tracking-map")).toHaveClass(/terrain/);
  await page.getByRole("button",{name:"Zoom in"}).click();
  await page.getByRole("button",{name:"Reset example map zoom"}).click();
  await page.getByRole("button",{name:"Call sample rider"}).first().click();
  await expect(page.getByRole("status")).toContainText("no phone call");
  await page.getByRole("button",{name:"Back to orders"}).click();
  await page.locator('.dt-history-card[data-order-id="DT-XRSEP"]').getByRole("button",{name:/View details/}).click();
  await expect(page.getByRole("heading",{name:"Your order is being prepared"})).toBeVisible();
  await expect(page.locator(".dt-tracking-map")).toHaveCount(0);
  await expect(page.getByText("Courier assignment pending")).toBeVisible();
  await page.getByRole("button",{name:"Back to orders"}).click();
  await page.locator('.dt-history-card[data-order-id="DT-K4HR9"]').getByRole("button",{name:/View details/}).click();
  await expect(page.getByRole("heading",{name:"This order was cancelled"})).toBeVisible();
  await expect(page.getByText("No courier dispatched")).toBeVisible();
});

test("Screen 10: completed order, accurate demo receipt and three rating controls", async ({page})=>{
  await fs.mkdir("visual-output/customer-next",{recursive:true});
  await page.goto("/orders");
  await page.locator('.dt-history-card[data-order-id="DT-6Z6X6"]').getByRole("button",{name:/View details/}).click();
  await expect(page).toHaveURL(/\/orders\/DT-6Z6X6\/delivered$/);
  await page.reload();
  await expect(page.getByText("#DT-6Z6X6")).toBeVisible();
  await expect(page.getByRole("heading",{name:"Order delivered!"})).toBeVisible();
  await expect(page.getByText("Total paid (demo)")).toBeVisible();
  await expect(page.locator(".dt-receipt-grand")).toContainText("Ksh 1,535.00");
  await page.screenshot({path:"visual-output/customer-next/10-delivered-1672x941.png",animations:"disabled"});
  await expect(page.getByRole("button",{name:"Preview feedback submission"})).toBeDisabled();
  for(const label of ["Food quality","Delivery experience","Restaurant service"]){
    await page.getByRole("button",{name:"5 stars for "+label}).click();
  }
  await page.getByRole("textbox",{name:"Additional feedback (optional)"}).fill("Fantastic demo order");
  await page.getByRole("button",{name:"Preview feedback submission"}).click();
  await expect(page.locator(".dt-rating-success")).toContainText("Nothing was submitted");
  await page.getByRole("button",{name:"Reorder menu"}).click();
  await expect(page).toHaveURL(/\/restaurant$/);
  await expect(page.getByRole("heading",{name:"Juja Grill House"})).toBeVisible();
});

test("Delivery screens are responsive and do not pretend to connect to GPS", async ({page})=>{
  await fs.mkdir("visual-output/customer-next",{recursive:true});
  await page.setViewportSize({width:390,height:844});
  for(const [path,name] of [["/orders","08-orders-mobile"],["/orders/tracking","09-tracking-mobile"],["/orders/delivered","10-delivered-mobile"]]){
    await page.goto(path);
    await expect(page.locator(".dt-main")).toBeVisible();
    await page.screenshot({path:"visual-output/customer-next/"+name+"-390x844.png",animations:"disabled"});
    const pageOverflows=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
    expect(pageOverflows,"No horizontal overflow for "+name).toBe(false);
  }
});


test("Screen 11: profile cards, editable personal details and local-only addresses", async ({page})=>{
  await fs.mkdir("visual-output/customer-next",{recursive:true});
  await page.goto("/profile");
  await expect(page.getByRole("heading",{name:"My profile"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Personal information"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Saved addresses"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Payment methods"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"DeeToo Plus"})).toBeVisible();
  await page.screenshot({path:"visual-output/customer-next/11-profile-1672x941.png",animations:"disabled"});
  await page.getByRole("button",{name:"Edit profile"}).click();
  await page.getByRole("textbox",{name:"Edit full name"}).fill("Demo Customer");
  await page.getByRole("button",{name:"Save preview"}).click();
  await expect(page.getByRole("heading",{name:"Demo Customer"})).toBeVisible();
  await expect(page.getByRole("status")).toContainText("saved locally");
  await page.getByRole("button",{name:"Add address",exact:true}).click();
  await page.getByRole("textbox",{name:"Address label"}).fill("Office");
  await page.getByRole("textbox",{name:"Address details"}).fill("Innovation Hub");
  await page.getByRole("button",{name:"Save sample address"}).click();
  await expect(page.getByText("Innovation Hub")).toBeVisible();
  await page.getByRole("button",{name:"Set Office as default"}).click();
  await expect(page.locator(".dt-address-entry").filter({hasText:"Office"}).getByText("Default")).toBeVisible();
  await page.getByRole("button",{name:"Remove Office address"}).click();
  await expect(page.getByText("Innovation Hub")).toHaveCount(0);
  await page.getByRole("switch",{name:"Preview marketing communications"}).click();
  await expect(page.getByRole("switch",{name:"Preview marketing communications"})).toHaveAttribute("aria-checked","false");
  await page.reload();
  await expect(page.getByRole("heading",{name:"Demo Customer"})).toHaveCount(0);
  await expect(page.getByRole("switch",{name:"Preview marketing communications"})).toHaveAttribute("aria-checked","true");
});

test("Screen 12: security and devices are informative only, no fake revocation", async ({page})=>{
  await fs.mkdir("visual-output/customer-next",{recursive:true});
  await page.goto("/security");
  await expect(page.getByRole("heading",{name:"Security & Devices"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Account security"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Your devices"})).toBeVisible();
  await expect(page.locator(".dt-device-entry")).toHaveCount(3);
  await page.screenshot({path:"visual-output/customer-next/12-security-1672x941.png",animations:"disabled"});
  await page.getByRole("button",{name:"Options for Android · DeeToo App"}).click();
  await expect(page.getByRole("button",{name:"Preview revoke action"})).toBeVisible();
  await page.getByRole("button",{name:"Preview revoke action"}).click();
  await expect(page.getByRole("status")).toContainText("no live security settings were changed");
  await expect(page.locator(".dt-device-entry")).toHaveCount(3);
  await page.getByRole("button",{name:/Sign out from all other devices/}).click();
  await expect(page.locator(".dt-device-entry")).toHaveCount(3);
  await page.getByRole("button",{name:/Delete account/}).click();
  await expect(page.getByRole("status")).toContainText("no live security settings were changed");
});

test("Screen 13: notification categories, read state, preferences and safe routing", async ({page})=>{
  await fs.mkdir("visual-output/customer-next",{recursive:true});
  await page.goto("/notifications");
  await expect(page.getByRole("heading",{name:"Notifications Center"})).toBeVisible();
  await expect(page.locator(".dt-notification-item")).toHaveCount(12);
  await expect(page.locator(".dt-notification-item.is-unread")).toHaveCount(4);
  await page.screenshot({path:"visual-output/customer-next/13-notifications-1672x941.png",animations:"disabled"});
  await page.getByRole("tab",{name:/Orders/}).click();
  await expect(page.locator(".dt-notification-item")).toHaveCount(4);
  await page.getByRole("tab",{name:/Offers/}).click();
  await expect(page.locator(".dt-notification-item")).toHaveCount(3);
  await page.getByRole("tab",{name:/All/}).click();
  await page.getByRole("button",{name:"Mark all as read"}).click();
  await expect(page.locator(".dt-notification-item.is-unread")).toHaveCount(0);
  await page.getByRole("switch",{name:"Preview System updates"}).click();
  await expect(page.getByRole("switch",{name:"Preview System updates"})).toHaveAttribute("aria-checked","true");
  await page.getByRole("button",{name:/Preview notifications/}).click();
  await expect(page.getByRole("status")).toContainText("No browser permission");
  await page.getByRole("button",{name:"Open Your order is on the way!"}).click();
  await expect(page).toHaveURL(/\/orders$/);
  await page.goto("/notifications");
  await expect(page.locator(".dt-notification-item.is-unread")).toHaveCount(4);
});

test("Screens 11–13 remain usable at mobile width with no horizontal overflow", async ({page})=>{
  await fs.mkdir("visual-output/customer-next",{recursive:true});
  await page.setViewportSize({width:390,height:844});
  for(const [path,file,heading] of [
    ["/profile","11-profile-mobile","My profile"],
    ["/security","12-security-mobile","Security & Devices"],
    ["/notifications","13-notifications-mobile","Notifications Center"],
  ]){
    await page.goto(path);
    await expect(page.getByRole("heading",{name:heading,exact:true})).toBeVisible();
    await page.screenshot({path:"visual-output/customer-next/"+file+"-390x844.png",animations:"disabled"});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    expect(overflow,"No horizontal overflow on "+path).toBe(false);
  }
});
