/**
 * DeeToo Admin Next: live-only transport and read adapters.
 * The accepted demo remains in its own explicit VITE_ADMIN_NEXT_MODE=demo build.
 * Never persist server response data in localStorage and never substitute demo fixtures.
 */
import {seedDemo} from "./data";
import type {DemoState,Order,Rider,OrderStatus,Area} from "./data";
import type {IncidentCase,SupportCase,MerchantRecord,CustomerRecord} from "./phase2Data";
import type {PhaseThreeState,CountyCoverage,ServiceZone,RefundRequest,PayoutBatch} from "./phase3Data";
import type {PhaseFourState,AdminAccount,HealthComponent} from "./phase4Data";
export type Json=Record<string,unknown>;
export type ResourceName="orders"|"dispatch"|"riders"|"incidents"|"support"|"merchants"|"customers"|"counties"|"zones"|"payments"|"journal"|"settlements"|"payouts"|"finance"|"reports"|"campaigns"|"templates"|"inbox"|"users"|"health"|"config"|"analytics"|"sessions";
export type ResourceState={status:"ready"|"error"|"restricted";error?:string;total?:number};
export type LiveSnapshot={data:DemoState;resources:Partial<Record<ResourceName,ResourceState>>;identity:Json};
const API="/api/v1";
const obj=(x:unknown):Json=>(x&&typeof x==="object"&&!Array.isArray(x)?x as Json:{});
const arr=(x:unknown):Json[]=>Array.isArray(x)?x.map(obj):[];
const str=(x:unknown,fallback=""):string=>typeof x==="string"?x:fallback;
const num=(x:unknown,fallback=0):number=>typeof x==="number"&&Number.isFinite(x)?x:typeof x==="string"&&x.trim()!==""&&Number.isFinite(Number(x))?Number(x):fallback;
const bool=(x:unknown)=>x===true||x==="true";
const when=(x:unknown)=>str(x,"1970-01-01T00:00:00.000Z");
const name=(x:Json,fallback="")=>str(x.display_name||x.name||x.full_name||x.business_name||x.first_name,fallback);
const county=(x:Json)=>str(x.county||x.county_name||x.county_code,"Unknown");
const minor=(x:unknown)=>num(x)/100; // backend stores KES minor units. UI displays KES major units.
const status=(x:unknown)=>str(x,"UNKNOWN").toUpperCase();
function area(x:unknown,defaultName="Unknown location"):Area {
 const r=obj(x),coord=obj(r.coordinates||r.location||r.position);
 const lat=num(r.latitude??r.lat??coord.latitude??coord.lat,NaN),lng=num(r.longitude??r.lng??coord.longitude??coord.lng,NaN);
 return {name:name(r,str(r.address_line1||r.address_text,defaultName)),county:county(r),lat,lng};
}
function canonicalOrder(x:unknown):Order{
 const o=obj(x),delivery=obj(o.delivery),branch=obj(o.branch||o.merchant_branch),customer=obj(o.customer),payment=obj(o.payment);
 const p=obj(o.pickup_address||o.pickup||branch.address),d=obj(o.delivery_address||o.dropoff_address||o.delivery_location);
 const raw=status(delivery.status||o.delivery_status||o.status);
 const resolved:OrderStatus=raw==="COMPLETED"||raw==="DELIVERED"?"DELIVERED":raw==="CANCELLED"||raw==="REJECTED"?"CANCELLED":raw==="PICKED_UP"?"PICKED_UP":raw==="IN_TRANSIT"||raw==="ON_THE_WAY"?"IN_TRANSIT":raw==="ASSIGNED"||raw==="RIDER_ASSIGNED"?"RIDER_ASSIGNED":raw==="DELAYED"?"DELAYED":"PREPARING";
 const items=arr(o.items||o.order_items).map(i=>({name:name(i,str(i.item_name||i.menu_item_name,"Item")),qty:num(i.quantity??i.qty,1),price:minor(i.unit_price_minor??i.price_minor??i.unit_price)}));
 const subtotal=minor(o.subtotal_minor??o.items_subtotal_minor);
 const fee=minor(o.delivery_fee_minor),service=minor(o.service_fee_minor);
 const collected=status(payment.status||o.payment_status);
 const paymentStatus:Order["paymentStatus"]=collected==="REFUNDED"||collected==="PARTIALLY_REFUNDED"?"Refunded":collected==="CAPTURED"||collected==="PAID"?"Paid":"Pending";
 const history=arr(o.timeline||o.history||o.status_history).map(h=>({at:when(h.created_at||h.at),event:str(h.event||h.status||h.action),by:str(h.actor_name||h.actor,"System"),detail:str(h.description||h.detail)}));
 return {id:str(o.id),merchant:name(obj(o.merchant),name(branch,str(o.merchant_name,"Merchant"))),area:name(branch,"Unknown area"),pickup:area(p,"Pickup location"),destination:area(d,"Delivery destination"),customer:name(customer,str(o.customer_name,"Customer")),customerPhone:str(customer.phone_e164||o.customer_phone),riderId:str(o.assigned_rider_id||delivery.rider_id||o.rider_id)||null,status:resolved,createdAt:when(o.created_at),etaMinutes:num(o.estimated_delivery_minutes??delivery.eta_minutes),delayMinutes:num(o.delay_minutes),subtotal,deliveryFee:fee,serviceFee:service,items,paymentMethod:status(payment.method||o.payment_method)==="CARD"?"Card":status(payment.method||o.payment_method)==="CASH"?"Cash":"M-PESA",paymentStatus,notes:[],history};
}
function canonicalRider(x:unknown):Rider {
 const r=obj(x),profile=obj(r.profile||r.rider_profile),user=obj(r.user),l=obj(r.last_location||r.location);
 const operation=status(r.operational_status||r.status),work=status(r.work_status||r.availability_status);
 const state:Rider["status"]=operation==="SUSPENDED"?"SUSPENDED":work==="ON_DELIVERY"||work==="BUSY"?"ON_DELIVERY":work==="AVAILABLE"||work==="ONLINE"?"AVAILABLE":"OFFLINE";
 return {id:str(r.id||r.rider_id||profile.id),name:name(user,name(r,"Rider")),phone:str(user.phone_e164||r.phone_e164||r.phone),email:str(user.email||r.email),status:state,onboarding:status(r.onboarding_status||profile.onboarding_status)==="APPROVED"?"VERIFIED":"PENDING_REVIEW",area:area(l,"Location unavailable"),vehicle:str(r.vehicle_type||obj(r.vehicle).vehicle_type,"Not recorded"),plate:str(r.plate_number||obj(r.vehicle).plate_number),rating:num(r.average_rating||r.rating),deliveries:num(r.completed_deliveries||r.deliveries),joinedAt:when(r.created_at),locationUpdatedAt:when(l.updated_at||r.location_updated_at),approved:status(r.onboarding_status||profile.onboarding_status)==="APPROVED"};
}
function canonicalIncident(x:unknown):IncidentCase {
 const r=obj(x),s=status(r.status),sev=status(r.severity);
 return {id:str(r.id),title:str(r.summary||r.title,"Operational incident"),type:str(r.type,"Operations"),description:str(r.details||r.description),severity:(["LOW","MEDIUM","HIGH","CRITICAL"].includes(sev)?sev:"MEDIUM") as IncidentCase["severity"],status:(["OPEN","ACKNOWLEDGED","INVESTIGATING","ACTION_REQUIRED","MONITORING","RESOLVED","CLOSED"].includes(s)?s:"OPEN") as IncidentCase["status"],assignedTo:str(r.assigned_to_name,"Unassigned"),reporter:str(r.reporter||r.actor_name,"Operations"),location:str(r.location||r.county_name),relatedOrderId:str(r.order_id)||null,relatedRiderId:str(r.rider_id)||null,createdAt:when(r.created_at),updatedAt:when(r.updated_at),timeline:arr(r.timeline).map(t=>({at:when(t.created_at),actor:str(t.actor_name),event:str(t.action),note:str(t.note)})),notes:[],evidence:[]};
}
function canonicalSupport(x:unknown):SupportCase {
 const r=obj(x),s=status(r.status),actor=status(r.participant_type||r.actor_type);
 const messages=arr(r.messages||r.timeline).map(m=>({id:str(m.id),by:str(m.actor_name||m.sender_name||m.author_name,"Participant"),actor:(["CUSTOMER","MERCHANT","RIDER","ADMIN","SYSTEM"].includes(status(m.actor_type||m.sender_type))?status(m.actor_type||m.sender_type):"SYSTEM") as "CUSTOMER"|"MERCHANT"|"RIDER"|"ADMIN"|"SYSTEM",text:str(m.body||m.message||m.content||m.note),at:when(m.created_at),internal:bool(m.is_internal||m.internal)}));
 return {id:str(r.id),subject:str(r.subject||r.case_number||r.category,"Support case"),priority:(["LOW","MEDIUM","HIGH","CRITICAL"].includes(status(r.priority))?status(r.priority):"MEDIUM") as SupportCase["priority"],status:(["OPEN","IN_PROGRESS","WAITING_ON_USER","RESOLVED","CLOSED"].includes(s)?s:s==="AWAITING_PARTICIPANTS"?"WAITING_ON_USER":"IN_PROGRESS") as SupportCase["status"],participantName:str(r.participant_name||r.customer_name,"Participant"),participantType:actor==="MERCHANT"?"Merchant":actor==="RIDER"?"Rider":"Customer",assignedTo:str(r.assigned_to_name,"Unassigned"),orderId:str(r.order_id)||null,createdAt:when(r.created_at),updatedAt:when(r.updated_at),messages,satisfaction:"NOT_REQUESTED",resolution:str(r.resolution_summary||r.resolution)};
}
function canonicalMerchant(x:unknown):MerchantRecord {
 const m=obj(x),s=status(m.status),approve=status(m.approval_status),branches=arr(m.branches).map(b=>({id:str(b.id),name:name(b),county:county(b),area:str(b.area||b.city),status:status(b.status)==="ACTIVE"?"ACTIVE" as const:"PAUSED" as const,address:str(b.address_line1||b.address),orders:num(b.total_orders)}));
 return {id:str(m.id),name:name(m,"Merchant"),category:str(m.category||m.primary_category,"Merchant"),status:(s==="SUSPENDED"?"SUSPENDED":s==="ACTIVE"?"ACTIVE":approve==="PENDING"?"PENDING":"ONBOARDING"),verification:approve==="APPROVED"?"VERIFIED":approve==="PENDING"||approve==="IN_REVIEW"?"IN_REVIEW":"MISSING",owner:str(m.owner_name||m.contact_name),email:str(m.email||m.contact_email),phone:str(m.phone_e164||m.contact_phone),joinedAt:when(m.created_at),registration:str(m.registration_number),description:str(m.description),branches,reviewNotes:[],rating:num(m.rating)};
}
function canonicalCustomer(x:unknown):CustomerRecord{
 const c=obj(x),p=obj(c.profile||c.customer_profile),u=obj(c.user);const s=status(u.status||c.status);
 return {id:str(c.user_id||c.id||u.id),name:name(u,name(c,"Customer")),phone:str(c.phone_e164||u.phone_e164),email:str(c.email||u.email),county:county(c),status:s==="ACTIVE"?"ACTIVE":s==="SUSPENDED"?"SUSPENDED":s==="DISABLED"?"DELETED":"RESTRICTED",verified:bool(c.email_verified||c.is_verified||u.is_verified),joinedAt:when(c.created_at),addresses:arr(c.addresses).map(a=>({id:str(a.id),label:str(a.label,"Address"),area:str(a.address_text||a.address_line1),county:county(a),isDefault:bool(a.is_default)})),notes:[],audit:[]};
}
function coverage(x:unknown):CountyCoverage{
 const c=obj(x);return {county:str(c.name),code:str(c.code),enabled:bool(c.enabled),fee:minor(c.delivery_fee_minor),eta:num(c.eta_minutes),updatedAt:when(c.enabled_at)};
}
function payout(x:unknown,kind:"MERCHANT"|"RIDER"):PayoutBatch {
 const p=obj(x);const s=status(p.status);
 return {id:str(p.id),kind,status:(s==="PAID"?"PAID":s==="APPROVED"?"APPROVED":s==="PROCESSING"?"PROCESSING":s==="FAILED"?"FAILED":s==="CANCELLED"?"REJECTED":"DRAFT"),period:str(p.period_start||p.settlement_period||p.period,"Recorded period"),createdAt:when(p.created_at),approvedAt:str(p.approved_at)||undefined,paidAt:str(p.paid_at)||undefined,reference:str(p.provider_reference)||undefined,reason:str(p.failure_reason)||undefined,totalAmount:minor(kind==="RIDER"?p.amount_minor:p.net_settlement_amount_minor),payeeCount:1,itemCount:arr(p.lines||p.items).length,items:arr(p.lines||p.items).map(x=>({orderId:str(x.order_id),payeeId:str(kind==="RIDER"?x.rider_id:x.merchant_id),payeeName:str(x.payee_name,"Partner"),amount:minor(x.amount_minor)}))};
}
function account(x:unknown):AdminAccount{const a=obj(x),roles=arr(a.roles).map(x=>str(x.code));const rawRoles=Array.isArray(a.roles)?a.roles.map(x=>typeof x==="string"?x:str(obj(x).code)):[];
 const role=rawRoles.includes("super_admin")?"SUPER_ADMIN":rawRoles.includes("finance")?"FINANCE":rawRoles.includes("support")?"SUPPORT":rawRoles.includes("admin")?"ADMIN":rawRoles.includes("ops")?"OPERATIONS":"VIEWER";
 const raw=status(a.status);return {id:str(a.id),name:name(a,str(a.email,"Admin")),email:str(a.email),role,status:raw==="ACTIVE"?"ACTIVE":raw==="PENDING"?"INVITED":"SUSPENDED",mfaEnabled:bool(a.mfa_enabled||a.mfa_verified),lastSeen:when(a.last_login_at||a.last_login),createdAt:when(a.created_at)};}
export function emptyLiveData():DemoState{
 const base=seedDemo();
 return {...base,orders:[],riders:[],incidents:[],tickets:[],activity:[],
   phase2:{incidents:[],support:[],merchants:[],customers:[],actions:[]},
   phase3:{coverage:[],zones:[],refunds:[],issues:[],reconciledOrders:[],payouts:[],control:{commissionRate:0,riderDeliveryShare:0,reservePercent:0,currency:"KES"},logs:[]},
   phase4:{reports:[],campaigns:[],notifications:[],templates:[],admins:[],sessions:[],components:[],settings:{maintenance:false,orderIntake:false,riderDispatch:false,supportIntake:false,notificationDelivery:false,autoAssign:false,maxActiveOrders:0,supportSlaMinutes:0},logs:[]},
   live:{payments:[],ledger:[],overview:{balances:{},paymentCount:0,reconciliation:{}},analytics:{orders:[],payments:[]}}};
}
export class LiveApiError extends Error{constructor(message:string,public status:number,public code:string){super(message);this.name="LiveApiError";}}
function errorBody(x:unknown){const o=obj(x),e=obj(o.error);return {code:str(e.code||o.code,"REQUEST_FAILED"),message:str(e.message||o.message||o.error,"Request could not be completed")};}
function csrf(){return document.cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith("deetoo_csrf="))?.split("=").slice(1).join("=")||"";}
async function doFetch(path:string,opts:RequestInit={},retry=true):Promise<unknown>{
 const headers=new Headers(opts.headers);headers.set("X-Auth-Transport","cookie");headers.set("X-Client-App","admin");headers.set("Accept","application/json");
 if(opts.body)headers.set("Content-Type","application/json");
 if(opts.method && !["GET","HEAD"].includes(opts.method)){headers.set("X-CSRF-Token",decodeURIComponent(csrf()));headers.set("X-Request-Id",crypto.randomUUID());}
 let response:Response;try{response=await fetch(API+path,{...opts,credentials:"include",headers,signal:opts.signal||AbortSignal.timeout(15000)});}catch(e){throw new LiveApiError("DeeToo API is unreachable. Check the API server and network.",0,"NETWORK_ERROR");}
 const body=await response.json().catch(()=>({}));if(response.status===401&&retry&&!path.startsWith("/auth/")){try{await doFetch("/auth/refresh",{method:"POST",body:"{}"},false);return doFetch(path,opts,false);}catch{}}
 if(!response.ok){const err=errorBody(body);throw new LiveApiError(err.message,response.status,err.code);}
 return body;
}
export async function apiGet(path:string):Promise<unknown>{return doFetch(path);}
export async function apiMutation(path:string,method:"POST"|"PATCH"|"PUT"|"DELETE",body:unknown={}):Promise<unknown>{return doFetch(path,{method,body:JSON.stringify(body)});}
export async function signIn(identifier:string,password:string){return apiMutation("/auth/login","POST",{identifier,password});}
export async function signOut(){return apiMutation("/auth/logout","POST");}
function payload(x:unknown):unknown{const o=obj(x);return o.data??o;}
function list(x:unknown,...keys:string[]):Json[]{const r=payload(x),o=obj(r);if(Array.isArray(r))return arr(r);for(const k of keys){if(Array.isArray(o[k]))return arr(o[k]);}return [];}
function shortId(x:unknown){return encodeURIComponent(str(x));}
const resources:Record<ResourceName,string>={
 orders:"/admin/orders?limit=100&page=1",dispatch:"/admin/dispatch/deliveries?limit=100&page=1",riders:"/admin/riders?limit=100&page=1",incidents:"/operations/incidents?limit=100",support:"/operations/support/cases?limit=100",merchants:"/admin/merchants?limit=100",customers:"/admin/customers?limit=100",counties:"/admin/geography/counties",zones:"/admin/service-zones?limit=100",payments:"/finance/ops/payments?limit=100",journal:"/finance/ops/journal",settlements:"/finance/settlements",payouts:"/finance/payouts",finance:"/finance/ops/overview",reports:"/admin/reports?limit=100",campaigns:"/admin/communications/campaigns?limit=100",templates:"/admin/communications/templates",inbox:"/admin/notifications?limit=100",users:"/admin/users?limit=100&role=staff",health:"/admin/observability/dependencies",config:"/admin/configuration",analytics:"/admin/analytics/series?bucket=day",sessions:"/auth/sessions"
};
const liveRoles=(identity:Json)=>{const raw=Array.isArray(identity.roles)?identity.roles:[];const x=raw.map(r=>typeof r==="string"?r:str(obj(r).code));return x.includes("super_admin")?"SUPER_ADMIN":x.includes("finance")?"FINANCE":x.includes("admin")?"ADMIN":x.includes("ops")?"OPERATIONS":x.includes("support")?"SUPPORT":"VIEWER";};
export function liveIdentityRole(identity:Json){return liveRoles(identity);}
export async function loadLive(signal?:AbortSignal):Promise<LiveSnapshot>{
 const identity=obj(payload(await apiGet("/auth/me")));
 const role=liveRoles(identity);
 if(role==="VIEWER")throw new LiveApiError("A verified DeeToo staff role is required to access Admin.",403,"STAFF_REQUIRED");
 const d=emptyLiveData(),rs:LiveSnapshot["resources"]={},entries=Object.entries(resources) as [ResourceName,string][];
 await Promise.all(entries.map(async([key,url])=>{
  try{
   const raw=await doFetch(url,{signal}),p=payload(raw),o=obj(p),rows=list(raw,
    key==="incidents"?"incidents":key==="support"?"cases":key==="settlements"?"settlements":key==="payouts"?"payouts":key);
   rs[key]={status:"ready",total:num(obj(obj(raw).meta).total??obj(obj(raw).pagination).total,rows.length)};
   switch(key){
   case "orders":d.orders=rows.map(canonicalOrder);break;
   case "riders":d.riders=rows.map(canonicalRider);break;
   case "incidents":d.phase2.incidents=rows.map(canonicalIncident);d.incidents=d.phase2.incidents.map(i=>({id:i.id,title:i.title,status:i.status,type:i.type,time:i.createdAt}));break;
   case "support":d.phase2.support=rows.map(canonicalSupport);d.tickets=d.phase2.support.map(c=>({id:c.id,title:c.subject,status:c.status,from:c.participantType,time:c.createdAt}));break;
   case "merchants":d.phase2.merchants=rows.map(canonicalMerchant);break;
   case "customers":d.phase2.customers=rows.map(canonicalCustomer);break;
   case "counties":d.phase3.coverage=rows.map(coverage);break;
   case "zones":d.phase3.zones=rows.map(z=>({id:str(z.id),county:county(z),name:name(z),enabled:status(z.status)==="ACTIVE",fee:minor(z.delivery_fee_minor),eta:num(z.eta_minutes),notes:str(z.description)}));break;
   case "payments":d.live!.payments=rows.map(p=>({id:str(p.id),orderId:str(p.order_id),reference:str(p.provider_reference,p.id as string),method:status(p.method),status:status(p.internal_status),reconciliation:status(p.reconciliation_status),amount:minor(p.amount_minor),captured:minor(p.captured_minor),refunded:minor(p.refunded_minor),date:when(p.created_at),provider:status(p.provider)}));break;
   case "journal":d.live!.ledger=rows.map(e=>{const details=obj(e.details),tx=status(details.transaction_type);const amount=minor(e.amount_minor);const outgoing=/REFUND|PAYOUT|WITHDRAWAL|DISBURSEMENT/.test(tx);
    return {id:str(e.id),date:when(e.effective_at),type:tx==="REFUND"?"Refund":tx.includes("MERCHANT")?"Merchant payout":tx.includes("RIDER")?"Rider payout":outgoing?"Outgoing":"Collection",reference:str(details.reference_id||e.id),description:str(e.event),debit:outgoing?amount:0,credit:outgoing?0:amount,status:status(e.status),orderId:status(details.reference_type)==="ORDER"?str(details.reference_id):null};});break;
   case "settlements":d.phase3.payouts.push(...rows.map(p=>payout(p,"MERCHANT")));break;
   case "payouts":d.phase3.payouts.push(...rows.map(p=>payout(p,"RIDER")));break;
   case "finance":{const b=obj(o.account_balances),bal:Record<string,number>={};for(const [k,v] of Object.entries(b))bal[k]=minor(v);
     const reconciliation=obj(o.reconciliation),rec:Record<string,number>={};for(const [k,v] of Object.entries(reconciliation))rec[k]=num(v);
     d.live!.overview={balances:bal,paymentCount:num(o.payment_count),reconciliation:rec};break;}
   case "analytics":{d.live!.analytics={orders:arr(o.orders).map(e=>({bucket:str(e.bucket),orders:num(e.orders),completed:num(e.completed),cancelled:num(e.cancelled)})),payments:arr(o.payments).map(e=>({bucket:str(e.bucket),captured:minor(e.captured_minor),refunded:minor(e.refunded_minor)}))};break;}
   case "reports":d.phase4.reports=rows.map(r=>({id:str(r.id),name:str(r.name),metric:status(r.metric) as "ORDERS",range:"ALL",county:str(obj(r.filters).county_code,"all"),cadence:status(r.cadence) as "MANUAL",createdAt:when(r.created_at),notes:"Saved on DeeToo"}));break;
   case "campaigns":d.phase4.campaigns=rows.map(c=>({id:str(c.id),title:str(c.title),body:str(c.body),audience:status(c.audience) as "ALL",channel:status(c.channel) as "IN_APP",priority:status(c.priority) as "NORMAL",status:status(c.status)==="SENT"?"SENT":status(c.status)==="CANCELLED"?"CANCELLED":status(c.status)==="APPROVED"?"APPROVED":"DRAFT",createdAt:when(c.created_at),recipientCount:num(c.recipient_count),templateId:str(c.template_id)||null}));break;
   case "templates":d.phase4.templates=rows.map(t=>({id:str(t.id),name:str(t.name),title:str(t.title),body:str(t.body),channel:status(t.channel) as "IN_APP"}));break;
   case "inbox":d.phase4.notifications=rows.map(n=>({id:status(n.event_type)+":"+str(n.event_id),title:str(n.title,"Attention needed"),description:str(n.summary),category:status(n.event_type)==="SUPPORT"?"SUPPORT":"OPERATIONS",at:when(n.event_at),read:!!n.read_at,target:status(n.event_type)==="SUPPORT"?"support":"incidents"}));break;
   case "users":d.phase4.admins=rows.filter(x=>Array.isArray(x.roles)&&x.roles.some((r:unknown)=>["super_admin","admin","ops","support","finance"].includes(typeof r==="string"?r:str(obj(r).code)))).map(account);break;
   case "sessions":d.phase4.sessions=rows.map(s=>({id:str(s.id),userId:str(s.user_id||identity.id),device:str(s.device_info,"Unknown device"),location:"Session",startedAt:when(s.created_at),status:s.revoked_at?"REVOKED":"ACTIVE"}));break;
   case "health":{const deps=obj(o.dependencies);d.phase4.components=Object.entries(deps).map(([id,value])=>{const v=obj(value),ok=bool(v.healthy||v.ok||v.connected)||value===true;return {id,name:id.toUpperCase(),group:"Infrastructure",status:ok?"HEALTHY":"DEGRADED",latencyMs:num(v.latency_ms||v.duration_ms),uptime:0,detail:"Live health probe (no guaranteed SLO)"}});break;}
   case "config":{const flags=obj(o.kill_switches),values=new Map(arr(o.settings).map(v=>[str(v.key),v.value]));
      d.phase4.settings={...d.phase4.settings,maintenance:bool(values.get("maintenance_banner")),supportIntake:!bool(values.get("support_intake_paused")),notificationDelivery:!bool(values.get("notification_campaign_paused")),riderDispatch:!bool(obj(flags.auto_dispatch_paused).enabled),autoAssign:!bool(obj(flags.auto_dispatch_paused).enabled)};break;}
   }
  }catch(e){rs[key]={status:e instanceof LiveApiError&&e.status===403?"restricted":"error",error:e instanceof Error?e.message:"Unavailable"};}
 }));
 return {data:d,resources:rs,identity};
}
export type LiveAction={type:string;[k:string]:unknown};
function requireId(x:unknown){const id=str(x);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new LiveApiError("Select a verified live record before taking this action.",400,"INVALID_LIVE_ID");return encodeURIComponent(id);}
function unsupported(type:string):never{throw new LiveApiError("This approved control requires an additional authoritative workflow. No change was saved: "+type,409,"ACTION_NOT_CONNECTED");}
export async function performLiveAction(a:LiveAction,data:DemoState,identity:Json):Promise<string>{
 const type=a.type,reason=str(a.reason||a.note||a.description).trim();
 const id=()=>requireId(a.id||a.orderId);const who=str(identity.id);
 switch(type){
 case "CANCEL_ORDER":await apiMutation("/admin/orders/"+id()+"/cancel","POST",{reason:reason||"Administrator requested cancellation"});return "Order cancellation accepted by DeeToo.";
 case "ADD_NOTE":await apiMutation("/admin/orders/"+id()+"/notes","POST",{note:str(a.note)});return "Internal order note saved.";
 case "ASSIGN_RIDER":{const order=data.orders.find(o=>o.id===a.orderId);if(!order)unsupported(type);const delivery=await apiGet("/operations/orders/unified/"+id());const deliveryId=requireId(obj(payload(delivery)).delivery_id);await apiMutation("/admin/dispatch/deliveries/"+deliveryId+"/assign","POST",{rider_id:requireId(a.riderId),reason:reason||"Assigned from Admin"});return "Dispatch assignment accepted.";}
 case "PHASE2_INCIDENT_CREATE":await apiMutation("/admin/operations/incidents","POST",{type:a.kind,severity:a.severity,summary:a.title,details:a.description,order_id:/^[a-f0-9-]{36}$/i.test(str(a.orderId))?a.orderId:undefined});return "Incident created.";
 case "PHASE2_INCIDENT_STATUS":{const state=status(a.status);const route:Record<string,string>={ACKNOWLEDGED:"acknowledge",INVESTIGATING:"investigate",RESOLVED:"resolve",CLOSED:"dismiss",OPEN:"reopen"};if(!route[state])unsupported(type);await apiMutation("/operations/incidents/"+id()+"/"+route[state],"POST",{note:reason||"Status reviewed by administration"});return "Incident change saved.";}
 case "PHASE2_INCIDENT_NOTE":await apiMutation("/operations/incidents/"+id()+"/timeline","POST",{note:str(a.note),action:"NOTE"});return "Incident timeline updated.";
 case "PHASE2_SUPPORT_REPLY":{if(a.actor!=="ADMIN")unsupported("Participant impersonation is prohibited");await apiMutation("/operations/support/cases/"+id()+"/notes","POST",{visibility:a.internal?"INTERNAL":"ALL_PARTICIPANTS",body:str(a.message)});return a.internal?"Internal support note saved.":"Admin reply delivered to the authorized support conversation.";}
 case "PHASE2_SUPPORT_STATUS":{const state=status(a.status);if(state==="RESOLVED"){await apiMutation("/operations/support/cases/"+id()+"/resolve","POST",{resolution:reason||"Resolved by staff"});return "Support resolution requested; participants must confirm.";}await apiMutation("/operations/support/cases/"+id()+"/status","POST",{status:state,reason});return "Case status updated.";}
 case "PHASE2_MERCHANT_STATUS":{const s=status(a.status),route=s==="ACTIVE"?"reactivate":s==="SUSPENDED"?"suspend":s==="PENDING"?"reject":"";if(!route)unsupported(type);await apiMutation("/admin/merchants/"+id()+"/"+route,"POST",{reason:reason||"Merchant status reviewed"});return "Merchant status updated.";}
 case "PHASE2_CUSTOMER_NOTE":await apiMutation("/admin/customers/"+id()+"/notes","POST",{note:a.note});return "Customer note saved.";
 case "PHASE2_CUSTOMER_EDIT":await apiMutation("/admin/governance/users/"+id(),"PATCH",{name:a.name,email:a.email,phone_e164:a.phone,reason:a.reason});return "Account correction submitted.";
 case "PHASE2_CUSTOMER_STATUS":{const route=status(a.status)==="ACTIVE"?"reactivate":"deactivate";await apiMutation("/admin/governance/users/"+id()+"/"+route,"POST",{reason});return "Account governance action submitted.";}
 case "PHASE3_COVERAGE":{const target=data.phase3.coverage.find(c=>c.county===a.county);if(!target?.code)unsupported(type);
    if(reason.length<5)throw new LiveApiError("Explain the coverage change before submitting.",400,"REASON_REQUIRED");
    const checked=obj(payload(await apiGet("/admin/geography/counties/"+encodeURIComponent(target.code)+"/impact")));
    if(a.enabled===true&&num(checked.active_polygon_zones)<1)throw new LiveApiError("County has no active PostGIS serviceability polygons. Activate a verified service zone first.",409,"COUNTY_NOT_SERVICEABLE");
    await apiMutation("/admin/geography/counties/"+encodeURIComponent(target.code),"PATCH",{enabled:!!a.enabled});
    return (a.enabled?"County enabled":"County paused")+"; existing orders and deliveries are not cancelled automatically. Impact snapshot: "+num(checked.active_orders)+" active orders and "+num(checked.active_deliveries)+" deliveries.";}
 case "PHASE3_COVERAGE_CONFIG":{const target=data.phase3.coverage.find(c=>c.county===a.county);if(!target?.code)unsupported(type);
    const commercial=obj(payload(await apiGet("/admin/geography/counties/"+encodeURIComponent(target.code)+"/commercial")));
    const zones=arr(commercial.zones);if(!zones.length)throw new LiveApiError("No active polygon-backed pricing zones. Configure service zones first.",409,"PRICING_ZONE_REQUIRED");
    const base=zones[0];const required=["included_distance_meters","per_km_fee_minor","minimum_fee_minor","maximum_fee_minor","max_delivery_distance_meters"];
    if(required.some(k=>base[k]===undefined||base[k]===null)||zones.some(z=>required.some(k=>num(z[k])!==num(base[k]))))throw new LiveApiError("Zonal pricing rules differ or are incomplete. Review each canonical rule before a county-wide change.",409,"ZONE_RULES_MISMATCH");
    const fee=Math.round(num(a.fee)*100),min=Math.min(fee,num(base.minimum_fee_minor)),max=Math.max(fee,num(base.maximum_fee_minor));
    await apiMutation("/admin/geography/counties/"+encodeURIComponent(target.code)+"/commercial","PATCH",{base_fee_minor:fee,included_distance_meters:num(base.included_distance_meters),per_km_fee_minor:num(base.per_km_fee_minor),minimum_fee_minor:min,maximum_fee_minor:max,max_delivery_distance_meters:num(base.max_delivery_distance_meters),eta_buffer_min:num(a.eta),reason});
    return "Future checkout quotes will use the updated zone pricing and ETA rules; existing signed quotes are unchanged.";
   }
   case "PHASE3_REFUND_REQUEST":{throw new LiveApiError("Select the real payment identifier and refund reason code; an order ID alone cannot authorize a refund.",409,"PAYMENT_ID_REQUIRED");}
 case "PHASE3_REFUND_REVIEW":{if(a.status==="REJECTED"){await apiMutation("/finance/ops/refunds/"+id()+"/reject","POST",{reason});return "Refund rejection saved.";}throw new LiveApiError("Refund approval requires verified payment/refund identifiers and separate authorized review.",409,"REFUND_REVIEW_REQUIRES_DETAIL");}
 case "PHASE3_RECONCILE_ISSUE":throw new LiveApiError("Provider evidence is required. A review note cannot mark a payment reconciled.",409,"PROVIDER_EVIDENCE_REQUIRED");
 case "PHASE3_PAYOUT_REVIEW":{if(a.status==="REJECTED"){const batch=data.phase3.payouts.find(p=>p.id===a.id);await apiMutation("/finance/ops/"+(batch?.kind==="RIDER"?"payouts":"settlements")+"/"+id()+"/reject","POST",{reason});return "Draft payout rejected.";}throw new LiveApiError("Payout approval must use a server-provided calculation with maker/checker separation.",409,"PAYOUT_APPROVAL_REQUIRES_DETAIL");}
 case "PHASE3_PAYOUT_MARK_PAID":throw new LiveApiError("Only a verified provider callback can mark a payout PAID.",409,"PROVIDER_CONFIRMATION_REQUIRED");
 case "PHASE4_REPORT_SAVE":{const selected=data.phase3.coverage.find(c=>c.county===a.county);
     if(a.county!=="all"&&!selected?.code)throw new LiveApiError("Selected county has no backend county code.",400,"COUNTY_CODE_REQUIRED");
     await apiMutation("/admin/reports","POST",{name:a.name,metric:a.metric,cadence:a.cadence,filters:{county_code:selected?.code||null}});return "Saved report created.";}

 case "PHASE4_REPORT_DELETE":await apiMutation("/admin/reports/"+id(),"DELETE");return "Saved report removed.";
 case "PHASE4_NOTIFICATION_READ":{const [t,eventId]=str(a.id).split(":");if(!a.read)unsupported(type);await apiMutation("/admin/notifications/"+t+"/"+requireId(eventId)+"/read","POST");return "Alert marked read.";}
 case "PHASE4_NOTIFICATION_READ_ALL":await apiMutation("/admin/notifications/read-all","POST",{});return "Alerts marked read.";
 case "PHASE4_CAMPAIGN_CREATE":await apiMutation("/admin/communications/campaigns","POST",{title:a.title,body:a.body,audience:a.audience,channel:a.channel,priority:a.priority});return "Campaign draft saved.";
 case "PHASE4_CAMPAIGN_SEND":{await apiMutation("/admin/communications/campaigns/"+id()+"/send","POST",{idempotency_key:crypto.randomUUID()});return "Consented campaign queued. Delivery is pending provider confirmation.";}
 case "PHASE4_CAMPAIGN_CANCEL":await apiMutation("/admin/communications/campaigns/"+id()+"/cancel","POST",{reason});return "Campaign cancelled.";
 case "PHASE4_TEMPLATE_SAVE":{const body={name:a.name,title:a.title,body:a.body,channel:a.channel};if(a.id)await apiMutation("/admin/communications/templates/"+id(),"PATCH",{...body,reason:"Template edited by admin"});else await apiMutation("/admin/communications/templates","POST",body);return "Template saved.";}
 case "PHASE4_ADMIN_INVITE":{const roles:Record<string,string>={OPERATIONS:"ops",SUPPORT:"support",FINANCE:"finance",ADMIN:"admin"};
    const staffRole=roles[str(a.role)];if(!staffRole)throw new LiveApiError("Invitations require an actual backend staff role: Admin, Operations, Support or Finance.",400,"INVALID_STAFF_ROLE");await apiMutation("/admin/security/invitations","POST",{name:a.name,email:a.email,staff_role:staffRole,reason});
    return "Staff invitation recorded. Delivery acceptance depends on verified email provider; invitee remains PENDING until activation.";
   }
   case "PHASE4_ADMIN_ROLE":{const roles:Record<string,string>={SUPER_ADMIN:"super_admin",OPERATIONS:"ops",SUPPORT:"support",FINANCE:"finance",ADMIN:"admin"};const role=roles[str(a.role)];if(!role)unsupported(type);await apiMutation("/admin/users/"+id()+"/roles","POST",{roles:[role],reason});return "Role assignment reviewed.";}
 case "PHASE4_ADMIN_STATUS":await apiMutation("/admin/users/"+id()+"/"+(a.status==="ACTIVE"?"reactivate":"suspend"),"POST",{reason});return "Admin account status changed.";
 case "PHASE4_SESSION_REVOKE":await apiMutation("/admin/security/sessions/"+id()+"/revoke","POST",{reason});return "Session revoked.";
 case "PHASE4_ADMIN_MFA":{if(a.enabled===true)throw new LiveApiError("MFA can only be enrolled by the account owner through /auth/mfa/enroll.",409,"MFA_OWNER_ENROLLMENT_REQUIRED");
    await apiMutation("/admin/security/users/"+id()+"/mfa-reset-requests","POST",{reason});return "MFA recovery submitted for independent Super Admin approval; no credentials have been reset yet.";
   }
 case "PHASE4_HEALTH_STATUS":throw new LiveApiError("Measured service health cannot be changed by an administrator; report an incident instead.",409,"LIVE_HEALTH_READ_ONLY");
 case "PHASE4_SETTING":{const key=str(a.key),value=bool(a.value);if(reason.length<10)throw new LiveApiError("A configuration reason of at least 10 characters is required.",400,"REASON_REQUIRED");
     const labels:Record<string,{name:string;inverse:boolean;kill:boolean}>={maintenance:{name:"maintenance_banner",inverse:false,kill:false},supportIntake:{name:"support_intake_paused",inverse:true,kill:false},notificationDelivery:{name:"notification_campaign_paused",inverse:true,kill:false},riderDispatch:{name:"auto_dispatch_paused",inverse:true,kill:true},autoAssign:{name:"auto_dispatch_paused",inverse:true,kill:true}};
     const target=labels[key];if(!target)throw new LiveApiError("Unsupported setting. Only explicitly service-enforced flags may be changed.",409,"CONFIG_KEY_UNSUPPORTED");
     await apiMutation("/admin/configuration/"+(target.kill?"kill-switches/":"settings/")+target.name,"PATCH",{enabled:target.inverse?!value:value,value:target.inverse?!value:value,reason});return "Supported operational control updated and recorded by DeeToo.";
   }
 default:unsupported(type);
 }
}
