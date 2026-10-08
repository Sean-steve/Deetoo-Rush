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
