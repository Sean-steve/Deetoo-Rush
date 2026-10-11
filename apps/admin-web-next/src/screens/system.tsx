import React,{useState} from "react";
import {Activity,AlertTriangle,ArrowRight,Bell,CheckCircle2,Clock3,Cloud,Database,FileClock,HardDrive,HeartPulse,LockKeyhole,Network,RefreshCw,Settings2,ShieldCheck,SlidersHorizontal,Server,ShieldAlert,ToggleLeft,Truck,XCircle} from "lucide-react";
import type {HealthComponent,ServiceStatus,SystemSettings} from "../phase4Data";
import {useDemo,canAct} from "../store";
import {Bars,Card,Chip,DetailLine,Empty,IconStat,Modal,SearchBox,SelectBox,Tabs,TimeSeries} from "../ui";
const checks:ServiceStatus[]=["HEALTHY","DEGRADED","DOWN","MAINTENANCE"];
const settingLabels:Record<keyof SystemSettings,string>={
 maintenance:"Platform maintenance banner",orderIntake:"Allow new orders",riderDispatch:"Automatic rider dispatch access",supportIntake:"Support intake",notificationDelivery:"Communications enabled (demo)",autoAssign:"Auto-assignment preference",maxActiveOrders:"Active orders soft limit",supportSlaMinutes:"Support SLA target (minutes)"
};
const settingDetails:Record<keyof SystemSettings,string>={
 maintenance:"Inform future UI clients that the platform is under maintenance.",
 orderIntake:"Allow or pause future intake; currently does not block existing mock orders.",
 riderDispatch:"Enable or pause simulated future rider dispatch.",
 supportIntake:"Enable or pause simulated future support intake.",
 notificationDelivery:"Enable simulated campaign sending from Notifications.",
 autoAssign:"Preference for later backend matching; no real dispatcher is running.",
 maxActiveOrders:"Target threshold for future operational alerting.",
 supportSlaMinutes:"Target time for support follow-up review."
};
export function SystemScreen({navigate,toast}:{navigate:(s:string)=>void;toast:(s:string)=>void}){
 const {data,act,role,mode}=useDemo(),state=data.phase4,canManage=canAct(role,"system");
 const [tab,setTab]=useState("health"),[query,setQuery]=useState(""),[filter,setFilter]=useState("all"),[selectedId,setSelectedId]=useState<string|null>(null);
 const [modal,setModal]=useState<"health"|"setting"|null>(null),[targetStatus,setTargetStatus]=useState<ServiceStatus>("HEALTHY"),[settingKey,setSettingKey]=useState<keyof SystemSettings>("maintenance"),[settingValue,setSettingValue]=useState("false"),[reason,setReason]=useState("");
 const components=state.components.filter(c=>(filter==="all"||c.status===filter)&&(c.name+" "+c.group).toLowerCase().includes(query.toLowerCase()));
 const selected=state.components.find(c=>c.id===selectedId)||components[0];
 const good=state.components.filter(c=>c.status==="HEALTHY").length;
 const degraded=state.components.filter(c=>c.status==="DEGRADED").length;
 const down=state.components.filter(c=>c.status==="DOWN").length;
 const operational=state.components.length===0?"UNKNOWN":good===state.components.length?"HEALTHY":down?"DEGRADED":"PARTIAL";
 const activeIncidents=data.phase2.incidents.filter(i=>!["RESOLVED","CLOSED"].includes(i.status));
 const metrics=state.components.map(c=>c.latencyMs);
 const settingsEntries=Object.entries(state.settings) as [keyof SystemSettings,boolean|number][];
 const editSetting=(key:keyof SystemSettings,value:boolean|number)=>{setSettingKey(key);setSettingValue(typeof value==="boolean"?String(!value):String(value));setReason("");setModal("setting");};
 const editStatus=()=>{if(!selected)return;setTargetStatus(selected.status);setReason("");setModal("health");};
 const save=()=>{
  if(!canManage||reason.trim().length<5)return;
  if(modal==="health"&&selected){act({type:"PHASE4_HEALTH_STATUS",id:selected.id,status:targetStatus,reason});toast("Demo service status updated. No actual service was contacted.");}
  if(modal==="setting"){
   const current=state.settings[settingKey];
   const value=typeof current==="boolean"?settingValue==="true":Number(settingValue);
   if(typeof value==="number"&&(!Number.isInteger(value)||value<1||value>10000))return;
   act({type:"PHASE4_SETTING",key:settingKey,value,reason});toast("Simulation setting changed; backend behavior is unchanged.");
  }
  setModal(null);setReason("");
 };
 const getIcon=(group:string)=>group==="Finance"?<Database size={18}/>:group==="Operations"?<Truck size={18}/>:group==="Security"?<ShieldCheck size={18}/>:group==="Messaging"?<Bell size={18}/>:<Server size={18}/>;
 return <div className="dn-screen" data-testid="screen-system">
  <div className="dn-title-row"><div><h1>System Health & Configuration</h1><p>Understand platform health, review incidents and manage controlled operational preferences.</p></div><div className="dn-title-buttons"><button className="dn-btn outline" onClick={()=>setTab("audit")}><FileClock size={15}/> Configuration Audit</button><button className="dn-btn primary" disabled={!canManage} onClick={()=>{setTab("settings");}}><Settings2 size={15}/> Manage Settings</button></div></div>
  <div className="dn-metrics five">
   <IconStat label="Overall Demo Health" value={operational==="UNKNOWN"?"Not sampled":operational==="HEALTHY"?"Healthy":"Attention"} icon={<HeartPulse/>} tone={operational==="HEALTHY"?"green":"amber"}/>
   <IconStat label="Healthy Components" value={good} icon={<CheckCircle2/>}/>
   <IconStat label="Degraded Components" value={degraded} tone="amber" icon={<AlertTriangle/>}/>
   <IconStat label="Down Components" value={down} tone="red" icon={<XCircle/>}/>
   <IconStat label="Active Incidents" value={activeIncidents.length} tone="blue" icon={<Activity/>}/>
  </div>
  <div className="dn-system-banner"><span className="dn-p4-event-icon"><Activity size={20}/></span><div><b>{mode==="live"?"Measured database, PostGIS and Redis probes":"Illustrative status data — no live backend monitoring"}</b><p>{mode==="live"?"The API reports live dependency readiness. Historical uptime is shown only when real monitoring samples have been recorded.":"Metrics, uptime percentages, queues and service checks on this page are deterministic fixtures or manually simulated changes. Actual service probes will be integrated later."}</p></div><Chip value={operational}/></div>
  <Tabs ariaLabel="System health sections" value={tab} onChange={setTab} tabs={[{key:"health",label:"Service Health"},{key:"settings",label:"Platform Configuration"},{key:"incidents",label:"Incident & Performance Overview"},{key:"audit",label:"System Audit Log"}]}/>
  {tab==="health"&&<div className="dn-p4-system-grid">
   <Card title="Service Component Status" desc="Editable demo statuses and fixed reference metrics" className="dn-p4-system-list">
    <div className="dn-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search services..."/><SelectBox label="Service status filter" value={filter} onChange={setFilter} options={[{value:"all",label:"All statuses"},...checks.map(s=>({value:s,label:s}))]}/></div>
    <div className="dn-p4-service-list">{components.map(c=><button className={"dn-p4-service "+(selected?.id===c.id?"active":"")} key={c.id} onClick={()=>setSelectedId(c.id)}><span className="dn-p4-event-icon">{getIcon(c.group)}</span><span><b>{c.name}</b><small>{c.group} · sample latency {c.latencyMs}ms</small></span><Chip value={c.status}/></button>)}{!components.length&&<Empty label="No services match the current filters"/>}</div>
   </Card>
   <div className="dn-p4-system-center">
    <Card title="Service Performance" desc="Reference-only telemetry illustrations"><div className="dn-p4-performance-pair"><div><b>{metrics.length?Math.round(metrics.reduce((n,x)=>n+x,0)/metrics.length)+" ms":"No samples"}</b><small>Average seeded latency</small></div><div><b>{mode==="live"?"Not measured":state.components.length?(state.components.reduce((n,x)=>n+x.uptime,0)/state.components.length).toFixed(2)+"%":"—"}</b><small>{mode==="live"?"Uptime requires monitoring history":"Average illustrated uptime"}</small></div></div><TimeSeries values={metrics.concat(metrics.slice(0,3))} labels={["T1","","T3","","T5","","T7","","T9","","","T13"]} fill/><p className="dn-helper">{mode==="live"?"Live dependency readiness; provider SLO statistics are not inferred.":"No real event streams, probes or latency samples have been collected."}</p></Card>
    <Card title="Platform Dependencies" desc="Design-stage connectivity summary"><div className="dn-p4-dependencies">{["API Gateway","Redis / Job Queue","PostgreSQL / PostGIS","M-PESA & Card Providers"].map((x,i)=><div key={x}><span>{i<2?<Server size={16}/>:<Database size={16}/>}</span><div><b>{x}</b><small>Mock availability reference</small></div><Chip value={i===3?"DEGRADED":"PREVIEW"}/></div>)}</div></Card>
   </div>
   <Card title="Selected Service Inspector" desc="No remote restart or service action is executed" className="dn-p4-system-detail">
    {selected?<><div className="dn-p4-inspection"><span className="dn-p4-event-icon">{getIcon(selected.group)}</span><div><h2>{selected.name}</h2><p>{selected.group}</p></div></div><DetailLine label="Component ID">{selected.id}</DetailLine><DetailLine label="Status"><Chip value={selected.status}/></DetailLine><DetailLine label="Sample latency">{selected.latencyMs} ms</DetailLine><DetailLine label="Uptime">{mode==="live"?"Not established":selected.uptime+"%"}</DetailLine><DetailLine label="Monitoring mode">{mode==="live"?"Backend probe":"Simulation"}</DetailLine><div className="dn-p4-warning"><AlertTriangle size={15}/>{selected.detail}</div><button className="dn-btn primary full" disabled={!canManage||mode==="live"} title={mode==="live"?"Measured status cannot be overridden":undefined} onClick={editStatus}>{mode==="live"?"Measured Health — Read Only":"Update Demo Health Status"}</button></>:<Empty label="Choose a service"/>}
   </Card>
  </div>}
  {tab==="settings"&&<div className="dn-p4-settings-grid">
   <Card title="Operational Controls" desc="Changes are local flags; DeeToo services remain untouched"><div className="dn-p4-settings-list">{settingsEntries.map(([key,value])=><div className="dn-p4-setting" key={key}><span className="dn-p4-event-icon"><SlidersHorizontal size={17}/></span><div><b>{settingLabels[key]}</b><p>{settingDetails[key]}</p></div>{typeof value==="boolean"?<button className={"dn-toggle "+(value?"on":"")} role="switch" aria-checked={value} aria-label={settingLabels[key]} disabled={!canManage} onClick={()=>editSetting(key,value)}><span/></button>:<button className="dn-smalloutline" disabled={!canManage} onClick={()=>editSetting(key,value)}>{value} · Edit</button>}</div>)}</div></Card>
   <div className="dn-p4-system-center"><Card title="System Configuration Summary"><DetailLine label="Maintenance"><Chip value={state.settings.maintenance?"ENABLED":"OFF"}/></DetailLine><DetailLine label="Order Intake"><Chip value={state.settings.orderIntake?"ENABLED":"PAUSED"}/></DetailLine><DetailLine label="Rider Dispatch"><Chip value={state.settings.riderDispatch?"ENABLED":"PAUSED"}/></DetailLine><DetailLine label="Support Intake"><Chip value={state.settings.supportIntake?"ENABLED":"PAUSED"}/></DetailLine><DetailLine label="Notification Delivery"><Chip value={state.settings.notificationDelivery?"ENABLED":"PAUSED"}/></DetailLine><DetailLine label="Auto-assign"><Chip value={state.settings.autoAssign?"ON":"OFF"}/></DetailLine><button className="dn-btn outline full" onClick={()=>navigate("geography")}>Coverage Settings <ArrowRight size={13}/></button></Card><Card title="Change Protection"><div className="dn-fin-note">Only the simulated Super Admin can change these local configuration flags. All changes require a written reason and appear in the audit history. Real safeguards, two-person approvals and API validation come later.</div></Card></div>
  </div>}
  {tab==="incidents"&&<div className="dn-p4-system-grid">
   <Card title="Open Platform & Operations Incidents" desc="Linked to incident records from Screen 05"><div className="dn-table-scroll"><table className="dn-table"><thead><tr><th>Incident</th><th>Title</th><th>Severity</th><th>Status</th></tr></thead><tbody>{activeIncidents.slice(0,14).map(i=><tr key={i.id}><td><b>{i.id}</b></td><td>{i.title}</td><td><Chip value={i.severity}/></td><td><Chip value={i.status}/></td></tr>)}</tbody></table></div><button className="dn-btn outline full" onClick={()=>navigate("incidents")}>Open Incident Management</button></Card>
   <Card title="System Operational Statistics"><Bars values={state.components.map(c=>c.latencyMs)} labels={state.components.map(c=>c.name.split(" ")[0])}/><DetailLine label="Components">{state.components.length}</DetailLine><DetailLine label="Simulated degradations">{degraded+down}</DetailLine><DetailLine label="Order intake limit">{state.settings.maxActiveOrders}</DetailLine></Card>
   <Card title="Incident Response Playbook"><div className="dn-p4-notes"><p>1. Inspect real telemetry once backend integration is available.</p><p>2. Open or escalate an incident in the operational workspace.</p><p>3. Record investigation steps and approvals.</p><p>4. Communicate verified updates using approved templates.</p></div><button className="dn-btn outline" onClick={()=>navigate("notifications")}>Communications Center</button></Card>
  </div>}
  {tab==="audit"&&<Card title="System Configuration & Simulated Health Audit"><div className="dn-table-scroll"><table className="dn-table"><thead><tr><th>Time</th><th>Actor</th><th>Change</th><th>Detail</th></tr></thead><tbody>{state.logs.filter(l=>/configuration|service status/i.test(l.action)).map(l=><tr key={l.id}><td>{new Date(l.at).toLocaleString("en-KE")}</td><td>{l.actor}</td><td>{l.action}</td><td>{l.detail}</td></tr>)}</tbody></table></div>{!state.logs.some(l=>/configuration|service status/i.test(l.action))&&<Empty label="No system changes have been recorded"/>}</Card>}
  {modal==="health"&&selected&&<Modal title="Simulate component health" subtitle={selected.name+" — frontend only"} onClose={()=>setModal(null)} onConfirm={save} confirmText="Save demo health status" disabled={!canManage||reason.trim().length<5}><label className="dn-field">New component status<select value={targetStatus} onChange={e=>setTargetStatus(e.target.value as ServiceStatus)}>{checks.map(s=><option key={s}>{s}</option>)}</select></label><label className="dn-field">Required note<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label><p>This does not restart, stop, deploy or reconfigure actual infrastructure.</p></Modal>}
  {modal==="setting"&&<Modal title="Change simulated configuration" subtitle={settingLabels[settingKey]} onClose={()=>setModal(null)} onConfirm={save} confirmText="Save simulated setting" disabled={!canManage||reason.trim().length<5||(typeof state.settings[settingKey]==="number"&&(!Number.isInteger(Number(settingValue))||Number(settingValue)<1||Number(settingValue)>10000))}><p>{settingDetails[settingKey]}</p>{typeof state.settings[settingKey]==="boolean"?<label className="dn-field">Value<select value={settingValue} onChange={e=>setSettingValue(e.target.value)}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>:<label className="dn-field">New value<input type="number" min="1" max="10000" value={settingValue} onChange={e=>setSettingValue(e.target.value)}/></label>}<label className="dn-field">Required approval reason<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label></Modal>}
 </div>;
}
