import type { MerchantLiveBridge } from "./MerchantLiveApp";
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, Check, ChevronRight, Clock3, Download, Ellipsis, FilePlus, FileText, Filter, Headphones, LifeBuoy, MessageCircle, Paperclip, Phone, Plus, Search, Send, Settings, ShieldCheck, User, Wallet, X } from "lucide-react";
import { DemoBadge, DemoCard, DemoHeading } from "./PrototypeBranch";

type CaseStatus="Open"|"In progress"|"Awaiting you"|"Resolved";
type CaseMessage={id:string|number;sender:"Merchant"|"DeeToo Support";body:string;date:string;files:string[]};
type SupportCase={id:string;title:string;status:CaseStatus;category:string;created:string;age:string;preview:string;order?:string;messages:CaseMessage[]};
const initial:SupportCase[]=[
{id:"#SUP-00123",title:"Unable to receive new orders",status:"Open",category:"Orders",created:"Oct 9, 2026, 10:15 AM",age:"2 hours ago",preview:"My store is online but I'm not receiving new orders. Please...",messages:[
{id:1,sender:"Merchant",body:"My store is online but I'm not receiving new orders. Please help me check what might be wrong. This started about 2 hours ago.",date:"Oct 9, 2026, 10:15 AM",files:["screenshot.png"]},
{id:2,sender:"DeeToo Support",body:"Hello,\n\nThank you for reaching out. We've checked your branch and can see the menu is visible. We're investigating why new orders are not coming through. We'll update you shortly.",date:"Oct 9, 2026, 10:32 AM",files:[]},
{id:3,sender:"Merchant",body:"Thank you. Please let me know once it's resolved. I've also attached a screenshot of my dashboard.",date:"Oct 9, 2026, 11:05 AM",files:[]}]},
{id:"#SUP-00122",title:"Payout not received",status:"In progress",category:"Payments",created:"Oct 8, 2026",age:"1 day ago",preview:"My weekly settlement has not been received in my M-PESA account...",messages:[{id:4,sender:"Merchant",body:"My weekly settlement has not been received in my M-PESA account.",date:"Oct 8, 2026",files:[]}]},
{id:"#SUP-00121",title:"Menu item not showing",status:"Awaiting you",category:"Menu",created:"Oct 7, 2026",age:"2 days ago",preview:"I added a new menu item but it's not visible on the customer app...",messages:[{id:5,sender:"Merchant",body:"My new menu item is not showing in the customer app.",date:"Oct 7, 2026",files:[]},{id:6,sender:"DeeToo Support",body:"Could you send us the item name and the branch where it should appear?",date:"Oct 8, 2026",files:[]}]},
{id:"#SUP-00120",title:"Update business information",status:"Resolved",category:"Business",created:"Oct 5, 2026",age:"4 days ago",preview:"I need to update my business documents and KRA PIN...",messages:[{id:7,sender:"Merchant",body:"How do I update my business documents and KRA PIN?",date:"Oct 5, 2026",files:[]},{id:8,sender:"DeeToo Support",body:"Your request has been reviewed and resolved.",date:"Oct 6, 2026",files:[]}]},
{id:"#SUP-00119",title:"App login issue",status:"In progress",category:"Account",created:"Oct 4, 2026",age:"5 days ago",preview:"Unable to login to the merchant dashboard. It keeps showing an error...",messages:[{id:9,sender:"Merchant",body:"Unable to login to the merchant dashboard.",date:"Oct 4, 2026",files:[]}]},
{id:"#SUP-00118",title:"General inquiry",status:"Open",category:"General",created:"Oct 2, 2026",age:"1 week ago",preview:"I want to know how to add a new branch and link it to my account...",messages:[{id:10,sender:"Merchant",body:"How do I add a new branch?",date:"Oct 2, 2026",files:[]}]}
];
function load<T>(key:string,def:T):T{try{const value=localStorage.getItem(key);return value?JSON.parse(value) as T:def;}catch{return def;}}
const cats=["Orders","Payments","Menu","Business","Account","General","Other"];
const seedFaqs=[["How can I change my branch opening hours?","Open Branch Settings, select Operating hours and adjust the opening and closing times. Save to keep the demo state."],["What happens when I decline an order?","In the prototype, declining removes the order from your active kitchen queue. Production decisions must be confirmed by the order backend."],["How do I invite a staff member?","Open Business & Team, click Invite team member, and enter the staff member's email, role and branch access."],["How are settlements calculated?","The finance prototype uses illustrative values. The production view must use the authoritative ledger, commission contract and actual payment records."],["How does support resolution work?","Merchant replies form a conversation. DeeToo administrators investigate and propose resolution; merchant satisfaction is then recorded before closure according to permissions."]];
export function PrototypeSupport({search,onNavigate,notify,live}:{search:string;onNavigate:(s:string)=>void;notify:(s:string)=>void;live?:MerchantLiveBridge}){
 const [cases,setCases]=useState<SupportCase[]>(()=>load("mp-demo-cases",initial));
 const [selected,setSelected]=useState("#SUP-00123");
 const [filter,setFilter]=useState("All");
 const [caseQuery,setCaseQuery]=useState("");
 const [dialog,setDialog]=useState<"new"|"articles"|"call"|"resolve"|"staff"|"details"|"filter"|"attachment"|null>(null);
 const [newKind,setNewKind]=useState("Support request"),[newSubject,setNewSubject]=useState(""),[newCategory,setNewCategory]=useState("Orders"),[newDescription,setNewDescription]=useState(""),[newOrder,setNewOrder]=useState("");
 const [newFiles,setNewFiles]=useState<File[]>([]),[replyFiles,setReplyFiles]=useState<File[]>([]);
 const [reply,setReply]=useState(""),[composeTab,setComposeTab]=useState("Reply");
 const [faqQuery,setFaqQuery]=useState("");
 const [helpArticles,setHelpArticles]=useState<[string,string][]>([]),[supportPhone,setSupportPhone]=useState<string|null>(null),
   [supportHours,setSupportHours]=useState(""),[loadError,setLoadError]=useState(""),[loading,setLoading]=useState(false);
 const faqs=live?helpArticles:seedFaqs;
 const loadCases=async()=>{if(!live)return;setLoading(true);
   try{
     const data=(await live.api.request<any>("/support/cases")).data;
     const raw=Array.isArray(data)?data:Array.isArray(data?.cases)?data.cases:[];
     const items:SupportCase[]=raw.map((c:any)=>({
       id:String(c.id),title:c.subject||"Support request",
       status:c.status==="RESOLVED"||c.status==="CLOSED"?"Resolved":
         c.status==="IN_PROGRESS"||c.status==="INVESTIGATING"?"In progress":
         c.status==="WAITING_CUSTOMER"||c.status==="AWAITING_MERCHANT"?"Awaiting you":"Open",
       category:c.category||"General",created:new Date(c.created_at).toLocaleString("en-KE"),
       age:new Date(c.created_at).toLocaleDateString("en-KE"),preview:c.description||"",
       order:c.order_id||undefined,messages:[]
     }));
     setCases(items);setSelected(prev=>items.some(c=>c.id===prev)?prev:items[0]?.id||"");
     setLoadError("");
   }catch(e){setLoadError(e instanceof Error?e.message:String(e));}finally{setLoading(false);}
 };
 useEffect(()=>{if(!live)return;let active=true;void loadCases();
   Promise.all([live.api.request<any[]>("/merchant/experience/help/articles"),
     live.api.request<any[]>("/merchant/experience/help/contact")]).then(([articles,contacts])=>{
     if(!active)return;
     setHelpArticles((articles.data||[]).map((a:any)=>[String(a.title),String(a.body)]));
     const info=(contacts.data||[]).find((c:any)=>c.phone_e164)||null;
     setSupportPhone(info?.phone_e164||null);setSupportHours(info?.hours_text||"");
   }).catch(e=>{if(active)setLoadError(e instanceof Error?e.message:String(e));});
   return()=>{active=false;};
 },[live?.branchId]);
 useEffect(()=>{if(!live||!selected)return;let active=true;
   live.api.request<any>(`/support/cases/${selected}`).then(r=>{if(!active)return;
     const msgs=(r.data?.notes||[]).map((n:any)=>({
       id:n.id,sender:n.author_role?.toLowerCase().includes("merchant")?"Merchant":"DeeToo Support",
       body:n.body||"",date:new Date(n.created_at).toLocaleString("en-KE"),
       files:(r.data?.attachments||[]).filter((a:any)=>a.note_id===n.id).map((a:any)=>a.file_name||a.media_id)
     }));
     setCases(prev=>prev.map(c=>c.id===selected?{...c,messages:msgs}:c));
   }).catch(e=>{if(active)setLoadError(e instanceof Error?e.message:String(e));});
   return()=>{active=false;};
 },[live?.branchId,selected]);
 const uploadEvidence=async(caseId:string,files:File[]):Promise<string[]>=>{
   if(!live)return[];const result:string[]=[];
   for(const file of files){const grant=(await live.api.request<any>("/media/uploads",{method:"POST",body:JSON.stringify({
     purpose:"SUPPORT_ATTACHMENT",content_type:file.type,reference_type:"SUPPORT_CASE",reference_id:caseId})})).data;
     const saved=await fetch(grant.upload_url,{method:"PUT",headers:grant.upload_headers||{"Content-Type":file.type},body:file});
     if(!saved.ok)throw new Error("Evidence upload failed");
     const done=(await live.api.request<any>(`/media/uploads/${grant.media_id}/complete`,{method:"POST"})).data;
     if(done.status!=="VERIFIED")throw new Error("Evidence pending verification");
     result.push(grant.media_id);
   }return result;
 };

 const counts=(value:string)=>value==="All"?cases.length:cases.filter(c=>c.status===value).length;
 const current=cases.find(c=>c.id===selected);
 const filtered=useMemo(()=>cases.filter(c=>(filter==="All"||c.status===filter)&&[c.title,c.category,c.preview,c.id].join(" ").toLowerCase().includes((caseQuery+" "+search).trim().toLowerCase())),[cases,filter,caseQuery,search]);
 const updateCases=(change:(v:SupportCase[])=>SupportCase[])=>setCases(prev=>{const next=change(prev);if(!live){try{localStorage.setItem("mp-demo-cases",JSON.stringify(next));}catch{}}return next;});
 const send=(e:React.FormEvent)=>{e.preventDefault();if(!reply.trim()&&!replyFiles.length)return;if(!current)return;const msg:CaseMessage={id:Date.now(),sender:"Merchant",body:reply.trim()||"Evidence attached",date:new Date().toLocaleString("en-KE"),files:replyFiles.map(f=>f.name)};updateCases(all=>all.map(c=>c.id===selected?{...c,status:c.status==="Awaiting you"?"In progress":c.status,messages:[...c.messages,msg]}:c));setReply("");setReplyFiles([]);notify("Reply added to demo conversation");};
 const create=(e:React.FormEvent)=>{e.preventDefault();if(!newSubject.trim()||!newDescription.trim())return;const id="#SUP-"+(Math.max(...cases.map(c=>Number(c.id.slice(-5))||0))+1).toString().padStart(5,"0");const added:SupportCase={id,title:newSubject,status:"Open",category:newCategory,order:newOrder||undefined,created:new Date().toLocaleString("en-KE"),age:"Just now",preview:newDescription.slice(0,90),messages:[{id:Date.now(),sender:"Merchant",body:newDescription,date:new Date().toLocaleString("en-KE"),files:newFiles.map(f=>f.name)}]};updateCases(all=>[added,...all]);setSelected(id);setFilter("All");setCaseQuery("");setNewSubject("");setNewDescription("");setNewFiles([]);setNewOrder("");setNewKind("Support request");setDialog(null);notify("Support case created in frontend preview");};
 const requestResolution=()=>{if(!current)return;updateCases(all=>all.map(c=>c.id===selected?{...c,status:"Resolved",messages:[...c.messages,{id:Date.now(),sender:"Merchant",body:"I confirm that this issue is resolved (prototype-only closure request; actual admin approval is required).",date:new Date().toLocaleString("en-KE"),files:[]}]}:c));setDialog(null);notify("Resolution recorded locally. Real closure requires DeeToo admin approval.");};
 const fileHandler=(ev:React.ChangeEvent<HTMLInputElement>,forNew:boolean)=>{const f=Array.from(ev.target.files||[]);const valid=f.filter(x=>x.size<=5*1024*1024&&(/image\/(jpeg|png|webp)|application\/pdf/.test(x.type)));if(valid.length<f.length)notify("Some files were skipped. Maximum 5 MB, JPG/PNG/WebP/PDF.");if(forNew)setNewFiles(old=>[...old,...valid]);else setReplyFiles(old=>[...old,...valid]);ev.target.value="";};
 return <div className="mp-p2">
  <div className="mp-p2-support-intro"><DemoHeading eyebrow="SUPPORT" title="Support & help center" description="Get help, report issues or ask questions. Our team is here to support your business."/><div className="mp-p2-help-actions"><button onClick={()=>setDialog("new")}><MessageCircle/><span><strong>Start a conversation</strong><small>Get help from our support team</small></span><ChevronRight/></button><button onClick={()=>setDialog("articles")}><BookOpen/><span><strong>Help articles</strong><small>Browse guides and FAQs</small></span><ChevronRight/></button><button onClick={()=>setDialog("call")}><Phone/><span><strong>Call support</strong><small>View support contact options</small></span><ChevronRight/></button></div></div>
  <div className="mp-p2-support-stats">{[["All cases","All",LifeBuoy],["Open","Open",MessageCircle],["In progress","In progress",AlertTriangle],["Awaiting your reply","Awaiting you",FileText],["Resolved","Resolved",Check]].map(([title,key,Icon]:any)=><button className="mp-p2-support-stat" onClick={()=>setFilter(key)} key={key}><span><Icon size={24}/></span><div><small>{title}</small><strong>{counts(key)}</strong><p>{key==="All"?"View all support cases":key==="Open"?"Waiting for our response":key==="In progress"?"Being handled by our team":key==="Awaiting you"?"Needs more information":"Completed cases"}</p></div></button>)}</div>
  <div className="mp-p2-support-content">
   <section className="mp-p2-case-list"><div className="mp-p2-case-search"><Search size={18}/><input value={caseQuery} onChange={e=>setCaseQuery(e.target.value)} placeholder="Search tickets..." aria-label="Search support cases"/><button aria-label="Filter support cases" onClick={()=>setDialog("filter")}><Filter size={17}/></button></div><div className="mp-p2-case-tabs">{["All","Open","In progress","Awaiting you","Resolved"].map(label=><button key={label} className={filter===label?"active":""} onClick={()=>setFilter(label)}>{label} ({counts(label)})</button>)}</div><div className="mp-p2-case-scroll">{filtered.length?filtered.map(c=><button key={c.id} className={"mp-p2-case-item "+(selected===c.id?"active":"")} onClick={()=>setSelected(c.id)}><span className={"mp-p2-case-icon mp-p2-case-"+c.category.toLowerCase()}>{c.category==="Orders"?<AlertTriangle/>:c.category==="Payments"?<Wallet/>:c.category==="Account"?<Headphones/>:<FileText/>}</span><span className="mp-p2-case-item-copy"><strong>{c.title}</strong><small>{c.id} · {c.age}</small><small>{c.preview}</small></span><DemoBadge kind={c.status==="Resolved"?"blue":c.status==="In progress"?"orange":c.status==="Awaiting you"?"blue":"red"}>{c.status}</DemoBadge><ChevronRight size={16}/></button>):<div className="mp-p2-empty">No matching cases. <button onClick={()=>{setFilter("All");setCaseQuery("");}}>Clear filters</button></div>}</div></section>
   <section className="mp-p2-case-conversation">{current?<><div className="mp-p2-case-conversation-head"><div><small className="mp-p2-case-id">{current.id}</small><h2>{current.title}</h2><p>Created {current.created} &nbsp; • &nbsp; Status <DemoBadge kind={current.status==="Resolved"?"blue":"red"}>{current.status}</DemoBadge> &nbsp; • &nbsp; Category {current.category}</p></div><div><button className="mp-outline" aria-label="More case options" onClick={()=>setDialog("details")}><Ellipsis size={18}/></button><button className="mp-primary" onClick={()=>setDialog("resolve")}><Check size={16}/>Mark as resolved</button></div></div><div className="mp-p2-conversation-scroll">{current.messages.map(m=><div key={m.id} className={"mp-p2-chat-entry "+(m.sender==="Merchant"?"merchant":"support")}><span className="mp-p2-chat-avatar">{m.sender==="Merchant"?"TM":"DS"}</span><div className="mp-p2-chat-message"><div className="mp-p2-chat-author"><strong>{m.sender==="Merchant"?"Deetoo Test Merchant":m.sender}</strong><small>{m.date}</small></div><p>{m.body}</p>{m.files.map(file=><button key={file} className="mp-p2-file" onClick={()=>{notify("Attachment "+file+" is a prototype-only file reference; no server download exists.");}}><FileText size={17}/><span>{file}<small>Local evidence reference</small></span><Download size={17}/></button>)}</div></div>)}</div><form className="mp-p2-composer" onSubmit={send}><div className="mp-p2-compose-tabs"><button type="button" className={composeTab==="Reply"?"active":""} onClick={()=>setComposeTab("Reply")}>Reply</button><button type="button" className={composeTab==="Add internal note"?"active":""} onClick={()=>{setComposeTab("Add internal note");setDialog("staff");}}>Add internal note</button></div><textarea required={replyFiles.length===0} value={reply} onChange={e=>setReply(e.target.value)} placeholder={composeTab==="Reply"?"Type your message...":"Internal notes are restricted to authorized support staff"} disabled={composeTab!=="Reply"}/><div className="mp-p2-compose-actions"><label className="mp-outline"><Paperclip size={17}/>Attach files <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={e=>fileHandler(e,false)} /></label><small>JPG, PNG, WebP, PDF (Max 5MB)</small>{replyFiles.length>0&&<span>{replyFiles.map(x=>x.name).join(", ")}</span>}<button disabled={composeTab!=="Reply"||(!reply.trim()&&!replyFiles.length)} className="mp-primary" type="submit"><Send size={16}/>Send message</button></div></form></>:<div className="mp-p2-empty">Select a case to see the conversation.</div>}</section>
  </div>
  {dialog&&<div className="mp-modal-overlay" onMouseDown={e=>e.target===e.currentTarget&&setDialog(null)}><section className="mp-modal" role="dialog" aria-modal="true" aria-label={dialog}><div className="mp-modal-head"><h2>{dialog==="new"?"Start a conversation":dialog==="articles"?"Help articles":dialog==="call"?"Contact support":dialog==="resolve"?"Confirm resolution":dialog==="staff"?"Internal notes":dialog==="details"?"Case details":"Filter cases"}</h2><button aria-label="Close" onClick={()=>{setDialog(null);setComposeTab("Reply");}}><X/></button></div>
   {dialog==="new"&&<form onSubmit={create}><label>Case type<select value={newKind} onChange={e=>setNewKind(e.target.value)}><option>Support request</option><option>Dispute</option><option>General inquiry</option></select></label><label>Category<select value={newCategory} onChange={e=>setNewCategory(e.target.value)}>{cats.map(cat=><option key={cat}>{cat}</option>)}</select></label><label>Subject <b>*</b><input required minLength={4} value={newSubject} onChange={e=>setNewSubject(e.target.value)}/></label><label>Order ID (optional)<input value={newOrder} onChange={e=>setNewOrder(e.target.value)}/></label><label>Tell us what happened <b>*</b><textarea required minLength={5} rows={4} value={newDescription} onChange={e=>setNewDescription(e.target.value)}/></label><label>Evidence (optional)<input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={e=>fileHandler(e,true)}/></label>{newFiles.length>0&&<small>{newFiles.map(f=>f.name).join(", ")}</small>}<button className="mp-primary mp-full">Create {newKind.toLowerCase()}</button></form>}
   {dialog==="articles"&&<><label>Search help topics<input value={faqQuery} onChange={e=>setFaqQuery(e.target.value)} placeholder="Search guides and FAQs..."/></label>{faqs.filter(([q,a])=>(q+a).toLowerCase().includes(faqQuery.toLowerCase())).map(([q,a])=><details key={q} className="mp-p2-faq"><summary>{q}</summary><p>{a}</p></details>)}</>}
   {dialog==="call"&&<><p>Phone assistance is included in the approved interface. An official verified number and support calling hours must be supplied before production activation.</p><div className="mp-p2-modal-device"><Headphones/> Contact via a support conversation now</div><button className="mp-primary mp-full" onClick={()=>setDialog("new")}>Open support request</button></>}
   {dialog==="resolve"&&<><p>In the frontend demo this records your confirmation. In the real DeeToo workflow, administrators must authorize closure and may require satisfaction confirmation from all parties.</p><button className="mp-primary mp-full" onClick={requestResolution}>Confirm issue is resolved (demo)</button></>}
   {dialog==="staff"&&<><p>The Internal note control is preserved exactly as requested. Merchants cannot author private administrative notes; only authorized support staff may use it once the backend permissions are integrated.</p><button className="mp-outline" onClick={()=>{setComposeTab("Reply");setDialog(null);}}>Return to reply</button></>}
   {dialog==="filter"&&<div className="mp-p2-menu-actions">{["All","Open","In progress","Awaiting you","Resolved"].map(option=><button key={option} onClick={()=>{setFilter(option);setDialog(null);}}>{option}</button>)}</div>}
   {dialog==="details"&&<>{current&&Object.entries({ID:current.id,Subject:current.title,Status:current.status,Category:current.category,Created:current.created,Order:current.order||"Not linked"}).map(([key,val])=><div className="mp-modal-row" key={key}>{key}<strong>{val}</strong></div>)}<button className="mp-primary mp-full" onClick={()=>setDialog(null)}>Done</button></>}
  </section></div>}
 </div>;
}
