import React,{useEffect,useMemo,useState} from "react";
import {AlertTriangle, ArrowRight, Bike, CheckCircle2, Clock3, Filter, Mail, MapPin, MoreHorizontal, Package, Phone, RefreshCw, Search, ShoppingBag, UserRound, Users, X} from "lucide-react";
import {Order,OrderStatus, Rider, formatMoney, isActive, orderTotal, displayTime} from "../data";
import {useDemo,canAct} from "../store";
import {Bars,Card,Chip,DemoMap,DeliveryOrderRow,DetailLine,Empty,IconStat,Initials,Journey,Modal,SearchBox,SelectBox,Tabs} from "../ui";
export function DispatchScreen({county,navigate,globalSearch,toast}:{county:string;navigate:(id:string)=>void;globalSearch:string;toast:(s:string)=>void}){
 const {data,act,role}=useDemo();
 const [tab,setTab]=useState("active"),[search,setSearch]=useState(""),[selectedId,setSelectedId]=useState<string|null>(null);
 const [detailTab,setDetailTab]=useState("overview"),[riderFilter,setRiderFilter]=useState("available"),[riderSearch,setRiderSearch]=useState("");
 const [modal,setModal]=useState<"assign"|"unassign"|"advance"|null>(null),[chosenRider,setChosenRider]=useState(""),[reason,setReason]=useState("");
 const [layers,setLayers]=useState({riders:true,orders:true,merchants:true});
 useEffect(()=>{if(globalSearch)setSearch(globalSearch);},[globalSearch]);
 useEffect(()=>{
   const orderId=sessionStorage.getItem("deetoo.demo.focusOrder");
   const riderId=sessionStorage.getItem("deetoo.demo.focusRider");
   if(orderId){setSelectedId(orderId);setTab("all");sessionStorage.removeItem("deetoo.demo.focusOrder");}
   else if(riderId){const order=data.orders.find(o=>o.riderId===riderId);if(order){setSelectedId(order.id);setTab("all");}sessionStorage.removeItem("deetoo.demo.focusRider");}
 },[]);
 const currentCounty=county==="all"?data.orders:data.orders.filter(o=>o.pickup.county===county);
 const list=currentCounty.filter(o=>(tab==="all" || (tab==="active"?isActive(o):tab==="unassigned"?!o.riderId&&isActive(o):tab==="delayed"?o.status==="DELAYED":o.status==="DELIVERED")) && (o.id+" "+o.merchant+" "+o.customer+" "+o.area).toLowerCase().includes(search.toLowerCase()));
 const selected=currentCounty.find(o=>o.id===selectedId)||list[0];
 const assigned=selected?data.riders.find(r=>r.id===selected.riderId):undefined;
 const riders=data.riders.filter(r=>(county==="all"||r.area.county===county)&&(r.name+" "+r.id+" "+r.area.name).toLowerCase().includes(riderSearch.toLowerCase())&&(riderFilter==="all"||r.status===(riderFilter==="available"?"AVAILABLE":riderFilter==="delivery"?"ON_DELIVERY":"OFFLINE")));
 const eligible=data.riders.filter(r=>r.status==="AVAILABLE"&&r.approved&&r.onboarding==="VERIFIED");
 const pick=(order:Order)=>{setSelectedId(order.id);setDetailTab("overview");};
 const canManage=canAct(role,"dispatch");
 const openAssign=(riderId?:string)=>{if(!selected){toast("Choose an order first.");return;} if(selected.riderId){toast("Release the assigned rider before selecting another.");return;} if(!isActive(selected)){toast("Only active orders can be assigned.");return;}setChosenRider(riderId||"");setReason("");setModal("assign");};
 const confirm=()=>{
  if(!selected||!canManage)return;
  if(modal==="assign"){const rider=eligible.find(r=>r.id===chosenRider);if(!rider)return;act({type:"ASSIGN_RIDER",orderId:selected.id,riderId:rider.id});toast("Rider "+rider.name+" assigned to #"+selected.id);}
  if(modal==="unassign"){if(reason.trim().length<3)return;act({type:"UNASSIGN_RIDER",orderId:selected.id});toast("Rider released. Order is available for reassignment.");}
  if(modal==="advance"){if(!selected.riderId)return;const next:OrderStatus=selected.status==="RIDER_ASSIGNED"?"PICKED_UP":selected.status==="PICKED_UP"?"IN_TRANSIT":"DELIVERED";act({type:"UPDATE_ORDER",orderId:selected.id,status:next,reason:"Updated by demo operations"});toast("Order moved to "+next.replaceAll("_"," ").toLowerCase()+".");}
  setModal(null);setReason("");setChosenRider("");
 };
 const stats=[data.riders.filter(r=>r.status==="AVAILABLE").length,data.orders.filter(isActive).length,data.orders.filter(o=>!o.riderId&&isActive(o)).length,data.orders.filter(o=>o.status==="DELAYED").length];
 return <div className="dn-screen" data-testid="screen-dispatch">
  <div className="dn-title-row"><div><h1>Live Dispatch & Tracking</h1><p>Real-time-style demo of orders, riders and deliveries across Kenya.</p></div><div className="dn-inline-kpis"><IconStat icon={<Bike/>} label="Available Riders" value={stats[0]}/><IconStat icon={<Package/>} label="Active Orders" value={stats[1]} tone="blue"/><IconStat icon={<AlertTriangle/>} label="Delayed" value={stats[3]} tone="red"/></div></div>
  <div className="dn-dispatch-grid">
   <Card className="dn-dispatch-queue">
    <Tabs value={tab} onChange={setTab} tabs={[{key:"active",label:"Active ("+currentCounty.filter(isActive).length+")"},{key:"unassigned",label:"Unassigned ("+currentCounty.filter(o=>!o.riderId&&isActive(o)).length+")"},{key:"delayed",label:"Delayed ("+currentCounty.filter(o=>o.status==="DELAYED").length+")"},{key:"all",label:"All"}]} ariaLabel="Dispatch queue"/>
    <div className="dn-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search orders..."/><button className="dn-iconbutton" aria-label="Clear filters" onClick={()=>{setSearch("");setTab("active");}}><Filter size={15}/></button></div>
    <div className="dn-scroll-queue">{list.length?list.map(o=><DeliveryOrderRow key={o.id} order={o} selected={selected?.id===o.id} riderName={data.riders.find(r=>r.id===o.riderId)?.name||"Unassigned"} onClick={()=>pick(o)}/>):<Empty label="No deliveries in this queue"/>}</div>
   </Card>
   <Card className="dn-dispatch-map">
    <div className="dn-map-top"><div className="dn-segment"><button className="active">Map</button><button onClick={()=>toast("Satellite imagery is unavailable in this offline frontend demo.")}>Satellite</button></div><span>🟢 Demo Nairobi tracking</span><button className="dn-iconbutton" aria-label="Reset map view" onClick={()=>setLayers({riders:true,orders:true,merchants:true})}><RefreshCw size={15}/></button></div>
    <DemoMap height={550} orders={currentCounty.filter(isActive)} riders={data.riders.filter(r=>r.status==="AVAILABLE"||r.status==="ON_DELIVERY")} layers={layers} onSelectOrder={id=>{setSelectedId(id);setDetailTab("overview");}} onSelectRider={id=>{const order=currentCounty.find(o=>o.riderId===id);if(order)setSelectedId(order.id);else toast("Selected rider is available; select an order to assign.");}}/>
    <div className="dn-map-toolbar">{([{key:"riders",label:"Riders"},{key:"orders",label:"Orders"},{key:"merchants",label:"Merchants"}] as const).map(x=><label key={x.key}><input checked={layers[x.key]} type="checkbox" onChange={e=>setLayers(v=>({...v,[x.key]:e.target.checked}))}/>{x.label}</label>)}</div>
   </Card>
   <Card className="dn-dispatch-panel">
    {selected?<><div className="dn-order-heading"><div><h2>#{selected.id}</h2><Chip value={selected.status}/></div><p>Placed {displayTime(selected.createdAt)} · Demo ETA {selected.etaMinutes} minutes</p></div>
     <Tabs value={detailTab} onChange={setDetailTab} tabs={[{key:"overview",label:"Overview"},{key:"timeline",label:"Timeline"},{key:"customer",label:"Customer"},{key:"merchant",label:"Merchant"},{key:"rider",label:"Rider"}]} ariaLabel="Dispatch details"/>
     {detailTab==="overview"&&<><Journey order={selected}/>
      <div className="dn-entity-pair"><div className="dn-entity"><span>Customer</span><div><Initials name={selected.customer}/><strong>{selected.customer}</strong></div><small>{selected.customerPhone}</small><small>{selected.destination.name}, {selected.destination.county}</small></div><div className="dn-entity"><span>Merchant</span><div><Initials name={selected.merchant}/><strong>{selected.merchant}</strong></div><small>{selected.pickup.name}, {selected.pickup.county}</small></div></div>
      <div className="dn-rider-person"><Initials name={assigned?.name||"?"}/><div><b>{assigned?.name||"Rider not assigned"}</b><small>{assigned?assigned.status.replaceAll("_"," "):"Choose an eligible rider"}</small></div>{assigned&&<button className="dn-smalloutline" onClick={()=>navigate("riders")}>Profile</button>}</div>
      <div className="dn-entity-pair dn-order-lines"><div><strong>Order Items ({selected.items.length})</strong>{selected.items.map((it,i)=><DetailLine key={i} label={it.name+" ×"+it.qty}>{formatMoney(it.price*it.qty)}</DetailLine>)}</div><div><strong>Order Total</strong><DetailLine label="Subtotal">{formatMoney(selected.subtotal)}</DetailLine><DetailLine label="Delivery fee">{formatMoney(selected.deliveryFee)}</DetailLine><DetailLine label="Service fee">{formatMoney(selected.serviceFee)}</DetailLine><DetailLine label="Total">{formatMoney(orderTotal(selected))}</DetailLine></div></div>
      <div className="dn-payment-mini"><ShoppingBag size={17}/><b>{selected.paymentMethod}</b><span>{selected.paymentStatus}</span></div>
     </>}
     {detailTab==="timeline"&&<div className="dn-timeline">{selected.history.map((e,i)=><div key={i}><span className="dn-time-point">●</span><div><strong>{e.event}</strong><small>{displayTime(e.at)} · {e.by}</small><p>{e.detail}</p></div></div>)}</div>}
     {detailTab==="customer"&&<div className="dn-detail-lines"><DetailLine label="Customer">{selected.customer}</DetailLine><DetailLine label="Phone">{selected.customerPhone}</DetailLine><DetailLine label="Drop-off">{selected.destination.name}</DetailLine><DetailLine label="County">{selected.destination.county}</DetailLine></div>}
     {detailTab==="merchant"&&<div className="dn-detail-lines"><DetailLine label="Merchant">{selected.merchant}</DetailLine><DetailLine label="Pickup">{selected.pickup.name}</DetailLine><DetailLine label="County">{selected.pickup.county}</DetailLine></div>}
     {detailTab==="rider"&&<div className="dn-detail-lines"><DetailLine label="Rider">{assigned?.name||"Unassigned"}</DetailLine><DetailLine label="Vehicle">{assigned?.vehicle||"—"}</DetailLine><DetailLine label="Status"><Chip value={assigned?.status}/></DetailLine><DetailLine label="Contact">{assigned?.phone||"—"}</DetailLine></div>}
     <div className="dn-dispatch-actions">
      {selected.riderId && isActive(selected) && canManage&&<button className="dn-btn outline" onClick={()=>{setReason("");setModal("unassign");}}>Reassign Rider</button>}
      {!selected.riderId && isActive(selected) && canManage&&<button className="dn-btn primary" onClick={()=>openAssign()}>Assign Rider</button>}
      {selected.riderId && isActive(selected) && selected.status!=="DELAYED" && canManage &&<button className="dn-btn primary" onClick={()=>setModal("advance")}>{selected.status==="RIDER_ASSIGNED"?"Confirm Pickup":selected.status==="PICKED_UP"?"Start Delivery":"Mark Delivered"}</button>}
      <button className="dn-btn red" onClick={()=>navigate("incidents")}><AlertTriangle size={14}/> Escalate Issue</button>
     </div>
    </>:<Empty label="Select a delivery from the queue"/>}
   </Card>
  </div>
  <Card title={"Available Riders ("+eligible.length+")"} desc="Riders online, verified, and available for new deliveries" className="dn-rider-strip">
   <div className="dn-right-filters"><SearchBox placeholder="Search riders..." value={riderSearch} onChange={setRiderSearch}/><SelectBox label="Rider availability" value={riderFilter} onChange={setRiderFilter} options={[{value:"available",label:"Available"},{value:"delivery",label:"On Delivery"},{value:"offline",label:"Offline"},{value:"all",label:"All statuses"}]}/></div>
   <div className="dn-table-scroll"><table className="dn-table"><thead><tr><th>Rider</th><th>Status</th><th>Location</th><th>Orders Today</th><th>Rating</th><th>Vehicle</th><th>Actions</th></tr></thead><tbody>{riders.slice(0,6).map(r=><tr key={r.id}><td><div className="dn-cell-person"><Initials name={r.name}/><b>{r.name}</b></div></td><td><Chip value={r.status}/></td><td>{r.area.name}</td><td>{r.deliveries}</td><td className="dn-rating">★ {r.rating.toFixed(1)}</td><td>{r.vehicle} ({r.plate})</td><td><button className="dn-mini-primary" disabled={!canManage||r.status!=="AVAILABLE"||!selected||Boolean(selected.riderId)} onClick={()=>openAssign(r.id)}>Assign Order</button></td></tr>)}</tbody></table></div>
   {riders.length===0&&<Empty/>}
  </Card>
  {modal==="assign"&&selected&&<Modal title="Assign an eligible rider" subtitle={"Order #"+selected.id+" · "+selected.merchant} onClose={()=>setModal(null)} onConfirm={confirm} disabled={!chosenRider} confirmText="Confirm assignment"><p>Only currently available, verified riders can be selected in this frontend workflow.</p><label className="dn-field">Eligible rider<select aria-label="Eligible rider" value={chosenRider} onChange={e=>setChosenRider(e.target.value)}><option value="">Select rider</option>{eligible.map(r=><option key={r.id} value={r.id}>{r.name} · {r.area.name} · {r.vehicle}</option>)}</select></label><div className="dn-modal-info">Assignment updates both the order timeline and the rider's availability.</div></Modal>}
  {modal==="unassign"&&selected&&<Modal title="Release rider from delivery" subtitle={"Order #"+selected.id} danger confirmText="Release rider" disabled={reason.trim().length<3} onClose={()=>setModal(null)} onConfirm={confirm}><p>This sends the order back to the unassigned queue. The rider becomes available.</p><label className="dn-field">Required reason<textarea aria-label="Release reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason for reassignment"/></label></Modal>}
  {modal==="advance"&&selected&&<Modal title="Confirm delivery milestone" subtitle={"Order #"+selected.id} confirmText="Update order" onClose={()=>setModal(null)} onConfirm={confirm}><p>This is a simulated operator action. The next milestone will appear in Orders & Deliveries and the Command Center immediately.</p></Modal>}
 </div>;
}
