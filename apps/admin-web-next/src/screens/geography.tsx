import React,{useMemo,useState} from "react";
import {Activity, AlertTriangle, ArrowRight, Bike, CheckCircle2, ClipboardList, Clock3, Map, MapPin, Plus, Search, Settings2, Store, Truck, Users} from "lucide-react";
import {useDemo,canAct} from "../store";
import {Card,Chip,DetailLine,Empty,IconStat,Modal,SearchBox,SelectBox,Tabs} from "../ui";
import {KENYA_COUNTIES,amount} from "../phase3Data";
export function GeographyScreen({navigate,county,toast}:{navigate:(screen:string)=>void;county:string;toast:(message:string)=>void}){
 const {data,act,role}=useDemo(),model=data.phase3,allowed=canAct(role,"geography");
 const [selected,setSelected]=useState(county==="all"?"Nairobi":county),[query,setQuery]=useState(""),[filter,setFilter]=useState("all"),[tab,setTab]=useState("coverage");
 const [modal,setModal]=useState<"coverage"|"rules"|"zone"|"zone-status"|null>(null),[reason,setReason]=useState(""),[targetEnabled,setTargetEnabled]=useState(false),[targetZone,setTargetZone]=useState(""),[fee,setFee]=useState("200"),[eta,setEta]=useState("45"),[newName,setNewName]=useState(""),[notes,setNotes]=useState("");
 const selectedCounty=model.coverage.find(x=>x.county===selected)||model.coverage.find(x=>x.county==="Nairobi")!;
 const zones=model.zones.filter(z=>z.county===selected);
 const relatedOrders=data.orders.filter(o=>o.pickup.county===selected),onlineRiders=data.riders.filter(r=>r.area.county===selected&&["AVAILABLE","ON_DELIVERY"].includes(r.status)),merchants=data.phase2.merchants.filter(m=>m.branches.some(b=>b.county===selected&&b.status==="ACTIVE"));
 const active=model.coverage.filter(c=>c.enabled).length;
 const visible=model.coverage.filter(c=>(filter==="all"||filter==="enabled"&&c.enabled||filter==="paused"&&!c.enabled)&&c.county.toLowerCase().includes(query.toLowerCase()));
 const conflicts=relatedOrders.filter(o=>o.status!=="DELIVERED"&&o.status!=="CANCELLED"&&!selectedCounty.enabled);
 const beginToggle=(enabled:boolean)=>{setTargetEnabled(enabled);setReason("");setModal("coverage");};
 const editRules=()=>{setFee(String(selectedCounty.fee));setEta(String(selectedCounty.eta));setReason("");setModal("rules");};
 const zoneModal=(id:string,enabled:boolean)=>{setTargetZone(id);setTargetEnabled(enabled);setReason("");setModal("zone-status");};
 const createZone=()=>{setNewName("");setNotes("");setFee(String(selectedCounty.fee));setEta(String(selectedCounty.eta));setModal("zone");};
 const save=()=>{
  if(!allowed)return;
  if(modal==="coverage"){if(reason.trim().length<3)return;act({type:"PHASE3_COVERAGE",county:selected,enabled:targetEnabled,reason});toast(selected+" coverage "+(targetEnabled?"enabled":"paused")+" for new simulated deliveries.");}
  if(modal==="rules"){if(!Number.isInteger(Number(fee))||Number(fee)<0||!Number.isInteger(Number(eta))||Number(eta)<5||Number(eta)>360||reason.trim().length<3)return;act({type:"PHASE3_COVERAGE_CONFIG",county:selected,fee:Number(fee),eta:Number(eta),reason});toast("County operating rules updated.");}
  if(modal==="zone"){if(newName.trim().length<3||Number(fee)<0||Number(eta)<5||model.zones.some(z=>z.county===selected&&z.name.toLowerCase()===newName.trim().toLowerCase()))return;act({type:"PHASE3_ZONE_CREATE",county:selected,name:newName,fee:Number(fee),eta:Number(eta),notes});toast("Service zone added to "+selected+".");}
  if(modal==="zone-status"){if(reason.trim().length<3)return;act({type:"PHASE3_ZONE_STATUS",id:targetZone,enabled:targetEnabled,reason});toast("Service zone updated.");}
  setModal(null);
 };
 const barHeight=(index:number)=>16+((index*17)%75);
 const coveragePoints=model.coverage.map((c,i)=>({county:c.county,enabled:c.enabled,x:10+(i%8)*11.1+(i%3)*1.5,y:12+Math.floor(i/8)*13.9+(i%4)*2.0}));
 const selectedZone=model.zones.find(z=>z.id===targetZone);
 return <div className="dn-screen" data-testid="screen-geography">
  <div className="dn-title-row"><div><h1>Geography & Service Coverage</h1><p>Control where DeeToo operates across Kenya, with county, zone and delivery rules.</p></div><div className="dn-title-buttons"><button className="dn-btn outline" onClick={()=>setTab("activity")}><ClipboardList size={15}/> Change History</button><button className="dn-btn primary" disabled={!allowed} onClick={createZone}><Plus size={15}/> Add Service Zone</button></div></div>
  <div className="dn-metrics five">
   <IconStat label="Kenya Counties" value={KENYA_COUNTIES.length} icon={<Map/>} foot="National register"/>
   <IconStat label="Service Enabled" value={active} icon={<CheckCircle2/>} foot="County-wide switches"/>
   <IconStat label="Coverage Paused" value={model.coverage.length-active} tone="amber" icon={<AlertTriangle/>}/>
   <IconStat label="Configured Zones" value={model.zones.length} tone="blue" icon={<MapPin/>}/>
   <IconStat label="Orders in Selected County" value={relatedOrders.length} tone="blue" icon={<Truck/>} foot="Historical + active demo"/>
  </div>
  <Tabs value={tab} onChange={setTab} ariaLabel="Geography workspace" tabs={[{key:"coverage",label:"County Coverage"},{key:"zones",label:"Service Zones ("+model.zones.length+")"},{key:"rules",label:"Delivery Rules"},{key:"activity",label:"Change History"}]}/>
  <div className="dn-geo-grid">
   <Card title="Counties & Availability" desc="47 counties · select to inspect or edit" className="dn-geo-directory">
    <div className="dn-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search a county..."/><SelectBox label="Coverage filter" value={filter} onChange={setFilter} options={[{value:"all",label:"All Counties"},{value:"enabled",label:"Enabled"},{value:"paused",label:"Paused"}]}/></div>
    <div className="dn-geo-county-list">{visible.map(c=><button key={c.county} onClick={()=>setSelected(c.county)} className={"dn-geo-county "+(c.county===selected?"selected":"")}><span className={"dn-geo-led "+(c.enabled?"on":"off")}></span><span>{c.county}</span><Chip value={c.enabled?"Enabled":"Paused"}/><span className="dn-geo-arrow">›</span></button>)}{!visible.length&&<Empty label="No counties match these filters"/>}</div>
    <div className="dn-geo-summary"><strong>{active} / 47 counties</strong><span>Enabled for new simulated requests</span><div className="dn-geo-progress"><div style={{width:active/47*100+"%"}}/></div></div>
   </Card>
   <div className="dn-geo-middle">
    <Card title="Kenya — Coverage Overview" desc="Schematic county status visualization · not a legal boundary map" action={<span className="dn-inline-demo">● Frontend simulation</span>}>
     <div className="dn-geo-map">
      <svg aria-hidden="true" viewBox="0 0 600 500" preserveAspectRatio="xMidYMid meet"><rect width="600" height="500" fill="#edf3ec"/><g fill="#d5e8d8" stroke="#c1d8c9" strokeWidth="1"><path d="M195 18 260 45 320 25 397 95 480 155 452 248 529 320 450 414 328 482 277 444 221 467 166 390 115 368 87 278 118 198 105 118Z"/><path d="M170 105 310 70 390 140 310 205 197 188Z"/><path d="M125 223 260 200 305 330 220 401 106 329Z"/></g><path d="M140 104 300 230 380 350 466 382M110 255 272 265 410 200M226 74 252 198 319 357 277 440" fill="none" stroke="white" strokeWidth="9" opacity=".75"/><path d="M125 310 250 259 376 333" fill="none" stroke="#c1dbe7" strokeWidth="13"/><text x="315" y="285" fontSize="22" fontWeight="bold" textAnchor="middle" fill="#5b7e74">KENYA</text><text x="325" y="309" fontSize="11" textAnchor="middle" fill="#71968b">Illustrative coverage overview</text></svg>
      {coveragePoints.map(p=><button key={p.county} title={p.county+(p.enabled?" · enabled":" · paused")} aria-label={"Select "+p.county} onClick={()=>setSelected(p.county)} style={{left:p.x+"%",top:p.y+"%"}} className={"dn-geo-pin "+(p.enabled?"enabled":"paused")+" "+(p.county===selected?"selected":"")} />)}
      <div className="dn-geo-map-legend"><span>● Enabled</span><span>● Paused</span><span>◎ Selected</span></div>
     </div>
    </Card>
    <div className="dn-geo-middle-bottom">
     <Card title="Delivery Readiness" desc={"Live-style demo indicators for "+selected}><div className="dn-geo-readiness"><div><Store size={20}/><b>{merchants.length}</b><span>Merchants</span></div><div><Bike size={20}/><b>{onlineRiders.length}</b><span>Active riders</span></div><div><Truck size={20}/><b>{relatedOrders.length}</b><span>Orders</span></div></div><p className="dn-helper">These counts reflect existing mock participants. Pausing coverage does not silently cancel ongoing orders.</p></Card>
     <Card title="Recent Service Changes" action={<button className="dn-text-btn" onClick={()=>setTab("activity")}>View all <ArrowRight size={12}/></button>}><div className="dn-simple-activity">{model.logs.filter(x=>x.action.includes("County")||x.action.includes("zone")||x.action.includes("Coverage")).slice(0,4).map(e=><p key={e.id}>{e.action}: {e.detail}</p>)}{model.logs.length===0&&<p>No geography changes in this demo yet.</p>}</div></Card>
    </div>
   </div>
   <Card className="dn-geo-detail">
    <div className="dn-geo-selected"><MapPin size={22}/><div><h2>{selected} County</h2><Chip value={selectedCounty.enabled?"Enabled":"Paused"}/><p>Kenya · county-level service configuration</p></div></div>
    <div className="dn-geo-action-status"><span>Accept new deliveries</span><button className={"dn-toggle "+(selectedCounty.enabled?"on":"")} role="switch" aria-checked={selectedCounty.enabled} aria-label={"Enable "+selected+" deliveries"} disabled={!allowed} onClick={()=>beginToggle(!selectedCounty.enabled)}><span/></button></div>
    <h3>Service Settings</h3><DetailLine label="Base delivery fee">{amount(selectedCounty.fee)}</DetailLine><DetailLine label="Estimated delivery">{selectedCounty.eta} min (demo)</DetailLine><DetailLine label="Service zones">{zones.length}</DetailLine><DetailLine label="Enabled zones">{zones.filter(z=>z.enabled).length}</DetailLine><DetailLine label="Active orders">{relatedOrders.filter(o=>!["CANCELLED","DELIVERED"].includes(o.status)).length}</DetailLine>
    <button className="dn-btn outline full" onClick={editRules} disabled={!allowed}><Settings2 size={14}/> Edit Delivery Rules</button>
    {conflicts.length>0&&<div className="dn-geo-warning"><AlertTriangle size={16}/>{conflicts.length} in-progress orders were already created. Their lifecycle remains unchanged.</div>}
    <h3>Zones in {selected}</h3><div className="dn-geo-zones">{zones.map(zone=><div key={zone.id}><div><b>{zone.name}</b><small>{amount(zone.fee)} · {zone.eta} min</small></div><Chip value={zone.enabled?"Enabled":"Paused"}/><button aria-label={(zone.enabled?"Pause ":"Enable ")+zone.name} disabled={!allowed} onClick={()=>zoneModal(zone.id,!zone.enabled)}>{zone.enabled?"Pause":"Enable"}</button></div>)}{!zones.length&&<Empty label="No service zones yet"/>}</div>
    <button className="dn-btn primary full" disabled={!allowed} onClick={createZone}><Plus size={14}/> Add Zone to {selected}</button>
   </Card>
  </div>
  {tab==="zones"&&<Card title="All Service Zones" desc="County-level overrides are simulated for future orders"><div className="dn-table-scroll"><table className="dn-table"><thead><tr><th>Zone</th><th>County</th><th>Fee</th><th>ETA</th><th>Status</th><th>County status</th><th>Action</th></tr></thead><tbody>{model.zones.map(z=><tr key={z.id}><td>{z.name}</td><td>{z.county}</td><td>{amount(z.fee)}</td><td>{z.eta} min</td><td><Chip value={z.enabled?"Enabled":"Paused"}/></td><td><Chip value={model.coverage.find(c=>c.county===z.county)?.enabled?"Enabled":"Paused"}/></td><td><button className="dn-smalloutline" onClick={()=>{setSelected(z.county);zoneModal(z.id,!z.enabled);}} disabled={!allowed}>{z.enabled?"Pause":"Resume"}</button></td></tr>)}</tbody></table></div></Card>}
  {tab==="rules"&&<Card title="Delivery Rules & Operational Safety"><div className="dn-geo-rules"><div><h3>Coverage vs. Active Orders</h3><p>New order eligibility follows enabled counties and zones. Previously created orders remain visible in Orders and Dispatch even if an area is paused.</p></div><div><h3>Pricing and ETA</h3><p>County and zone base fees are simulated future-order configuration. No existing order totals or payments are retroactively changed.</p></div><div><h3>Geography Accuracy</h3><p>All county points are illustrative schematic positions, not official county boundaries. GIS, geofencing and accurate mapping will be integrated later.</p></div></div></Card>}
  {tab==="activity"&&<Card title="Coverage Audit History"><div className="dn-table-scroll"><table className="dn-table"><thead><tr><th>Action</th><th>Detail</th><th>Operator</th><th>Date</th></tr></thead><tbody>{model.logs.filter(x=>/County|zone|Coverage/.test(x.action)).map(x=><tr key={x.id}><td>{x.action}</td><td>{x.detail}</td><td>{x.actor}</td><td>{new Date(x.at).toLocaleString("en-KE")}</td></tr>)}</tbody></table></div>{!model.logs.some(x=>/County|zone|Coverage/.test(x.action))&&<Empty label="No coverage history yet"/>}</Card>}
  {modal==="coverage"&&<Modal title={(targetEnabled?"Enable":"Pause")+" county coverage"} subtitle={selected+" · applies to new demo requests only"} onClose={()=>setModal(null)} onConfirm={save} disabled={!allowed||reason.trim().length<3} danger={!targetEnabled} confirmText={targetEnabled?"Enable county":"Pause county"}><p>Already placed orders will not be removed, cancelled or changed. The new county coverage setting will update immediately across this frontend.</p><label className="dn-field">Required reason<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain the coverage change"/></label></Modal>}
  {modal==="rules"&&<Modal title="Edit county delivery rules" subtitle={selected} onClose={()=>setModal(null)} onConfirm={save} disabled={!allowed||!Number.isInteger(Number(fee))||Number(fee)<0||!Number.isInteger(Number(eta))||Number(eta)<5||Number(eta)>360||reason.trim().length<3} confirmText="Save rules"><label className="dn-field">Base fee (KES)<input type="number" min="0" step="1" value={fee} onChange={e=>setFee(e.target.value)}/></label><label className="dn-field">Estimated delivery (minutes)<input type="number" min="5" max="360" step="1" value={eta} onChange={e=>setEta(e.target.value)}/></label><label className="dn-field">Required reason<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label></Modal>}
  {modal==="zone"&&<Modal title="Add service zone" subtitle={selected+" County · local demo only"} onClose={()=>setModal(null)} onConfirm={save} disabled={!allowed||newName.trim().length<3||Number(fee)<0||Number(eta)<5||model.zones.some(z=>z.county===selected&&z.name.toLowerCase()===newName.trim().toLowerCase())} confirmText="Create zone"><label className="dn-field">Zone name<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Town, neighbourhood or district"/></label><label className="dn-field">Delivery fee (KES)<input type="number" min="0" step="1" value={fee} onChange={e=>setFee(e.target.value)}/></label><label className="dn-field">Estimated delivery (minutes)<input type="number" min="5" step="1" value={eta} onChange={e=>setEta(e.target.value)}/></label><label className="dn-field">Notes<input value={notes} onChange={e=>setNotes(e.target.value)}/></label></Modal>}
  {modal==="zone-status"&&<Modal title={(targetEnabled?"Enable":"Pause")+" service zone"} subtitle={selectedZone?.name} onClose={()=>setModal(null)} onConfirm={save} disabled={!allowed||reason.trim().length<3} danger={!targetEnabled} confirmText="Save zone status"><label className="dn-field">Required reason<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label><p>Existing orders will remain unchanged.</p></Modal>}
 </div>;
}
