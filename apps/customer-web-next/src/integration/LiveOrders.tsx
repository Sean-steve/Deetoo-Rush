/**
 * Phase B3 — approved Screens 08–10 connected to authenticated DeeToo orders.
 * No sample riders, fabricated route geometry, fake ETA, synthetic payments or
 * fake delivery confirmations. Server remains authoritative for every status.
 */
import {useEffect,useMemo,useState} from "react";
import {ArrowLeft,ArrowRight,Bike,CalendarDays,Check,CheckCircle2,ChevronDown,Clock3,CreditCard,Headphones,House,MapPin,Package,RefreshCw,Search,ShieldCheck,ShoppingBag,Star,Truck,XCircle} from "lucide-react";
import type {CustomerTrackingResponse,Order,OrderStatus,DeliveryStatus} from "@deetoo/types";
import {Badge,Button,IconButton,Panel,classNames} from "../../../../packages/customer-ui/src/index";
import type {CustomerGateway} from "./customer-gateway";
import {backendError,useBackendResource} from "./resource";
import {money,ResourceView,SafePhoto,StatusPanel} from "./LiveUtilities";

type View="history"|"tracking"|"completed";
type Props={gateway:CustomerGateway;screen:View;orderId:string;onNavigate:(path:string)=>void;authenticated:boolean;requestSignIn:()=>void};
type Tab="all"|"active"|"completed"|"cancelled";
const terminal=new Set<string>(["COMPLETED","CANCELLED","REJECTED"]);
const arrival=new Set<string>(["PICKED_UP","EN_ROUTE","ARRIVED_DROPOFF"]);
const validCoordinate=(lat:number,lng:number)=>Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
const statusName:Record<OrderStatus,string>={
 PENDING_PAYMENT:"Awaiting payment",PLACED:"Order placed",ACCEPTED:"Accepted",PREPARING:"Preparing",
 READY:"Ready for pickup",COMPLETED:"Delivered",REJECTED:"Rejected",CANCELLED:"Cancelled"
};
const statusVariant=(status:OrderStatus):"mint"|"gold"|"red"|"neutral"=>
 status==="COMPLETED"?"mint":status==="CANCELLED"||status==="REJECTED"?"red":status==="PENDING_PAYMENT"?"neutral":"gold";
function Status({order}:{order:Order}){return <Badge variant={statusVariant(order.status)}>{statusName[order.status]||"Status unavailable"}</Badge>;}
const when=(iso?:string|null)=>{if(!iso)return "Not yet";const date=new Date(iso);return Number.isNaN(date.getTime())?"Unavailable":new Intl.DateTimeFormat("en-KE",{dateStyle:"medium",timeStyle:"short",timeZone:"Africa/Nairobi"}).format(date);};
const idOf=(order:Order)=>order.public_code||order.order_number||order.id;
const itemCount=(order:Order)=>order.items?.reduce((a,b)=>a+b.quantity,0)||0;
function PhaseTimeline({order,tracking}:{order:Order;tracking?:CustomerTrackingResponse|null}){
 const stages=[
   {label:"Placed",done:order.status!=="PENDING_PAYMENT",at:order.placed_at||order.created_at},
   {label:"Preparing",done:["PREPARING","READY","COMPLETED"].includes(order.status),at:order.preparing_at},
   {label:"Picked up",done:tracking?["PICKED_UP","EN_ROUTE","ARRIVED_DROPOFF","DELIVERED"].includes(tracking.deliveryStatus):false,at:tracking?.timeline.find(x=>x.to_status==="PICKED_UP")?.created_at},
   {label:"Delivered",done:order.status==="COMPLETED",at:order.completed_at}
 ];
 return <ol className="dt-order-stages dt-live-order-stages" aria-label="Verified order progression">{stages.map((s,i)=>
  <li key={s.label} className={classNames(s.done&&"dt-stage-reached",s.done&&!stages[i+1]?.done&&"dt-stage-current")}>
   <div className="dt-stage-node">{s.done?<Check size={16}/>:<span/>}</div><strong>{s.label}</strong><small>{s.done?when(s.at):"Pending"}</small>
  </li>)}</ol>;
}
function MoneySummary({order}:{order:Order}){
 const p=order.pricing_snapshot;
 return <div className="dt-live-order-money"><h2>Order summary</h2>
  <dl><div><dt>Items</dt><dd>{money(p?.gross_subtotal_minor??order.subtotal_minor)}</dd></div>
  <div><dt>Discount</dt><dd>-{money(p?.discount_minor??order.discount_minor)}</dd></div>
  <div><dt>Delivery fee</dt><dd>{money(p?.delivery_fee_minor??order.delivery_fee_minor)}</dd></div>
  <div><dt>Service fee</dt><dd>{money(p?.service_fee_minor??order.service_fee_minor)}</dd></div>
  {p&&<div><dt>Tax</dt><dd>{money(p.tax_minor)}</dd></div>}
  <div className="dt-live-order-money-total"><dt>Total · {order.currency||"KES"}</dt><dd>{money(order.total_minor)}</dd></div></dl>
  <p>The amounts shown are from this order's saved DeeToo checkout record.</p>
 </div>;
}
function Items({order}:{order:Order}) {
 return <div className="dt-live-order-items"><h2>Items in this order</h2>
 {(order.items||[]).map(item=><div className="dt-live-order-item" key={item.id}><SafePhoto className="dt-live-order-photo" src={item.item_snapshot?.image_url} alt={item.item_name}/>
 <div><strong>{item.quantity} × {item.item_name}</strong><small>{(item.modifiers||[]).map(x=>x.option_name).filter(Boolean).join(" · ")||"No extras"}</small></div>
 <b>{typeof item.line_total_minor==="number"?money(item.line_total_minor):"—"}</b></div>)}
 {(!order.items||order.items.length===0)&&<p>Item details are unavailable for this order.</p>}
 </div>;
}
function EntryCard({order,onOpen,onReorder}:{order:Order;onOpen:()=>void;onReorder:()=>void}){
 const complete=order.status==="COMPLETED";
  const thumbs=(order.items||[]).slice(0,3);
 return <article className={classNames("dt-history-card",!terminal.has(order.status)&&"dt-history-card--active")} data-order-id={order.id}>
  <header className="dt-history-head"><div><strong>#{idOf(order)}</strong> <Status order={order}/><p>{order.merchant_name||order.branch_name||"DeeToo restaurant"} · {when(order.placed_at||order.created_at)}</p></div>
  <div><Button variant="outline" size="sm" onClick={onOpen}>View details <ArrowRight size={15}/></Button>
   {complete&&<Button size="sm" onClick={onReorder}><RefreshCw size={15}/> View menu</Button>}</div></header>
  <div className="dt-history-body"><div className="dt-history-merchant">
    <div className="dt-history-thumbs" aria-label="Order items">{thumbs.length?thumbs.map(item=><SafePhoto key={item.id} className="dt-order-photo" src={item.item_snapshot?.image_url} alt={item.item_name}/>):<Package size={26} aria-label="Item photos unavailable"/>}</div>
    <div><h3>{order.merchant_name||order.branch_name||"Restaurant"}</h3><p>{itemCount(order)} items · {money(order.total_minor)}</p>
      <div className="dt-live-order-mini-items">{(order.items||[]).slice(0,4).map(i=><small key={i.id}>{i.quantity}× {i.item_name}</small>)}</div><div className="dt-history-rider"><Bike size={15}/><span>{complete?"Delivery confirmed":terminal.has(order.status)?"No active delivery":"Open details for rider updates"}</span></div></div>
  </div><div className="dt-history-progress"><PhaseTimeline order={order}/>
  <p className={classNames("dt-history-caption",complete&&"dt-history-caption--done",["CANCELLED","REJECTED"].includes(order.status)&&"dt-history-caption--cancelled")}>{order.status==="PENDING_PAYMENT"?"Payment confirmation is required before preparation begins.":
    order.status==="COMPLETED"?"Delivery confirmed by DeeToo. Open your order to review the receipt.":
    order.status==="CANCELLED"?"This order was cancelled.":"Status is updated by DeeToo when the merchant or rider completes each step."}</p>
  </div></div>
  {!terminal.has(order.status)&&<button type="button" className="dt-history-track" onClick={onOpen}><Bike size={18}/> Track this order <ArrowRight size={16}/></button>}
 </article>;
}
function History({gateway,onNavigate}:{gateway:CustomerGateway;onNavigate:(path:string)=>void}){
 const resource=useBackendResource(()=>gateway.orders.list({limit:50}),true,[]);
 const [tab,setTab]=useState<Tab>("all"),[search,setSearch]=useState(""),[period,setPeriod]=useState("3");
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==="visible")resource.refresh();};
  window.addEventListener("focus",refresh);const t=window.setInterval(refresh,30000);
  return()=>{clearInterval(t);window.removeEventListener("focus",refresh);};},[resource.refresh]);
 const list=(resource.state.status==="ready"||resource.state.status==="empty")?resource.state.data:[];
 const visible=useMemo(()=>{
  const now=new Date(),cutoff=new Date(now);
  if(period==="1")cutoff.setDate(now.getDate()-30);
  if(period==="3")cutoff.setMonth(now.getMonth()-3);
  const q=search.toLowerCase().trim();
  return list.filter(o=>{
   if(tab==="active"&&terminal.has(o.status))return false;
   if(tab==="completed"&&o.status!=="COMPLETED")return false;
   if(tab==="cancelled"&&!["REJECTED","CANCELLED"].includes(o.status))return false;
   if(period!=="all"&&new Date(o.placed_at||o.created_at)<cutoff)return false;
   return !q||[idOf(o),o.branch_name||"",o.merchant_name||"",...(o.items||[]).map(i=>i.item_name)].some(x=>x.toLowerCase().includes(q));
  }).sort((a,b)=>new Date(b.placed_at||b.created_at).getTime()-new Date(a.placed_at||a.created_at).getTime());
 },[list,tab,search,period]);
 const open=(o:Order)=>onNavigate(o.status==="COMPLETED"?"/orders/"+o.id+"/completed":"/orders/"+o.id+"/track");
 return <section className="dt-orders-page dt-screen-enter">
  <header className="dt-orders-header"><div><h1>Your orders</h1><p>Track current orders or view your completed order history.</p></div>
  <div className="dt-orders-controls"><label className="dt-orders-search"><Search size={20}/><input type="search" aria-label="Search orders by restaurant or item" placeholder="Search orders by restaurant or item…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
  <label className="dt-orders-period"><CalendarDays size={18}/><select value={period} aria-label="Filter order date range" onChange={e=>setPeriod(e.target.value)}><option value="3">Last 3 months</option><option value="1">Last 30 days</option><option value="all">All available</option></select><ChevronDown size={15}/></label></div></header>
  <div className="dt-orders-tabsbar"><div role="tablist" aria-label="Order status filters">{([["all","All orders"],["active","Active"],["completed","Past orders"],["cancelled","Cancelled"]] as const).map(([id,name])=><button key={id} type="button" role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{name}{id==="active"&&<span> ({list.filter(o=>!terminal.has(o.status)).length})</span>}</button>)}</div>
    <Button variant="outline" size="sm" onClick={resource.refresh}><RefreshCw size={16}/> Refresh</Button></div>
  <ResourceView resource={resource.state} onRetry={resource.refresh} empty="No orders yet">{()=>visible.length?
    <div className="dt-orders-list">{visible.map(o=><EntryCard key={o.id} order={o} onOpen={()=>open(o)} onReorder={()=>onNavigate("/restaurant/"+encodeURIComponent(o.branch_id))}/>)}</div>:
    <Panel className="dt-orders-empty"><Search size={30}/><h2>No matching orders</h2><p>Try changing your filters or search terms.</p><Button onClick={()=>{setTab("all");setPeriod("all");setSearch("");}}>Clear filters</Button></Panel>}</ResourceView>
  <p className="dt-orders-disclaimer"><ShieldCheck size={14}/> Showing up to 50 recent orders returned by your authenticated DeeToo account. No sample orders are included.</p>
 </section>;
}
function NoLocation({tracking}:{tracking:CustomerTrackingResponse|null}){
 const loc=tracking?.riderLiveLocation;
 const fresh=Boolean(loc&&!loc.isStale&&Date.now()-new Date(loc.recordedAt).getTime()<180000&&Date.now()-new Date(loc.recordedAt).getTime()>=-30000&&validCoordinate(loc.latitude,loc.longitude));
 return <div className="dt-live-order-map dt-tracking-map-panel"><div className="dt-map-inner dt-fidelity-tracking-map"><div className="dt-map-roads" aria-hidden="true"/></div><div className="dt-live-order-map-canvas"><MapPin size={42}/>
  <strong>{fresh?"Verified rider location available":"Live map unavailable"}</strong>
  <p>{fresh?"DeeToo has received a recent rider location. Open the verified point in a map. Live route geometry is not yet available here.":
    loc?"The latest rider position is old or cannot be verified. No marker or arrival estimate is shown.":
    "The rider has not shared a current location. We won't display an invented route."}</p>
  {fresh&&loc&&<a target="_blank" rel="noopener noreferrer" href={"https://www.openstreetmap.org/?mlat="+loc.latitude+"&mlon="+loc.longitude+"#map=15/"+loc.latitude+"/"+loc.longitude}>
    Open verified location <ArrowRight size={15}/></a>}
  </div><small>{fresh&&loc?"Last updated "+when(loc.recordedAt):"Rider location is provided only after authorized assignment and valid GPS."}</small></div>;
}
function Rider({tracking}:{tracking:CustomerTrackingResponse|null}){
 if(!tracking?.rider)return <div className="dt-live-order-rider dt-rider-card"><span className="dt-rider-avatar dt-rider-avatar--big"><Bike size={22}/></span><div><strong>Finding your rider</strong><p>Assignment is confirmed by DeeToo dispatch. No rider is assigned in this view yet.</p></div></div>;
 return <div className="dt-live-order-rider dt-rider-card"><span className="dt-rider-avatar dt-rider-avatar--big"><Bike size={24}/></span><div><strong>{tracking.rider.firstName}</strong>
  <p className="dt-rider-plate">{tracking.rider.vehicleType}{tracking.rider.vehicleRegistrationMasked?" · "+tracking.rider.vehicleRegistrationMasked:""}</p>
  <small>Identity and vehicle details are provided by DeeToo.</small></div></div>;
}
function LiveOrderDetail({gateway,orderId,onNavigate,completed}:{gateway:CustomerGateway;orderId:string;onNavigate:(path:string)=>void;completed:boolean}){
 const order=useBackendResource(()=>gateway.orders.detail(orderId),Boolean(orderId),[orderId]);
 const value=order.state.status==="ready"?order.state.data:null;
 const ongoing=Boolean(value&&!terminal.has(value.status));
 const canTrack=Boolean(value&&value.status!=="PENDING_PAYMENT"&&!["CANCELLED","REJECTED"].includes(value.status));
 const track=useBackendResource(()=>gateway.orders.tracking(orderId),canTrack,[orderId]);
 const [cancelOpen,setCancelOpen]=useState(false),[cancelBusy,setCancelBusy]=useState(false),[error,setError]=useState("");
 const [rating,setRating]=useState(0),[comment,setComment]=useState(""),[ratingBusy,setRatingBusy]=useState(false),[rated,setRated]=useState(false);
 const tracking=track.state.status==="ready"?track.state.data:null;
 useEffect(()=>{if(!ongoing)return;const tick=()=>{if(document.visibilityState==="visible"){order.refresh();if(canTrack)track.refresh();}};
  const t=setInterval(tick,12000);const vis=()=>{if(document.visibilityState==="visible")tick();};
  document.addEventListener("visibilitychange",vis);return()=>{clearInterval(t);document.removeEventListener("visibilitychange",vis);};
 },[order.refresh,track.refresh,ongoing,canTrack]);
 const cancel=async()=>{if(cancelBusy||!value||value.status!=="PLACED")return;setCancelBusy(true);setError("");
  try {await gateway.orders.cancel(orderId,"CUSTOMER_CANCELLED");setCancelOpen(false);order.refresh();track.refresh();}
  catch(e){setError(backendError(e).message);order.refresh();}
  finally{setCancelBusy(false);}};
 const submitRating=async()=>{if(ratingBusy||!value||value.status!=="COMPLETED"||rating<1)return;setRatingBusy(true);setError("");
  try{await gateway.orders.rateDelivery(orderId,rating,comment);setRated(true);}
  catch(e){setError(backendError(e).message);}
  finally{setRatingBusy(false);}};
 const verifiedEta=tracking?.riderLiveLocation&&!tracking.riderLiveLocation.isStale&&tracking.estimatedEtaMinutes!=null
  &&arrival.has(tracking.deliveryStatus)&&Date.now()-new Date(tracking.riderLiveLocation.recordedAt).getTime()<180000
  &&Date.now()-new Date(tracking.riderLiveLocation.recordedAt).getTime()>=-30000;
 return <section className="dt-orders-page dt-screen-enter">
  <header className="dt-orders-header dt-live-order-detail-head"><div><button className="dt-live-order-back" onClick={()=>onNavigate("/orders")}><ArrowLeft size={16}/> Back to your orders</button>
  <h1>{completed?"Order complete":"Track your delivery"}</h1>
  <p>Real order updates from DeeToo. Delivery information refreshes while this page is open.</p></div><Button variant="outline" onClick={()=>{order.refresh();track.refresh();}}><RefreshCw size={17}/> Refresh</Button></header>
  <ResourceView resource={order.state} onRetry={order.refresh} empty="Order unavailable">{o=>
   completed&&o.status!=="COMPLETED"?<StatusPanel title="Order not yet completed" description="Only completed orders have a final delivery summary. You can follow the latest verified status instead."><Button onClick={()=>onNavigate("/orders/"+orderId+"/track")}>Open order tracking</Button></StatusPanel>:
   <div className="dt-live-order-detail-grid"><div className="dt-live-order-detail-primary">
    <Panel className="dt-live-order-overview"><div><h2>Order #{idOf(o)}</h2><Status order={o}/></div>
     <p>{o.merchant_name||o.branch_name||"DeeToo restaurant"} · Ordered {when(o.placed_at||o.created_at)}</p>
     <PhaseTimeline order={o} tracking={tracking}/>
     {o.status==="PENDING_PAYMENT"&&<div className="dt-live-order-alert"><CreditCard size={18}/><span>Payment is still pending. Preparation and courier assignment have not started.</span><Button onClick={()=>onNavigate("/payment/"+o.id)}>Complete payment</Button></div>}
     {o.status==="COMPLETED"&&<p className="dt-live-order-confirmed"><CheckCircle2 size={19}/> DeeToo confirms this order is completed{ o.completed_at?" · "+when(o.completed_at):""}.</p>}
     {["CANCELLED","REJECTED"].includes(o.status)&&<p className="dt-live-order-alert"><XCircle size={17}/> {o.cancellation_reason||o.rejection_reason||"This order will not be delivered."}</p>}
    </Panel>
    {!completed&&<Panel className="dt-live-order-tracking"><div className="dt-live-order-topline"><div><h2>Delivery tracking</h2><p>{tracking?.statusMessage||"Dispatch and GPS updates are verified by DeeToo."}</p></div><Badge variant={verifiedEta?"mint":"neutral"}>{verifiedEta?"ETA "+tracking?.estimatedEtaMinutes+" min":"ETA unavailable"}</Badge></div>
      {track.state.status==="error"&&<p role="status" className="dt-live-order-info">{track.state.code==="NOT_FOUND"?"A delivery has not yet been created or assigned for this order.":track.state.message} <button onClick={track.refresh}>Retry</button></p>}
      {track.state.status==="loading"&&<p role="status" className="dt-live-order-info">Checking current delivery status…</p>}
      {tracking&&["FAILED","CANCELLED"].includes(tracking.deliveryStatus)&&<p role="alert" className="dt-live-order-alert">This delivery needs support or operational review. No completion is assumed.</p>}
      {tracking&&["UNASSIGNED","OFFERED"].includes(tracking.deliveryStatus)&&<p role="status" className="dt-live-order-info"><Clock3 size={17}/> A rider hasn't accepted this delivery yet. You can check again later.</p>}
      <NoLocation tracking={tracking}/><Rider tracking={tracking}/>
      {tracking?.deliveryStatus==="ARRIVED_DROPOFF"&&tracking.deliveryOtp&&<p className="dt-live-order-otp">Delivery handover code: <strong>{tracking.deliveryOtp}</strong><small>Share only with your assigned rider at the delivery point.</small></p>}
    </Panel>}
    <Panel className="dt-live-order-products"><Items order={o}/></Panel>
    {completed&&<Panel className="dt-live-order-rating"><h2>Rate your delivery</h2>
      {rated?<p role="status"><CheckCircle2 size={18}/> Your rating has been received by DeeToo.</p>:<>
      <p>Your rating is sent to the verified rider-performance service. Restaurant ratings are not yet available here.</p>
      <div className="dt-live-order-stars" role="group" aria-label="Rate the rider">{[1,2,3,4,5].map(n=><button key={n} aria-label={n+" stars"} aria-pressed={rating===n} onClick={()=>setRating(n)} disabled={ratingBusy}><Star size={23} fill={n<=rating?"currentColor":"none"}/></button>)}</div>
      <label>Optional feedback<textarea value={comment} maxLength={500} onChange={e=>setComment(e.target.value)} rows={3}/></label>
      <Button disabled={!rating||ratingBusy} onClick={()=>void submitRating()}>{ratingBusy?"Submitting…":"Submit delivery rating"}</Button></>}</Panel>}
   </div><aside className="dt-live-order-detail-aside"><Panel><h2>Delivery details</h2>
    <dl className="dt-live-order-meta"><div><dt>Order number</dt><dd>{idOf(o)}</dd></div><div><dt>Restaurant</dt><dd>{o.branch_name||o.merchant_name||"Unavailable"}</dd></div>
    <div><dt>Deliver to</dt><dd>{o.delivery_address_snapshot?.address_text||"Address details unavailable"}</dd></div><div><dt>Last updated</dt><dd>{when(o.updated_at)}</dd></div></dl>
    {o.status==="PLACED"&&!completed&&<Button variant="outline" onClick={()=>setCancelOpen(true)}><XCircle size={17}/> Request cancellation</Button>}
   </Panel><Panel><MoneySummary order={o}/></Panel>
   <Panel className="dt-live-order-actions"><h2>Need help?</h2><p>Customer support case conversations will be connected in Phase B4. Do not use this page for emergency assistance.</p>
    <Button variant="outline" onClick={()=>onNavigate("/support")}><Headphones size={16}/> Support status</Button>
    <Button variant="outline" onClick={()=>onNavigate("/restaurant/"+encodeURIComponent(o.branch_id))}><ShoppingBag size={16}/> View restaurant menu</Button>
   </Panel>
   </aside></div>
  }</ResourceView>
  {error&&<p className="dt-live-error" role="alert">{error}</p>}
  {cancelOpen&&<div className="dt-live-order-modal-backdrop"><div className="dt-live-order-modal" role="dialog" aria-modal="true" aria-label="Confirm order cancellation"><h2>Cancel this order?</h2><p>Cancellation is only available before merchant acceptance. DeeToo checks the current order state before making changes.</p>
   {error&&<p role="alert">{error}</p>}<div><Button variant="outline" disabled={cancelBusy} onClick={()=>setCancelOpen(false)}>Keep order</Button><Button disabled={cancelBusy} onClick={()=>void cancel()}>{cancelBusy?"Checking…":"Confirm cancellation"}</Button></div></div></div>}
 </section>;
}
export function LiveOrders({gateway,screen,orderId,onNavigate,authenticated,requestSignIn}:Props){
 if(!authenticated)return <StatusPanel title="Sign in to view your orders" description="DeeToo order history and live tracking are available only to the customer who placed the order."><Button onClick={requestSignIn}>Sign in</Button></StatusPanel>;
 if(screen==="history")return <History gateway={gateway} onNavigate={onNavigate}/>;
 return <LiveOrderDetail key={orderId} gateway={gateway} orderId={orderId} onNavigate={onNavigate} completed={screen==="completed"}/>;
}
