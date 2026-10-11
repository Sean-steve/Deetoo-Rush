/* Phase 4 design-first fixtures and reducers. Browser-local only: no email, push, auth, telemetry or configuration calls. */
export type ReportMetric="ORDERS"|"REVENUE"|"DELIVERIES"|"MERCHANTS"|"CUSTOMERS"|"SUPPORT"|"INCIDENTS"|"PAYOUTS";
export type ReportRange="TODAY"|"7D"|"30D"|"ALL";
export type SavedReport={id:string;name:string;metric:ReportMetric;range:ReportRange;county:string;cadence:"MANUAL"|"WEEKLY"|"MONTHLY";createdAt:string;notes:string;};
export type NoticeAudience="ALL"|"CUSTOMERS"|"MERCHANTS"|"RIDERS";
export type NoticeChannel="IN_APP"|"EMAIL"|"SMS"|"PUSH";
export type NoticePriority="NORMAL"|"IMPORTANT"|"URGENT";
export type NoticeStatus="DRAFT"|"SENT"|"CANCELLED";
export type Campaign={id:string;title:string;body:string;audience:NoticeAudience;channel:NoticeChannel;priority:NoticePriority;status:NoticeStatus;createdAt:string;sentAt?:string;recipientCount:number;templateId:string|null;};
export type NotificationEvent={id:string;title:string;description:string;category:"OPERATIONS"|"SUPPORT"|"SECURITY"|"SYSTEM"|"CAMPAIGN";at:string;read:boolean;target:"command"|"incidents"|"support"|"security"|"system"|"notifications";};
export type MessageTemplate={id:string;name:string;title:string;body:string;channel:NoticeChannel;};
export type UserRole="SUPER_ADMIN"|"ADMIN"|"OPERATIONS"|"SUPPORT"|"FINANCE"|"VIEWER";
export type AdminAccountStatus="ACTIVE"|"INVITED"|"SUSPENDED";
export type AdminAccount={id:string;name:string;email:string;role:UserRole;status:AdminAccountStatus;mfaEnabled:boolean;lastSeen:string;createdAt:string;};
export type AdminSession={id:string;userId:string;device:string;location:string;startedAt:string;status:"ACTIVE"|"REVOKED";};
export type ServiceStatus="HEALTHY"|"DEGRADED"|"DOWN"|"MAINTENANCE";
export type HealthComponent={id:string;name:string;group:string;status:ServiceStatus;latencyMs:number;uptime:number;detail:string;};
export type SystemSettings={maintenance:boolean;orderIntake:boolean;riderDispatch:boolean;supportIntake:boolean;notificationDelivery:boolean;autoAssign:boolean;maxActiveOrders:number;supportSlaMinutes:number;};
export type PhaseFourLog={id:string;at:string;actor:string;action:string;detail:string;};
export type PhaseFourState={reports:SavedReport[];campaigns:Campaign[];notifications:NotificationEvent[];templates:MessageTemplate[];admins:AdminAccount[];sessions:AdminSession[];components:HealthComponent[];settings:SystemSettings;logs:PhaseFourLog[];};
export type PhaseFourAction=
 | {type:"PHASE4_REPORT_SAVE";name:string;metric:ReportMetric;range:ReportRange;county:string;cadence:SavedReport["cadence"];notes:string}
 | {type:"PHASE4_REPORT_DELETE";id:string;reason:string}
 | {type:"PHASE4_NOTIFICATION_READ";id:string;read:boolean}
 | {type:"PHASE4_NOTIFICATION_READ_ALL"}
 | {type:"PHASE4_CAMPAIGN_CREATE";title:string;body:string;audience:NoticeAudience;channel:NoticeChannel;priority:NoticePriority;templateId:string|null}
 | {type:"PHASE4_CAMPAIGN_SEND";id:string;recipientCount:number;reason:string}
 | {type:"PHASE4_CAMPAIGN_CANCEL";id:string;reason:string}
 | {type:"PHASE4_TEMPLATE_SAVE";id:string|null;name:string;title:string;body:string;channel:NoticeChannel}
 | {type:"PHASE4_ADMIN_INVITE";name:string;email:string;role:UserRole;reason:string}
 | {type:"PHASE4_ADMIN_ROLE";id:string;role:UserRole;reason:string}
 | {type:"PHASE4_ADMIN_STATUS";id:string;status:"ACTIVE"|"SUSPENDED";reason:string}
 | {type:"PHASE4_ADMIN_MFA";id:string;enabled:boolean;reason:string}
 | {type:"PHASE4_SESSION_REVOKE";id:string;reason:string}
 | {type:"PHASE4_HEALTH_STATUS";id:string;status:ServiceStatus;reason:string}
 | {type:"PHASE4_SETTING";key:keyof SystemSettings;value:boolean|number;reason:string};
const stamp=()=>new Date().toISOString();
const INITIAL="2026-10-09T10:24:00+03:00";
const uuid=(prefix:string,n:number)=>prefix+"-"+String(n).padStart(4,"0");
const audit=(logs:PhaseFourLog[],action:string,detail:string):PhaseFourLog[]=>[{id:"AUD-"+Date.now()+"-"+logs.length,at:stamp(),actor:"Demo Administrator",action,detail},...logs].slice(0,250);
const next=(items:{id:string}[],prefix:string,minimum:number)=>uuid(prefix,Math.max(minimum,...items.map(x=>Number(x.id.split("-").at(-1))||0))+1);
export function seedPhaseFour():PhaseFourState{
 const components:[string,string,ServiceStatus,number,number,string][]=[
  ["API Gateway","Platform","HEALTHY",87,99.98,"Frontend indicator; no live probes"],
  ["Identity & Sessions","Security","HEALTHY",104,99.97,"Mock authentication status"],
  ["Order Service","Operations","HEALTHY",134,99.91,"Orders are local sample records"],
  ["Dispatch Worker","Operations","HEALTHY",153,99.88,"No actual dispatch worker connected"],
  ["Payments & M-PESA","Finance","DEGRADED",385,99.52,"Demo discrepancy alert; no provider checks"],
  ["Settlement Engine","Finance","HEALTHY",132,99.93,"No real payout processing"],
  ["Support & Chat","Support","HEALTHY",110,99.95,"Local demo conversations"],
  ["Notification Delivery","Messaging","HEALTHY",168,99.94,"No messages delivered outside this browser"],
  ["Geography / Coverage","Operations","HEALTHY",98,99.96,"Geofencing not active"],
  ["Reporting & Exports","Intelligence","HEALTHY",203,99.82,"Browser-derived demo analytics"],
 ];
 return {
 reports:[{id:"RPT-0001",name:"Daily Operations Summary",metric:"ORDERS",range:"7D",county:"all",cadence:"MANUAL",createdAt:INITIAL,notes:"Saved sample reporting view"},{id:"RPT-0002",name:"Revenue & Refund Overview",metric:"REVENUE",range:"ALL",county:"all",cadence:"WEEKLY",createdAt:INITIAL,notes:"Weekly cadence preference only; no scheduler"}],
 campaigns:[
  {id:"COM-0001",title:"New delivery areas are coming",body:"We're expanding our delivery zones. Stay tuned for updates!",audience:"ALL",channel:"IN_APP",priority:"NORMAL",status:"SENT",createdAt:INITIAL,sentAt:INITIAL,recipientCount:75,templateId:null},
  {id:"COM-0002",title:"Rider safety reminder",body:"Remember to wear protective equipment and follow road-safety guidelines.",audience:"RIDERS",channel:"PUSH",priority:"IMPORTANT",status:"DRAFT",createdAt:INITIAL,recipientCount:0,templateId:null}
 ],
 notifications:[
  {id:"NTF-001",title:"Finance exception requires attention",description:"A simulated M-PESA mismatch has been flagged for review.",category:"OPERATIONS",at:INITIAL,read:false,target:"command"},
  {id:"NTF-002",title:"Customer support backlog",description:"Support cases are waiting for response and resolution.",category:"SUPPORT",at:INITIAL,read:false,target:"support"},
  {id:"NTF-003",title:"Unverified merchant applications",description:"Review merchant onboarding applications.",category:"OPERATIONS",at:INITIAL,read:false,target:"command"},
  {id:"NTF-004",title:"Admin security review",description:"Demo account access review is recommended.",category:"SECURITY",at:INITIAL,read:true,target:"security"},
  {id:"NTF-005",title:"Service health update",description:"Demo provider status is degraded; this is not a real outage.",category:"SYSTEM",at:INITIAL,read:false,target:"system"},
 ],
 templates:[
  {id:"TPL-001",name:"Delivery Update",title:"An update about your order",body:"Your order has a new delivery update. Please check your DeeToo account.",channel:"IN_APP"},
  {id:"TPL-002",name:"Service Advisory",title:"DeeToo service announcement",body:"We have an important update about delivery availability in your area.",channel:"EMAIL"},
  {id:"TPL-003",name:"Rider Safety",title:"Safe deliveries",body:"Please follow all safety procedures during delivery.",channel:"PUSH"},
 ],
 admins:[
  {id:"ADM-0001",name:"Demo Super Admin",email:"admin@deetoo.example",role:"SUPER_ADMIN",status:"ACTIVE",mfaEnabled:true,lastSeen:INITIAL,createdAt:INITIAL},
  {id:"ADM-0002",name:"Operations Manager",email:"operations@deetoo.example",role:"OPERATIONS",status:"ACTIVE",mfaEnabled:true,lastSeen:INITIAL,createdAt:INITIAL},
  {id:"ADM-0003",name:"Support Lead",email:"support@deetoo.example",role:"SUPPORT",status:"ACTIVE",mfaEnabled:false,lastSeen:INITIAL,createdAt:INITIAL},
  {id:"ADM-0004",name:"Finance Controller",email:"finance@deetoo.example",role:"FINANCE",status:"ACTIVE",mfaEnabled:true,lastSeen:INITIAL,createdAt:INITIAL},
  {id:"ADM-0005",name:"New Operator",email:"new.operator@deetoo.example",role:"VIEWER",status:"INVITED",mfaEnabled:false,lastSeen:INITIAL,createdAt:INITIAL}
 ],
 sessions:[
  {id:"SES-001",userId:"ADM-0001",device:"Chrome · Linux",location:"Nairobi (demo)",startedAt:INITIAL,status:"ACTIVE"},
  {id:"SES-002",userId:"ADM-0002",device:"Firefox · Windows",location:"Kiambu (demo)",startedAt:INITIAL,status:"ACTIVE"},
  {id:"SES-003",userId:"ADM-0003",device:"Safari · macOS",location:"Nairobi (demo)",startedAt:INITIAL,status:"ACTIVE"}
 ],
 components:components.map(([name,group,status,latencyMs,uptime,detail],i)=>({id:"SVC-"+String(i+1).padStart(3,"0"),name,group,status,latencyMs,uptime,detail})),
 settings:{maintenance:false,orderIntake:true,riderDispatch:true,supportIntake:true,notificationDelivery:true,autoAssign:true,maxActiveOrders:1000,supportSlaMinutes:30},
 logs:[],
 };
}
export function audienceSize(audience:NoticeAudience,customers:{status:string}[],merchants:{status:string}[],riders:{status:string;approved:boolean}[]):number{
 const activeCustomers=customers.filter(c=>c.status==="ACTIVE").length;
 const activeMerchants=merchants.filter(m=>m.status==="ACTIVE").length;
 const activeRiders=riders.filter(r=>r.approved&&r.status!=="SUSPENDED").length;
 if(audience==="CUSTOMERS")return activeCustomers;
 if(audience==="MERCHANTS")return activeMerchants;
 if(audience==="RIDERS")return activeRiders;
 return activeCustomers+activeMerchants+activeRiders;
}
export function reducePhaseFour(state:PhaseFourState,a:PhaseFourAction):PhaseFourState{
 if(a.type==="PHASE4_REPORT_SAVE"){
  if(a.name.trim().length<3||state.reports.some(r=>r.name.toLowerCase()===a.name.trim().toLowerCase()))return state;
  const item:SavedReport={id:next(state.reports,"RPT",2),name:a.name.trim(),metric:a.metric,range:a.range,county:a.county,cadence:a.cadence,notes:a.notes.trim(),createdAt:stamp()};
  return {...state,reports:[item,...state.reports],logs:audit(state.logs,"Report saved",item.name)};
 }
 if(a.type==="PHASE4_REPORT_DELETE"){
  if(a.reason.trim().length<3||!state.reports.some(r=>r.id===a.id))return state;
  return {...state,reports:state.reports.filter(r=>r.id!==a.id),logs:audit(state.logs,"Report removed",a.id+" · "+a.reason)};
 }
 if(a.type==="PHASE4_NOTIFICATION_READ"){
  return {...state,notifications:state.notifications.map(n=>n.id===a.id?{...n,read:a.read}:n)};
 }
 if(a.type==="PHASE4_NOTIFICATION_READ_ALL"){
  return {...state,notifications:state.notifications.map(n=>({...n,read:true}))};
 }
 if(a.type==="PHASE4_CAMPAIGN_CREATE"){
  if(a.title.trim().length<5||a.body.trim().length<10)return state;
  const id=next(state.campaigns,"COM",2);
  return {...state,campaigns:[{id,title:a.title.trim(),body:a.body.trim(),audience:a.audience,channel:a.channel,priority:a.priority,status:"DRAFT",createdAt:stamp(),recipientCount:0,templateId:a.templateId},...state.campaigns],logs:audit(state.logs,"Campaign drafted",id+" · "+a.title)};
 }
 if(a.type==="PHASE4_CAMPAIGN_SEND"){
  const c=state.campaigns.find(c=>c.id===a.id);
  if(!c||c.status!=="DRAFT"||!Number.isInteger(a.recipientCount)||a.recipientCount<=0||a.reason.trim().length<5)return state;
  const notification:NotificationEvent={id:next(state.notifications,"NTF",5),title:"Simulated communication sent",description:c.title+" · "+c.channel+" · "+a.recipientCount+" demo recipients (no real delivery)",category:"CAMPAIGN",at:stamp(),read:false,target:"notifications"};
  return {...state,campaigns:state.campaigns.map(x=>x.id===a.id?{...x,status:"SENT",recipientCount:a.recipientCount,sentAt:stamp()}:x),notifications:[notification,...state.notifications],logs:audit(state.logs,"Campaign sent (simulation)",a.id+" · "+a.reason)};
 }
 if(a.type==="PHASE4_CAMPAIGN_CANCEL"){
  if(a.reason.trim().length<5||!state.campaigns.some(c=>c.id===a.id&&c.status==="DRAFT"))return state;
  return {...state,campaigns:state.campaigns.map(c=>c.id===a.id?{...c,status:"CANCELLED"}:c),logs:audit(state.logs,"Campaign cancelled",a.id+" · "+a.reason)};
 }
 if(a.type==="PHASE4_TEMPLATE_SAVE"){
  if(a.name.trim().length<3||a.title.trim().length<5||a.body.trim().length<10)return state;
  if(a.id && !state.templates.some(t=>t.id===a.id))return state;
  const id=a.id||next(state.templates,"TPL",3);
  const template:MessageTemplate={id,name:a.name.trim(),title:a.title.trim(),body:a.body.trim(),channel:a.channel};
  return {...state,templates:a.id?state.templates.map(t=>t.id===a.id?template:t):[template,...state.templates],logs:audit(state.logs,"Template saved",id)};
 }
 if(a.type==="PHASE4_ADMIN_INVITE"){
  if(a.name.trim().length<3||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim())||a.reason.trim().length<5||state.admins.some(u=>u.email.toLowerCase()===a.email.trim().toLowerCase()))return state;
  const id=next(state.admins,"ADM",5);
  return {...state,admins:[{id,name:a.name.trim(),email:a.email.trim(),role:a.role,status:"INVITED",mfaEnabled:false,lastSeen:stamp(),createdAt:stamp()},...state.admins],logs:audit(state.logs,"Admin invite drafted",id+" · "+a.email+" · "+a.reason)};
 }
 if(a.type==="PHASE4_ADMIN_ROLE"||a.type==="PHASE4_ADMIN_STATUS"){
  const u=state.admins.find(u=>u.id===a.id);
  if(!u||a.reason.trim().length<5)return state;
  const changingLastActiveSuper=u.role==="SUPER_ADMIN"&&u.status==="ACTIVE"&&state.admins.filter(x=>x.role==="SUPER_ADMIN"&&x.status==="ACTIVE").length===1;
  if(changingLastActiveSuper&&(a.type==="PHASE4_ADMIN_STATUS"?a.status!=="ACTIVE":a.role!=="SUPER_ADMIN"))return state;
  const admins=state.admins.map(x=>x.id===a.id?{...x,...(a.type==="PHASE4_ADMIN_ROLE"?{role:a.role}:{status:a.status})}:x);
  const sessions=a.type==="PHASE4_ADMIN_STATUS"&&a.status==="SUSPENDED"?state.sessions.map(s=>s.userId===a.id?{...s,status:"REVOKED" as const}:s):state.sessions;
  return {...state,admins,sessions,logs:audit(state.logs,"Admin access changed",a.id+" · "+(a.type==="PHASE4_ADMIN_ROLE"?a.role:a.status)+" · "+a.reason)};
 }
 if(a.type==="PHASE4_ADMIN_MFA"){
  if(a.reason.trim().length<5||!state.admins.some(u=>u.id===a.id))return state;
  return {...state,admins:state.admins.map(u=>u.id===a.id?{...u,mfaEnabled:a.enabled}:u),logs:audit(state.logs,"MFA requirement changed (mock)",a.id+" · "+a.enabled+" · "+a.reason)};
 }
 if(a.type==="PHASE4_SESSION_REVOKE"){
  if(a.reason.trim().length<5||!state.sessions.some(s=>s.id===a.id&&s.status==="ACTIVE"))return state;
  return {...state,sessions:state.sessions.map(s=>s.id===a.id?{...s,status:"REVOKED"}:s),logs:audit(state.logs,"Demo session revoked",a.id+" · "+a.reason)};
 }
 if(a.type==="PHASE4_HEALTH_STATUS"){
  if(a.reason.trim().length<5||!state.components.some(c=>c.id===a.id))return state;
  return {...state,components:state.components.map(c=>c.id===a.id?{...c,status:a.status,detail:a.reason}:c),logs:audit(state.logs,"Simulated service status",a.id+" → "+a.status+" · "+a.reason)};
 }
 if(a.type==="PHASE4_SETTING"){
  if(a.reason.trim().length<5||!(a.key in state.settings))return state;
  const initial=state.settings[a.key];
  if(typeof initial!==typeof a.value)return state;
  if(typeof a.value==="number"&&(!Number.isInteger(a.value)||a.value<1||a.value>10000))return state;
  return {...state,settings:{...state.settings,[a.key]:a.value},logs:audit(state.logs,"Demo configuration changed",a.key+" → "+a.value+" · "+a.reason)};
 }
 return state;
}
