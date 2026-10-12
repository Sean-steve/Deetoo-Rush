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
 await page.getByRole("button",{name:"Retry API connection"}).click();
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


test("live Command Center uses a running Nairobi clock and no preview service status",async({page})=>{
 await page.route("**/api/v1/**",async route=>{
  const endpoint=new URL(route.request().url()).pathname;
  const body=endpoint==="/api/v1/auth/me"?staff():{data:[]};
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(body)});
 });
 await page.goto("/#/command");
 await expect(page.locator('[data-testid="screen-command"]')).toBeVisible();
 const clock=page.locator(".dn-period-head strong").first();
 const first=await clock.innerText();
 await expect(clock).not.toHaveText(first,{timeout:5000});
 await expect(page.getByText("Demo snapshot")).toHaveCount(0);
 await expect(page.getByText("Demo ready")).toHaveCount(0);
 await expect(page.locator(".dn-admin-connected")).toBeVisible();
});
test("live Orders show public order code and print only the selected order",async({page,context})=>{
 const uuid="e6b7c58c-2064-4178-9b8a-3adc96d1e686";
 await page.route("**/api/v1/**",async route=>{
  const endpoint=new URL(route.request().url()).pathname;
  const data=endpoint==="/api/v1/auth/me"?staff():
    endpoint==="/api/v1/admin/orders"?{data:[{
     id:uuid,public_code:"DT-ACCEPT-007",status:"PREPARING",created_at:"2026-10-12T08:11:00.000Z",
     merchant_name:"Example Kitchen",customer_name:"Njeri <Test>",customer_phone:"+254700000001",
     subtotal_minor:54000,delivery_fee_minor:7500,service_fee_minor:1200,
     order_items:[{item_name:"Chapati",quantity:2,unit_price_minor:27000}],
     pickup:{name:"Westlands",latitude:-1.26,longitude:36.8},
     delivery_address:{name:"Kilimani",latitude:-1.28,longitude:36.78}
    }]}:{data:[]};
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
 });
 await page.goto("/#/orders");
 await expect(page.locator(".dn-order-line").first()).toContainText("#DT-ACCEPT-007");
 await page.locator(".dn-order-line").first().click();
 await expect(page.locator(".dn-order-detail-head h2")).toHaveText("#DT-ACCEPT-007");
 const printed=context.waitForEvent("page");
 await page.getByRole("button",{name:"Print",exact:true}).click();
 const report=await printed;
 await expect(report.locator("body")).toContainText("DT-ACCEPT-007");
 await expect(report.locator("body")).toContainText("Chapati");
 await expect(report.locator(".dn-sidebar")).toHaveCount(0);
 await expect(report.locator("body")).not.toContainText("Admin Operations Command Center");
});
test("opening an unread Activity & Alerts entry does not silently mark it read",async({page})=>{
 const eventId="bbde1307-8abd-482f-bf26-6399b845dffa";
 let readMutations=0;
 await page.route("**/api/v1/**",async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.includes("/notifications/")&&u.pathname.endsWith("/read"))readMutations++;
  const response=u.pathname==="/api/v1/auth/me"?staff():
   u.pathname==="/api/v1/admin/notifications"?{data:[{
     event_id:eventId,event_type:"SUPPORT",title:"Support case needs review",
     summary:"Awaiting operator action",event_at:"2026-10-12T08:00:00.000Z",read_at:null
   }]}:{data:[]};
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(response)});
 });
 await page.goto("/#/notifications");
 await expect(page.getByText("Support case needs review")).toBeVisible();
 await page.getByRole("button",{name:"Open →"}).first().click();
 await expect(page).toHaveURL(/\/support/);
 expect(readMutations).toBe(0);
 await expect(page.getByText("Alert marked read.")).toHaveCount(0);
});
