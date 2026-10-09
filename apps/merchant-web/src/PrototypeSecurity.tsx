import type { MerchantLiveBridge } from "./MerchantLiveApp";
import React, { useEffect, useState } from "react";
import { AlertTriangle, Bell, Check, ChevronRight, Clock3, KeyRound, Laptop, LockKeyhole, LogOut, Monitor, ShieldCheck, Smartphone, TabletSmartphone, Trash2, UserRound, X } from "lucide-react";
import { BranchBanner, DemoBadge, DemoCard, DemoHeading } from "./PrototypeBranch";

type Session={id:number|string;device:string;location:string;time:string;current:boolean;trusted:boolean;browser:string};
type Login={id:number|string;date:string;device:string;location:string;status:"Success"|"Failed"};
const sessionSeed:Session[]=[
{id:1,device:"Linux · Chrome 118.0.0",location:"Kalimoni, Juja, Kenya",time:"Just now",current:true,trusted:true,browser:"desktop"},
{id:2,device:"Android · Chrome 118.0.0",location:"Juja, Kenya",time:"Oct 9, 2026 10:18 AM",current:false,trusted:true,browser:"phone"},
{id:3,device:"Windows · Edge 117.0.0",location:"Nairobi, Kenya",time:"Oct 8, 2026 4:32 PM",current:false,trusted:true,browser:"desktop"}];
const loginSeed:Login[]=[
{id:1,date:"Oct 9, 2026 12:24 PM",device:"Linux · Chrome",location:"Kalimoni, Juja",status:"Success"},
{id:2,date:"Oct 9, 2026 10:18 AM",device:"Android · Chrome",location:"Juja, Kenya",status:"Success"},
{id:3,date:"Oct 8, 2026 4:32 PM",device:"Windows · Edge",location:"Nairobi, Kenya",status:"Success"},
{id:4,date:"Oct 7, 2026 9:15 PM",device:"Android · Chrome",location:"Nairobi, Kenya",status:"Success"},
{id:5,date:"Oct 6, 2026 2:11 PM",device:"Linux · Firefox",location:"Kalimoni, Juja",status:"Success"},
{id:6,date:"Oct 5, 2026 11:03 AM",device:"Windows · Chrome",location:"Nakuru, Kenya",status:"Failed"}];
function readLocal<T>(key:string,fallback:T):T{try{const val=localStorage.getItem(key);return val?JSON.parse(val) as T:fallback;}catch{return fallback;}}
export function PrototypeSecurity({store,onNavigate,notify,live}:{store:string;onNavigate:(s:string)=>void;notify:(s:string)=>void;live?:MerchantLiveBridge}){
 const [sessions,setSessions]=useState<Session[]>(()=>readLocal("mp-demo-sessions",sessionSeed));
 const [loginHistory,setHistory]=useState<Login[]>(loginSeed);
 const [historyAll,setHistoryAll]=useState(false);
 const [twoFactor,setTwoFactor]=useState(()=>readLocal("mp-demo-2fa",true));
 const [deactivated,setDeactivated]=useState(()=>readLocal("mp-demo-deactivated",false));
 const [dialog,setDialog]=useState<"password"|"2fa"|"trusted"|"deactivate"|"session"|"history"|"all"|null>(null);
 const [chosen,setChosen]=useState<string|number|null>(null);
 const [password,setPassword]=useState(""),[confirmPassword,setConfirmPassword]=useState("");
 const [currentPassword,setCurrentPassword]=useState(""),[reason,setReason]=useState(""),
   [totp,setTotp]=useState(""),[mfaSecret,setMfaSecret]=useState(""),
   [trustedDevices,setTrustedDevices]=useState<any[]>([]),[securityError,setSecurityError]=useState("");

 const loadSecurity=async()=>{if(!live)return;try{
   const [ss,history,mfa,devices]=await Promise.all([
     live.api.listSessions(),live.api.request<any>("/auth/security/login-history?limit=30"),
     live.api.request<any>("/auth/security/mfa/status"),live.api.request<any[]>("/auth/security/trusted-devices")]);
   setSessions((ss.data||[]).map((x:any)=>({id:x.id,device:x.device_info||"Unknown device",location:x.ip_address||"Unknown location",
     time:new Date(x.last_used_at||x.created_at).toLocaleString("en-KE"),current:Boolean(x.is_current||x.current),
     trusted:false,browser:/android|iphone/i.test(x.device_info||"")?"phone":"desktop"})));
   const hist=(history.data?.sessions||[]).map((x:any)=>({id:x.id,date:new Date(x.created_at).toLocaleString("en-KE"),
     device:x.device_info||"Unknown device",location:x.ip_address||"Unknown network",status:"Success" as const}));
   const events=(history.data?.events||[]).map((x:any)=>({id:x.id,date:new Date(x.created_at).toLocaleString("en-KE"),
     device:x.device_info||x.event_type,location:x.ip_address||"Unknown network",
     status:x.event_type?.includes("FAILED")?"Failed" as const:"Success" as const}));
   setHistory([...hist,...events]);setTwoFactor(Boolean(mfa.data.enabled));
   setTrustedDevices((devices.data||[]).filter((x:any)=>!x.revoked_at));setSecurityError("");
 }catch(e){setSecurityError(e instanceof Error?e.message:String(e));}};
 useEffect(()=>{if(live)void loadSecurity();},[live?.branchId]);
 const securityCommand=async(path:string,method="POST",body?:unknown)=>{
  if(!live)return;
  try{await live.api.request(path,{method,body:body===undefined?undefined:JSON.stringify(body)});
    await loadSecurity();setDialog(null);notify("Security change saved to DeeToo");
  }catch(e){notify("Unable to update security: "+(e instanceof Error?e.message:String(e)));}
 };

 const saveSessions=(next:Session[])=>{setSessions(next);if(!live)localStorage.setItem("mp-demo-sessions",JSON.stringify(next));};
 const revoke=(id:string|number)=>{if(live){void securityCommand(`/auth/sessions/${id}/revoke`);return;}saveSessions(sessions.filter(x=>x.id!==id));setDialog(null);notify("Session revoked in frontend preview");};
 const logoutAll=()=>{if(live){void live.api.revokeAllSessions().then(()=>live.logout()).catch(e=>notify("Unable to sign out: "+(e instanceof Error?e.message:String(e))));return;}saveSessions([]);setDialog(null);notify("All demo sessions signed out. No real tokens were revoked.");};
 const toggleTrust=(id:string|number)=>{if(live){notify("Trusted authentication devices are managed below. Verification is required.");setDialog("trusted");return;}saveSessions(sessions.map(x=>x.id===id?{...x,trusted:!x.trusted}:x));notify("Device trust changed in frontend preview");};
 const trustedCount=live?trustedDevices.length:sessions.filter(s=>s.trusted&&!s.current).length;
 const deviceIcon=(v:string)=>v==="phone"?<Smartphone size={25}/>:<Monitor size={26}/>;
 return <div className="mp-p2">
  {securityError&&<div role="alert" className="mp-live-error">{securityError}</div>}
  <DemoHeading eyebrow="ACCOUNT" title="Security & sessions" description="Keep your account secure and manage where it is being accessed." action={<BranchBanner store={store} action="Back to dashboard" onAction={()=>onNavigate("orders")}/>} />
  <div className="mp-p2-security-stats">
    <div className="mp-p2-security-stat"><span className="mp-p2-stat-icon mp-green"><ShieldCheck size={27}/></span><div><small>Active sessions</small><strong>{sessions.length}</strong><p>Devices currently signed in</p></div></div>
    <div className="mp-p2-security-stat"><span className="mp-p2-stat-icon mp-blue"><Monitor size={27}/></span><div><small>Trusted devices</small><strong>{trustedCount}</strong><p>Devices you've marked as trusted</p></div></div>
    <div className="mp-p2-security-stat"><span className="mp-p2-stat-icon mp-blue"><Clock3 size={27}/></span><div><small>Last login</small><strong>{live?(loginHistory[0]?.date||"No login events"):"Today, 12:24 PM"}</strong><p>{live?(loginHistory[0]?.device||"Device information unavailable"):"Kalimoni, Juja · Chrome on Linux"}</p></div></div>
    <div className="mp-p2-security-stat"><span className="mp-p2-stat-icon mp-orange"><LockKeyhole size={27}/></span><div><small>Security status</small><strong className="mp-p2-security-strong">{live?(twoFactor?"2FA enabled":"2FA disabled"):"Strong"} <span/></strong><p>{live?"Verified account protection status":"Illustrative security score"}</p></div></div>
  </div>
  <div className="mp-p2-security-grid">
    <DemoCard><div className="mp-p2-card-head"><div><h2>Active sessions</h2><p>These are the devices currently signed in to your account.</p></div><button className="mp-p2-danger-soft" onClick={()=>setDialog("all")}><LogOut size={15}/> Sign out from all devices</button></div><div className="mp-p2-sessions">{sessions.map(session=><div className={"mp-p2-session "+(session.current?"current":"")} key={session.id}>{deviceIcon(session.browser)}<div><span>{session.current&&<DemoBadge>Current session</DemoBadge>}<strong>{session.device}</strong></span><p>⌖ {session.location} · {session.current?"This device":session.time}</p></div><div className="mp-p2-session-side"><small>{session.time}</small>{session.trusted&&<DemoBadge>{session.current?"Current":"Trusted"}</DemoBadge>}{!session.current&&<button aria-label={"Manage "+session.device} onClick={()=>{setChosen(session.id);setDialog("session");}}>⋮</button>}</div></div>)}{sessions.length===0&&<div className="mp-p2-empty">{live?"No active sessions reported by the server.":<>All preview sessions have been signed out. <button onClick={()=>{saveSessions(sessionSeed);notify("Demo sessions restored");}}>Restore demo sessions</button></>}</div>}</div></DemoCard>
    <DemoCard><div className="mp-p2-card-head"><div><h2>Login history</h2><p>Recent sign-in activity on your account.</p></div><button className="mp-outline" onClick={()=>setHistoryAll(!historyAll)}>{historyAll?"Show less":"View all"}</button></div><div className="mp-table-scroll"><table><thead><tr><th>Date & time</th><th>Device</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead><tbody>{(historyAll?loginHistory:loginHistory.slice(0,6)).map(row=><tr key={row.id}><td>{row.date}</td><td>{row.device}</td><td>{row.location}</td><td><DemoBadge kind={row.status==="Success"?"green":"red"}>{row.status}</DemoBadge></td><td><button aria-label={"Inspect login "+row.date} onClick={()=>{setChosen(row.id);setDialog("history");}}>⋮</button></td></tr>)}</tbody></table></div><small className="mp-p2-data-note">{live?"Authenticated user-associated sessions and security events.":"Illustrative login history, not authenticated security events."}</small></DemoCard>
    <DemoCard><div className="mp-p2-card-head"><div><h2>Security settings</h2><p>Manage your account security preferences.</p></div></div><div className="mp-p2-security-options"><button onClick={()=>setDialog("password")}><LockKeyhole/><span><strong>Change password</strong><small>Update your password regularly to keep your account secure.</small></span><ChevronRight/></button><button onClick={()=>setDialog("2fa")}><ShieldCheck/><span><strong>Two-factor authentication (2FA)</strong><small>Add an extra layer of security to your account.</small></span><DemoBadge>{twoFactor?"Enabled":"Disabled"}</DemoBadge><ChevronRight/></button><button onClick={()=>setDialog("trusted")}><Laptop/><span><strong>Trusted devices</strong><small>Manage remembered devices. Remembering a device never bypasses MFA.</small></span><ChevronRight/></button></div></DemoCard>
    <DemoCard><div className="mp-p2-card-head"><div><h2 className="mp-p2-danger-title">Danger zone</h2><p>These actions can affect your account access and data.</p></div></div><div className="mp-p2-danger-list"><div><span><Trash2/></span><div><strong>Sign out from all devices</strong><small>{live?"This revokes all active server sessions, including this one.":"This will end all active demo sessions, including your current one."}</small></div><button className="mp-p2-danger-button" onClick={()=>setDialog("all")}>Sign out all</button></div><div><span><AlertTriangle/></span><div><strong>{deactivated?"Reactivate account":"Deactivate account"}</strong><small>{live?"Submit an account deactivation request for administrator review.":"Temporarily disable your merchant access. You can reactivate it later."}</small></div><button className="mp-p2-danger-outline" onClick={()=>setDialog("deactivate")}>{deactivated?"Reactivate":"Deactivate"}</button></div></div></DemoCard>
  </div>
  {dialog&&<div className="mp-modal-overlay" onMouseDown={e=>e.target===e.currentTarget&&setDialog(null)}><section className="mp-modal" role="dialog" aria-modal="true" aria-label={dialog}><div className="mp-modal-head"><h2>{dialog==="password"?"Change password":dialog==="2fa"?"Two-factor authentication":dialog==="trusted"?"Trusted devices":dialog==="deactivate"?(deactivated?"Reactivate account":"Deactivate account"):dialog==="session"?"Manage session":dialog==="history"?"Login event":"Sign out all devices"}</h2><button aria-label="Close" onClick={()=>setDialog(null)}><X/></button></div>
    {dialog==="password"&&<form onSubmit={e=>{e.preventDefault();if(password!==confirmPassword){notify("Passwords must match");return;}
 if(live){void securityCommand("/auth/security/password/change","POST",{current_password:currentPassword,new_password:password});setPassword("");setConfirmPassword("");return;}
 setPassword("");setConfirmPassword("");setDialog(null);notify("Demo password form submitted. No credentials changed.");}}><p>{live?"Current password and enabled MFA verification are required; other sessions will be revoked.":"Password changes are simulated in this isolated frontend preview. Never use a real password here."}</p>
 {live&&<label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label>}<label>{live?"New password":"New demo password"}<input type="password" autoComplete="new-password" minLength={live?12:8} required value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirm demo password<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label><button className="mp-primary mp-full">{live?"Change password":"Save demo password"}</button></form>}
    {dialog==="2fa"&&<><p>{live?"Enroll with your account password and authenticator code; disable requires recent MFA verification.":"Enable or disable the example two-factor authentication state. Real enrollment, QR codes and recovery codes require authentication services."}</p><div className="mp-p2-toggle-row"><strong>Two-factor authentication</strong><button role="switch" className={"mp-switch "+(twoFactor?"on":"")} aria-checked={twoFactor} aria-label="Two-factor authentication" onClick={()=>{if(live){notify("Use the verified enrollment or disable action below.");return;}setTwoFactor(!twoFactor);localStorage.setItem("mp-demo-2fa",JSON.stringify(!twoFactor));}}><span/></button></div>{live&&<><label>Account password<input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password"/></label>
 <label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={e=>setTotp(e.target.value)}/></label>
 {mfaSecret&&<p role="status">Add this secret to your authenticator: <code>{mfaSecret}</code></p>}
 {twoFactor?<button className="mp-p2-danger-button mp-full" onClick={()=>void securityCommand("/auth/security/mfa/disable","POST",{password:currentPassword})}>Disable MFA with verification</button>
 :<button className="mp-outline mp-full" onClick={()=>void live.api.request<any>("/auth/mfa/enroll",{method:"POST",body:JSON.stringify({password:currentPassword})}).then(r=>setMfaSecret(String(r.data?.secret||r.data?.totp_secret||"Enrollment initiated; follow authenticator setup instructions."))).catch(e=>notify(e instanceof Error?e.message:String(e)))}>Start authenticator enrollment</button>}
 <button className="mp-primary mp-full" onClick={()=>void live.api.request("/auth/mfa/verify",{method:"POST",body:JSON.stringify({code:totp})}).then(()=>{setTwoFactor(true);setDialog(null);notify("Authenticator verification succeeded");}).catch(e=>notify(e instanceof Error?e.message:String(e)))}>Verify code</button></>}
 <button className="mp-primary mp-full" onClick={()=>{setDialog(null);if(!live)notify("2FA preference updated locally (not real authentication)");}}>Done</button></>}
    {dialog==="trusted"&&<><p>{live?"Remembered devices do not bypass MFA; account verification is required.":"Manage trust for the devices shown in the active sessions list."}</p>
 {live&&<><label>Current device name<input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Merchant laptop"/></label>
 <label>Account password<input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label>
 <button className="mp-primary mp-full" onClick={()=>void securityCommand("/auth/security/trusted-devices/current","POST",{name:reason,password:currentPassword})}>Trust current device (verified)</button>
 {trustedDevices.map(d=><div className="mp-p2-modal-device" key={d.id}><strong>{d.display_name}</strong><button className="mp-p2-danger-button" onClick={()=>void securityCommand(`/auth/security/trusted-devices/${d.id}`,"DELETE")}>Untrust</button></div>)}</>}
 {!live&&sessions.map(s=><div className="mp-p2-modal-device" key={s.id}><span>{deviceIcon(s.browser)} {s.device}</span><button className="mp-outline" onClick={()=>toggleTrust(s.id)}>{s.trusted?"Untrust":"Trust"}</button></div>)}<button className="mp-primary mp-full" onClick={()=>setDialog(null)}>Done</button></>}
    {dialog==="session"&&<><p>{sessions.find(s=>s.id===chosen)?.device||"Device"}</p><div className="mp-p2-modal-device"><button className="mp-outline" onClick={()=>{if(chosen!=null)toggleTrust(chosen);}}>{sessions.find(s=>s.id===chosen)?.trusted?"Untrust device":"Trust device"}</button><button className="mp-p2-danger-button" onClick={()=>{if(chosen!=null)revoke(chosen);}}>Revoke session</button></div></>}
    {dialog==="history"&&<><p>{live?"Recent user-associated security events.":"Event details (illustrative):"}</p>{Object.entries(loginHistory.find(x=>x.id===chosen)||{}).map(([key,value])=><div className="mp-modal-row" key={key}>{key}<strong>{String(value)}</strong></div>)}</>}
    {dialog==="all"&&<><p>{live?"All sessions will be revoked server-side, including the current one. You will be signed out.":"Are you sure? All locally simulated sessions will be removed. This does not sign out any real user."}</p><button className="mp-p2-danger-button mp-full" onClick={logoutAll}>Confirm sign out all</button></>}
    {dialog==="deactivate"&&<><p>{deactivated?"Restore this account\'s demo state?":live?"Request account deactivation? An administrator must approve before account access changes.":"Deactivate this account in the prototype? This does not affect merchant access on the backend."}</p><div>{live&&<><label>Account password<input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label><label>Reason<textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label></>}</div>
 <button className="mp-p2-danger-button mp-full" onClick={()=>{if(live){void securityCommand("/auth/security/deactivation-request","POST",{password:currentPassword,reason});return;}setDeactivated(!deactivated);localStorage.setItem("mp-demo-deactivated",JSON.stringify(!deactivated));setDialog(null);notify("Account state changed in frontend preview only");}}>{live?"Submit for admin review":deactivated?"Reactivate demo account":"Deactivate demo account"}</button></>}
  </section></div>}
 </div>;
}
