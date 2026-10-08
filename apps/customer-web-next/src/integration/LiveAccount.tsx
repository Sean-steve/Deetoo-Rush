/* Screens 11–13 — customer-owned profile, sessions and notification inbox. */
import {useEffect,useState} from "react";
import {ArrowRight,Bell,Check,CheckCircle2,ChevronRight,CreditCard,House,KeyRound,Laptop,LockKeyhole,MapPin,Plus,RefreshCw,ShieldCheck,Smartphone,Trash2,UserRound,X} from "lucide-react";
import type {CustomerAddress,CustomerProfile,NotificationRecord} from "@deetoo/types";
import {Badge,Button,Panel} from "../../../../packages/customer-ui/src/index";
import type {CustomerGateway,CustomerDeviceSession} from "./customer-gateway";
import {backendError,useBackendResource} from "./resource";
import {ResourceView,StatusPanel} from "./LiveUtilities";

type Destination="profile"|"security"|"notifications";
type Props={screen:Destination;gateway:CustomerGateway;authenticated:boolean;requestSignIn:()=>void;onNavigate:(p:string)=>void;logout:()=>Promise<unknown>;userId:string;onAddressesChanged:()=>void};
const prettyDate=(iso?:string|null)=>iso?new Date(iso).toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short"}):"Unavailable";
const inlineError=(err:string)=>err?<p role="alert" className="dt-live-error">{err}</p>:null;
const ResourceError=({message}:{message:string})=><p role="status" className="dt-live-account-note">{message}</p>;


function AddressEditor({gateway,original,onClose,onSaved}:{gateway:CustomerGateway;original:CustomerAddress|null;onClose:()=>void;onSaved:()=>void}){
 const [label,setLabel]=useState(original?.label||"Home"),[line,setLine]=useState(original?.address_line1||""),[city,setCity]=useState(original?.city||""),[region,setRegion]=useState(original?.region||""),[instructions,setInstructions]=useState(original?.delivery_instructions||"");
 const [location,setLocation]=useState<{latitude:number;longitude:number}|null>(original?{latitude:original.latitude,longitude:original.longitude}:null);
 const [serviceable,setServiceable]=useState(Boolean(original)),[locating,setLocating]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const locate=()=>{if(!navigator.geolocation){setError("Geolocation is unavailable. Your saved coordinates remain unchanged.");return;}
  setLocating(true);setError("");navigator.geolocation.getCurrentPosition(async p=>{const latitude=p.coords.latitude,longitude=p.coords.longitude;
   try{if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw new Error("Invalid location");
    const available=await gateway.discovery.serviceability(latitude,longitude);setServiceable(available.serviceable);
    setLocation(available.serviceable?{latitude,longitude}:null);
    if(!available.serviceable)setError("This location is outside DeeToo's active delivery zones.");
   }catch(e){setError(backendError(e).message);setLocation(null);setServiceable(false);}finally{setLocating(false);}
  },()=>{setLocating(false);setError("Location permission is required to verify a new delivery location.");},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
 };
 const save=async(e:React.FormEvent)=>{e.preventDefault();if(!location||!serviceable||busy)return;setBusy(true);setError("");
  const payload={label:label.trim(),address_line1:line.trim(),city:city.trim(),region:region.trim(),country_code:"KE",
    latitude:location.latitude,longitude:location.longitude,delivery_instructions:instructions.trim()};
  try{if(original)await gateway.account.updateAddress(original.id,payload);else await gateway.account.addAddress(payload);
    onSaved();onClose();
  }catch(e){setError(backendError(e).message);}finally{setBusy(false);}};
 return <div className="dt-live-account-overlay"><section className="dt-live-account-modal dt-live-address-editor" role="dialog" aria-modal="true" aria-label={original?"Edit delivery address":"Add delivery address"}>
  <header><h2>{original?"Edit delivery address":"Add delivery address"}</h2><button type="button" aria-label="Close address editor" onClick={onClose}><X size={18}/></button></header>
  <p>We use verified coordinates for serviceability. No location is guessed from an address label.</p>
  <form onSubmit={e=>void save(e)}>
    <label>Label<select value={label} onChange={e=>setLabel(e.target.value)}><option>Home</option><option>Work</option><option>Other</option></select></label>
    <label>Street, building or landmark<input required maxLength={255} value={line} onChange={e=>setLine(e.target.value)}/></label>
    <label>Town / city<input required maxLength={100} value={city} onChange={e=>setCity(e.target.value)}/></label>
    <label>County / region<input required maxLength={100} value={region} onChange={e=>setRegion(e.target.value)}/></label>
    <label>Delivery instructions<textarea value={instructions} maxLength={500} rows={2} onChange={e=>setInstructions(e.target.value)}/></label>
    <Button variant="outline" type="button" disabled={locating} onClick={locate}><MapPin size={17}/>{locating?"Verifying location…":original?"Reverify location":"Use and verify my GPS location"}</Button>
    {location&&serviceable&&<p role="status" className="dt-live-success"><Check size={15}/> Verified coordinates: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</p>}
    {error&&<p role="alert" className="dt-live-error">{error}</p>}
    <footer><Button variant="outline" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy||!serviceable||!location||!line.trim()||!city.trim()||!region.trim()}>{busy?"Saving…":"Save address"}</Button></footer>
  </form>
 </section></div>;
}

function Profile({gateway,onNavigate,onAddressesChanged}:{gateway:CustomerGateway;onNavigate:(path:string)=>void;onAddressesChanged:()=>void}){
 const profile=useBackendResource(()=>gateway.account.profile(),true,[]);
 const addresses=useBackendResource(()=>gateway.account.addresses(),true,[]);
 const [editing,setEditing]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(""),[done,setDone]=useState("");
 const [fields,setFields]=useState({first_name:"",last_name:"",display_name:"",phone:"",email:""});
 const [confirmRemove,setConfirmRemove]=useState<CustomerAddress|null>(null);
 const [editor,setEditor]=useState<CustomerAddress|"new"|null>(null);
 const [addressBusy,setAddressBusy]=useState("");
 const initial=profile.state.status==="ready"?profile.state.data:null;
 const start=()=>{if(!initial)return;setFields({first_name:initial.first_name||"",last_name:initial.last_name||"",display_name:initial.display_name||"",phone:initial.phone||"",email:initial.email||""});setEditing(true);setError("");};
 const update=async(e:React.FormEvent)=>{e.preventDefault();if(saving)return;setSaving(true);setError("");try{
  await gateway.account.updateProfile({display_name:fields.display_name.trim(),first_name:fields.first_name.trim(),last_name:fields.last_name.trim(),phone:fields.phone.trim(),email:fields.email.trim()});
  profile.refresh();setEditing(false);setDone("Your DeeToo profile was updated.");}
  catch(err){setError(backendError(err).message);}finally{setSaving(false);}};
 const changeAddress=async(id:string,action:"default"|"remove")=>{
  setAddressBusy(id);setError("");try{if(action==="default")await gateway.account.makeDefault(id);
   else await gateway.account.removeAddress(id);addresses.refresh();profile.refresh();onAddressesChanged();setDone(action==="default"?"Default address updated.":"Address deleted.");setConfirmRemove(null);}
  catch(e){setError(backendError(e).message);}finally{setAddressBusy("");}};
 return <section className="dt-profile-page dt-screen-enter dt-live-account">
  <div className="dt-profile-main"><header className="dt-account-pagehead"><div><h1>My profile</h1><p>Manage your account, saved delivery addresses and preferences.</p></div>
   <Button variant="outline" onClick={()=>onNavigate("/security")}><ShieldCheck size={16}/> Security</Button></header>
  {done&&<p role="status" className="dt-live-success"><Check size={17}/>{done}</p>}{inlineError(error)}
  <Panel className="dt-live-account-card"><div className="dt-account-section-head"><span className="dt-account-icon"><UserRound/></span><div><h2>Personal information</h2><p>Information stored in your customer account.</p></div>
  {!editing&&<Button variant="outline" size="sm" onClick={start}>Edit profile</Button>}</div>
  <ResourceView resource={profile.state} empty="Customer profile unavailable" onRetry={profile.refresh}>{(customer:CustomerProfile)=>
   editing?<form onSubmit={e=>void update(e)} className="dt-live-account-form">
    <label>Display name<input required maxLength={100} value={fields.display_name} onChange={e=>setFields(v=>({...v,display_name:e.target.value}))}/></label>
    <label>First name<input maxLength={100} value={fields.first_name} onChange={e=>setFields(v=>({...v,first_name:e.target.value}))}/></label>
    <label>Last name<input maxLength={100} value={fields.last_name} onChange={e=>setFields(v=>({...v,last_name:e.target.value}))}/></label>
    <label>Phone number<input type="tel" value={fields.phone} onChange={e=>setFields(v=>({...v,phone:e.target.value}))}/></label>
    <label>Email<input type="email" value={fields.email} onChange={e=>setFields(v=>({...v,email:e.target.value}))}/></label>
    <div><Button disabled={saving} type="submit">{saving?"Saving…":"Save changes"}</Button><Button variant="outline" type="button" onClick={()=>setEditing(false)}>Cancel</Button></div>
   </form>:<dl className="dt-live-account-dl">
    <div><dt>Display name</dt><dd>{customer.display_name||"Not provided"}</dd></div><div><dt>First / last name</dt><dd>{[customer.first_name,customer.last_name].filter(Boolean).join(" ")||"Not provided"}</dd></div>
    <div><dt>Email address</dt><dd>{customer.email||"Not provided"}</dd></div><div><dt>Phone number</dt><dd>{customer.phone||"Not provided"}</dd></div>
   </dl>}</ResourceView></Panel>
  <Panel className="dt-live-account-card"><div className="dt-account-section-head"><span className="dt-account-icon"><MapPin/></span><div><h2>Saved addresses</h2><p>Delivery locations verified by DeeToo.</p></div>
   <Button size="sm" onClick={()=>setEditor("new")}><Plus size={16}/> Add address</Button></div>
   <ResourceView resource={addresses.state} empty="No saved addresses yet" onRetry={addresses.refresh}>{(list:CustomerAddress[])=><div className="dt-live-account-addresses">{list.map(a=><article key={a.id}>
    <span className="dt-account-icon"><House size={21}/></span><div><h3>{a.label} {a.is_default&&<Badge variant="mint">Default</Badge>}</h3><p>{a.address_text||a.address_line1}, {a.city}, {a.region}</p><small>{a.delivery_instructions||"Delivery address"}</small></div>
    <div>{!a.is_default&&<Button variant="outline" size="sm" disabled={addressBusy===a.id} onClick={()=>void changeAddress(a.id,"default")}>Set default</Button>}
     <Button variant="outline" size="sm" onClick={()=>setEditor(a)}>Edit</Button><Button variant="outline" size="sm" onClick={()=>setConfirmRemove(a)} disabled={addressBusy===a.id} aria-label={"Remove "+a.label}><Trash2 size={16}/></Button></div>
   </article>)}</div>}</ResourceView>
   <ResourceError message="New or edited address coordinates must be verified against active service zones. Use the existing checkout location picker; location fields are never guessed."/></Panel>
  <Panel className="dt-live-account-card"><div className="dt-account-section-head"><span className="dt-account-icon"><CreditCard/></span><div><h2>Payment methods & membership</h2><p>Secure payment, rewards and Plus information</p></div></div>
   <ResourceError message="Saved payment cards, DeeToo Plus and rewards do not have a verified customer backend contract. No payment instrument is shown or stored here."/></Panel>
  <Panel className="dt-live-account-card"><div className="dt-account-section-head"><span className="dt-account-icon"><Bell/></span><div><h2>Preferences</h2><p>Notification delivery settings and privacy.</p></div></div>
   <ResourceError message="Notification channel preferences are awaiting a consent-aware backend endpoint. Existing read settings are not persisted by this screen."/>
   <Button variant="outline" onClick={()=>onNavigate("/notifications")}>View notifications <ArrowRight size={16}/></Button></Panel></div>
  <aside className="dt-live-account-side"><Panel><h2>Quick links</h2>{[["Orders & tracking","/orders"],["Security & devices","/security"],["Notifications","/notifications"],["Help & support","/support"]].map(([label,path])=><button key={path} onClick={()=>onNavigate(path)}>{label}<ChevronRight size={16}/></button>)}</Panel></aside>
  {editor&&<AddressEditor gateway={gateway} original={editor==="new"?null:editor} onClose={()=>setEditor(null)} onSaved={()=>{addresses.refresh();profile.refresh();onAddressesChanged();setDone("Address saved to DeeToo.");}}/>}
  {confirmRemove&&<div className="dt-live-account-overlay"><section role="dialog" aria-modal="true" aria-label="Confirm address deletion" className="dt-live-account-modal"><h2>Remove saved address?</h2><p>This will delete the saved delivery address "{confirmRemove.label}" from DeeToo. Existing order snapshots remain unchanged.</p>
  <div><Button variant="outline" onClick={()=>setConfirmRemove(null)}>Keep address</Button><Button disabled={!!addressBusy} onClick={()=>void changeAddress(confirmRemove.id,"remove")}>Remove address</Button></div></section></div>}
 </section>;
}
function Security({gateway,logout}:{gateway:CustomerGateway;logout:()=>Promise<unknown>}){
 const sessions=useBackendResource(()=>gateway.auth.sessions(),true,[]);
 const profile=useBackendResource(()=>gateway.account.profile(),true,[]);
 const [target,setTarget]=useState<CustomerDeviceSession|"all"|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [resetBusy,setResetBusy]=useState(false);
 const active=(sessions.state.status==="ready"?sessions.state.data:[]).filter(s=>s.is_active);
 const revoke=async()=>{if(!target||busy)return;setBusy(true);setError("");try{
   if(target==="all"){await gateway.auth.revokeAllSessions();setTarget(null);await logout();return;}
   await gateway.auth.revokeSession(target.id);sessions.refresh();setTarget(null);setNotice("Session revoked by DeeToo.");
   if(target.current){await logout();return;}
  }catch(e){setError(backendError(e).message);}finally{setBusy(false);}};
 const forgot=async()=>{const email=profile.state.status==="ready"?profile.state.data.email:"";
  if(!email){setError("A verified email is required to request a password reset.");return;}
  setResetBusy(true);setError("");try{await gateway.auth.requestPasswordReset(email);setNotice("If this email is eligible, password reset instructions will be sent.");}
  catch(e){setError(backendError(e).message);}finally{setResetBusy(false);}};
 return <section className="dt-security-page dt-screen-enter dt-live-account"><header className="dt-account-pagehead"><div><h1>Security & Devices</h1><p>Protect your DeeToo account and manage authenticated sessions.</p></div><Badge variant="mint"><ShieldCheck size={14}/> Secure account</Badge></header>
  {notice&&<p className="dt-live-success" role="status"><CheckCircle2 size={17}/>{notice}</p>}{inlineError(error)}
  <div className="dt-live-security-grid"><Panel className="dt-live-account-card"><div className="dt-account-section-head"><span className="dt-account-icon"><KeyRound/></span><div><h2>Password & recovery</h2><p>Reset your password using DeeToo's verified recovery process.</p></div></div>
    <Button variant="outline" disabled={resetBusy} onClick={()=>void forgot()}>{resetBusy?"Requesting…":"Send password reset instructions"}</Button>
    <p className="dt-live-account-note">We never display, store or ask for your current password here. Verification occurs through the dedicated recovery service.</p>
    <div className="dt-account-section-head"><span className="dt-account-icon"><LockKeyhole/></span><div><h2>Two-factor authentication</h2><p>Enrollment and verification require a separate secure step-up experience.</p></div></div>
    <p className="dt-live-account-note">MFA enrollment status is not reported by the authenticated sessions endpoint. This screen does not claim that MFA is enabled.</p></Panel>
   <Panel className="dt-live-account-card"><div className="dt-account-section-head"><span className="dt-account-icon"><Smartphone/></span><div><h2>Active sessions</h2><p>Only live sessions from DeeToo's authentication system.</p></div></div>
    <ResourceView resource={sessions.state} onRetry={sessions.refresh} empty="No sessions found">{()=>active.length?<div className="dt-live-sessions">
    {active.map(s=><div key={s.id}><span className="dt-account-icon">{s.device_info?.toLowerCase().includes("mobile")?<Smartphone size={20}/>:<Laptop size={20}/>}</span>
      <div><h3>{s.device_info||"Unidentified device"} {s.current&&<Badge variant="mint">This session</Badge>}</h3>
      <p>Last active: {prettyDate(s.last_used_at||s.created_at)}</p><small>{s.ip_address?"IP "+s.ip_address:"IP unavailable"}</small></div>
      <Button variant="outline" size="sm" onClick={()=>setTarget(s)}>Revoke</Button></div>)}</div>:<p className="dt-live-account-note">No active sessions are reported.</p>}</ResourceView>
    <Button variant="outline" disabled={active.length===0} onClick={()=>setTarget("all")}>Sign out all devices</Button></Panel></div>
   <Panel className="dt-live-account-card"><div className="dt-account-section-head"><span className="dt-account-icon"><ShieldCheck/></span><div><h2>Privacy controls</h2><p>Account information and deletion permissions</p></div></div>
   <p className="dt-live-account-note">Account deletion and downloadable data exports require a dedicated verified policy and API. No irreversible action is simulated.</p></Panel>
  {target&&<div className="dt-live-account-overlay"><section role="dialog" aria-modal="true" className="dt-live-account-modal" aria-label="Confirm session revocation"><h2>{target==="all"?"Sign out every device?":"Revoke this session?"}</h2><p>{target==="all"?"You will be signed out here too.":"This will immediately invalidate the selected DeeToo session. If this is your current device, you will be signed out."}</p>
  <div><Button variant="outline" onClick={()=>setTarget(null)}>Cancel</Button><Button disabled={busy} onClick={()=>void revoke()}>{busy?"Revoking…":"Confirm sign out"}</Button></div></section></div>}
 </section>;
}
function notificationText(n:NotificationRecord){
 const title=n.subject||n.template_code.replaceAll("_"," ").toLowerCase();
 // Avoid injecting free-form potentially sensitive notification payload.
 const body=typeof n.payload?.message==="string"?n.payload.message:typeof n.payload?.body==="string"?n.payload.body:null;
 return {title,body};
}
function Notifications({gateway,onNavigate}:{gateway:CustomerGateway;onNavigate:(path:string)=>void}){
 const resource=useBackendResource(()=>gateway.notifications.list(),true,[]);
 const [filter,setFilter]=useState("all"),[busy,setBusy]=useState(""),[error,setError]=useState(""),[query,setQuery]=useState("");
 const rows=resource.state.status==="ready"?resource.state.data.notifications:[];
 const categories=[["all","All"],["orders","Orders"],["payments","Payments"],["delivery","Delivery"],["support","Support"]] as const;
 const tag=(n:NotificationRecord)=>n.template_code.includes("PAYMENT")||n.template_code.includes("REFUND")?"payments":n.template_code.includes("RIDER")||n.template_code.includes("DELIVERY")?"delivery":n.template_code.includes("SUPPORT")?"support":"orders";
 const matching=rows.filter(n=>(filter==="all"||tag(n)===filter)&&(!query||notificationText(n).title.toLowerCase().includes(query.toLowerCase())));
 const unread=rows.filter(n=>!n.read_at).length;
 const read=async(n:NotificationRecord)=>{if(n.read_at||busy)return;setBusy(n.id);setError("");try{await gateway.notifications.markRead(n.id);resource.refresh();}catch(e){setError(backendError(e).message);}finally{setBusy("");}};
 useEffect(()=>{const t=setInterval(()=>{if(document.visibilityState==="visible")resource.refresh();},30000);return()=>clearInterval(t);},[resource.refresh]);
 return <section className="dt-notify-page dt-screen-enter dt-live-account"><header className="dt-account-pagehead"><div><h1>Notifications</h1><p>Updates about your real orders, payments, deliveries and support cases.</p></div>
   <Badge variant="mint">{unread} unread</Badge></header>{inlineError(error)}
   <Panel className="dt-live-account-card"><div className="dt-live-notify-tools"><div role="tablist" aria-label="Notification filters">{categories.map(([id,label])=><button key={id} role="tab" aria-selected={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div>
    <input aria-label="Search notifications" placeholder="Search notifications" value={query} onChange={e=>setQuery(e.target.value)}/><Button variant="outline" onClick={resource.refresh}><RefreshCw size={16}/> Refresh</Button></div>
    <ResourceView resource={resource.state} onRetry={resource.refresh} empty="No notifications yet">{()=>matching.length?<div className="dt-live-notification-list">
      {matching.map(n=>{const {title,body}=notificationText(n);return <article key={n.id} className={!n.read_at?"dt-live-notification-unread":""}>
       <span className="dt-account-icon"><Bell size={21}/></span><div><h3>{title}</h3>{body&&<p>{body}</p>}<small>{prettyDate(n.created_at)} · {n.channel.toLowerCase()}</small></div>
       {!n.read_at?<Button variant="outline" size="sm" disabled={busy===n.id} onClick={()=>void read(n)}>Mark read</Button>:<span className="dt-live-muted"><Check size={15}/> Read</span>}
      </article>})}</div>:<p className="dt-live-account-note">No notifications match the selected filters.</p>}</ResourceView></Panel>
   <div className="dt-live-security-grid"><Panel className="dt-live-account-card"><h2>Delivery preferences</h2><ResourceError message="Per-channel email, SMS and push preferences need a customer consent API. No toggles are displayed as saved before that API exists."/></Panel>
   <Panel className="dt-live-account-card"><h2>Notification actions</h2><ResourceError message="Bulk mark-read is not supported by the current API. Read individual notifications above."/>
   <Button variant="outline" onClick={()=>onNavigate("/orders")}>View orders <ArrowRight size={16}/></Button></Panel></div>
 </section>;
}
export function LiveAccount({screen,gateway,authenticated,requestSignIn,onNavigate,logout,userId,onAddressesChanged}:Props){
 if(!authenticated)return <StatusPanel title="Sign in to manage your account" description="Customer profile, sessions and notifications are private to the signed-in DeeToo account."><Button onClick={requestSignIn}>Sign in</Button></StatusPanel>;
 return screen==="profile"?<Profile key={userId} gateway={gateway} onNavigate={onNavigate} onAddressesChanged={onAddressesChanged}/>:
 screen==="security"?<Security key={userId} gateway={gateway} logout={logout}/>:
 <Notifications key={userId} gateway={gateway} onNavigate={onNavigate}/>;
}
