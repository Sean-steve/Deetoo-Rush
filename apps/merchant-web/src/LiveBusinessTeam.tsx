import React,{useEffect,useMemo,useState} from "react";
import {Ellipsis,FilePlus2,Pencil,Plus,ShieldCheck,Store,Users} from "lucide-react";
import type {MerchantLiveBridge} from "./MerchantLiveApp";

const names:Record<string,string>={merchant_owner:"Owner",merchant_manager:"Manager",merchant_staff:"Staff"};
const statuses=(value:string)=>value==="ACTIVE"?"Active":value==="SUSPENDED"?"Inactive":"Pending";
const capNames:Record<string,string>={ORDERS_WRITE:"Manage kitchen orders",MENU_WRITE:"Manage menu",INVENTORY_WRITE:"Update inventory",BRANCH_WRITE:"Configure branches",DOCUMENTS_WRITE:"Manage documents",FINANCE_READ:"View finances",TEAM_INVITE:"Invite staff"};
function dateText(s:string){return s?new Date(s).toLocaleDateString("en-KE"):"—";}
export function LiveBusinessTeam({live,notify}:{live:MerchantLiveBridge;notify:(s:string)=>void}){
 const profile=live.resource.profile||{},members=live.resource.team?.members||[],
   invitations=live.resource.team?.invitations||[],docs=live.resource.documents||[];
 const [dialog,setDialog]=useState<"profile"|"invite"|"member"|"document"|"roles"|"image"|null>(null),
       [member,setMember]=useState<any|null>(null),[tab,setTab]=useState("All"),
       [query,setQuery]=useState(""),[roleFilter,setRoleFilter]=useState("All roles"),
       [branchFilter,setBranchFilter]=useState("All branches"),[busy,setBusy]=useState(false);
 const [name,setName]=useState(""),[description,setDescription]=useState(""),[email,setEmail]=useState(""),
   [phone,setPhone]=useState(""),[role,setRole]=useState("merchant_staff"),[assigned,setAssigned]=useState<string[]>([]);
 const [documentType,setDocumentType]=useState("BUSINESS_REGISTRATION"),[file,setFile]=useState<File|null>(null),
   [capRole,setCapRole]=useState("merchant_manager"),[capability,setCapability]=useState("ORDERS_WRITE"),[allow,setAllow]=useState(false);
 useEffect(()=>{setName(String(profile.display_name||""));setDescription(String(profile.description||""));
   setPhone(String(profile.phone||""));setEmail(String(profile.email||""));},[profile.id,profile.updated_at,live.branchId]);
 const all=[...members.map((m:any)=>({...m,pending:false})),...invitations.map((m:any)=>({...m,user_email:m.email,pending:true,status:"PENDING"}))];
 const list=useMemo(()=>all.filter(m=>(tab==="All"||statuses(m.status)===tab)
   &&(roleFilter==="All roles"||names[m.role_code]===roleFilter)
   &&(branchFilter==="All branches"||m.branch_ids?.includes(branchFilter))
   &&[m.user_email,m.email,m.user_name,m.role_code].join(" ").toLowerCase().includes(query.toLowerCase())),
  [members,invitations,tab,roleFilter,branchFilter,query]);
 const mutate=async(path:string,method:string,input:unknown)=>{
  setBusy(true);
  try{await live.api.request(path,{method,body:JSON.stringify(input)});live.refresh();setDialog(null);notify("Saved to DeeToo");}
  catch(e){notify("Unable to save: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 };
 const openInvite=()=>{setEmail("");setRole("merchant_staff");setAssigned([live.branchId]);setMember(null);setDialog("invite");};
 const edit=(m:any)=>{setMember(m);setEmail(m.user_email||m.email||"");setRole(m.role_code);setAssigned(m.branch_ids||[]);setDialog("member");};
 const upload=async()=>{
  if(!file){notify("Choose a PDF or document image first");return;}
  if(file.size>5*1024*1024){notify("Documents must be under 5MB");return;}
  setBusy(true);
  try{
   const g=(await live.api.request<any>("/media/uploads",{method:"POST",body:JSON.stringify({
    purpose:"MERCHANT_DOCUMENT",content_type:file.type,reference_type:"MERCHANT",reference_id:live.merchantId})})).data;
   const response=await fetch(g.upload_url,{method:"PUT",headers:g.upload_headers||{"Content-Type":file.type},body:file});
   if(!response.ok)throw new Error("Storage upload failed");
   const checked=(await live.api.request<any>(`/media/uploads/${g.media_id}/complete`,{method:"POST"})).data;
   if(checked.status!=="VERIFIED")throw new Error("Document verification pending");
   await live.api.request("/merchant/experience/documents",{method:"POST",body:JSON.stringify({media_id:g.media_id,document_type:documentType})});
   live.refresh();setDialog(null);notify("Document submitted for administrator review");
  }catch(e){notify("Unable to upload document: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}
 };
 const cap=live.resource.roleMatrix?.roles?.[capRole]||{};
 return <div className="mp-live-business">
  <div className="mp-summary-grid">
   <button className="mp-summary" onClick={()=>document.getElementById("mp-team-list")?.scrollIntoView()}><span className="mp-summary-icon mp-green"><Users/></span><span><small>Team members</small><strong>{all.length}</strong><em>{all.filter(m=>m.status==="ACTIVE").length} active · {invitations.length} pending</em></span></button>
   <button className="mp-summary" onClick={()=>setDialog("roles")}><span className="mp-summary-icon mp-violet"><ShieldCheck/></span><span><small>Roles</small><strong>3</strong><em>Owner, Manager, Staff</em></span></button>
   <button className="mp-summary" onClick={()=>notify("Use Branch Settings to manage your locations.")}><span className="mp-summary-icon mp-orange"><Store/></span><span><small>Branches</small><strong>{live.branches.length}</strong><em>{live.branch?.name||"Selected branch"}</em></span></button>
   <button className="mp-summary" onClick={()=>setTab("Pending")}><span className="mp-summary-icon mp-blue"><Users/></span><span><small>Pending invites</small><strong>{invitations.length}</strong><em>Awaiting acceptance</em></span></button>
  </div>
  {live.errors.team&&<p className="mp-live-error" role="alert">Team data unavailable: {live.errors.team}</p>}
  <div className="mp-business-layout"><div className="mp-business-left">
   <section className="mp-white-card"><div className="mp-card-title"><div><h3>Business profile</h3><p>Business details displayed to customers.</p></div><button className="mp-outline" onClick={()=>setDialog("profile")}><Pencil size={15}/> Edit profile</button></div>
    <div className="mp-business-profile"><div className="mp-restaurant-photo">🏮<button onClick={()=>setDialog("image")} aria-label="Edit business logo">📷</button></div><div>
    <p>Legal name<strong>{profile.legal_name||"Not supplied"}</strong></p><p>Display name<strong>{profile.display_name||"Not supplied"}</strong></p><p>Business description<strong>{profile.description||"Not supplied"}</strong></p></div></div>
    <div className="mp-profile-details"><p>♧ &nbsp; Business type<strong>Restaurant</strong></p><p>⌾ &nbsp; Street address<strong>{live.branch?.address_line1||"Not supplied"}</strong></p>
      <p>☎ &nbsp; Phone<strong>{profile.phone||"Not supplied"}</strong></p><p>⊕ &nbsp; Operating country<strong>{live.branch?.country_code||"KE"}</strong></p><p>✉ &nbsp; Email<strong>{profile.email||"Not supplied"}</strong></p></div>
   </section>
   <section className="mp-white-card"><div className="mp-card-title"><div><h3>Business documents</h3><p>Verification is performed by authorized administrators.</p></div><button className="mp-primary" onClick={()=>setDialog("document")}>Add document</button></div>
    {docs.map((d:any)=><button className="mp-doc-row" key={d.id} onClick={()=>notify("Use an authorized signed media link to view your private document.")}>
      <FilePlus2 size={20}/><span><b>{String(d.document_type).replaceAll("_"," ")}</b><small>Uploaded {dateText(d.created_at)}</small></span>
      <span className={"mp-pill mp-"+(d.review_status==="VERIFIED"?"green":"orange")}>{d.review_status}</span><Ellipsis size={17}/></button>)}
    {!docs.length&&<p className="mp-live-empty">No documents uploaded yet.</p>}
   </section>
  </div><div className="mp-business-right">
   <section className="mp-white-card" id="mp-team-list"><div className="mp-card-title"><div><h3>Team members</h3><p>Invite staff and manage permissions by branch.</p></div><button className="mp-primary" onClick={openInvite}><Plus size={16}/> Invite team member</button></div>
    <div className="mp-tabs">{["All","Active","Pending","Inactive"].map(t=><button key={t} className={tab===t?"selected":""} onClick={()=>setTab(t)}>{t} ({t==="All"?all.length:all.filter(m=>statuses(m.status)===t).length})</button>)}</div>
    <div className="mp-toolbar mp-team-controls"><div className="mp-inline-search"><input placeholder="Search team…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
     <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>{["All roles","Owner","Manager","Staff"].map(x=><option key={x}>{x}</option>)}</select>
     <select value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option>All branches</option>{live.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>
    </div><div className="mp-table-scroll"><table><thead><tr>{["Name","Email / Phone","Role","Branch access","Status","Actions"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{list.map(m=><tr key={m.id}><td>{m.user_name||m.user_email||m.email||"Team member"}</td><td>{m.user_email||m.email||"—"}</td><td>{names[m.role_code]||m.role_code}</td><td>{m.branch_ids?.length?m.branch_ids.length+" branches":"All branches"}</td><td><span className="mp-pill mp-green">{statuses(m.status)}</span></td><td><button aria-label="Manage team member" disabled={Boolean(m.pending)} onClick={()=>edit(m)}><Ellipsis size={16}/></button></td></tr>)}{!list.length&&<tr><td colSpan={6}>No matching team members.</td></tr>}</tbody></table></div>
   </section>
   <section className="mp-white-card"><div className="mp-card-title"><div><h3>Roles & permissions</h3><p>Owner restrictions cannot grant more access than platform RBAC.</p></div><button className="mp-outline" onClick={()=>setDialog("roles")}>Manage roles</button></div>
    <div className="mp-summary-grid">{["Owner","Manager","Staff"].map(x=><button className="mp-outline" key={x} onClick={()=>{setCapRole("merchant_"+x.toLowerCase());setDialog("roles");}}>{x}</button>)}</div>
   </section>
  </div></div>
  {dialog&&<div className="mp-modal-overlay" onMouseDown={e=>e.target===e.currentTarget&&setDialog(null)}><section role="dialog" aria-modal="true" aria-label={dialog} className="mp-modal">
   <div className="mp-modal-head"><h2>{({profile:"Edit business profile",invite:"Invite team member",member:"Manage team access",document:"Add business document",roles:"Roles & permissions",image:"Business logo"} as Record<string,string>)[dialog]}</h2><button onClick={()=>setDialog(null)}>✕</button></div>
   {dialog==="profile"&&<form onSubmit={e=>{e.preventDefault();void mutate("/merchant/profile","PATCH",{display_name:name,description,phone,email});}}>
     <label>Display name<input required value={name} onChange={e=>setName(e.target.value)}/></label><label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label><label>Business phone<input value={phone} onChange={e=>setPhone(e.target.value)}/></label><label>Business email<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
     <p>Legal entity changes require appropriate business verification.</p><button disabled={busy} className="mp-primary mp-full">{busy?"Saving…":"Save profile"}</button></form>}
   {(dialog==="invite"||dialog==="member")&&<form onSubmit={e=>{e.preventDefault();void mutate(dialog==="invite"?"/merchant/team/invitations":`/merchant/team/memberships/${member.id}`,dialog==="invite"?"POST":"PATCH",dialog==="invite"?{email,role_code:role,branch_ids:assigned}:{role_code:role,branch_ids:assigned});}}>
     <label>Email<input type="email" disabled={dialog==="member"} required value={email} onChange={e=>setEmail(e.target.value)}/></label>
     <label>Role<select value={role} onChange={e=>setRole(e.target.value)}><option value="merchant_owner">Owner</option><option value="merchant_manager">Manager</option><option value="merchant_staff">Staff</option></select></label>
     <label>Branch access<select multiple size={Math.min(4,live.branches.length||1)} value={assigned} onChange={e=>setAssigned(Array.from(e.target.selectedOptions).map(x=>x.value))}>{live.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><small>Empty list grants all branches only where the server role permits it.</small></label>
     <button className="mp-primary mp-full" disabled={busy}>{dialog==="invite"?"Send invitation":"Save access"}</button>
     {dialog==="member"&&<button type="button" className="mp-p2-danger-button mp-full" disabled={busy} onClick={()=>void mutate(`/merchant/team/memberships/${member.id}/revoke`,"POST",{})}>Revoke membership</button>}
    </form>}
   {dialog==="document"&&<><p>Only authorized owners/managers can upload documents. Verification is performed by Admin.</p><label>Document type<select value={documentType} onChange={e=>setDocumentType(e.target.value)}>{["BUSINESS_REGISTRATION","KRA_PIN","FOOD_HANDLING","OTHER"].map(x=><option key={x}>{x}</option>)}</select></label>
      <label>File (max 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
      <button className="mp-primary mp-full" disabled={busy} onClick={()=>void upload()}>{busy?"Uploading…":"Upload for review"}</button></>}
   {dialog==="image"&&<><p>Merchant images use a verified private object-storage upload. Configure media credentials before uploading.</p><button className="mp-outline" onClick={()=>setDialog(null)}>Close</button></>}
   {dialog==="roles"&&<><p>Server-enforced restrictions. Only Merchant Owners can change manager or staff capabilities.</p>
     <label>Role<select value={capRole} onChange={e=>setCapRole(e.target.value)}><option value="merchant_owner">Owner (immutable)</option><option value="merchant_manager">Manager</option><option value="merchant_staff">Staff</option></select></label>
     <div>{Object.entries(cap).map(([key,value]:[string,any])=><div className="mp-modal-row" key={key}><span>{capNames[key]||key}</span><strong>{value.allowed?"Allowed":"Restricted"}{value.platform_allowed?"":" · Platform blocked"}</strong></div>)}</div>
     <label>Capability<select value={capability} onChange={e=>setCapability(e.target.value)}>{Object.keys(capNames).map(x=><option key={x} value={x}>{capNames[x]}</option>)}</select></label>
     <label><input type="checkbox" checked={allow} onChange={e=>setAllow(e.target.checked)}/> Allow where platform permits</label>
     <button className="mp-primary mp-full" disabled={busy||capRole==="merchant_owner"||!cap[capability]?.editable}
       onClick={()=>void mutate(`/merchant/experience/roles/capabilities/${capRole}`,"PUT",{capability,allowed:allow})}>Save role restriction</button></>}
  </section></div>}
 </div>;
}
