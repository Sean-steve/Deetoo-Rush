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
import {GeographyScreen} from "./screens/geography";
import {PaymentsScreen} from "./screens/payments";
import {PaymentsLive} from "./screens/payments-live";
import {SettlementsScreen} from "./screens/settlements";
import {SettlementsLive} from "./screens/settlements-live";
import {FinancialScreen} from "./screens/financial";
import {AnalyticsScreen} from "./screens/analytics";
import {NotificationsScreen} from "./screens/notifications";
import {SecurityScreen} from "./screens/security";
import {SystemScreen} from "./screens/system";
import "./styles.css";
import "./phase2.css";
import "./phase3.css";
import "./phase4.css";
import "./live.css";
type Route = {id:string;label:string;icon:React.ComponentType<{size?:number}>;phase:number};
const groups: {name:string;items:Route[]}[]=[
 {name:"OPERATIONS",items:[{id:"command",label:"Command Center",icon:Home,phase:1},{id:"dispatch",label:"Live Dispatch",icon:Radio,phase:1},{id:"orders",label:"Orders & Deliveries",icon:Truck,phase:1},{id:"riders",label:"Riders & Fleet",icon:Bike,phase:1},{id:"incidents",label:"Incidents",icon:AlertTriangle,phase:2},{id:"support",label:"Support & Conversations",icon:Headphones,phase:2}]},
 {name:"MARKETPLACE",items:[{id:"merchants",label:"Merchants",icon:Store,phase:2},{id:"customers",label:"Customers",icon:Users,phase:2},{id:"geography",label:"Geography & Coverage",icon:MapPin,phase:3}]},
 {name:"FINANCE",items:[{id:"payments",label:"Payments & Refunds",icon:Wallet,phase:3},{id:"settlements",label:"Settlements & Payouts",icon:CircleDollarSign,phase:3},{id:"financial",label:"Financial Control",icon:ClipboardList,phase:3}]},
 {name:"INTELLIGENCE",items:[{id:"analytics",label:"Analytics & Reports",icon:BarChart3,phase:4},{id:"notifications",label:"Notifications",icon:Bell,phase:4}]},
 {name:"ADMINISTRATION",items:[{id:"security",label:"Identity & Security",icon:ShieldCheck,phase:4} ,{id:"system",label:"System Health & Config",icon:Settings,phase:4}]},
];
function routeFromHash():Screen {const part=location.hash.replace(/^#\/?/,"").split("?")[0];return ["command","dispatch","orders","riders","incidents","support","merchants","customers","geography","payments","settlements","financial","analytics","notifications","security","system"].includes(part)?part as Screen:"command";}
export function AdminNext({forceLive=false}:{forceLive?:boolean}={}){return <DemoProvider forceLive={forceLive}><Workspace/></DemoProvider>;}
function Workspace(){
 const {data,role,setRole,reset,mode,phase,identity,resources,notice,clearNotice,refresh,login,logout,verifyMfa}=useDemo();
 const [screen,setScreen]=useState<Screen>(routeFromHash);
 const [collapsed,setCollapsed]=useState(false);
 const [quickSearch,setQuickSearch]=useState("");
 const [searchText,setSearchText]=useState("");
 const [selectedCounty,setSelectedCounty]=useState("all");
 const [resetConfirm,setResetConfirm]=useState(false);
 const [toast,setToast]=useState("");
 const [showAlerts,setShowAlerts]=useState(false);
 const [profileMenu,setProfileMenu]=useState(false);
 const [mfaOpen,setMfaOpen]=useState(false),[mfaCode,setMfaCode]=useState(""),[mfaError,setMfaError]=useState(""),[mfaBusy,setMfaBusy]=useState(false);
 const [previewState,setPreviewState]=useState<"normal"|"loading"|"error">("normal");
 useEffect(()=>{const change=()=>setScreen(routeFromHash());addEventListener("hashchange",change);return()=>removeEventListener("hashchange",change);},[]);
 useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(""),3500);return()=>clearTimeout(timer);}},[toast]);
 const navigate=(id:string)=>{
   if(!["command","dispatch","orders","riders","incidents","support","merchants","customers","geography","payments","settlements","financial","analytics","notifications","security","system"].includes(id)){const p=groups.flatMap(g=>g.items).find(x=>x.id===id);setToast((p?.label||"This area")+" is planned for Phase "+(p?.phase||2)+".");return;}
   const view=id as Screen;clearNotice();location.hash="/"+view;setScreen(view);window.scrollTo({top:0,behavior:"smooth"});
 };
 const search=(e:React.FormEvent)=>{e.preventDefault();const text=quickSearch.trim();if(!text)return;setSearchText(text);navigate(/^RDR/i.test(text)||/rider/i.test(text)?"riders":/^INC/i.test(text)||/incident/i.test(text)?"incidents":/^SUP/i.test(text)||/support/i.test(text)?"support":/^MER/i.test(text)||/merchant/i.test(text)?"merchants":/^CUS/i.test(text)||/customer/i.test(text)?"customers":"orders");};
 const countyName=selectedCounty==="all"?"Kenya (All Counties)":selectedCounty+" County";
 const screenResource:Record<string,string[]>={command:["orders","riders","incidents","support"],dispatch:["dispatch","riders"],orders:["orders"],riders:["riders"],incidents:["incidents"],support:["support"],merchants:["merchants"],customers:["customers"],geography:["counties","zones"],payments:["payments"],settlements:["settlements","payouts"],financial:["finance"],analytics:["analytics","orders"],notifications:["inbox","campaigns"],security:["users","sessions"],system:["health","config"]};
 const problems=mode==="live"?(screenResource[screen]||[]).filter(k=>resources[k as keyof typeof resources]?.status!=="ready"):[];
 const screenToast=(message:string)=>{if(mode==="demo")setToast(message);};
 if(mode==="live"&&phase==="loading")return <div className="dn-live-auth"><div role="status" className="dn-qa-state"><span className="dn-loading-spinner"/><strong>Connecting to DeeToo Admin…</strong><p>Validating your server session and authorized workspace resources.</p></div></div>;
 if(mode==="live"&&phase==="auth")return <LiveLogin onLogin={login} notice={notice}/>;
 if(mode==="live"&&phase==="error")return <div className="dn-live-auth"><div role="alert" className="dn-qa-state error"><strong>Unable to reach DeeToo Admin</strong><p>{notice}</p><button className="dn-btn primary" onClick={()=>void refresh()}>Retry API connection</button></div></div>;

 return <div className={"dn-app "+(collapsed?"dn-collapsed":"")}>
 <aside className="dn-sidebar">
  <div className="dn-logo"><span className="dn-logo-mark"><span/></span><strong>DeeToo<small>Rush</small></strong></div>
  <div className="dn-sidebar-links">{groups.map(group=><div key={group.name} className="dn-nav-group"><div className="dn-nav-head">{group.name}</div>{group.items.map(item=><button key={item.id} title={item.label+(item.phase>1?" · Phase "+item.phase:"")} className={"dn-nav-link "+(screen===item.id?"active ":"")+(item.phase>4?"future":"")} onClick={()=>navigate(item.id)} aria-current={screen===item.id?"page":undefined}><item.icon size={18}/><span>{item.label}</span></button>)}</div>)}</div>
  <button className="dn-sidebar-collapse" onClick={()=>setCollapsed(v=>!v)}><ChevronLeft size={17}/><span>{collapsed?"Expand":"Collapse"} Sidebar</span></button>
 </aside>
 <div className="dn-page">
  <header className="dn-topbar">
   <form onSubmit={search} className="dn-top-search"><Search size={18}/><input value={quickSearch} onChange={e=>setQuickSearch(e.target.value)} placeholder="Search orders, users, merchants, riders..." aria-label="Search across workspace"/><kbd>↵</kbd></form>
   <div className="dn-top-actions">
    <label className="dn-county"><MapPin size={15}/><select aria-label={mode==="demo"?"Demo county filter":"County filter"} value={selectedCounty} onChange={e=>setSelectedCounty(e.target.value)}><option value="all">Kenya (All Counties)</option><option value="Nairobi">Nairobi County</option><option value="Kiambu">Kiambu County</option><option value="Kajiado">Kajiado County</option></select><ChevronDown size={13}/></label>
    <div className="dn-alerts-container"><button className="dn-notification" aria-label="Open operational alerts" onClick={()=>setShowAlerts(v=>!v)}><Bell size={19}/><span>{data.phase2.incidents.filter(x=>!["RESOLVED","CLOSED"].includes(x.status)).length+data.phase2.support.filter(x=>!["RESOLVED","CLOSED"].includes(x.status)).length+data.phase4.notifications.filter(x=>!x.read).length}</span></button>{showAlerts&&<div className="dn-popover"><b>Attention required</b>{data.phase2.incidents.slice(0,3).map(i=><p key={i.id}>{i.title} <small>{i.status}</small></p>)}<button onClick={()=>{setShowAlerts(false);navigate("notifications");}}>Open Notification Center</button></div>}</div>
    <div className="dn-profile-container"><button className="dn-profile" onClick={()=>setProfileMenu(v=>!v)}><span className="dn-face">AD</span><span>{mode==="live"?String(identity?.name||identity?.email||"DeeToo Administrator"):"Admin User"}<small>{role==="SUPER_ADMIN"?"Super Admin":role==="OPERATIONS"?"Operations Manager":role==="FINANCE"?"Finance Controller":role==="SUPPORT"?"Support Viewer":"Read-only Viewer"}</small></span><ChevronDown size={14}/></button>{profileMenu&&<div className="dn-popover dn-account-pop">{mode==="live"?<><b>Authenticated DeeToo staff</b><p>{String(identity?.email||"")}</p><p>Role and permissions are enforced by the API.</p><button onClick={()=>{setProfileMenu(false);void refresh();}}>Refresh records</button><button onClick={()=>{setProfileMenu(false);setMfaOpen(true);setMfaCode("");setMfaError("");}}><ShieldCheck size={14}/> Verify MFA for privileged actions</button><button onClick={()=>{setProfileMenu(false);void logout();}}><LogOut size={14}/> Sign out</button></>:<><b>Demo identity</b><label>Simulated role<select value={role} onChange={e=>setRole(e.target.value as AdminRole)}><option value="SUPER_ADMIN">Super Admin</option><option value="OPERATIONS">Operations Manager</option><option value="SUPPORT">Support Viewer</option><option value="FINANCE">Finance Controller</option><option value="VIEWER">Read-only Viewer</option></select></label><label>Preview state<select aria-label="Preview state" value={previewState} onChange={e=>setPreviewState(e.target.value as "normal"|"loading"|"error")}><option value="normal">Normal data</option><option value="loading">Loading records</option><option value="error">Simulated load failure</option></select></label><button onClick={()=>{setResetConfirm(true);setProfileMenu(false);}}><RotateCcw size={14}/> Reset all demo changes</button><p>No login or real backend is connected.</p></>}</div>}</div>
   </div>
  </header>
  <main className="dn-main">
   {mode==="demo"?<div className="dn-demo-banner"><DemoNotice/><button onClick={()=>setResetConfirm(true)}><RotateCcw size={13}/> Reset demo</button></div>:<div className="dn-admin-connected"><span><ShieldCheck size={15}/> <b>Live DeeToo backend</b> · {role.replaceAll("_"," ").toLowerCase()}</span><button className="dn-text-btn" onClick={()=>void refresh()}><RotateCcw size={13}/> Refresh data</button></div>}
   {mode==="live"&&problems.length>0&&<details className="dn-live-diagnostics"><summary><AlertTriangle size={15}/> {problems.length} {problems.length===1?"service needs attention":"services need attention"} on this screen · View details</summary><div role="status"><p>{problems.map(k=>k+": "+(resources[k as keyof typeof resources]?.error||"Not loaded")).join(" · ")}</p>{problems.includes("riders")&&<p><b>Rider data:</b> A durable-storage error must be resolved in the API/PostgreSQL configuration. Check the API's DATABASE_URL, database permissions and migrations; do not replace rider records with demo data.</p>}<button className="dn-btn outline" onClick={()=>void refresh()}>Retry affected resources</button></div></details>}
   {mode==="live"&&notice&&<div role={/error|failed|denied|unavailable|invalid|rejected/i.test(notice)?"alert":"status"} className="dn-live-feedback"><span>{notice}</span><button className="dn-text-btn" onClick={clearNotice}>Dismiss</button></div>}
   {mode==="demo"&&previewState==="loading" && <div className="dn-qa-state" role="status"><span className="dn-loading-spinner"/><strong>Loading workspace records…</strong><p>Frontend-only loading scenario. Use the profile menu to return to normal data.</p><button className="dn-btn outline" onClick={()=>setPreviewState("normal")}>Show data</button></div>}
   {mode==="demo"&&previewState==="error" && <div className="dn-qa-state error" role="alert"><strong>Unable to load demo records</strong><p>Simulated service interruption — this does not contact the DeeToo backend.</p><button className="dn-btn primary" onClick={()=>setPreviewState("normal")}>Retry</button></div>}
   {(mode==="live"||previewState==="normal")&&screen==="command"&&<CommandScreen data={data} navigate={navigate} county={selectedCounty} />}
   {(mode==="live"||previewState==="normal")&&screen==="dispatch"&&<DispatchScreen county={selectedCounty} navigate={navigate} globalSearch={searchText} toast={screenToast}/>}
   {(mode==="live"||previewState==="normal")&&screen==="orders"&&<OrdersScreen county={selectedCounty} navigate={navigate} globalSearch={searchText} toast={screenToast}/>}
   {(mode==="live"||previewState==="normal")&&screen==="riders"&&<RidersScreen county={selectedCounty} navigate={navigate} globalSearch={searchText} toast={screenToast}/>}
   {(mode==="live"||previewState==="normal")&&screen==="incidents"&&<IncidentsScreen navigate={navigate} globalSearch={searchText} toast={screenToast}/>}
   {(mode==="live"||previewState==="normal")&&screen==="support"&&<SupportScreen navigate={navigate} globalSearch={searchText} toast={screenToast}/>}
   {(mode==="live"||previewState==="normal")&&screen==="merchants"&&<MerchantsScreen county={selectedCounty} navigate={navigate} globalSearch={searchText} toast={screenToast}/>}
   {(mode==="live"||previewState==="normal")&&screen==="customers"&&<CustomersScreen county={selectedCounty} navigate={navigate} globalSearch={searchText} toast={screenToast}/>}
   {(mode==="live"||previewState==="normal")&&screen==="geography"&&<GeographyScreen navigate={navigate} county={selectedCounty} toast={screenToast}/>}
   {mode==="live"&&screen==="payments"&&<PaymentsLive navigate={navigate}/>}
   {mode==="demo"&&previewState==="normal"&&screen==="payments"&&<PaymentsScreen navigate={navigate} globalSearch={searchText} toast={screenToast}/>}
   {mode==="live"&&screen==="settlements"&&<SettlementsLive navigate={navigate}/>}
   {mode==="demo"&&previewState==="normal"&&screen==="settlements"&&<SettlementsScreen navigate={navigate} toast={screenToast}/>}
   {(mode==="live"||previewState==="normal")&&screen==="financial"&&<FinancialScreen navigate={navigate} toast={screenToast}/>}
   {(mode==="live"||previewState==="normal")&&screen==="analytics"&&<AnalyticsScreen navigate={navigate} toast={screenToast}/>}
   {(mode==="live"||previewState==="normal")&&screen==="notifications"&&<NotificationsScreen navigate={navigate} toast={screenToast}/>}
   {(mode==="live"||previewState==="normal")&&screen==="security"&&<SecurityScreen navigate={navigate} toast={screenToast}/>}
   {(mode==="live"||previewState==="normal")&&screen==="system"&&<SystemScreen navigate={navigate} toast={screenToast}/>}
  </main>
 </div>
 {toast&&<div className="dn-toast" role="status">{toast}<button onClick={()=>setToast("")} aria-label="Dismiss notification"><X size={14}/></button></div>}
 {mode==="live"&&mfaOpen&&<Modal title="Verify your DeeToo MFA" subtitle="Recent verification is required for privileged API mutations" onClose={()=>setMfaOpen(false)} onConfirm={()=>{setMfaBusy(true);setMfaError("");void verifyMfa(mfaCode).then(()=>{setMfaOpen(false);void refresh();}).catch(e=>setMfaError(e instanceof Error?e.message:"MFA verification failed")).finally(()=>setMfaBusy(false));}} confirmText={mfaBusy?"Verifying…":"Verify session"} disabled={mfaBusy||!/^\d{6}$/.test(mfaCode)}><label className="dn-field">Authenticator code<input value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\D/g,"").slice(0,6))} autoComplete="one-time-code" inputMode="numeric" maxLength={6} placeholder="6-digit code"/></label>{mfaError&&<p role="alert">{mfaError}</p>}<p>Only DeeToo's identity service can validate this code. No MFA secrets or codes are stored in this browser.</p></Modal>}
  {mode==="demo"&&resetConfirm&&<Modal title="Reset demo workspace?" subtitle="This only affects the local frontend preview. It does not access DeeToo backend." onClose={()=>setResetConfirm(false)} onConfirm={()=>{if(canAct(role,"reset")){reset();setToast("Demo restored to the original data.");}else setToast("Only the simulated Super Admin can reset this demo.");setResetConfirm(false);}} confirmText="Reset local demo" danger><p>This restores every phase, including orders, finance, messaging, security and configuration, to the original frontend fixtures.</p><p>Switch to the Super Admin demo role to perform a reset.</p></Modal>}
 </div>;
}

function LiveLogin({onLogin,notice}:{onLogin:(identifier:string,password:string)=>Promise<void>;notice:string}){
 const [identifier,setIdentifier]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError("");try{await onLogin(identifier,password);}catch(e){setError(e instanceof Error?e.message:"Unable to sign in.");}finally{setBusy(false);}};
 return <div className="dn-live-auth"><form className="dn-live-login" onSubmit={submit}><div className="dn-logo"><span className="dn-logo-mark"><span/></span><strong>DeeToo<small>Rush</small></strong></div><h1>Admin sign in</h1><p>Use your authorized DeeToo staff account. Actions are governed by live permissions and may require recent MFA verification.</p><label className="dn-field">Staff email or phone<input autoComplete="username" required value={identifier} onChange={e=>setIdentifier(e.target.value)}/></label><label className="dn-field">Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{(error||notice)&&<p role="alert" className="dn-login-error">{error||notice}</p>}<button className="dn-btn primary full" disabled={busy||!identifier||!password}>{busy?"Authenticating…":"Sign in securely"}</button><small>Credentials are transmitted to DeeToo through the configured cookie-auth API. Browser demo data is never used in live mode.</small></form></div>;
}
