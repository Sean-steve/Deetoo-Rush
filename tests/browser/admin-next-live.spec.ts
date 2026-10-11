import {test,expect} from "@playwright/test";
const titles=[
 ["command","Operations Command Center"],["dispatch","Live Dispatch"],["orders","Orders & Deliveries"],["riders","Riders & Fleet"],["incidents","Incident Management"],
 ["support","Support & Conversations"],["merchants","Merchant Management"],["customers","Customer Management"],["geography","Geography & Service Coverage"],
 ["payments","Payments & Refunds"],["settlements","Settlements & Payouts"],["financial","Financial Control Center"],["analytics","Analytics & Reports"],
 ["notifications","Notifications & Communications"],["security","Identity, Access & Security"],["system","System Health & Configuration"]
];
function staff(){return {data:{id:"acb934e9-8498-4c91-847e-1baf1090f153",email:"super.admin@example.test",name:"Acceptance Super Admin",roles:["super_admin"],status:"ACTIVE"}};}
test("live sign-in uses DeeToo auth transport and does not reveal sample fixture identities",async({page})=>{
 let authenticated=false;
 await page.route("**/api/v1/**",async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==="/api/v1/auth/me"){await route.fulfill({status:authenticated?200:401,contentType:"application/json",body:JSON.stringify(authenticated?staff():{error:{code:"UNAUTHORIZED",message:"Authentication required"}})});return;}
  if(u.pathname==="/api/v1/auth/login"){
    expect(route.request().headers()["x-auth-transport"]).toBe("cookie");
    const body=route.request().postDataJSON();
    expect(body.identifier).toBe("super.admin@example.test");
    authenticated=true;
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(staff())});return;
  }
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[]})});
 });
 await page.goto("/#/command");
 await expect(page.getByRole("heading",{name:"Admin sign in"})).toBeVisible();
 await page.getByLabel("Staff email or phone").fill("super.admin@example.test");
 await page.getByLabel("Password").fill("acceptance-only-not-real");
 await page.getByRole("button",{name:"Sign in securely"}).click();
 await expect(page.getByText("Live DeeToo backend")).toBeVisible();
 await expect(page.locator(".dn-demo-banner")).toHaveCount(0);
 await expect(page.getByText("DR78291")).toHaveCount(0);
});
test("all 16 approved live workspaces render with empty authoritative API responses and no demo fallback",async({page})=>{
 await page.route("**/api/v1/**",async route=>{
  const u=new URL(route.request().url());
  const value=u.pathname==="/api/v1/auth/me"?staff():{data:[]};
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(value)});
 });
 await page.goto("/#/command");
 await expect(page.getByText("Live DeeToo backend")).toBeVisible();
 for(const [route] of titles){
  await page.goto("/#/"+route);
  await expect(page.locator('[data-testid="screen-'+route+'"]')).toBeVisible();
  await expect(page.locator(".dn-demo-banner")).toHaveCount(0);
  await expect(page.locator(".dn-order-line")).toHaveCount(0);
 }
 await expect(page.locator(".dn-nav-link")).toHaveCount(16);
});
test("401 responses return to sign-in instead of rendering local demo records",async({page})=>{
 await page.route("**/api/v1/**",r=>r.fulfill({status:401,contentType:"application/json",body:JSON.stringify({error:{code:"UNAUTHORIZED",message:"Sign in required"}})}));
 await page.goto("/#/payments");
 await expect(page.getByRole("heading",{name:"Admin sign in"})).toBeVisible();
 await expect(page.locator(".dn-demo-banner")).toHaveCount(0);
});


test("Phase 5: a failed API never unlocks demo data, and retry restores the authorized live workspace",async({page})=>{
 let healthy=false;
 await page.route("**/api/v1/**",async route=>{
  const u=new URL(route.request().url());
  if(!healthy){
   await route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:{code:"UPSTREAM_UNAVAILABLE",message:"Test backend recovery required"}})});
   return;
  }
  const body=u.pathname==="/api/v1/auth/me"?staff():{data:[]};
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
 });
 await page.goto("/#/orders");
 await expect(page.getByRole("alert")).toContainText("Test backend recovery required");
 await expect(page.getByText("Unable to reach DeeToo Admin")).toBeVisible();
 await expect(page.locator(".dn-demo-banner")).toHaveCount(0);
 await expect(page.locator(".dn-order-line")).toHaveCount(0);
 healthy=true;
 await page.getByRole("button",{name:/Retry connection/i}).click();
 await expect(page.getByText("Live DeeToo backend")).toBeVisible();
 await expect(page.locator('[data-testid="screen-orders"]')).toBeVisible();
 await expect(page.locator(".dn-demo-banner")).toHaveCount(0);
});

test("Phase 5: an authenticated customer without a staff role cannot access any Admin workspace",async({page})=>{
 await page.route("**/api/v1/**",async route=>{
  const body=new URL(route.request().url()).pathname==="/api/v1/auth/me"
   ?{data:{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",name:"Customer",email:"customer@example.test",roles:["customer"],status:"ACTIVE"}}
   :{data:[]};
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
 });
 await page.goto("/#/financial");
 await expect(page.getByRole("heading",{name:"Admin sign in"})).toBeVisible();
 await expect(page.getByText("Live DeeToo backend")).toHaveCount(0);
 await expect(page.locator(".dn-demo-banner")).toHaveCount(0);
});
