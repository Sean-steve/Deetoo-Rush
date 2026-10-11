/* DeeToo Admin Next Phase 3: wholly fictional, browser-persisted operational and money-control demo.
   All amounts are integer KES. Actions MUST NOT call real providers. */
import type {Order, Rider} from "./data";
export const KENYA_COUNTIES=[
"Baringo","Bomet","Bungoma","Busia","Elgeyo-Marakwet","Embu","Garissa","Homa Bay","Isiolo","Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu","Kitui","Kwale","Laikipia","Lamu","Machakos","Makueni","Mandera","Marsabit","Meru","Migori","Mombasa","Murang'a","Nairobi","Nakuru","Nandi","Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta","Tana River","Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"
] as const;
export type CountyName=typeof KENYA_COUNTIES[number];
export type CountyCoverage={county:string;enabled:boolean;fee:number;eta:number;updatedAt:string;};
export type ServiceZone={id:string;county:string;name:string;enabled:boolean;fee:number;eta:number;notes:string};
export type RefundStatus="PENDING"|"APPROVED"|"REJECTED";
export type RefundRequest={id:string;orderId:string;amount:number;reason:string;status:RefundStatus;createdAt:string;reviewedAt?:string;reviewNote?:string};
export type PaymentIssue={id:string;reference:string;orderId:string|null;provider:"M-PESA"|"Card";issue:string;status:"OPEN"|"RECONCILED";note:string};
export type PayoutKind="MERCHANT"|"RIDER";
export type PayoutItem={orderId:string;payeeId:string;payeeName:string;amount:number};
export type PayoutStatus="DRAFT"|"APPROVED"|"PAID"|"REJECTED";
export type PayoutBatch={id:string;kind:PayoutKind;status:PayoutStatus;period:string;createdAt:string;approvedAt?:string;paidAt?:string;reference?:string;reason?:string;items:PayoutItem[]};
export type FinanceControl={commissionRate:number;riderDeliveryShare:number;reservePercent:number;currency:"KES";};
export type FinanceLog={id:string;at:string;action:string;detail:string;actor:string};
export type PhaseThreeState={coverage:CountyCoverage[];zones:ServiceZone[];refunds:RefundRequest[];issues:PaymentIssue[];reconciledOrders:string[];payouts:PayoutBatch[];control:FinanceControl;logs:FinanceLog[]};
export type PhaseThreeAction=
 | {type:"PHASE3_COVERAGE";county:string;enabled:boolean;reason:string}
 | {type:"PHASE3_COVERAGE_CONFIG";county:string;fee:number;eta:number;reason:string}
 | {type:"PHASE3_ZONE_CREATE";county:string;name:string;fee:number;eta:number;notes:string}
 | {type:"PHASE3_ZONE_STATUS";id:string;enabled:boolean;reason:string}
 | {type:"PHASE3_REFUND_REQUEST";orderId:string;amount:number;reason:string}
 | {type:"PHASE3_REFUND_REVIEW";id:string;status:"APPROVED"|"REJECTED";reason:string}
 | {type:"PHASE3_RECONCILE_PAYMENT";orderId:string;reason:string}
 | {type:"PHASE3_RECONCILE_ISSUE";id:string;reason:string}
 | {type:"PHASE3_PAYOUT_CREATE";kind:PayoutKind;period:string;items:PayoutItem[]}
 | {type:"PHASE3_PAYOUT_REVIEW";id:string;status:"APPROVED"|"REJECTED";reason:string}
 | {type:"PHASE3_PAYOUT_MARK_PAID";id:string;reference:string;reason:string}
 | {type:"PHASE3_FINANCE_CONFIG";commissionRate:number;riderDeliveryShare:number;reservePercent:number;reason:string};
const now=()=>new Date().toISOString();
const audit=(previous:FinanceLog[],action:string,detail:string):FinanceLog[]=>[{id:"EVT-"+Date.now()+"-"+previous.length,at:now(),action,detail,actor:"Demo Admin"},...previous].slice(0,250);
const seedTime="2026-10-09T10:24:00+03:00";
export function seedPhaseThree():PhaseThreeState {
 const activeCounties=["Nairobi","Kiambu","Kajiado","Mombasa"];
 const coverage=KENYA_COUNTIES.map(county=>({county,enabled:activeCounties.includes(county),fee:county==="Nairobi"?200:county==="Kiambu"?250:300,eta:county==="Nairobi"?40:60,updatedAt:seedTime}));
 const places=["Westlands","Kilimani","CBD","Lavington","Karen","Upper Hill","Embakasi","Kasarani","South B","Roysambu"];
 const zones:ServiceZone[]=[
 ...places.map((name,i)=>({id:"ZONE-"+(i+1),county:"Nairobi",name,enabled:true,fee:200+(i%3)*25,eta:30+(i%5)*5,notes:"Approved illustrative coverage region"})),
 {id:"ZONE-11",county:"Kiambu",name:"Thika Road",enabled:true,fee:250,eta:55,notes:"Demo service corridor"},
 {id:"ZONE-12",county:"Kajiado",name:"Ngong",enabled:true,fee:300,eta:60,notes:"Demo service corridor"},
 {id:"ZONE-13",county:"Mombasa",name:"Nyali",enabled:true,fee:250,eta:45,notes:"Demo service corridor"}
 ];
 return {coverage,zones,refunds:[
  {id:"RF-3001",orderId:"DR78289",amount:450,reason:"Missing item reported",status:"PENDING",createdAt:seedTime},
  {id:"RF-3002",orderId:"DR78288",amount:200,reason:"Delivery service adjustment",status:"REJECTED",createdAt:seedTime,reviewNote:"Insufficient evidence"},
 ],issues:[
  {id:"EXC-501",reference:"MP-DEMO-001",orderId:"DR78290",provider:"M-PESA",issue:"Provider amount differs from order record",status:"OPEN",note:""},
  {id:"EXC-502",reference:"CARD-DEMO-002",orderId:null,provider:"Card",issue:"Unmatched provider transaction",status:"OPEN",note:""},
 ],reconciledOrders:[],payouts:[],control:{commissionRate:15,riderDeliveryShare:80,reservePercent:0,currency:"KES"},logs:[]};
}
export const amount=(n:number)=>"KES "+Math.round(n).toLocaleString("en-KE");
export const payoutTotal=(batch:PayoutBatch)=>batch.items.reduce((sum,item)=>sum+item.amount,0);
export function refundsForOrder(state:PhaseThreeState,orderId:string){return state.refunds.filter(r=>r.orderId===orderId);}
export function refundedTotal(state:PhaseThreeState,orderId:string){return refundsForOrder(state,orderId).filter(r=>r.status==="APPROVED").reduce((a,r)=>a+r.amount,0);}
export function reservedRefundTotal(state:PhaseThreeState,orderId:string){return refundsForOrder(state,orderId).filter(r=>r.status!=="REJECTED").reduce((a,r)=>a+r.amount,0);}
export function eligiblePayoutItems(state:PhaseThreeState,orders:Order[],riders:Rider[],kind:PayoutKind):PayoutItem[]{
 const occupied=new Set(state.payouts.filter(b=>b.kind===kind&&b.status!=="REJECTED").flatMap(b=>b.items.map(item=>item.orderId)));
 return orders.filter(o=>o.status==="DELIVERED"&&o.paymentStatus==="Paid"&&!occupied.has(o.id)&&refundedTotal(state,o.id)===0&&!state.refunds.some(r=>r.orderId===o.id&&r.status==="PENDING")).flatMap(o=>{
  if(kind==="MERCHANT"){
    const commission=Math.floor(o.subtotal*state.control.commissionRate/100);
    const reserve=Math.floor((o.subtotal-commission)*state.control.reservePercent/100);
    return [{orderId:o.id,payeeId:"MER-"+o.merchant,payeeName:o.merchant,amount:Math.max(0,o.subtotal-commission-reserve)}];
  }
  if(!o.riderId)return [];
  const rider=riders.find(r=>r.id===o.riderId);
  return [{orderId:o.id,payeeId:o.riderId,payeeName:rider?.name||o.riderId,amount:Math.floor(o.deliveryFee*state.control.riderDeliveryShare/100)}];
 });
}
export function financeEntries(state:PhaseThreeState,orders:Order[]){
 type Entry={id:string;date:string;type:string;reference:string;description:string;debit:number;credit:number;status:string;orderId:string|null};
 const entries:Entry[]=[];
 for(const o of orders){
  if(o.paymentStatus==="Paid"){entries.push({id:"PMT-"+o.id,date:o.createdAt,type:"Collection",reference:"SIM-"+o.id,description:o.paymentMethod+" · "+o.customer,debit:0,credit:o.subtotal+o.deliveryFee+o.serviceFee,status:state.reconciledOrders.includes(o.id)?"Reconciled":"Unreconciled",orderId:o.id});}
 }
 for(const r of state.refunds.filter(x=>x.status==="APPROVED"))entries.push({id:r.id,date:r.reviewedAt||r.createdAt,type:"Refund",reference:"SIM-"+r.id,description:"Customer adjustment · "+r.orderId,debit:r.amount,credit:0,status:"Approved (simulated)",orderId:r.orderId});
 for(const batch of state.payouts.filter(x=>x.status==="PAID"))entries.push({id:batch.id,date:batch.paidAt||batch.createdAt,type:batch.kind==="MERCHANT"?"Merchant payout":"Rider payout",reference:batch.reference||"SIM-"+batch.id,description:batch.items.length+" allocated orders",debit:payoutTotal(batch),credit:0,status:"Marked paid (simulated)",orderId:null});
 return entries.sort((a,b)=>b.date.localeCompare(a.date));
}
export function reducePhaseThree(state:PhaseThreeState,action:PhaseThreeAction,orders:Order[]):PhaseThreeState{
 switch(action.type){
 case "PHASE3_COVERAGE":{
  if(action.reason.trim().length<3||!state.coverage.some(c=>c.county===action.county))return state;
  return {...state,coverage:state.coverage.map(c=>c.county===action.county?{...c,enabled:action.enabled,updatedAt:now()}:c),logs:audit(state.logs,"County coverage",action.county+" → "+(action.enabled?"Enabled":"Paused")+" · "+action.reason.trim())};
 }
 case "PHASE3_COVERAGE_CONFIG":{
  if(!Number.isInteger(action.fee)||action.fee<0||!Number.isInteger(action.eta)||action.eta<5||action.eta>360||action.reason.trim().length<3)return state;
  return {...state,coverage:state.coverage.map(c=>c.county===action.county?{...c,fee:action.fee,eta:action.eta,updatedAt:now()}:c),logs:audit(state.logs,"Coverage rules",action.county+" · fee "+action.fee+" · ETA "+action.eta)};
 }
 case "PHASE3_ZONE_CREATE":{
  if(action.name.trim().length<3||!state.coverage.some(c=>c.county===action.county)||!Number.isInteger(action.fee)||action.fee<0||!Number.isInteger(action.eta)||action.eta<5)return state;
  if(state.zones.some(z=>z.county===action.county&&z.name.toLowerCase()===action.name.trim().toLowerCase()))return state;
  const id="ZONE-"+(Math.max(13,...state.zones.map(z=>Number(z.id.replace("ZONE-",""))||0))+1);
  return {...state,zones:[...state.zones,{id,county:action.county,name:action.name.trim(),fee:action.fee,eta:action.eta,notes:action.notes.trim(),enabled:true}],logs:audit(state.logs,"Service zone created",id+" · "+action.name.trim())};
 }
 case "PHASE3_ZONE_STATUS":{
  if(action.reason.trim().length<3||!state.zones.some(z=>z.id===action.id))return state;
  return {...state,zones:state.zones.map(z=>z.id===action.id?{...z,enabled:action.enabled}:z),logs:audit(state.logs,"Service zone status",action.id+" → "+(action.enabled?"Enabled":"Paused")+" · "+action.reason.trim())};
 }
 case "PHASE3_REFUND_REQUEST":{
  const o=orders.find(x=>x.id===action.orderId);
  if(!o||o.paymentStatus!=="Paid"||!Number.isInteger(action.amount)||action.amount<=0||action.amount>o.subtotal+o.deliveryFee+o.serviceFee-reservedRefundTotal(state,o.id)||action.reason.trim().length<5)return state;
  const id="RF-"+(Math.max(3002,...state.refunds.map(x=>Number(x.id.replace("RF-",""))||0))+1);
  return {...state,refunds:[{id,orderId:o.id,amount:action.amount,reason:action.reason.trim(),status:"PENDING",createdAt:now()},...state.refunds],logs:audit(state.logs,"Refund requested",id+" · "+action.amount+" KES · "+o.id)};
 }
 case "PHASE3_REFUND_REVIEW":{
  const request=state.refunds.find(x=>x.id===action.id);
  if(!request||request.status!=="PENDING"||action.reason.trim().length<5)return state;
  const o=orders.find(x=>x.id===request.orderId);
  if(action.status==="APPROVED"&&(!o||refundedTotal(state,o.id)+request.amount>o.subtotal+o.deliveryFee+o.serviceFee))return state;
  return {...state,refunds:state.refunds.map(r=>r.id===action.id?{...r,status:action.status,reviewNote:action.reason.trim(),reviewedAt:now()}:r),logs:audit(state.logs,"Refund review",request.id+" → "+action.status+" · "+action.reason.trim())};
 }
 case "PHASE3_RECONCILE_PAYMENT":{
  if(action.reason.trim().length<3||state.reconciledOrders.includes(action.orderId)||!orders.some(o=>o.id===action.orderId&&o.paymentStatus==="Paid"))return state;
  return {...state,reconciledOrders:[...state.reconciledOrders,action.orderId],logs:audit(state.logs,"Collection reconciled",action.orderId+" · "+action.reason.trim())};
 }
 case "PHASE3_RECONCILE_ISSUE":{
  if(action.reason.trim().length<5||!state.issues.some(i=>i.id===action.id&&i.status==="OPEN"))return state;
  return {...state,issues:state.issues.map(i=>i.id===action.id?{...i,status:"RECONCILED",note:action.reason.trim()}:i),logs:audit(state.logs,"Exception resolved",action.id+" · "+action.reason.trim())};
 }
 case "PHASE3_PAYOUT_CREATE":{
  const eligible=eligiblePayoutItems(state,orders,[],action.kind);
  if(!action.items.length||action.items.some(item=>!eligible.some(e=>e.orderId===item.orderId&&e.payeeId===item.payeeId&&e.amount===item.amount)))return state;
  const keys=new Set(action.items.map(i=>i.orderId));if(keys.size!==action.items.length)return state;
  const id="SET-"+(Math.max(600,...state.payouts.map(b=>Number(b.id.slice(4))||0))+1);
  return {...state,payouts:[{id,kind:action.kind,status:"DRAFT",period:action.period,createdAt:now(),items:action.items},...state.payouts],logs:audit(state.logs,"Payout batch drafted",id+" · "+action.kind+" · "+action.items.length+" orders")};
 }
 case "PHASE3_PAYOUT_REVIEW":{
  const batch=state.payouts.find(x=>x.id===action.id);
  if(!batch||batch.status!=="DRAFT"||action.reason.trim().length<5)return state;
  return {...state,payouts:state.payouts.map(b=>b.id===action.id?{...b,status:action.status,reason:action.reason.trim(),approvedAt:action.status==="APPROVED"?now():undefined}:b),logs:audit(state.logs,"Payout review",batch.id+" → "+action.status)};
 }
 case "PHASE3_PAYOUT_MARK_PAID":{
  const batch=state.payouts.find(x=>x.id===action.id);
  if(!batch||batch.status!=="APPROVED"||action.reference.trim().length<5||action.reason.trim().length<5||state.payouts.some(b=>b.reference===action.reference.trim()))return state;
  return {...state,payouts:state.payouts.map(b=>b.id===action.id?{...b,status:"PAID",paidAt:now(),reference:action.reference.trim(),reason:action.reason.trim()}:b),logs:audit(state.logs,"Payout marked paid (simulation)",batch.id+" · "+action.reference.trim())};
 }
 case "PHASE3_FINANCE_CONFIG":{
  const {commissionRate,riderDeliveryShare,reservePercent}=action;
  if([commissionRate,riderDeliveryShare,reservePercent].some(n=>!Number.isFinite(n)||n<0||n>100)||action.reason.trim().length<5)return state;
  return {...state,control:{...state.control,commissionRate,riderDeliveryShare,reservePercent},logs:audit(state.logs,"Commercial policy updated","Commission "+commissionRate+"%, rider "+riderDeliveryShare+"%, reserve "+reservePercent+"% · "+action.reason.trim())};
 }
 default:return state;
 }
}
