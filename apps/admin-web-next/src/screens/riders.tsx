import React,{useEffect,useState} from "react";
import {AlertTriangle, ArrowRight, Bike, CheckCircle2, Clock3, Download, Edit3, FileCheck2, Filter, MapPin, Phone, Plus, Search, ShieldCheck, Truck, UserRound, Users, XCircle} from "lucide-react";
import {Rider,RiderStatus,formatMoney,displayTime} from "../data";
import {useDemo,canAct} from "../store";
import {Bars,Card,Chip,DemoMap,DetailLine,Empty,IconStat,Initials,Modal,Ring,SearchBox,SelectBox,Tabs} from "../ui";
export function RidersScreen({county,navigate,globalSearch,toast}:{county:string;navigate:(s:string)=>void;globalSearch:string;toast:(s:string)=>void}){
 const {data,act,role}=useDemo();
 const [tab,setTab]=useState("overview"),[search,setSearch]=useState(""),[statusFilter,setStatusFilter]=useState("all"),[selectedId,setSelectedId]=useState<string|null>(null);
 const [details,setDetails]=useState("overview"),[page,setPage]=useState(1),[modal,setModal]=useState<"approve"|"reject"|"suspend"|"reactivate"|"add"|null>(null),[reason,setReason]=useState("");
 const [newName,setNewName]=useState(""),[newPhone,setNewPhone]=useState(""),[newArea,setNewArea]=useState("Westlands");
 useEffect(()=>{if(globalSearch)setSearch(globalSearch);},[globalSearch]);
 useEffect(()=>{const id=sessionStorage.getItem("deetoo.demo.focusRider");if(id){setSelectedId(id);setSearch(id);setTab("overview");sessionStorage.removeItem("deetoo.demo.focusRider");}},[]);
 useEffect(()=>setPage(1),[tab,search,statusFilter,county]);
 const all=data.riders.filter(r=>county==="all"||r.area.county===county);
 const shown=all.filter(r=>{
  const tabMatch=tab==="overview"||tab==="performance"||tab==="fleet"||tab==="applications"&&r.onboarding==="PENDING_REVIEW"||tab==="active"&&(r.status==="AVAILABLE"||r.status==="ON_DELIVERY")||tab==="suspended"&&r.status==="SUSPENDED";
  return tabMatch&&(statusFilter==="all"||r.status===statusFilter)&&(r.name+" "+r.id+" "+r.vehicle+" "+r.area.name).toLowerCase().includes(search.toLowerCase());
 });
 const pageRows=shown.slice((page-1)*10,page*10);
 const active=all.filter(r=>r.status==="AVAILABLE"||r.status==="ON_DELIVERY"),available=all.filter(r=>r.status==="AVAILABLE"),delivery=all.filter(r=>r.status==="ON_DELIVERY");
 const offline=all.filter(r=>r.status==="OFFLINE"),suspended=all.filter(r=>r.status==="SUSPENDED"),pending=all.filter(r=>r.onboarding==="PENDING_REVIEW");
 const selected=all.find(r=>r.id===selectedId)||pageRows[0];
 const riderOrders=selected?data.orders.filter(o=>o.riderId===selected.id):[];
 const canManage=canAct(role,"rider");
 const doAction=()=>{
  if(!canManage)return;
  if(modal==="add"){if(newName.trim().length<3||newPhone.trim().length<8)return;act({type:"ADD_RIDER",name:newName.trim(),phone:newPhone.trim(),area:newArea});toast("New rider added to onboarding review.");setTab("applications");setSearch("");setSelectedId(null);}
  else if(selected){
   if(reason.trim().length<3)return;
   if(modal==="approve"||modal==="reject")act({type:"REVIEW_RIDER",riderId:selected.id,approved:modal==="approve",reason});
   if(modal==="suspend")act({type:"UPDATE_RIDER",riderId:selected.id,status:"SUSPENDED",reason});
   if(modal==="reactivate")act({type:"UPDATE_RIDER",riderId:selected.id,status:"OFFLINE",reason});
   toast("Rider action saved in the local demo.");
  }
  setModal(null);setReason("");setNewName("");setNewPhone("");
 };
 const exportRiders=()=>{const csv=["ID,Name,Phone,Status,Verification,Vehicle,Area",...shown.map(r=>[r.id,r.name,r.phone,r.status,r.onboarding,r.vehicle,r.area.name].map(v=>'"'+v.replaceAll('"','""')+'"').join(","))].join("\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="deetoo-demo-riders.csv";a.click();URL.revokeObjectURL(url);toast("Rider demo records exported.");};
 return <div className="dn-screen" data-testid="screen-riders">
  <div className="dn-title-row"><div><h1>Riders & Fleet</h1><p>Manage rider onboarding, availability, performance and fleet operations.</p></div><div className="dn-title-buttons"><button className="dn-btn outline" onClick={exportRiders}><Download size={15}/> Export</button><button className="dn-btn primary" disabled={!canManage} onClick={()=>setModal("add")}><Plus size={16}/> Add Rider</button></div></div>
  <div className="dn-metrics six">
   <IconStat label="Total Riders" value={all.length} icon={<Users/>} change="Demo directory"/>
   <IconStat label="Online Now" value={available.length} icon={<CheckCircle2/>} change="Ready for dispatch"/>
   <IconStat label="On Delivery" value={delivery.length} icon={<Bike/>} tone="blue" change="Currently assigned"/>
   <IconStat label="Offline" value={offline.length} icon={<UserRound/>} tone="grey" change="Not accepting orders"/>
   <IconStat label="New Applications" value={pending.length} icon={<Clock3/>} tone="amber" change="Awaiting review"/>
   <IconStat label="Suspended" value={suspended.length} icon={<AlertTriangle/>} tone="red" change="Requires attention"/>
  </div>
  <Tabs value={tab} onChange={setTab} ariaLabel="Rider sections" tabs={[{key:"overview",label:"Riders Overview"},{key:"applications",label:"Applications ("+pending.length+")"},{key:"active",label:"Active Riders ("+active.length+")"},{key:"suspended",label:"Suspended ("+suspended.length+")"},{key:"performance",label:"Performance"},{key:"fleet",label:"Fleet & Vehicles"}]}/>
  <div className="dn-riders-workspace">
   <Card className="dn-riders-directory" title="Riders">
    <div className="dn-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search riders..."/><button className="dn-iconbutton" title="Clear filters" aria-label="Clear rider filters" onClick={()=>{setSearch("");setStatusFilter("all");}}><Filter size={15}/></button><SelectBox label="Rider status" value={statusFilter} onChange={setStatusFilter} options={[{value:"all",label:"All Statuses"},{value:"AVAILABLE",label:"Available"},{value:"ON_DELIVERY",label:"On Delivery"},{value:"OFFLINE",label:"Offline"},{value:"SUSPENDED",label:"Suspended"}]}/></div>
    <div className="dn-table-scroll"><table className="dn-table dn-rider-table"><thead><tr><th>Rider</th><th>Status</th><th>Location</th><th>Deliveries</th><th>Rating</th><th></th></tr></thead><tbody>{pageRows.map(r=><tr key={r.id} className={selected?.id===r.id?"selected":""} tabIndex={0} onClick={()=>{setSelectedId(r.id);setDetails("overview");}} onKeyDown={e=>e.key==="Enter"&&setSelectedId(r.id)}><td><div className="dn-cell-person"><Initials name={r.name}/><div><b>{r.name}</b><small>#{r.id}</small></div></div></td><td><Chip value={r.status}/></td><td>{r.area.name}</td><td>{r.deliveries}</td><td className="dn-rating">★ {r.rating.toFixed(1)}</td><td>⋮</td></tr>)}</tbody></table></div>
    {!pageRows.length&&<Empty label="No riders in this view"/>}
    <div className="dn-pagination"><span>Showing {shown.length?(page-1)*10+1:0}–{Math.min(page*10,shown.length)} of {shown.length} riders</span><div><button disabled={page===1} aria-label="Previous page" onClick={()=>setPage(v=>v-1)}>‹</button>{Array.from({length:Math.min(5,Math.ceil(shown.length/10))},(_,i)=><button key={i} className={page===i+1?"selected":""} onClick={()=>setPage(i+1)}>{i+1}</button>)}<button aria-label="Next page" disabled={page*10>=shown.length} onClick={()=>setPage(v=>v+1)}>›</button></div></div>
   </Card>
   <div className="dn-riders-center">
    <Card title="Riders Live on Map" desc={available.length+" available · "+delivery.length+" on delivery · "+offline.length+" offline"} action={<span className="dn-inline-demo">Demo Nairobi</span>}>
      <DemoMap height={362} orders={data.orders.filter(o=>o.riderId)} riders={all.filter(r=>r.status==="AVAILABLE"||r.status==="ON_DELIVERY")} onSelectRider={setSelectedId}/>
      <div className="dn-map-rider-legend"><span>🟢 Available ({available.length})</span><span>🔵 On Delivery ({delivery.length})</span><span>⚪ Offline ({offline.length})</span><span>🔴 Suspended ({suspended.length})</span></div>
    </Card>
    <div className="dn-rider-small-panels">
     <Card title="Rider Performance" desc="Delivery activity represented in the demo"><Bars color="#0dbd71" values={[12,22,15,26,18,30,25,22,34,30,27,22,31,34]} labels={["1","","","","7","","","","14","","","","21","28"]}/></Card>
     <Card title="Fleet & Vehicles"><Ring number={all.length} label="Vehicles" parts={[{name:"Motorbike",value:all.filter(r=>r.vehicle==="Motorbike").length,color:"#00a960"},{name:"Bicycle",value:all.filter(r=>r.vehicle==="Bicycle").length,color:"#f79620"}]}/></Card>
    </div>
   </div>
   <Card className="dn-rider-profile">
     {selected?<><div className="dn-profile-summary"><Initials name={selected.name}/><div><h2>{selected.name}</h2><Chip value={selected.status}/><div className="dn-rating">★ {selected.rating.toFixed(1)}</div></div></div>
      <Tabs ariaLabel="Rider profile sections" value={details} onChange={setDetails} tabs={[{key:"overview",label:"Overview"},{key:"performance",label:"Performance"},{key:"documents",label:"Documents"},{key:"history",label:"History"}]}/>
      {details==="overview"&&<div className="dn-rider-profile-content"><div className="dn-card-subhead"><b>Rider Information</b></div>
       <DetailLine label="Rider ID">#{selected.id}</DetailLine><DetailLine label="Phone">{selected.phone}</DetailLine><DetailLine label="Email">{selected.email}</DetailLine><DetailLine label="Vehicle">{selected.vehicle}</DetailLine><DetailLine label="Plate">{selected.plate}</DetailLine><DetailLine label="Home County">{selected.area.county}</DetailLine><DetailLine label="Availability"><Chip value={selected.status}/></DetailLine><DetailLine label="Joined">{displayTime(selected.joinedAt)} (demo)</DetailLine><DetailLine label="Verification"><Chip value={selected.onboarding}/></DetailLine><DetailLine label="Deliveries">{selected.deliveries}</DetailLine>
      </div>}
      {details==="performance"&&<div className="dn-panel-information"><DetailLine label="Total deliveries">{selected.deliveries}</DetailLine><DetailLine label="Rating">★ {selected.rating.toFixed(1)}</DetailLine><DetailLine label="Active assignments">{riderOrders.filter(o=>o.status!=="DELIVERED"&&o.status!=="CANCELLED").length}</DetailLine><p>Performance charts are simulated and are not connected to live analytics.</p><Bars values={[4,7,3,9,8,6,10,11,6]} labels={["Mon","","Wed","","Fri","","Sun","",""]}/></div>}
      {details==="documents"&&<div className="dn-panel-information"><DetailLine label="Verification status"><Chip value={selected.onboarding}/></DetailLine><DetailLine label="Approved">{selected.approved?"Yes":"No"}</DetailLine><p>Identity and vehicle documents will be integrated in the backend stage. No real personal documents are stored in the frontend preview.</p></div>}
      {details==="history"&&<div className="dn-panel-information"><h3>Assignments in this demo</h3>{riderOrders.map(o=><div className="dn-history-row" key={o.id}><strong>#{o.id}</strong><span>{o.merchant}</span><Chip value={o.status}/></div>)}{riderOrders.length===0&&<Empty label="No assignments in the current demo"/>}</div>}
      <div className="dn-profile-buttons">
       <button className="dn-btn outline" onClick={()=>{sessionStorage.setItem("deetoo.demo.focusRider",selected.id);navigate("dispatch");}}><MapPin size={14}/> Live Track</button>
       {canManage&&selected.onboarding==="PENDING_REVIEW"&&<><button className="dn-btn primary" onClick={()=>{setReason("");setModal("approve");}}>Approve</button><button className="dn-btn red" onClick={()=>{setReason("");setModal("reject");}}>Reject</button></>}
       {canManage&&selected.status==="SUSPENDED"&&<button className="dn-btn primary" onClick={()=>{setReason("");setModal("reactivate");}}>Reactivate</button>}
       {canManage&&selected.status!=="SUSPENDED"&&selected.status!=="ON_DELIVERY"&&<button className="dn-btn red" onClick={()=>{setReason("");setModal("suspend");}}>Suspend Rider</button>}
      </div>
     </>:<Empty label="Select a rider to view the profile"/>}
   </Card>
  </div>
  {selected&&modal&&modal!=="add"&&<Modal title={(modal==="approve"?"Approve":modal==="reject"?"Reject":modal==="suspend"?"Suspend":"Reactivate")+" rider"} subtitle={selected.name+" · #"+selected.id} confirmText="Save rider action" onClose={()=>setModal(null)} onConfirm={doAction} disabled={reason.trim().length<3} danger={modal==="reject"||modal==="suspend"}><label className="dn-field">Reason / audit note<textarea aria-label="Rider action reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain this action in the demo"/></label><p>The resulting rider status will update across all four screens.</p></Modal>}
  {modal==="add"&&<Modal title="Add a new rider" subtitle="Creates a frontend-only rider application" confirmText="Create rider application" onClose={()=>setModal(null)} onConfirm={doAction} disabled={newName.trim().length<3||newPhone.trim().length<8}><label className="dn-field">Full name<input aria-label="Rider full name" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Jane Wanjiku"/></label><label className="dn-field">Phone number<input aria-label="Rider phone number" value={newPhone} onChange={e=>setNewPhone(e.target.value)} placeholder="+254 7..."/></label><label className="dn-field">Operating area<select aria-label="Rider operating area" value={newArea} onChange={e=>setNewArea(e.target.value)}>{[...new Set(data.riders.map(r=>r.area.name))].map(a=><option key={a}>{a}</option>)}</select></label><p>The new rider is placed under Applications awaiting approval; no real account is created.</p></Modal>}
 </div>;
}
