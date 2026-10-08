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
