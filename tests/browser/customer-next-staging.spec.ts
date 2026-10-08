/**
 * Real deployed Customer Web acceptance only. No Playwright API mocks.
 * The certified order/support fixtures must already exist in staging.
 * Never starts a payment or mutates delivery status.
 */
import {test,expect} from "@playwright/test";
const required=(name:string)=>{const value=process.env[name]?.trim();if(!value)throw new Error("Missing external staging fixture "+name);return value;};
const credentials={email:required("STAGING_CUSTOMER_EMAIL"),password:required("STAGING_CUSTOMER_PASSWORD")};
const other={email:required("STAGING_OTHER_CUSTOMER_EMAIL"),password:required("STAGING_OTHER_CUSTOMER_PASSWORD")};
const orderId=required("STAGING_CERT_ORDER_ID"),caseId=required("STAGING_CERT_SUPPORT_CASE_ID"),branchId=required("STAGING_CERT_BRANCH_ID");
const encoded=(value:string)=>encodeURIComponent(value);
async function login(page:any,identity:{email:string;password:string}){
 await page.goto("/profile");
 const signIn=page.getByRole("button",{name:"Sign in",exact:true});
 if(await signIn.isVisible())await signIn.click();
 const dialog=page.getByRole("dialog",{name:"DeeToo customer sign in"});
 await expect(dialog).toBeVisible();
 await dialog.getByRole("textbox",{name:"Email or phone"}).fill(identity.email);
 await dialog.getByLabel("Password").fill(identity.password);
 await dialog.getByRole("button",{name:"Sign in",exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect(page.getByRole("heading",{name:"My profile"})).toBeVisible();
}
test("all 15 deployed connected customer screens use real backend endpoints",async({page,request})=>{
 const failures:string[]=[];
 page.on("response",response=>{if(new URL(response.url()).pathname.startsWith("/api/v1")&&response.status()>=500)failures.push(response.status()+" "+response.url().split("?")[0]);});
 const health=await request.get("/health");
 expect(health.ok(),"staging API health endpoint should be accessible via same-origin proxy").toBeTruthy();
 await page.goto("/");
 await expect(page.locator(".dt-app")).toBeVisible();
 await expect(page.getByText("Design preview · sample account")).toHaveCount(0);
 // Screen 02 guest search and 03 real restaurant public catalogue
 await page.goto("/search");await expect(page.locator(".dt-app")).toBeVisible();
 await page.goto("/restaurant/"+encoded(branchId));await expect(page.locator(".dt-app")).toBeVisible();
 // Login once; use the same real customer token/cookie across all screens.
 await login(page,credentials);
 for(const [route,heading] of [
  ["/profile","My profile"],["/security","Security & Devices"],["/notifications","Notifications"],
  ["/orders","Your orders"],["/orders/"+encoded(orderId)+"/track","Track your delivery"],
  ["/orders/"+encoded(orderId)+"/completed","Order complete"],
  ["/support","Help & Support"],["/support/cases/"+encoded(caseId),"Support Conversation"],
 ] as const){
  await page.goto(route);
  await expect(page.getByRole("heading",{name:heading,exact:true})).toBeVisible();
 }
 for(const route of ["/bag","/checkout"]){await page.goto(route);await expect(page.locator(".dt-app")).toBeVisible();}
 await expect(page.getByText("sample conversations")).toHaveCount(0);
 expect(failures,"no server-side errors during real customer journey").toEqual([]);
});
test("cross-customer ownership remains enforced on deployed staging",async({browser,request})=>{
 const context=await browser.newContext({baseURL:required("STAGING_CUSTOMER_BASE_URL")});
 const page=await context.newPage();
 try{
  await login(page,other);
  const cookies=await context.cookies();
  // Exercise the real UI path first; case detail fails closed with no transcript.
  await page.goto("/support/cases/"+encoded(caseId));
  await expect(page.getByText("The delivery was late.")).toHaveCount(0);
  await expect(page.getByText("Unable to load this information")).toBeVisible();
  await page.goto("/orders/"+encoded(orderId)+"/track");
  await expect(page.getByText("You do not have permission to view this information.")).toBeVisible();
  expect(cookies.length).toBeGreaterThan(0);
 }finally{await context.close();}
});
