import {test,expect} from "@playwright/test";

const stamp="2026-10-08T16:22:00.000Z";
const order=(id:string,status:string)=>({
 id,public_code:id,order_number:id,status,branch_id:"branch-juja",merchant_name:"Verified Juja Kitchen",
 branch_name:"Juja",customer_id:"cust-1",currency:"KES",total_minor:182500,subtotal_minor:170000,
 delivery_fee_minor:10000,service_fee_minor:2500,discount_minor:0,created_at:stamp,updated_at:stamp,placed_at:stamp,
 delivery_address_snapshot:{address_text:"Juja Estate",location:{latitude:-1.1,longitude:37}},
 pricing_snapshot:{gross_subtotal_minor:170000,discount_minor:0,delivery_fee_minor:10000,service_fee_minor:2500,tax_minor:0,total_minor:182500},
 items:[{id:"item-1",order_id:id,item_name:"Rice Bowl",quantity:2,line_total_minor:170000,modifiers:[]}],timeline:[],version:1
});
async function setup(page:any,kind:"stale"|"fresh"|"missing"|"forbidden"="stale"){
 const calls:string[]=[];
 await page.route("**/api/v1/**",async(route:any)=>{
  const p=new URL(route.request().url()).pathname.replace("/api/v1",""),method=route.request().method();
  calls.push(method+" "+p);
  const ok=(data:any)=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({success:true,data})});
  const fail=(n:number,code:string)=>route.fulfill({status:n,contentType:"application/json",body:JSON.stringify({error:{code}})});
  if(p==="/auth/me")return ok({id:"cust-1",name:"Customer",roles:["customer"],permissions:[],status:"ACTIVE"});
  if(p==="/cart")return ok(null);
  if(p==="/customer/addresses")return ok([]);
  if(p==="/customer/orders")return ok([order("order-1","READY"),order("order-2","COMPLETED"),order("order-3","CANCELLED")]);
  if(p==="/customer/orders/order-1")return kind==="forbidden"?fail(403,"FORBIDDEN_OPERATION"):ok(order("order-1","READY"));
  if(p==="/customer/orders/order-2")return ok(order("order-2","COMPLETED"));
  if(p==="/customer/orders/order-1/track"){
   if(kind==="missing")return fail(404,"NOT_FOUND");
   const fresh=kind==="fresh";
   return ok({orderId:"order-1",orderNumber:"order-1",publicCode:"order-1",deliveryStatus:"EN_ROUTE",
    statusMessage:"Courier is on the way",
    restaurant:{name:"Verified Juja Kitchen",address:"Juja",location:{latitude:-1.1,longitude:37},branchId:"branch-juja"},
    dropoff:{address:"Juja Estate",location:{latitude:-1.12,longitude:37.02}},
    rider:{id:"r-1",firstName:"Amina",vehicleType:"MOTORBIKE",vehicleRegistrationMasked:"K***A"},
    riderLiveLocation:{latitude:-1.103,longitude:37.017,recordedAt:fresh?new Date().toISOString():"2026-01-01T00:00:00Z",isStale:!fresh},
    estimatedEtaMinutes:7,timeline:[]});
  }
  if(p==="/customer/orders/order-2/track")return fail(404,"NOT_FOUND");
  if(p==="/trust/ratings"&&method==="POST")return ok({id:"rating-1"});
  return fail(404,"NOT_FOUND");
 });
 return calls;
}
test("08 order history filters and links to verified records",async({page})=>{
 await setup(page);await page.goto("/orders");
 await expect(page.getByRole("heading",{name:"Your orders"})).toBeVisible();
 await expect(page.locator(".dt-history-card")).toHaveCount(3);
 await page.getByRole("tab",{name:"Past orders"}).click();
 await expect(page.locator(".dt-history-card")).toHaveCount(1);
 await page.getByRole("tab",{name:/All orders/}).click();
 await page.getByRole("button",{name:/View details/}).first().click();
 await expect(page).toHaveURL(/\/orders\/order-1\/track$/);
});
test("09 tracking hides unverified ETA and GPS",async({page})=>{
 await setup(page);await page.goto("/orders/order-1/track");
 await expect(page.getByText("Live map unavailable")).toBeVisible();
 await expect(page.getByText("ETA unavailable")).toBeVisible();
 await expect(page.getByRole("link",{name:/Open verified location/})).toHaveCount(0);
});
test("09 fresh GPS may show verified ETA and location link",async({page})=>{
 await setup(page,"fresh");await page.goto("/orders/order-1/track");
 await expect(page.getByText("ETA 7 min")).toBeVisible();
 await expect(page.getByRole("link",{name:/Open verified location/})).toHaveAttribute("href",/openstreetmap.org/);
});
test("09 unassigned delivery or forbidden order doesn't leak rider",async({page})=>{
 await setup(page,"missing");await page.goto("/orders/order-1/track");
 await expect(page.getByText("Live map unavailable")).toBeVisible();
 await expect(page.getByText(/delivery has not yet been created/)).toBeVisible();
});
test("09 foreign order denied",async({page})=>{
 await setup(page,"forbidden");await page.goto("/orders/order-1/track");
 await expect(page.getByText(/do not have permission/)).toBeVisible();
 await expect(page.getByText("Amina")).toHaveCount(0);
});
test("10 completed receipt and real rider rating API",async({page})=>{
 const calls=await setup(page);await page.goto("/orders/order-2/completed");
 await expect(page.getByText("Ksh 1,825.00")).toBeVisible();
 await page.getByRole("button",{name:"5 stars"}).click();
 await page.getByRole("button",{name:"Submit delivery rating"}).click();
 await expect(page.getByText(/rating has been received/)).toBeVisible();
 expect(calls).toContain("POST /trust/ratings");
});
test("10 noncompleted orders cannot show completed receipt",async({page})=>{
 await setup(page);await page.goto("/orders/order-1/completed");
 await expect(page.getByText("Order not yet completed")).toBeVisible();
});
test("08–10 mobile page width",async({page})=>{
 await setup(page);await page.setViewportSize({width:390,height:844});
 for(const path of ["/orders","/orders/order-1/track","/orders/order-2/completed"]){
   await page.goto(path);await expect(page.locator(".dt-orders-page")).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),path).toBe(true);
 }
});
