/**
 * Real-services Customer Screens 01–07 acceptance.
 * CI only: isolated PostgreSQL/PostGIS + Redis + DeeToo Express HTTP + local
 * payment worker. No mocked fetch/router/repository responses, no live charge.
 * The local provider is explicitly prohibited when APP_ENV=staging/production.
 */
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createServer,type Server} from "node:http";
import {createApp} from "../../apps/api/src/app";
import {runMigrations} from "../../scripts/db-migrate";
import {getDbPool,closeDbPool} from "../../apps/api/src/db/client";
import {closeRedisClient} from "../../apps/api/src/db/redis";
import {authService} from "../../apps/api/src/modules/auth/auth.service";
import {merchantRepository} from "../../apps/api/src/modules/merchant/merchant.repository";
import {customerRepository} from "../../apps/api/src/modules/customer/customer.repository";
import {processPaymentCommand} from "../../apps/api/src/modules/payment/payment-worker";
import {notificationService} from "../../apps/api/src/modules/operations/notification.service";
import {MerchantStatus,MerchantApprovalStatus,BranchAdminStatus,BranchOperationalStatus} from "@deetoo/types";
import {config} from "@deetoo/config";

if(config.storage.mode!=="postgres"||config.storage.fixtures||
 !process.env.DATABASE_URL?.includes("foundation")||
 !config.localWorkflow||["staging","production"].includes(config.environment))
 throw new Error("Run ONLY in isolated local/test PostgreSQL with explicit synthetic provider; never in deployed staging/production.");

let server:Server,base="",token="",customerId="",branchId="",itemId="",addressId="",merchantId="",modifierId="",unavailableOptionId="",soldoutItemId="";
const prefix="/api/v1";
async function http(path:string,init:RequestInit={}){
 const response=await fetch(base+prefix+path,{...init,headers:{
   ...(token?{Authorization:"Bearer "+token}:{}),
   ...(init.body?{"Content-Type":"application/json"}:{}),
   ...init.headers
 }});
 const json=await response.json() as {data?:any;error?:{code?:string;message?:string};meta?:any};
 return {status:response.status,json};
}
const post=(path:string,payload:unknown,key?:string)=>http(path,{
 method:"POST",body:JSON.stringify(payload),headers:key?{"Idempotency-Key":key}:undefined
});
const eq=(actual:number,expected:number,stage:string)=>assert.equal(actual,expected,stage);
function record(stage:string,details:Record<string,unknown>={}){console.log("REAL_SERVICES_ACCEPTANCE "+JSON.stringify({stage,result:"PASS",...details}));}

before(async()=>{
 await runMigrations();
 const now=new Date().toISOString(),db=getDbPool();
 const user=await authService.registerCustomer({name:"Shopping Acceptance",email:randomUUID()+"@example.test",password:"Isolated-Test-Only-893!"});
 token=user.accessToken;customerId=user.user.id;
 merchantId=randomUUID();branchId=randomUUID();const menuId=randomUUID(),categoryId=randomUUID();itemId=randomUUID();
 const zoneId=randomUUID();
 await merchantRepository.createMerchant({
  id:merchantId,legal_name:"Real Services Checkout Test",display_name:"Acceptance Kitchen "+merchantId.slice(0,8),
  status:MerchantStatus.ACTIVE,approval_status:MerchantApprovalStatus.APPROVED,
  commission_bps:2000,settlement_schedule:"WEEKLY",created_at:now,updated_at:now
 });
 await merchantRepository.createBranch({
  id:branchId,merchant_id:merchantId,name:"Acceptance Branch",address_line1:"Juja",address_text:"Juja Test Location",
  latitude:-1.105,longitude:37.014,status:BranchAdminStatus.ACTIVE,
  operational_status:BranchOperationalStatus.OPEN,city:"Juja",region:"Kiambu",country_code:"KE",
  timezone:"Africa/Nairobi",currency:"KES",min_order_minor:0,prep_default_min:20,created_at:now,updated_at:now
 });
 await db.query("INSERT INTO branch_opening_hours(id,branch_id,day_of_week,open_time,close_time,is_closed) SELECT gen_random_uuid(),$1,n,'00:00','23:59',false FROM generate_series(0,6) n",[branchId]);
 await db.query("INSERT INTO service_zones(id,name,status,boundary) VALUES($1,$2,'ACTIVE',ST_Multi(ST_GeomFromText('POLYGON((36 -2,38 -2,38 0,36 0,36 -2))',4326))::geography)",[zoneId,"Acceptance zone "+zoneId.slice(0,8)]);
 await db.query("INSERT INTO branch_service_zones(branch_id,service_zone_id) VALUES($1,$2)",[branchId,zoneId]);
 const address=await customerRepository.createAddress({customer_id:customerId,label:"Home",address_line1:"Juja Test Location",latitude:-1.107,longitude:37.016});
 addressId=address.id;
 await db.query("INSERT INTO menus(id,branch_id,merchant_id,name,status) VALUES($1,$2,$3,'Acceptance Menu','ACTIVE')",[menuId,branchId,merchantId]);
 await db.query("INSERT INTO menu_categories(id,menu_id,name) VALUES($1,$2,'Acceptance Burgers')",[categoryId,menuId]);
 await db.query("INSERT INTO menu_items(id,menu_id,category_id,name,price_minor) VALUES($1,$2,$3,$4,85000)",[itemId,menuId,categoryId,"Acceptance Smash "+merchantId.slice(0,8)]);
 // Real menu modifier group: one required, one available, one unavailable.
 const modifierGroupId=randomUUID();modifierId=randomUUID();unavailableOptionId=randomUUID();soldoutItemId=randomUUID();
 await db.query("INSERT INTO modifier_groups(id,merchant_id,name,min_selections,max_selections,is_required) VALUES($1,$2,'Choose patty',1,1,true)",[modifierGroupId,merchantId]);
 await db.query("INSERT INTO modifier_options(id,modifier_group_id,name,price_delta_minor,is_available) VALUES($1,$2,'Beef patty',5000,true),($3,$2,'Unavailable patty',5000,false)",[modifierId,modifierGroupId,unavailableOptionId]);
 await db.query("INSERT INTO item_modifier_groups(item_id,modifier_group_id) VALUES($1,$2)",[itemId,modifierGroupId]);
 await db.query("INSERT INTO menu_items(id,menu_id,category_id,name,price_minor,is_available) VALUES($1,$2,$3,'Sold Out Test',10000,false)",[soldoutItemId,menuId,categoryId]);
 await db.query("INSERT INTO delivery_pricing_rules(id,base_fee_minor,included_distance_meters,per_km_fee_minor,minimum_fee_minor,maximum_fee_minor,max_delivery_distance_meters,status,effective_from) VALUES($1,10000,5000,0,10000,10000,100000,'ACTIVE',now())",[randomUUID()]);
 await db.query("INSERT INTO service_fee_rules(id,fee_type,percentage_basis_points,fixed_fee_minor,minimum_fee_minor,maximum_fee_minor,status,effective_from) VALUES($1,'FIXED',0,2500,2500,2500,'ACTIVE',now())",[randomUUID()]);
 await db.query("INSERT INTO merchant_commission_rules(id,merchant_id,percentage_rate,fixed_fee_minor,effective_from,status) VALUES($1,$2,0.2,0,now(),'ACTIVE')",[randomUUID(),merchantId]);
 server=createServer(createApp());
 await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
 const addr=server.address();assert(addr&&typeof addr!=="string");
 base="http://127.0.0.1:"+addr.port;
});
after(async()=>{
 if(server)await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 await closeDbPool();
 closeRedisClient();
});

test("01–07 full HTTP customer journey uses genuine PostgreSQL, Redis, and payment worker",async()=>{
 // 01: serviceable customer location and real merchant discovery
 const zone=await http("/serviceability?lat=-1.107&lng=37.016");
 eq(zone.status,200,"01 serviceability");
 assert.equal(zone.json.data.serviceable,true);
 const discovery=await http("/restaurants?search=Acceptance%20Kitchen&lat=-1.107&lng=37.016");
 eq(discovery.status,200,"01 restaurant discovery");
 assert((discovery.json.data as any[]).some(r=>r.branch_id===branchId));
 record("01-discover",{branchCount:discovery.json.data.length});
 // 02: live search includes actual indexed menu item, no mocked search responses
 const search=await http("/restaurants?search=Acceptance%20Smash&lat=-1.107&lng=37.016");
 eq(search.status,200,"02 dish search");
 assert((search.json.data as any[]).some(r=>r.branch_id===branchId));
 record("02-search");
 // 03: merchant detail and public menu reflect live database
 const detail=await http("/restaurants/"+branchId);
 eq(detail.status,200,"03 restaurant detail");
 assert.equal(detail.json.data.branch.branch_id,branchId);
 const menu=await http("/public/branches/"+branchId+"/menu");
 eq(menu.status,200,"03 public menu");
 assert(menu.json.data.categories.some((c:any)=>c.items.some((x:any)=>x.id===itemId&&x.modifier_groups?.[0]?.min_selections===1)));
 record("03-menu");
 // 04/05/06: actual authenticated cart, price in minor units, quantity updates
 const noAuth=await fetch(base+prefix+"/cart");
 eq(noAuth.status,401,"05 authorization");
 const initial=await http("/cart");eq(initial.status,200,"05 empty cart");assert.equal(initial.json.data,null);
 const missing=await post("/cart/items",{branch_id:branchId,menu_item_id:itemId,quantity:1,modifier_option_ids:[]});
 assert(missing.status>=400,"04 required modifier must be rejected");
 const unavailable=await post("/cart/items",{branch_id:branchId,menu_item_id:itemId,quantity:1,modifier_option_ids:[unavailableOptionId]});
 assert(unavailable.status>=400,"04 unavailable modifier must be rejected");
 const soldout=await post("/cart/items",{branch_id:branchId,menu_item_id:soldoutItemId,quantity:1,modifier_option_ids:[]});
 assert(soldout.status>=400,"04 sold-out item must be rejected");
 const add=await post("/cart/items",{branch_id:branchId,menu_item_id:itemId,quantity:1,modifier_option_ids:[modifierId]});
 eq(add.status,200,"04 add menu item with required option");assert.equal(add.json.data.total_quantity,1);
 record("04-modifiers",{requiredDenied:true,unavailableDenied:true,soldOutDenied:true});
 const cartItemId=add.json.data.items[0].id;
 eq((await http("/cart")).json.data.items[0].line_total_minor,90000,"06 persisted price includes modifier");
 const update=await http("/cart/items/"+cartItemId,{method:"PATCH",body:JSON.stringify({quantity:2})});
 eq(update.status,200,"06 quantity update");eq(update.json.data.total_quantity,2,"06 updated cart quantity");
 const reloaded=await http("/cart");
 eq(reloaded.json.data.pricing.items_subtotal_minor,170000,"06 base item subtotal");
 eq(reloaded.json.data.pricing.modifiers_subtotal_minor,10000,"06 modifier subtotal");
 eq(reloaded.json.data.pricing.subtotal_minor,180000,"06 combined priced subtotal");
 record("04-06-cart",{subtotalMinor:reloaded.json.data.pricing.items_subtotal_minor});
 // 07: saved address, immutable server quote, idempotent pending order
 const addresses=await http("/customer/addresses");
 eq(addresses.status,200,"07 address selection");
 assert((addresses.json.data as any[]).some(a=>a.id===addressId));
 const quoted=await post("/checkout/quote",{address_id:addressId,payment_method:"MPESA"});
 eq(quoted.status,200,"07 authoritative quote");
 const quote=quoted.json.data;
 assert.equal(quote.gross_subtotal_minor,180000);
 assert.equal(quote.total_minor,quote.net_subtotal_minor+quote.delivery_fee_minor+quote.service_fee_minor+quote.tax_minor);
 const key=randomUUID();
 const first=await post("/orders",{quote_id:quote.id},key);
 eq(first.status,201,"07 pending order");
 assert.equal(first.json.data.status,"PENDING_PAYMENT");
 const second=await post("/orders",{quote_id:quote.id},key);
 assert([200,201].includes(second.status),"idempotent order repeat should succeed");
 assert.equal(first.json.data.id,second.json.data.id,"order deduplicated");
 record("07-quote-and-idempotency",{quoteTotalMinor:quote.total_minor});
 // Synthetic LOCAL test only: real durable worker and ledgers, not Daraja STK.
 const payment=await post("/payments/initiate",{order_id:first.json.data.id,method:"MPESA",phone:"254700000000"},randomUUID());
 eq(payment.status,201,"07 payment attempt accepted");
 const pid=payment.json.data.id;
 for(let i=0;i<3;i++)await processPaymentCommand(pid);
 const order=await http("/orders/"+first.json.data.id);
 eq(order.status,200,"07 persisted order reload");
 assert.equal(order.json.data.status,"PLACED","payment worker releases order only after verified local capture");
 const customerPayments=await http("/payments/order/"+first.json.data.id);
 eq(customerPayments.status,200,"07 authorized payment history");
 record("07-durable-local-payment",{orderStatus:order.json.data.status,provider:"SYNTHETIC_LOCAL_ONLY"});
 // Phase B3: order list/details are customer-scoped; tracking has a safe no-delivery state.
 const history=await http("/customer/orders?limit=50");
 eq(history.status,200,"08 authenticated history");
 assert((history.json.data as any[]).some(x=>x.id===first.json.data.id),"persisted customer history must include released order");
 const owned=await http("/customer/orders/"+first.json.data.id);
 eq(owned.status,200,"08 order detail");
 assert.equal(owned.json.data.customer_id,customerId);
 const delivery=await http("/customer/orders/"+first.json.data.id+"/delivery");
 eq(delivery.status,200,"09 scoped delivery");
 // A rider need not be assigned immediately after payment; never require invented coordinates.
 assert(delivery.json.data===null||"delivery" in delivery.json.data);
 const tracking=await http("/customer/orders/"+first.json.data.id+"/track");
 assert(tracking.status===200||tracking.status===404,"09 no delivery may be 404; no fake tracking");
 if(tracking.status===200)assert.equal(tracking.json.data.orderId,first.json.data.id);
 const stranger=await authService.registerCustomer({name:"Unrelated Customer",email:randomUUID()+"@example.test",password:"Isolation-ONLY-893!"});
 const foreign=await fetch(base+prefix+"/customer/orders/"+first.json.data.id,{headers:{Authorization:"Bearer "+stranger.accessToken}});
 eq(foreign.status,403,"08 foreign customer forbidden");
 const foreignTracking=await fetch(base+prefix+"/customer/orders/"+first.json.data.id+"/track",{headers:{Authorization:"Bearer "+stranger.accessToken}});
 eq(foreignTracking.status,403,"09 foreign tracking forbidden");
 record("08-09-orders-and-privacy",{historyCount:history.json.data.length,trackingStatus:tracking.status,foreignDenied:true});
 // Phase B4: real customer profile/address/sessions and privacy protection.
 const customerProfile=await http("/customer/profile");
 eq(customerProfile.status,200,"11 customer profile");
 assert.equal(customerProfile.json.data.user_id,customerId);
 const profileUpdated=await http("/customer/profile",{method:"PATCH",body:JSON.stringify({display_name:"Real Service Customer"})});
 eq(profileUpdated.status,200,"11 update profile");assert.equal(profileUpdated.json.data.display_name,"Real Service Customer");
 const originalSessions=await http("/auth/sessions");
 eq(originalSessions.status,200,"12 authenticated security sessions");
 assert(Array.isArray(originalSessions.json.data));
 record("11-12-account",{savedAddresses:addresses.json.data.length,sessions:originalSessions.json.data.length});

 // 13: actual persisted customer notification, scoped unread and read handling.
 const sent=await notificationService.sendNotification({recipientType:"CUSTOMER",recipientId:customerId,
  channel:"IN_APP",templateCode:"SUPPORT_CASE_UPDATED",subject:"Your DeeToo support request",payload:{message:"We are reviewing your request."},
  referenceId:randomUUID()});
 const inbox=await http("/customer/support/notifications");
 eq(inbox.status,200,"13 customer inbox");
 assert(Array.isArray(inbox.json.data.notifications),"notification envelope includes a collection");
 assert(inbox.json.data.notifications.some((n:any)=>n.id===sent.id));
 const read=await post("/customer/support/notifications/"+sent.id+"/read",{});
 eq(read.status,200,"13 customer mark-read");
 assert(read.json.data.read_at,"read timestamp persisted");
 const foreignRead=await fetch(base+prefix+"/customer/support/notifications/"+sent.id+"/read",
  {method:"POST",headers:{Authorization:"Bearer "+stranger.accessToken,"Content-Type":"application/json"},body:"{}"});
 assert([403,404].includes(foreignRead.status),"notifications may only be marked read by their recipient");
 record("13-notifications",{readPersisted:true,foreignDenied:true});

 // 14–15: customer-owned persisted conversation with scoped case attachment/read boundary.
 const createdCase=await post("/customer/support/cases",{category:"ORDER_ISSUE",order_id:first.json.data.id,
  subject:"Question about paid order",description:"Please help with the actual paid order status."});
 eq(createdCase.status,201,"14 create scoped support request");
 const caseId=createdCase.json.data.id;
 const caseList=await http("/customer/support/cases");
 eq(caseList.status,200,"14 customer support listing");
 assert(caseList.json.data.cases.some((c:any)=>c.id===caseId));
 const firstRead=await http("/customer/support/cases/"+caseId);
 eq(firstRead.status,200,"15 case detail");
 assert.equal(firstRead.json.data.case.customer_id,customerId);
 const posted=await post("/customer/support/cases/"+caseId+"/notes",{body:"I want to understand the delivery status.",media_ids:[]});
 eq(posted.status,201,"15 message persisted");
 const thread=await http("/customer/support/cases/"+caseId);
 eq(thread.status,200,"15 conversation reread");
 assert(thread.json.data.notes.some((n:any)=>n.body==="I want to understand the delivery status."));
 const foreignCase=await fetch(base+prefix+"/customer/support/cases/"+caseId,
  {headers:{Authorization:"Bearer "+stranger.accessToken}});
 eq(foreignCase.status,403,"15 other customer's conversation blocked");
 const foreignPost=await fetch(base+prefix+"/customer/support/cases/"+caseId+"/notes",
  {method:"POST",headers:{Authorization:"Bearer "+stranger.accessToken,"Content-Type":"application/json"},
   body:JSON.stringify({body:"Should never be posted"})});
 eq(foreignPost.status,403,"15 other customer's messages blocked");
 record("14-15-support",{casePersisted:true,conversationPersisted:true,foreignDenied:true});


});
