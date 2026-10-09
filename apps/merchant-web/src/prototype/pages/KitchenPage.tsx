import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, CheckCircle2, ChefHat, ChevronDown, ChevronRight, Clock3, Phone, ShoppingCart, Timer, Truck, Utensils, X } from "lucide-react";
import { cash, useDemo, type Order, type OrderStage } from "../model";
import { CountTile, Field, HeaderTitle, Modal, Pill } from "../MerchantPrototype";
type KitchenProps={search:string;navigate:(page:string)=>void};
const lanes:{id:OrderStage;title:string;subtitle:string;icon:React.ElementType}[]=[
{id:"new",title:"New orders",subtitle:"Respond first",icon:ShoppingCart},
{id:"preparing",title:"Preparing",subtitle:"In the kitchen",icon:ChefHat},
{id:"ready",title:"Ready for pickup",subtitle:"Waiting for Rider",icon:CheckCircle2},
{id:"completed",title:"Completed",subtitle:"Picked up & delivered",icon:CheckCircle2}
];
export function KitchenPage({search,navigate}:KitchenProps){
 const {data,update,announce}=useDemo();
 const [tab,setTab]=useState("all");
 const [period,setPeriod]=useState("Today");
 const [sort,setSort]=useState("Oldest first");
 const [accept,setAccept]=useState<Order|null>(null);
 const [decline,setDecline]=useState<Order|null>(null);
 const [prep,setPrep]=useState("20");
 const [reason,setReason]=useState("Kitchen unavailable");
 const [selected,setSelected]=useState<Order|null>(null);
 const [minutes,setMinutes]=useState(0);
 useEffect(()=>{const i=setInterval(()=>setMinutes(v=>v+1),60000);return()=>clearInterval(i);},[]);
 const counts=(stage:OrderStage)=>data.orders.filter(o=>o.stage===stage).length;
 const visible=useMemo(()=>data.orders.filter(o=>["new","preparing","ready","completed"].includes(o.stage)).filter(o=>!search||[o.id,o.customer,o.items,o.rider||""].some(t=>t.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>sort==="Oldest first"?b.elapsed-a.elapsed:a.elapsed-b.elapsed),[data.orders,sort,search]);
 const transition=(id:string,stage:OrderStage,patch:Partial<Order>={})=>{
 update(p=>({...p,orders:p.orders.map(o=>o.id===id?{...o,...patch,stage}:o)}));
 announce("#"+id+" moved to "+stage+" (local prototype)");
 setSelected(null);
 };
 const countAll=data.orders.filter(o=>o.stage!=="declined").length;
 return <div className="mp-page mp-orders-page">
 <HeaderTitle eyebrow="Live service" title="Kitchen orders" description="Prepare and manage incoming orders in real time. Oldest orders appear first."/>
 <div className="mp-stat-grid">
 <CountTile icon={ShoppingCart} label="New orders" value={counts("new")} caption="Waiting for acceptance" accent="red" action={()=>setTab("new")}/>
 <CountTile icon={ChefHat} label="Preparing" value={counts("preparing")} caption="In the kitchen" accent="orange" action={()=>setTab("preparing")}/>
 <CountTile icon={CheckCircle2} label="Ready" value={counts("ready")} caption="Waiting for Rider pickup" accent="mint" action={()=>setTab("ready")}/>
 <CountTile icon={Timer} label="Avg. prep time" value="18 min" caption="↓ 12% vs. last week · demo metric" accent="blue" action={()=>announce("Performance graph needs analytics backend; keeping the complete design.")}/>
 </div>
 <div className="mp-list-toolbar"><div className="mp-tabs" role="group" aria-label="Order filters">{[["all","All",countAll],["new","New",counts("new")],["preparing","Preparing",counts("preparing")],["ready","Ready",counts("ready")],["completed","Completed",counts("completed")]].map(([key,label,count])=><button key={key} className={tab===key?"active":""} aria-pressed={tab===key} onClick={()=>setTab(String(key))}>{label} ({count})</button>)}</div>
 <div className="mp-toolbar-end"><label className="mp-select-control"><CalendarDays size={18}/><select aria-label="Filter order date" value={period} onChange={e=>{setPeriod(e.target.value);announce("Showing "+e.target.value+" (demo records)");}}><option>Today</option><option>Yesterday</option><option>This week</option><option>This month</option></select><ChevronDown size={15}/></label>
 <label className="mp-select-control"><span>⇅</span><select aria-label="Sort orders" value={sort} onChange={e=>setSort(e.target.value)}><option>Oldest first</option><option>Newest first</option></select><ChevronDown size={15}/></label></div></div>
 <div className={"mp-order-board "+(tab!=="all"?"mp-order-board-filtered":"")}>
 {lanes.filter(l=>tab==="all"||tab===l.id).map(lane=>{const Icon=lane.icon;const rows=visible.filter(o=>o.stage===lane.id);return <section key={lane.id} className={"mp-order-lane mp-lane-"+lane.id}>
 <header className="mp-lane-header"><div className="mp-lane-symbol"><Icon size={25}/></div><div><h2>{lane.title}</h2><p>{lane.subtitle}</p></div><span className="mp-lane-count">{rows.length}</span></header>
 {rows.length?rows.map(order=><article className="mp-order-card" key={order.id}>
 <div className="mp-order-card-title"><button onClick={()=>setSelected(order)}>#{order.id}</button><time>{order.time}</time></div>
 {lane.id==="new"&&<div className="mp-urgent"><Clock3 size={18}/><div><strong>Waiting {order.elapsed+minutes} min</strong><small>Respond asap</small></div></div>}
 <p className="mp-order-person"><span>♙</span> {order.customer}<a href={"tel:"+order.phone.replace(/[^+0-9]/g,"")} title={"Call "+order.customer} aria-label={"Call "+order.customer}><Phone size={17}/></a></p>
 <div className="mp-order-line"><span>♧ {order.items}</span><strong>{cash(order.amount)}</strong></div>
 {lane.id==="new"&&<><div className="mp-order-instructions">{order.instructions||"No special instructions"}</div><div className="mp-order-actions"><button className="mp-danger-lite" onClick={()=>{setDecline(order);setReason("Kitchen unavailable");}}>Decline</button><button className="mp-primary" onClick={()=>{setAccept(order);setPrep("20");}}>Accept & set prep time</button></div></>}
 {lane.id==="preparing"&&<><div className="mp-progress-note"><Timer size={16}/> Preparing · {order.prepMinutes||20} minute target</div><button className="mp-primary mp-full" onClick={()=>transition(order.id,"ready")}>Mark ready for pickup</button></>}
 {lane.id==="ready"&&<><div className="mp-rider-state"><Pill tone="blue">✓ Rider assigned</Pill><small>{order.eta||"Pickup pending"}</small></div><div className="mp-rider-row"><Truck size={18}/> {order.rider||"Assigning rider"}<strong>{order.handover}</strong></div><button className="mp-outline mp-full" onClick={()=>{setSelected(order);}}>Mark as picked up</button></>}
 {lane.id==="completed"&&<Pill tone="green">✓ Picked up</Pill>}
 </article>):<div className="mp-lane-empty"><div className="mp-empty-icon"><Icon size={33}/></div><h3>{lane.id==="preparing"?"No orders in preparation":lane.id==="completed"?"No completed orders yet":lane.id==="new"?"No new orders":"No orders ready yet"}</h3><p>{lane.id==="preparing"?"Accepted orders will appear here. Set preparation time to keep customers informed.":lane.id==="completed"?"Orders will move here after pickup to keep your board clean.":"Orders in this stage will appear here."}</p></div>}
 </section>})}
 </div>
 <Modal open={Boolean(accept)} title={"Accept order #"+(accept?.id||"")} onClose={()=>setAccept(null)}>
 <p className="mp-muted">Confirm acceptance and tell the kitchen how much time is required. The order will move to Preparing.</p>
 <div className="mp-modal-order-summary"><strong>{accept?.customer}</strong><span>{accept?.items} — {cash(accept?.amount||0)}</span></div>
 <Field label="Preparation time (minutes)"><select value={prep} onChange={e=>setPrep(e.target.value)}><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="20">20 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></Field>
 <div className="mp-dialog-actions"><button className="mp-outline" onClick={()=>setAccept(null)}>Cancel</button><button className="mp-primary" onClick={()=>{if(accept)transition(accept.id,"preparing",{prepMinutes:Number(prep)});setAccept(null);}}><Check size={17}/> Accept order</button></div>
 </Modal>
 <Modal open={Boolean(decline)} title={"Decline order #"+(decline?.id||"")} onClose={()=>setDecline(null)}>
 <p className="mp-muted">Declining this order will remove it from the active kitchen queue in this demo. This action requires confirmation.</p>
 <Field label="Reason"><select value={reason} onChange={e=>setReason(e.target.value)}><option>Kitchen unavailable</option><option>Item out of stock</option><option>Closing soon</option><option>Other</option></select></Field>
 <div className="mp-dialog-actions"><button className="mp-outline" onClick={()=>setDecline(null)}>Cancel</button><button className="mp-danger" onClick={()=>{if(decline)transition(decline.id,"declined",{instructions:"Declined: "+reason});setDecline(null);}}>Decline order</button></div>
 </Modal>
 <Modal open={Boolean(selected)} title={"Order #"+(selected?.id||"")} onClose={()=>setSelected(null)}>
 <div className="mp-detail-stack"><div><small>Customer</small><strong>{selected?.customer}</strong></div><div><small>Items</small><strong>{selected?.items}</strong></div><div><small>Total</small><strong>{cash(selected?.amount||0)}</strong></div><div><small>Rider</small><strong>{selected?.rider||"Not assigned"}</strong></div><div><small>Handover code</small><strong>{selected?.handover}</strong></div></div>
 {selected?.stage==="ready"&&<><p className="mp-muted">Pickup confirmation is shown here as a prototype interaction. Production pickup authorization will be mapped to the Rider/dispatch workflow.</p><div className="mp-dialog-actions"><button className="mp-outline" onClick={()=>setSelected(null)}>Cancel</button><button className="mp-primary" onClick={()=>selected&&transition(selected.id,"completed")}>Confirm picked up (demo)</button></div></>}
 </Modal>
 </div>;
}
