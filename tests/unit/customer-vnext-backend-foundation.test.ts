import assert from "node:assert/strict";
import {describe,it} from "node:test";
import type {DeetooApiClient} from "../../packages/api-client/src/index";
import {createCustomerGateway,ContractMismatchError,IntegrationUnavailableError,responseData,safeResourceId} from "../../apps/customer-web-next/src/integration/customer-gateway";
import {resolveCustomerBackendMode} from "../../apps/customer-web-next/src/integration/mode";
import {backendError,isEmptyData} from "../../apps/customer-web-next/src/integration/resource";

describe("Customer vNext Backend Foundation",()=>{
 it("starts in preview mode without enabling backend integrations",()=>{
   assert.equal(resolveCustomerBackendMode(undefined),"preview");
   assert.equal(resolveCustomerBackendMode(""),"preview");
   assert.equal(resolveCustomerBackendMode("CONNECTED"),"preview");
   assert.equal(resolveCustomerBackendMode("connected"),"connected");
 });
 it("only accepts safe, encoded path identifiers",()=>{
   assert.equal(safeResourceId("DT-E2ZG5"),"DT-E2ZG5");
   assert.equal(safeResourceId("4fbd7c11-1c22-4aca-9c70-7aa094c947bb"),"4fbd7c11-1c22-4aca-9c70-7aa094c947bb");
   for(const bad of ["","../admin","order?next=../","a/b","x%2Fy","é", "A".repeat(129)]){
     assert.throws(()=>safeResourceId(bad),TypeError);
   }
 });
 it("preserves null data but rejects invalid and failed envelopes",async()=>{
   assert.equal(await responseData(Promise.resolve({data:null}),"/cart"),null);
   assert.deepEqual(await responseData(Promise.resolve({data:[]}),"/orders"),[]);
   await assert.rejects(()=>responseData(Promise.resolve({success:false,data:[]} as any),"/orders"),ContractMismatchError);
   await assert.rejects(()=>responseData(Promise.resolve({success:true} as any),"/orders"),ContractMismatchError);
 });
 it("returns sanitized user messages for auth, permission and timeout failures",()=>{
   assert.equal(backendError({error:{code:"HTTP_401",message:"leaky"}}).code,"UNAUTHORIZED");
   assert.equal(backendError({error:{code:"FORBIDDEN_OPERATION",message:"internal"}}).code,"FORBIDDEN");
   assert.equal(backendError({error:{code:"TIMEOUT"}}).code,"TIMEOUT");
   assert.equal(backendError(new Error("secret token")).message.includes("secret"),false);
   assert.equal(isEmptyData(null),true);
   assert.equal(isEmptyData([]),true);
   assert.equal(isEmptyData({}),false);
 });
 it("routes customer support mutations through correct scoped endpoints",async()=>{
   const recorded:Array<{route:string;options?:RequestInit}>=[];
   const client={request:async(route:string,options?:RequestInit)=>{recorded.push({route,options});return {data:{id:"server-owned"}};}} as unknown as DeetooApiClient;
   const gateway=createCustomerGateway(client);
   await gateway.support.list();
   await gateway.support.detail("case-42");
   await gateway.support.create({category:"ORDER_ISSUE",subject:"Wrong food",description:"The wrong item arrived."});
   await gateway.support.message("case-42",{body:"Please look at my delivery.",media_ids:[]});
   await gateway.support.resolutionResponse("case-42","DISPUTED","Not satisfied");
   await gateway.support.attachmentUrl("case-42","file-14");
   await gateway.notifications.markRead("notification-5");
   assert.deepEqual(recorded.map(x=>x.route),[
     "/customer/support/cases","/customer/support/cases/case-42","/customer/support/cases",
     "/customer/support/cases/case-42/notes","/customer/support/cases/case-42/resolution-response",
     "/customer/support/cases/case-42/attachments/file-14/read-url",
     "/customer/support/notifications/notification-5/read"
   ]);
   assert.equal(JSON.parse(String(recorded[4].options?.body)).decision,"DISPUTED");
   assert.equal(JSON.parse(String(recorded[3].options?.body)).body,"Please look at my delivery.");
   assert.equal(recorded[2].options?.method,"POST");
 });
 it("will not create an order without a stable idempotency key",()=>{
   const client={createOrder:()=>{throw Error("unsafe order attempted");}} as unknown as DeetooApiClient;
   const gateway=createCustomerGateway(client);
   assert.throws(()=>gateway.orders.create({} as never,"short"),/idempotency/);
 });
 it("queries real order tracking on the customer-scoped route",async()=>{
   const observed:string[]=[];
   const client={request:async(path:string)=>{observed.push(path);return{data:null};}} as unknown as DeetooApiClient;
   const gateway=createCustomerGateway(client);
   assert.equal(await gateway.orders.tracking("DT-E2ZG5"),null);
   assert.deepEqual(observed,["/customer/orders/DT-E2ZG5/track"]);
   assert.throws(()=>gateway.orders.tracking("../../merchant"),TypeError);
 });
 it("fails closed when notification preference and bulk-read APIs are unavailable",()=>{
   const gateway=createCustomerGateway({} as DeetooApiClient);
   assert.throws(()=>gateway.notifications.preferences(),IntegrationUnavailableError);
   assert.throws(()=>gateway.notifications.markAllRead(),IntegrationUnavailableError);
 });
});
