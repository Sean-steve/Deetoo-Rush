import React, {useEffect,useState} from "react";
import {Activity, AlertTriangle, BarChart3, Bell, Bike, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, Download, Headphones, Home, LogOut, MapPin, MessageSquare, Package, Radio, RotateCcw, Search, Settings, ShieldCheck, Store, Truck, Users, Wallet, X} from "lucide-react";
import {DemoProvider, useDemo, canAct} from "./store";
import {AdminRole} from "./data";
import {Modal, Screen, DemoNotice} from "./ui";
import {CommandScreen} from "./screens/command";
import {DispatchScreen} from "./screens/dispatch";
import {OrdersScreen} from "./screens/orders";
import {RidersScreen} from "./screens/riders";
import {IncidentsScreen} from "./screens/incidents";
import {SupportScreen} from "./screens/support";
import {MerchantsScreen} from "./screens/merchants";
import {CustomersScreen} from "./screens/customers";
import "./styles.css";
import "./phase2.css";
type Route = {id:string;label:string;icon:React.ComponentType<{size?:number}>;phase:number};
const groups: {name:string;items:Route[]}[]=[
 {name:"OPERATIONS",items:[{id:"command",label:"Command Center",icon:Home,phase:1},{id:"dispatch",label:"Live Dispatch",icon:Radio,phase:1},{id:"orders",label:"Orders & Deliveries",icon:Truck,phase:1},{id:"riders",label:"Riders & Fleet",icon:Bike,phase:1},{id:"incidents",label:"Incidents",icon:AlertTriangle,phase:2},{id:"support",label:"Support & Conversations",icon:Headphones,phase:2}]},
 {name:"MARKETPLACE",items:[{id:"merchants",label:"Merchants",icon:Store,phase:2},{id:"customers",label:"Customers",icon:Users,phase:2},{id:"geography",label:"Geography & Coverage",icon:MapPin,phase:3}]},
 {name:"FINANCE",items:[{id:"payments",label:"Payments & Refunds",icon:Wallet,phase:3},{id:"settlements",label:"Settlements & Payouts",icon:CircleDollarSign,phase:3},{id:"financial",label:"Financial Control",icon:ClipboardList,phase:3}]},
 {name:"INTELLIGENCE",items:[{id:"analytics",label:"Analytics & Reports",icon:BarChart3,phase:4},{id:"notifications",label:"Notifications",icon:Bell,phase:4}]},
 {name:"ADMINISTRATION",items:[{id:"security",label:"Identity & Security",icon:ShieldCheck,phase:4},{id:"system",label:"System Health",icon:Activity,phase:4},{id:"configuration",label:"Configuration",icon:Settings,phase:4}]},
];
function routeFromHash():Screen {const part=location.hash.replace(/^#\/?/,"").split("?")[0];return ["command","dispatch","orders","riders","incidents","support","merchants","customers"].includes(part)?part as Screen:"command";}
export function AdminNext(){return <DemoProvider><Workspace/></DemoProvider>;}
function Workspace(){
 const {data,role,setRole,reset}=useDemo();
 const [screen,setScreen]=useState<Screen>(routeFromHash);
 const [collapsed,setCollapsed]=useState(false);
 const [quickSearch,setQuickSearch]=useState("");
 const [searchText,setSearchText]=useState("");
 const [selectedCounty,setSelectedCounty]=useState("all");
 const [resetConfirm,setResetConfirm]=useState(false);
 const [toast,setToast]=useState("");
 const [showAlerts,setShowAlerts]=useState(false);
 const [profileMenu,setProfileMenu]=useState(false);
 const [previewState,setPreviewState]=useState<"normal"|"loading"|"error">("normal");
 useEffect(()=>{const change=()=>setScreen(routeFromHash());addEventListener("hashchange",change);return()=>removeEventListener("hashchange",change);},[]);
 useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(""),3500);return()=>clearTimeout(timer);}},[toast]);
 const navigate=(id:string)=>{
   if(!["command","dispatch","orders","riders","incidents","support","merchants","customers"].includes(id)){const p=groups.flatMap(g=>g.items).find(x=>x.id===id);setToast((p?.label||"This area")+" is planned for Phase "+(p?.phase||2)+".");return;}
   const view=id as Screen;location.hash="/"+view;setScreen(view);window.scrollTo({top:0,behavior:"smooth"});
 };
 const search=(e:React.FormEvent)=>{e.preventDefault();const text=quickSearch.trim();if(!text)return;setSearchText(text);navigate(/^RDR/i.test(text)||/rider/i.test(text)?"riders":/^INC/i.test(text)||/incident/i.test(text)?"incidents":/^SUP/i.test(text)||/support/i.test(text)?"support":/^MER/i.test(text)||/merchant/i.test(text)?"merchants":/^CUS/i.test(text)||/customer/i.test(text)?"customers":"orders");};
 const countyName=selectedCounty==="all"?"Kenya (All Counties)":selectedCounty+" County";
 return <div className={"dn-app "+(collapsed?"dn-collapsed":"")}>
 <aside className="dn-sidebar">
  <div className="dn-logo"><span className="dn-logo-mark"><span/></span><strong>DeeToo<small>Rush</small></strong></div>
  <div className="dn-sidebar-links">{groups.map(group=><div key={group.name} className="dn-nav-group"><div className="dn-nav-head">{group.name}</div>{group.items.map(item=><button key={item.id} title={item.label+(item.phase>1?" · Phase "+item.phase:"")} className={"dn-nav-link "+(screen===item.id?"active ":"")+(item.phase>2?"future":"")} onClick={()=>navigate(item.id)} aria-current={screen===item.id?"page":undefined}><item.icon size={18}/><span>{item.label}</span></button>)}</div>)}</div>
  <button className="dn-sidebar-collapse" onClick={()=>setCollapsed(v=>!v)}><ChevronLeft size={17}/><span>{collapsed?"Expand":"Collapse"} Sidebar</span></button>
 </aside>
 <div className="dn-page">
  <header className="dn-topbar">
   <form onSubmit={search} className="dn-top-search"><Search size={18}/><input value={quickSearch} onChange={e=>setQuickSearch(e.target.value)} placeholder="Search orders, users, merchants, riders..." aria-label="Search across workspace"/><kbd>↵</kbd></form>
   <div className="dn-top-actions">
    <label className="dn-county"><MapPin size={15}/><select aria-label="Demo county filter" value={selectedCounty} onChange={e=>setSelectedCounty(e.target.value)}><option value="all">Kenya (All Counties)</option><option value="Nairobi">Nairobi County</option><option value="Kiambu">Kiambu County</option><option value="Kajiado">Kajiado County</option></select><ChevronDown size={13}/></label>
    <div className="dn-alerts-container"><button className="dn-notification" aria-label="Open demo alerts" onClick={()=>setShowAlerts(v=>!v)}><Bell size={19}/><span>{data.phase2.incidents.filter(x=>!["RESOLVED","CLOSED"].includes(x.status)).length+data.phase2.support.filter(x=>!["RESOLVED","CLOSED"].includes(x.status)).length}</span></button>{showAlerts&&<div className="dn-popover"><b>Attention required</b>{data.phase2.incidents.slice(0,3).map(i=><p key={i.id}>{i.title} <small>{i.status}</small></p>)}<button onClick={()=>{setShowAlerts(false);navigate("command");}}>Open Command Center</button></div>}</div>
    <div className="dn-profile-container"><button className="dn-profile" onClick={()=>setProfileMenu(v=>!v)}><span className="dn-face">AD</span><span>Admin User<small>{role==="SUPER_ADMIN"?"Super Admin":role==="OPERATIONS"?"Operations Manager":"Support Viewer"}</small></span><ChevronDown size={14}/></button>{profileMenu&&<div className="dn-popover dn-account-pop"><b>Demo identity</b><label>Simulated role<select value={role} onChange={e=>setRole(e.target.value as AdminRole)}><option value="SUPER_ADMIN">Super Admin</option><option value="OPERATIONS">Operations Manager</option><option value="SUPPORT">Support Viewer</option></select></label><label>Preview state<select aria-label="Preview state" value={previewState} onChange={e=>setPreviewState(e.target.value as "normal"|"loading"|"error")}><option value="normal">Normal data</option><option value="loading">Loading records</option><option value="error">Simulated load failure</option></select></label><button onClick={()=>{setResetConfirm(true);setProfileMenu(false);}}><RotateCcw size={14}/> Reset all demo changes</button><p>No login or real backend is connected.</p></div>}</div>
   </div>
  </header>
  <main className="dn-main">
   <div className="dn-demo-banner"><DemoNotice/><button onClick={()=>setResetConfirm(true)}><RotateCcw size={13}/> Reset demo</button></div>
   {previewState==="loading" && <div className="dn-qa-state" role="status"><span className="dn-loading-spinner"/><strong>Loading workspace records…</strong><p>Frontend-only loading scenario. Use the profile menu to return to normal data.</p><button className="dn-btn outline" onClick={()=>setPreviewState("normal")}>Show data</button></div>}
   {previewState==="error" && <div className="dn-qa-state error" role="alert"><strong>Unable to load demo records</strong><p>Simulated service interruption — this does not contact the DeeToo backend.</p><button className="dn-btn primary" onClick={()=>setPreviewState("normal")}>Retry</button></div>}
   {previewState==="normal"&&screen==="command"&&<CommandScreen data={data} navigate={navigate} county={selectedCounty} />}
   {previewState==="normal"&&screen==="dispatch"&&<DispatchScreen county={selectedCounty} navigate={navigate} globalSearch={searchText} toast={setToast}/>}
   {previewState==="normal"&&screen==="orders"&&<OrdersScreen county={selectedCounty} navigate={navigate} globalSearch={searchText} toast={setToast}/>}
   {previewState==="normal"&&screen==="riders"&&<RidersScreen county={selectedCounty} navigate={navigate} globalSearch={searchText} toast={setToast}/>}
   {previewState==="normal"&&screen==="incidents"&&<IncidentsScreen navigate={navigate} globalSearch={searchText} toast={setToast}/>}
   {previewState==="normal"&&screen==="support"&&<SupportScreen navigate={navigate} globalSearch={searchText} toast={setToast}/>}
   {previewState==="normal"&&screen==="merchants"&&<MerchantsScreen county={selectedCounty} navigate={navigate} globalSearch={searchText} toast={setToast}/>}
   {previewState==="normal"&&screen==="customers"&&<CustomersScreen county={selectedCounty} navigate={navigate} globalSearch={searchText} toast={setToast}/>}
  </main>
 </div>
 {toast&&<div className="dn-toast" role="status">{toast}<button onClick={()=>setToast("")} aria-label="Dismiss notification"><X size={14}/></button></div>}
 {resetConfirm&&<Modal title="Reset demo workspace?" subtitle="This only affects the local frontend preview. It does not access DeeToo backend." onClose={()=>setResetConfirm(false)} onConfirm={()=>{if(canAct(role,"reset")){reset();setToast("Demo restored to the original data.");}else setToast("Only the simulated Super Admin can reset this demo.");setResetConfirm(false);}} confirmText="Reset local demo" danger><p>This clears all assignment, order and rider changes saved in your browser for this preview.</p><p>Switch to the Super Admin demo role to perform a reset.</p></Modal>}
 </div>;
}
