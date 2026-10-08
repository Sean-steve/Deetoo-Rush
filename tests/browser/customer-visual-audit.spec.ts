import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

const ROOT = "http://127.0.0.1:5173/customer";

test("compare all fifteen customer surfaces at reference dimensions", async ({ page }) => {
  await fs.mkdir("visual-output", { recursive:true });
  const metrics: Record<string, unknown> = {};
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  async function open(path = "") {
    await page.goto(ROOT + path);
    await expect(page.locator(".customer-shell")).toBeVisible();
    await page.waitForTimeout(800);
  }
  async function capture(name:string) {
    const data = await page.evaluate(() => {
      const box = (selector:string) => {
        const el=document.querySelector(selector);
        const r=el?.getBoundingClientRect();
        return r ? [r.x,r.y,r.width,r.height].map(Math.round) : null;
      };
      return {
        route: location.pathname,
        viewport: [innerWidth,innerHeight],
        overflow: document.documentElement.scrollWidth > innerWidth,
        topbar:box(".customer-topbar"), sidebar:box(".customer-side-nav"),
        main:box(".customer-page"), hero:box(".customer-hero"),
        search:box(".customer-global-search"), grid:box(".customer-restaurant-grid"),
        menu:box(".customer-menu-storefront"), menuRail:box(".customer-menu-categories"),
        cart:box(".customer-cart-view"), checkout:box(".customer-checkout-card"),
        orders:box(".customer-order-list"), tracking:box(".customer-tracking-hero"),
        profile:box(".customer-profile-grid"), security:box(".customer-security-grid"),
        notifications:box(".customer-notification-layout"), support:box(".customer-support-workspace"),
        modal:box("dialog.deetoo-bottom-sheet[open]"),
        title:document.querySelector("h1")?.textContent?.trim() || "",
        navigation:document.querySelector(".customer-side-nav [aria-current=page]")?.textContent?.trim() || "",
      };
    });
    metrics[name]=data;
    await page.screenshot({path:"visual-output/"+name+".png",animations:"disabled"});
    console.log("VISUAL_GEOMETRY "+name+" "+JSON.stringify(data));
  }
  async function selectRestaurant() {
    await open();
    const first = page.locator(".customer-restaurant-card").first();
    await first.waitFor({state:"visible",timeout:12000}).catch(()=>{});
    if (await first.count()) {
      await first.click();
      await page.waitForTimeout(850);
      return true;
    }
    return false;
  }
  await open();
  await page.locator(".customer-restaurant-card").first().waitFor({state:"visible",timeout:10000}).catch(()=>{});
  await capture("01-discovery");
  await open("/search");
  await page.locator(".customer-global-search input").fill("burger");
  await page.waitForTimeout(900);
  await capture("02-search");
  await selectRestaurant();
  await capture("03-restaurant");
  const customizable=page.locator("[aria-label^='Customize ']").first();
  if(await customizable.count())await customizable.click().catch(()=>{});
  await capture("04-item-customization");

  await open();
  await page.getByRole("button",{name:"Sign In",exact:true}).first().click();
  const form=page.locator("form").filter({has:page.getByPlaceholder("customer@deetoo.ke or +254712345678")});
  await form.getByPlaceholder("customer@deetoo.ke or +254712345678").fill("customer@deetoo.ke");
  await form.locator("input[type=password]").fill(process.env.VISUAL_CUSTOMER_PASSWORD || "CustomerPass123!");
  await form.getByRole("button",{name:"Sign In",exact:true}).click();
  await expect(page.getByTitle("Sign Out")).toBeVisible();
  await open("/cart");
  await capture("05-empty-bag");

  await selectRestaurant();
  const choose=page.locator("[aria-label^='Customize ']").first();
  if(await choose.count()) {
    await choose.click().catch(()=>{});
    const add=page.locator("dialog.deetoo-bottom-sheet").getByRole("button",{name:/Add · KES/}).first();
    if(await add.count()) await add.click().catch(()=>{});
  }
  await open("/cart");
  await capture("06-cart");
  const review=page.getByRole("button",{name:/Review checkout|Refresh confirmed price/}).first();
  if(await review.count())await review.click().catch(()=>{});
  await capture("07-checkout");

  await open("/orders");
  await capture("08-orders");
  const track=page.getByRole("button",{name:/View details/}).first();
  if(await track.count())await track.click().catch(()=>{});
  await capture("09-tracking");
  await open("/orders");
  const past=page.getByRole("button",{name:"Past orders"});
  if(await past.count())await past.click();
  const delivered=page.getByRole("button",{name:/View details/}).first();
  if(await delivered.count())await delivered.click().catch(()=>{});
  await capture("10-delivered");

  await open("/profile");
  await capture("11-profile");
  await open("/security");
  await capture("12-security");
  await open("/notifications");
  await capture("13-notifications");
  await open("/support");
  await capture("14-support");
  const subject=page.getByLabel("Subject",{exact:true});
  if(await subject.count()) {
    await subject.fill("Visual review conversation");
    const message=page.getByLabel("Tell us what happened");
    if(await message.count())await message.fill("Checking conversation layout against the visual design.");
    await page.getByRole("button",{name:"Create support case"}).click().catch(()=>{});
    await page.waitForTimeout(750);
  }
  await capture("15-support-conversation");
  await fs.writeFile("visual-output/layout-metrics.json",JSON.stringify({metrics,errors},null,2));
});
