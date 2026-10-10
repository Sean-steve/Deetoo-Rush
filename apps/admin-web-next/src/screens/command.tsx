import React,{useMemo,useState} from "react";
import {Activity, AlertTriangle, ArrowRight, Bike, CalendarDays, CheckCircle2, Clock3, Headphones, MapPin, Package, ShieldAlert, ShoppingCart, TrendingUp, Users} from "lucide-react";
import {DemoState, isActive, formatMoney, areas, orderTotal} from "../data";
import {Bars, Card, Chip, DemoMap, DetailLine, Empty, IconStat, Ring, SelectBox, Tabs, TimeSeries} from "../ui";
export function CommandScreen({data,navigate,county}:{data:DemoState;navigate:(id:string)=>void;county:string}){
 const [period,setPeriod]=useState("today");const [zone,setZone]=useState("Nairobi");
 const [layers,setLayers]=useState({riders:true,orders:true,merchants:true});
 const matching=data.orders.filter(o=>county==="all"||o.pickup.county===county);
 const filtered=data.riders.filter(r=>county==="all"||r.area.county===county);
 const active=matching.filter(isActive),completed=matching.filter(o=>o.status==="DELIVERED");
 const delayed=matching.filter(o=>o.status==="DELAYED"),online=filtered.filter(r=>r.status==="AVAILABLE"||r.status==="ON_DELIVERY");
 const avail=filtered.filter(r=>r.status==="AVAILABLE");
 const subsets=useMemo(()=>Array.from({length:24},(_,h)=>Math.max(0,Math.round(matching.filter((_,i)=>i%24===h).length * (period==="today"?1:period==="week"?2:3)))),[matching.length,period]);
 const statuses=["PREPARING","RIDER_ASSIGNED","PICKED_UP","IN_TRANSIT","DELIVERED","DELAYED","CANCELLED"];
 const areaRanking=areas.map(area=>({name:area.name,count:matching.filter(o=>o.area===area.name).length})).sort((a,b)=>b.count-a.count).slice(0,5);
 return <div className="dn-screen" data-testid="screen-command">
   <div className="dn-title-row dn-command-heading"><div><h1>Good morning, Admin 👋</h1><p>Here's what's happening with DeeToo Rush today.</p></div><div className="dn-period-head"><div><span>Thursday, 9 Oct 2026 · Demo snapshot</span><strong>10:24 AM</strong></div><Tabs value={period} onChange={setPeriod} tabs={[{key:"live",label:"Live"},{key:"today",label:"Today"},{key:"week",label:"7 Days"},{key:"month",label:"30 Days"}]} ariaLabel="Dashboard reporting period"/></div></div>
   <div className="dn-metrics eight">
     <IconStat label="Active Orders" value={active.length} change="↑ In demo" icon={<ShoppingCart/>}/>
     <IconStat label="Completed Deliveries" value={completed.length} change="↑ In demo" icon={<CheckCircle2/>}/>
     <IconStat label="Completion Rate" value={(matching.length?Math.round(completed.length/matching.length*100):0)+"%"} change="✓ From current records" icon={<Clock3/>} tone="blue"/>
     <IconStat label="Active Riders" value={online.length} change="↑ Available + delivering" icon={<Users/>} tone="blue"/>
     <IconStat label="Available Riders" value={avail.length} change="Ready for dispatch" icon={<Bike/>}/>
     <IconStat label="Delayed Deliveries" value={delayed.length} change="↑ Need attention" icon={<AlertTriangle/>} tone="red"/>
     <IconStat label="Open Incidents" value={data.phase2.incidents.length} change="Investigation queue" icon={<ShieldAlert/>} tone="red"/>
     <IconStat label="Open Support Cases" value={data.phase2.support.filter(t=>!["RESOLVED","CLOSED"].includes(t.status)).length} change="Conversation queue" icon={<Headphones/>} tone="blue"/>
   </div>
   <div className="dn-command-grid">
    <Card title="Live Operations Map" desc="Demo rider & order tracking across Kenya" action={<SelectBox value={zone} onChange={setZone} label="Map demo area" options={[{value:"Nairobi",label:"Nairobi"},{value:"Kiambu",label:"Kiambu"},{value:"Kajiado",label:"Kajiado"}]}/>} className="dn-ops-map">
      <DemoMap height={389} orders={active.filter(o=>o.pickup.county===zone || zone==="Nairobi").slice(0,25)} riders={avail.filter(r=>r.area.county===zone || zone==="Nairobi")} layers={layers} onSelectOrder={()=>navigate("dispatch")}/>
      <div className="dn-map-layer-toggles">{([{key:"riders",label:"Riders ("+avail.length+")"},{key:"orders",label:"Orders ("+active.length+")"},{key:"merchants",label:"Merchants"}] as const).map(x=><label key={x.key}><input type="checkbox" checked={layers[x.key]} onChange={e=>setLayers(v=>({...v,[x.key]:e.target.checked}))}/>{x.label}</label>)}</div>
    </Card>
    <div className="dn-command-centercol">
     <Card title="Order Volume" desc="Orders represented by demo timestamps" action={<SelectBox label="Chart period" value={period} onChange={setPeriod} options={[{value:"live",label:"Recent"},{value:"today",label:"Today"},{value:"week",label:"7 days"},{value:"month",label:"30 days"}]}/>}>
       <TimeSeries values={subsets} fill color="#04ad60"/><div className="dn-legend"><span className="g">● Received</span><span className="b">● Completed</span><span className="r">● Delayed</span></div>
     </Card>
     <Card title="Revenue Overview" desc="Total order values in the seeded demo" action={<button className="dn-text-btn" onClick={()=>navigate("orders")}>View orders <ArrowRight size={13}/></button>}>
       <div className="dn-revenue-row"><strong>{formatMoney(matching.reduce((a,o)=>a+orderTotal(o),0))}</strong><span>Based on {matching.length} demo orders</span></div>
       <Bars values={subsets.filter((_,i)=>i%2===0)} labels={["12AM","","4AM","","8AM","","12PM","","4PM","","8PM","",""]} color="#1683fb"/>
       <div className="dn-revenue-side"><span>Customer payments</span><b>{formatMoney(matching.filter(o=>o.paymentStatus==="Paid").reduce((a,o)=>a+orderTotal(o),0))}</b></div>
     </Card>
    </div>
    <div className="dn-command-sidecol">
     <Card title="Platform Status" desc="Frontend demo services" action={<span className="dn-inline-demo">Preview only</span>}>
      <div className="dn-system-lines">{["Ordering Interface","Payment Simulation","Dispatch Logic","Local Persistence","Notification Demo","Reporting Views"].map(x=><div key={x}><CheckCircle2 size={14}/><span>{x}</span><strong>Demo ready</strong></div>)}</div>
      <button className="dn-text-btn aligned-right" onClick={()=>navigate("system")}>View Details <ArrowRight size={13}/></button>
     </Card>
     <Card title="Top Performing Areas" desc="By order volume" action={<span className="dn-inline-demo">Orders</span>}>
      <div className="dn-top-areas">{areaRanking.map((x,i)=><div key={x.name}><b>{i+1}</b><span>{x.name}</span><strong>{x.count}</strong><TrendingUp size={13}/></div>)}</div>
      <button className="dn-text-btn aligned-right" onClick={()=>navigate("geography")}>View all areas <ArrowRight size={13}/></button>
     </Card>
    </div>
   </div>
   <div className="dn-command-bottom">
    <Card title={"Delayed Deliveries ("+delayed.length+")"} desc="Require attention" action={<button className="dn-text-btn" onClick={()=>navigate("dispatch")}>View all <ArrowRight size={13}/></button>}>
      {delayed.length?<table className="dn-table compact"><thead><tr><th>Order #</th><th>Delayed</th><th>Merchant</th><th>Rider</th><th>Status</th></tr></thead><tbody>{delayed.slice(0,5).map(o=><tr key={o.id} tabIndex={0} onClick={()=>navigate("dispatch")} onKeyDown={e=>e.key==="Enter"&&navigate("dispatch")}><td>#{o.id}</td><td className="danger-text">{o.delayMinutes} mins</td><td>{o.merchant}</td><td>{data.riders.find(r=>r.id===o.riderId)?.name||"Unassigned"}</td><td><Chip value={o.status}/></td></tr>)}</tbody></table>:<Empty label="No delayed deliveries"/>}
    </Card>
    <Card title={"Recent Incidents ("+data.phase2.incidents.length+")"} desc="Need investigation" action={<button className="dn-text-btn" onClick={()=>navigate("incidents")}>View all <ArrowRight size={13}/></button>}>
      <table className="dn-table compact"><thead><tr><th>Time</th><th>Type</th><th>Description</th><th>Status</th></tr></thead><tbody>{data.phase2.incidents.map(x=><tr key={x.id} onClick={()=>navigate("incidents")}><td>{displayTime(x.createdAt)}</td><td>{x.type}</td><td>{x.title}</td><td><Chip value={x.status}/></td></tr>)}</tbody></table>
    </Card>
    <Card title="Recent Support Cases" desc="Open conversations" action={<button className="dn-text-btn" onClick={()=>navigate("support")}>View all <ArrowRight size={13}/></button>}>
     <table className="dn-table compact"><thead><tr><th>Time</th><th>From</th><th>Subject</th><th>Status</th></tr></thead><tbody>{data.phase2.support.map(x=><tr key={x.id} onClick={()=>navigate("support")}><td>{displayTime(x.createdAt)}</td><td>{x.participantType}</td><td>{x.subject}</td><td><Chip value={x.status}/></td></tr>)}</tbody></table>
    </Card>
   </div>
 </div>;
}
