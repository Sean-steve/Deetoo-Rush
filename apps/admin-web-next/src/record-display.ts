/** Human-facing labels only. Never substitute these for authoritative API IDs. */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function recordDisplayId(value:string|undefined|null,prefix="REF"){
 const id=String(value||"").trim();
 if(!id)return "Not assigned";
 if(!uuid.test(id))return id.startsWith("#")?id:"#"+id;
 return "#"+prefix+"-"+id.slice(0,8).toUpperCase()+"-"+id.slice(-4).toUpperCase();
}
export function orderDisplayId(order:{id:string;publicCode?:string}){
 return order.publicCode?recordDisplayId(order.publicCode):recordDisplayId(order.id,"DT");
}
export function paymentDisplayId(payment:{id:string;reference?:string}){
 return payment.reference&&payment.reference!==payment.id&& !uuid.test(payment.reference)
  ?recordDisplayId(payment.reference):recordDisplayId(payment.id,"PAY");
}
export function refundDisplayId(id:string){return recordDisplayId(id,"REF");}
