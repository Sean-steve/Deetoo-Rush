import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test("customer visual geometry audit", async ({ page }) => {
  await fs.mkdir("visual-output", { recursive: true });
  const targets = [
    ["01-discovery", "/customer"],
    ["02-search", "/customer/search"],
    ["05-empty-bag", "/customer/cart"],
    ["08-orders", "/customer/orders"],
    ["11-profile", "/customer/profile"],
    ["12-security", "/customer/security"],
    ["13-notifications", "/customer/notifications"],
    ["14-support", "/customer/support"],
  ] as const;
  const metrics: Record<string, unknown> = {};
  for (const [name, path] of targets) {
    await page.goto("http://127.0.0.1:5173" + path);
    await expect(page.locator(".customer-shell")).toBeVisible();
    await page.waitForTimeout(600);
    metrics[name] = await page.evaluate(() => {
      function box(selector: string) {
        const el = document.querySelector(selector);
        const rect = el?.getBoundingClientRect();
        return rect ? [rect.x, rect.y, rect.width, rect.height].map(Math.round) : null;
      }
      return {
        viewport: [innerWidth, innerHeight],
        overflow: document.documentElement.scrollWidth > innerWidth,
        topbar: box(".customer-topbar"),
        sidebar: box(".customer-side-nav"),
        main: box(".customer-page"),
        hero: box(".customer-hero"),
        search: box(".customer-global-search"),
        restaurantGrid: box(".customer-restaurant-grid"),
        title: document.querySelector("h1")?.textContent?.trim() || "",
      };
    });
    await page.screenshot({
      path: "visual-output/" + name + ".png",
      animations: "disabled",
    });
    console.log("VISUAL_GEOMETRY " + name + " " + JSON.stringify(metrics[name]));
  }
  await fs.writeFile("visual-output/layout-metrics.json", JSON.stringify(metrics, null, 2));
});
