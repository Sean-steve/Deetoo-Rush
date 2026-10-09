import {test,expect} from "@playwright/test";

const restaurant={
 branch_id:"branch-juja",merchant_id:"merchant-1",merchant_name:"Live Juja Kitchen",branch_name:"Juja Town",
 cover_url:null,categories:["Burgers"],category_ids:["cat-burgers"],address_text:"Juja Road, Kiambu County",
 city:"Juja",latitude:-1.105,longitude:37.014,distance_km:1.5,min_order_minor:10000,currency:"KES",
 prep_default_min:18,open_status:"OPEN",is_open_now:true,is_busy:false,status_badge_text:"Open",
 opening_hours:[],serviceable:true
};
const address={id:"address-1",customer_id:"cust-1",label:"Home",address_line1:"Juja Road",
 address_text:"Juja Road, Juja",city:"Juja",region:"Kiambu County",country_code:"KE",
 latitude:-1.105,longitude:37.014,is_default:true,is_active:true,created_at:"2026-10-08T00:00:00Z",updated_at:"2026-10-08T00:00:00Z"};
const menu={menu:{id:"menu-1"},merchant:{id:"merchant-1",display_name:"Live Juja Kitchen"},
 branch:{id:"branch-juja",name:"Juja Town",address_text:"Juja Road, Juja",operational_status:"OPEN",currency:"KES"},
 categories:[{id:"category-1",name:"Burgers",sort_order:1,items:[{
  id:"burger-1",name:"Live Smash Burger",price_minor:85000,currency:"KES",image_url:"",is_available:true,
  description:"Smash beef patty and cheese",modifier_groups:[{id:"patty-1",name:"Choose your patty",
   min_selections:1,max_selections:1,is_required:true,options:[{id:"beef-1",name:"Beef",price_delta_minor:0,is_available:true},
   {id:"chicken-1",name:"Chicken",price_delta_minor:10000,is_available:true}]}]
 }]}]};
const cart={
 id:"cart-1",branch_id:"branch-juja",customer_id:"cust-1",
 branch:{id:"branch-juja",merchant_id:"merchant-1",name:"Juja Town",merchant_name:"Live Juja Kitchen",
 min_order_minor:10000,currency:"KES",open_status:"OPEN",is_open_now:true,address_text:"Juja Road, Juja",latitude:-1.105,longitude:37.014},
 items:[{id:"cart-item-1",cart_id:"cart-1",menu_item_id:"burger-1",item_name:"Live Smash Burger",quantity:1,
 unit_base_price_minor:85000,unit_modifiers_price_minor:0,unit_total_price_minor:85000,line_total_minor:85000,
 is_available:true,price_changed:false,modifiers:[{group_id:"patty-1",group_name:"Choose your patty",option_id:"beef-1",
 option_name:"Beef",price_delta_minor:0,is_available:true}]}],
 total_quantity:1,currency:"KES",pricing:{items_subtotal_minor:85000,modifiers_subtotal_minor:0,subtotal_minor:85000,
 minimum_order_minor:10000,minimum_order_met:true,minimum_order_remaining_minor:0,estimated_delivery_fee_minor:10000,
 estimated_service_fee_minor:2125,discount_minor:0,estimated_total_minor:97125},
 warnings:[],created_at:"2026-10-08T00:00:00Z",updated_at:"2026-10-08T00:00:00Z"
};
const customer={id:"cust-1",name:"Verified Customer",roles:["customer"],permissions:[],status:"ACTIVE",
 created_at:"2026-10-08T00:00:00Z"};
function routeSetup(page:any,authenticated:boolean){
 const hits:string[]=[];let filled=false;let placed=false;let paid=false;
 return page.route("**/api/v1/**",async(route:any)=>{
  const u=new URL(route.request().url()),p=u.pathname.replace("/api/v1",""),method=route.request().method();
  hits.push(method+" "+p);
  const respond=(data:any,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify({success:true,data})});
  if(p==="/auth/me")return authenticated?respond(customer):route.fulfill({status:401,contentType:"application/json",body:'{"error":{"code":"UNAUTHORIZED","message":"No customer session"}}'});
  if(p==="/auth/refresh")return route.fulfill({status:401,contentType:"application/json",body:'{"error":{"code":"UNAUTHORIZED","message":"No refresh"}}'});
  if(p==="/restaurant-categories")return respond([{id:"cat-burgers",name:"Burgers",slug:"burgers",sort_order:0,is_active:true}]);
  if(p==="/restaurants")return respond([restaurant]);
  if(p==="/restaurants/branch-juja")return respond({branch:restaurant,merchant:{id:"merchant-1",display_name:"Live Juja Kitchen"},opening_hours:[],serviceability:{serviceable:true,reason_code:"ZONE_ACTIVE"}});
  if(p==="/public/branches/branch-juja/menu")return respond(menu);
  if(p==="/customer/addresses")return respond([address]);
  if(p==="/serviceability")return respond({serviceable:true,eligible_branch_count:1,reason_code:"SERVICEABLE"});
  if(p==="/cart"&&method==="GET")return respond(filled&&!placed?cart:null);
  if(p==="/cart/items"&&method==="POST"){const body=route.request().postDataJSON();if(body.menu_item_id!=="burger-1"||!body.modifier_option_ids.includes("beef-1"))throw Error("Wrong live modifier selection");filled=true;return respond(cart);}
  if(p==="/checkout/quote"&&method==="POST")return respond({id:"quote-1",quote_id:"quote-1",cart_id:"cart-1",branch_id:"branch-juja",branch_name:"Live Juja Kitchen",customer_id:"cust-1",delivery_address_id:"address-1",
   delivery_address_snapshot:{recipient_name:"Customer",address_text:"Juja Road",location:{latitude:-1.105,longitude:37.014}},
   currency:"KES",items_subtotal_minor:85000,modifiers_subtotal_minor:0,gross_subtotal_minor:85000,discount_minor:0,net_subtotal_minor:85000,delivery_fee_minor:10000,service_fee_minor:2125,tax_minor:0,total_minor:97125,distance_meters:1200,estimated_duration_min:20,
   delivery_pricing_rule_id:"rule-1",service_fee_rule_id:"rule-2",expires_at:new Date(Date.now()+600000).toISOString(),created_at:new Date().toISOString()});
  if(p==="/orders"&&method==="POST"){if(!route.request().headers()["idempotency-key"])throw Error("Missing idempotency key");placed=true;return respond({id:"order-1",order_number:"DT-ONE",status:"PENDING_PAYMENT",total_minor:97125});}
  if(p==="/customer/orders/order-1")return respond({id:"order-1",order_number:"DT-ONE",status:"PENDING_PAYMENT",total_minor:97125});
  if(p==="/payments/order/order-1")return respond(paid?[{id:"payment-1",order_id:"order-1",status:"CAPTURED",created_at:new Date().toISOString()}]:[]);
  if(p==="/payments/initiate"&&method==="POST"){if(!route.request().headers()["idempotency-key"])throw Error("Missing payment key");paid=true;return respond({id:"payment-1",order_id:"order-1",status:"INITIATED"});}
  return route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({error:{code:"UNEXPECTED_MOCK_ROUTE",message:p}})});
 }).then(()=>hits);
}

test("Connected discovery shows only the API's real restaurants, not preview fixtures",async({page})=>{
 await routeSetup(page,false);
 await page.goto("/");
 await expect(page.getByRole("heading",{name:"Discover restaurants"})).toBeVisible();
 await expect(page.getByText("Live Juja Kitchen").first()).toBeVisible();
 await expect(page.getByText("Smash Burger", {exact:true})).toHaveCount(0);
 await expect(page.getByText("Deetoo Test Merchant")).toHaveCount(0);
 await page.getByRole("textbox",{name:"Search restaurants, dishes or cuisines"}).fill("Juja");
 await expect(page).toHaveURL(/\/search$/);
 await expect(page.getByText("Live Juja Kitchen").first()).toBeVisible();
});

test("Screens 03–07 use live menu modifiers, verified bag/quote and payment status",async({page})=>{
 const hits=await routeSetup(page,true);
 await page.goto("/");
 await expect(page.getByText("Live Juja Kitchen").first()).toBeVisible();
 await page.getByRole("button",{name:"Open Live Juja Kitchen"}).first().click();
 await expect(page).toHaveURL(/\/restaurant\/branch-juja$/);
 await expect(page.getByRole("heading",{name:"Live Smash Burger"})).toBeVisible();
 await page.getByRole("button",{name:"Customize Live Smash Burger"}).click();
 const dialog=page.getByRole("dialog");
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole("button",{name:/Add to bag/})).toBeDisabled();
 await dialog.getByLabel("Beef",{exact:true}).check();
 await dialog.getByRole("button",{name:/Add to bag/}).click();
 await expect(dialog).not.toBeVisible();
 await page.locator(".dt-header-cart").click();
 await expect(page.getByRole("heading",{name:"Your bag"})).toBeVisible();
 await expect(page.getByText("Live Smash Burger").first()).toBeVisible();
 await expect(page.getByText("Ksh 971.25").first()).toBeVisible();
 await page.getByRole("button",{name:/Proceed to checkout/}).click();
 await expect(page.getByRole("heading",{name:"Checkout"})).toBeVisible();
 await page.getByRole("button",{name:/Review checkout/}).click();
 await expect(page.getByText("Verified total to pay")).toBeVisible();
 await page.getByRole("button",{name:/Create order/}).click();
 await expect(page).toHaveURL(/\/payment\/order-1$/);
 await expect(page.getByRole("heading",{name:"Complete your payment"})).toBeVisible();
 await page.getByRole("textbox",{name:"M-PESA mobile number"}).fill("254712345678");
 await page.getByRole("button",{name:"Send M-PESA prompt"}).click();
 await expect(page.getByRole("heading",{name:"Payment received"})).toBeVisible();
 expect(hits).toContain("POST /cart/items");
 expect(hits).toContain("POST /checkout/quote");
 expect(hits).toContain("POST /orders");
 expect(hits).toContain("POST /payments/initiate");
});
