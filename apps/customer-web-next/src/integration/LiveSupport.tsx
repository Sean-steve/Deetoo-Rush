/* Screens 14–15 — real, customer-scoped DeeToo support. */
import {useEffect,useState,type FormEvent} from "react";
import {ArrowLeft,ArrowRight,Bell,Bike,Check,CheckCircle2,ChevronRight,Clock3,CreditCard,FileText,Headphones,LifeBuoy,MapPin,MessageCircle,Paperclip,Plus,Send,ShieldAlert,ShoppingBag,Store,UserRound,X} from "lucide-react";
import type {Order,SupportCase,SupportCaseCategory,SupportCaseNote,SupportCaseAttachment,SupportCaseConfirmation} from "@deetoo/types";
import {Badge,Button,IconButton,Panel,classNames} from "../../../../packages/customer-ui/src/index";
import type {CustomerGateway,ResolutionDecision} from "./customer-gateway";
import {backendError,useBackendResource} from "./resource";
import {ResourceView,StatusPanel,money} from "./LiveUtilities";
import {PreviewAgentArt} from "../components/SupportPreview";
type Props={gateway:CustomerGateway;screen:"support"|"conversation";caseId:string;onNavigate:(path:string)=>void;authenticated:boolean;requestSignIn:()=>void};
type Group="all"|"orders"|"payments"|"account"|"merchants"|"riders"|"other";
type Filter="all"|"open"|"waiting"|"resolved";
const topics:{id:Group;label:string;hint:string;icon:typeof ShoppingBag;category?:SupportCaseCategory}[]=[
 {id:"all",label:"All topics",hint:"All your requests",icon:LifeBuoy},
 {id:"orders",label:"Orders",hint:"Delivery issues",icon:ShoppingBag,category:"ORDER_ISSUE"},
 {id:"payments",label:"Payments",hint:"Refunds & charges",icon:CreditCard,category:"PAYMENT_ISSUE"},
 {id:"account",label:"Account",hint:"Profile & sign-in",icon:UserRound,category:"ACCOUNT_ISSUE"},
 {id:"merchants",label:"Merchants",hint:"Restaurant issues",icon:Store,category:"MERCHANT_ISSUE"},
 {id:"riders",label:"Riders",hint:"Rider issues",icon:Bike,category:"RIDER_ISSUE"},
 {id:"other",label:"Other",hint:"Another concern",icon:MessageCircle,category:"OTHER"}
];
const groupOf=(category:SupportCaseCategory):Group=>
 ["ORDER_ISSUE","MISSING_ITEM","WRONG_ITEM","DELIVERY_DELAY","CUSTOMER_UNREACHABLE"].includes(category)?"orders":
 ["PAYMENT_ISSUE","REFUND"].includes(category)?"payments":category==="ACCOUNT_ISSUE"?"account":
 category==="MERCHANT_ISSUE"?"merchants":category==="RIDER_ISSUE"?"riders":"other";
const statusOf=(s:SupportCase["status"]):Filter=>["CLOSED","RESOLVED"].includes(s)?"resolved":
 ["WAITING_CUSTOMER","WAITING_MERCHANT","WAITING_RIDER","WAITING_INTERNAL","PARTY_CONFIRMATION","RESOLUTION_PROPOSED"].includes(s)?"waiting":"open";
const statusText=(s:SupportCase["status"]):string=>s.replaceAll("_"," ").toLowerCase().replace(/^./,x=>x.toUpperCase());
const prettyDate=(iso?:string|null)=>iso?new Date(iso).toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short"}):"Unavailable";
function Tag({s}:{s:SupportCase["status"]}){const state=statusOf(s);return <Badge variant={state==="resolved"?"mint":state==="waiting"?"gold":"neutral"}>{statusText(s)}</Badge>;}
function CaseIcon({category}:{category:SupportCaseCategory}){const group=groupOf(category);const Icon=topics.find(x=>x.id===group)?.icon||LifeBuoy;return <span className={"dt-case-icon dt-case-icon--"+group}><Icon size={22}/></span>;}
function CaseList({cases,current,onSelect,status,setStatus,group,setGroup}:{cases:SupportCase[];current:string;onSelect:(id:string)=>void;status:Filter;setStatus:(f:Filter)=>void;group:Group;setGroup:(g:Group)=>void}){
 const filtered=cases.filter(c=>(status==="all"||statusOf(c.status)===status)&&(group==="all"||groupOf(c.category)===group));
 return <><div role="tablist" aria-label="Support case status" className="dt-support-tabs">{([["all","All"],["open","Open"],["waiting","Waiting"],["resolved","Resolved"]] as const).map(([id,name])=>
 <button key={id} role="tab" aria-selected={status===id} onClick={()=>setStatus(id)}>{name} <span>{cases.filter(c=>group==="all"||groupOf(c.category)===group).filter(c=>id==="all"||statusOf(c.status)===id).length}</span></button>)}</div>
 <div className="dt-support-case-list">{filtered.length?filtered.map(c=><button key={c.id} className={classNames("dt-support-case",current===c.id&&"is-selected")} aria-pressed={current===c.id} onClick={()=>onSelect(c.id)}>
  <CaseIcon category={c.category}/><span className="dt-support-case-copy"><strong>{c.subject}</strong><small>{c.case_number} · {prettyDate(c.created_at)}</small></span>
  <span className="dt-support-case-meta"><Tag s={c.status}/></span><ChevronRight size={15}/></button>):
 <p className="dt-support-no-cases">No matching support requests.</p>}</div></>;
}
function NewCase({gateway,onClose,onCreated}:{gateway:CustomerGateway;onClose:()=>void;onCreated:(id:string)=>void}){
 const [topic,setTopic]=useState<SupportCaseCategory>("ORDER_ISSUE"),[subject,setSubject]=useState(""),[description,setDescription]=useState(""),[orderId,setOrderId]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const create=async(e:FormEvent)=>{e.preventDefault();if(busy)return;setBusy(true);setError("");
  try{const created=await gateway.support.create({category:topic,subject:subject.trim(),description:description.trim(),...(orderId.trim()?{order_id:orderId.trim()}:{})});onCreated(created.id);}
  catch(err){setError(backendError(err).message);}finally{setBusy(false);}};
 return <div className="dt-support-modal-backdrop"><div className="dt-support-modal" role="dialog" aria-modal="true" aria-label="New support request"><header><div><h2>New support request</h2><p>DeeToo support will receive this request.</p></div><IconButton label="Close request" onClick={onClose}><X size={19}/></IconButton></header>
 <form onSubmit={e=>void create(e)}><label>Support topic<select value={topic} onChange={e=>setTopic(e.target.value as SupportCaseCategory)}>{topics.filter(t=>t.category).map(t=><option value={t.category} key={t.id}>{t.label}</option>)}</select></label>
 <label>Request subject<input required minLength={4} maxLength={140} value={subject} onChange={e=>setSubject(e.target.value)}/></label>
 <label>What happened?<textarea required minLength={10} maxLength={3000} rows={5} value={description} onChange={e=>setDescription(e.target.value)}/></label>
 <label>Related order ID (optional)<input value={orderId} placeholder="Use the internal order reference" onChange={e=>setOrderId(e.target.value)}/><small>The server will verify this order belongs to you.</small></label>
 {error&&<p className="dt-live-error" role="alert">{error}</p>}
 <footer><Button variant="outline" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy?"Submitting…":"Create support request"}<ArrowRight size={16}/></Button></footer></form></div></div>;
}
function Chat({gateway,caseId,onNavigate,compact=false}:{gateway:CustomerGateway;caseId:string;onNavigate:(path:string)=>void;compact?:boolean}){
 const resource=useBackendResource(()=>gateway.support.detail(caseId),Boolean(caseId),[caseId]);
 const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [decision,setDecision]=useState<ResolutionDecision|null>(null),[replyComment,setReplyComment]=useState("");
 useEffect(()=>{if(!caseId)return;const t=setInterval(()=>{if(document.visibilityState==="visible")resource.refresh();},18000);return()=>clearInterval(t);},[caseId,resource.refresh]);
 const send=async(e:FormEvent)=>{e.preventDefault();if(busy||!message.trim())return;setBusy(true);setError("");const original=message;
  try{await gateway.support.message(caseId,{body:original.trim()});setMessage("");resource.refresh();setNotice("Your message was delivered to DeeToo support.");}
  catch(err){setError(backendError(err).message+" If delivery is uncertain, refresh before sending again.");}finally{setBusy(false);}};
 const respond=async()=>{if(!decision||busy)return;setBusy(true);setError("");try{await gateway.support.resolutionResponse(caseId,decision,replyComment);
  setDecision(null);setReplyComment("");resource.refresh();setNotice("Your resolution response has been recorded.");}
  catch(e){setError(backendError(e).message);}finally{setBusy(false);}};
 return <Panel className={classNames("dt-support-chat-panel",!compact&&"dt-support-chat-panel--full")}>{caseId?
 <ResourceView resource={resource.state} onRetry={resource.refresh} empty="Conversation unavailable">{data=>{
  const c=data.case;const mine=data.confirmations?.find(x=>x.party_type==="CUSTOMER"&&x.party_id===c.customer_id);
  const proposal=["RESOLUTION_PROPOSED","PARTY_CONFIRMATION"].includes(c.status)&&Boolean(c.resolution_code||c.resolution_notes);
  return <><header className="dt-support-chat-head"><div className="dt-support-chat-heading"><CaseIcon category={c.category}/><div><h2>{compact?"Support conversation":c.subject} <Tag s={c.status}/></h2><p>Case #{c.case_number} · {prettyDate(c.created_at)}</p></div></div><Button variant="outline" size="sm" onClick={resource.refresh}><Clock3 size={14}/> Refresh</Button></header>
  <div className="dt-support-conversation-day">{data.notes?.length?prettyDate(data.notes[0]?.created_at):prettyDate(c.created_at)} <span>· Verified case timeline</span></div>
   <div className={classNames("dt-support-messages",compact&&"dt-support-messages--compact")} aria-label="Support conversation messages" aria-live="polite">
   {(data.notes||[]).map((n:SupportCaseNote)=>{const own=n.author_user_id===c.customer_id;return <div key={n.id} className={classNames("dt-support-message",own?"dt-support-message--customer":"dt-support-message--staff")}>
    <span className="dt-support-message-avatar">{own?"You":<Headphones size={18}/>}</span><div className="dt-support-message-content"><div className="dt-support-message-author">{own?"You":n.author_name||"DeeToo support"} <time>{prettyDate(n.created_at)}</time></div><div className="dt-support-message-bubble"><p>{n.body}</p>
    {(n.attachments||[]).map((file:SupportCaseAttachment)=><button key={file.id} type="button" className="dt-support-message-attachment" onClick={async()=>{setError("");try{const result=await gateway.support.attachmentUrl(caseId,file.media_object_id);if(result.url&&/^https:\/\//.test(result.url))window.open(result.url,"_blank","noopener,noreferrer");else setError("Attachment URL unavailable.");}catch(e){setError(backendError(e).message);}}}><Paperclip size={16}/> View verified attachment</button>)}</div></div></div>})}
   {!data.notes?.length&&<p className="dt-support-no-cases">No messages yet. Explain your concern to DeeToo support below.</p>}
  </div>
  {proposal&&<div className="dt-support-proposal" role="region" aria-label="Proposed resolution"><strong><ShieldAlert size={16}/> Proposed resolution · {c.resolution_code?.replaceAll("_"," ")||"Review required"}</strong><p>{c.resolution_notes||"Support has proposed resolving this case. Please review."}</p>
   {mine?.decision==="PENDING"||!mine?<>{decision?<div className="dt-live-support-decision"><label>Optional explanation<textarea rows={2} value={replyComment} onChange={e=>setReplyComment(e.target.value)} maxLength={1500}/></label>
   <Button disabled={busy} onClick={()=>void respond()}>{busy?"Sending…":decision==="ACCEPTED"?"Confirm acceptance":"Submit dispute"}</Button><Button variant="outline" onClick={()=>setDecision(null)}>Cancel</Button></div>:<div><Button size="sm" onClick={()=>setDecision("ACCEPTED")}>I accept</Button><Button size="sm" variant="outline" onClick={()=>setDecision("DISPUTED")}>I need more help</Button></div>}</>:
    <p>Your response: {mine.decision}. Current case status remains server-controlled.</p>}
  </div>}
  {["CLOSED","RESOLVED"].includes(c.status)&&<div className="dt-support-resolved-note"><CheckCircle2 size={16}/> DeeToo has recorded this case as {statusText(c.status).toLowerCase()}. Your conversation remains available.</div>}
  <form className="dt-support-composer" onSubmit={e=>void send(e)}><input aria-label="Type a support message" value={message} maxLength={5000} onChange={e=>setMessage(e.target.value)} placeholder="Type your message to DeeToo support…" disabled={busy}/><Button type="submit" disabled={busy||!message.trim()} aria-label="Send support message"><Send size={17}/></Button></form>
  <p className="dt-support-composer-disclaimer">Messages are sent to the real case. Evidence upload needs separately verified secure upload authorization.</p>
  {notice&&<p className="dt-live-success" role="status"><Check size={16}/>{notice}</p>}{error&&<p className="dt-live-error" role="alert">{error}</p>}
  </>;}}</ResourceView>:
 <StatusPanel title="Select a support case" description="Choose a conversation to see verified messages and replies."/>}</Panel>;
}
function OrderSide({gateway,caseId,onNavigate}:{gateway:CustomerGateway;caseId:string;onNavigate:(path:string)=>void}){
 const detail=useBackendResource(()=>gateway.support.detail(caseId),Boolean(caseId),[caseId]);
 const orderId=detail.state.status==="ready"?detail.state.data.case.order_id:null;
 const order=useBackendResource(()=>gateway.orders.detail(orderId!),Boolean(orderId),[orderId]);
 const c=detail.state.status==="ready"?detail.state.data.case:null;
 return <aside className="dt-support-side"><Panel className="dt-support-order-side"><header><h2>Related order</h2>{orderId&&<button onClick={()=>onNavigate("/orders/"+encodeURIComponent(orderId)+"/track")}>View order <ArrowRight size={14}/></button>}</header>
  {orderId?<ResourceView resource={order.state} empty="Order unavailable" onRetry={order.refresh}>{(o:Order)=><div><div className="dt-support-order-card"><ShoppingBag size={28}/><div><strong>{o.merchant_name||o.branch_name||"Restaurant"}</strong><small>#{o.order_number}</small></div></div>
   <dl><div><dt>Order status</dt><dd>{o.status.replaceAll("_"," ")}</dd></div><div><dt>Verified total</dt><dd>{money(o.total_minor)}</dd></div></dl></div>}</ResourceView>:<p className="dt-support-no-order">No related order was supplied for this case.</p>}</Panel>
  <Panel className="dt-support-attachments"><header><h2>Attachments</h2></header>
   {detail.state.status==="ready"&&detail.state.data.notes.flatMap(n=>n.attachments||[]).length>0?
     detail.state.data.notes.flatMap(n=>n.attachments||[]).map((attachment:SupportCaseAttachment)=>
     <div className="dt-support-attached-file" key={attachment.id}><Paperclip size={22}/><span><strong>Verified case attachment</strong><small>Accessible only to authorized case participants</small></span></div>):
     <p>{c?"No attachments recorded. Additional uploads require secure media authorization.":"Select a case to see its evidence."}</p>}
  </Panel>
  {orderId&&<Panel className="dt-support-tracker"><header><h2>Order progress</h2><button onClick={()=>onNavigate("/orders/"+encodeURIComponent(orderId)+"/track")}>View status <ChevronRight size={15}/></button></header>
    <div className="dt-support-tracker-stages"><span><Store size={23}/><strong>Merchant</strong><small>Check order record</small></span><span><Bike size={23}/><strong>Rider</strong><small>Assignment in tracking</small></span><span><MapPin size={23}/><strong>Delivery</strong><small>Verified in order</small></span></div><p>No simulated rider position or ETA is shown.</p></Panel>}
  <Panel className="dt-support-help-links"><h2>Quick help</h2><button onClick={()=>onNavigate("/orders")}><ShoppingBag size={17}/><span><strong>Order history</strong><small>Check an order's current status</small></span><ChevronRight size={16}/></button>
    <button onClick={()=>onNavigate("/security")}><ShieldAlert size={17}/><span><strong>Account security</strong><small>Review signed-in devices</small></span><ChevronRight size={16}/></button></Panel></aside>;
}
export function LiveSupport({gateway,screen,caseId,onNavigate,authenticated,requestSignIn}:Props){
 const resource=useBackendResource(()=>gateway.support.list(),authenticated,[]);
 const [group,setGroup]=useState<Group>("all"),[status,setStatus]=useState<Filter>("all"),[newOpen,setNewOpen]=useState(false),[active,setActive]=useState("");
 const cases=resource.state.status==="ready"?resource.state.data.cases:[];
 const selected=screen==="conversation"?caseId:active||cases[0]?.id||"";
 useEffect(()=>{if(!authenticated)return;const t=setInterval(()=>{if(document.visibilityState==="visible")resource.refresh();},45000);return()=>clearInterval(t);},[authenticated,resource.refresh]);
 if(!authenticated)return <StatusPanel title="Sign in to contact support" description="DeeToo support requests and conversations are only accessible to the case owner."><Button onClick={requestSignIn}>Sign in</Button></StatusPanel>;
 return <section className={classNames("dt-support-page","dt-screen-enter",screen==="conversation"&&"dt-support-page--conversation","dt-live-support")}>
  {screen==="conversation"?<div className="dt-support-thread-heading"><div><button className="dt-live-order-back" onClick={()=>onNavigate("/support")}><ArrowLeft size={16}/> Back to support</button><h1>Support Conversation</h1><p>Review case history and reply directly to DeeToo support.</p></div><Button variant="outline" onClick={()=>setNewOpen(true)}><Plus size={16}/> New request</Button></div>:
  <div className="dt-support-banner"><div><h1>Help & Support</h1><p>We're here to help with orders, payments, and deliveries.</p></div><PreviewAgentArt/><Panel className="dt-support-urgent"><div><span><Headphones size={25}/></span><div><h2>Need help with a delivery?</h2><p>Send a request linked to your order.</p></div></div><Button onClick={()=>setNewOpen(true)}>New support request <ArrowRight size={16}/></Button></Panel></div>}
  {screen==="support"&&<div className="dt-support-topics">{topics.map(({id,label,hint,icon:Icon})=><button type="button" key={id} className={group===id?"is-selected":""} aria-pressed={group===id} onClick={()=>setGroup(id)}><Icon size={22}/><span><strong>{label}</strong><small>{hint}</small></span></button>)}</div>}
  <div className={classNames("dt-support-columns",screen==="conversation"&&"dt-support-columns--conversation")}><Panel className="dt-support-cases-panel"><header><h2>Your support tickets</h2><Button onClick={()=>setNewOpen(true)}><Plus size={15}/> New request</Button></header>
   <ResourceView resource={resource.state} empty="No support cases yet" onRetry={resource.refresh}>{data=><CaseList cases={data.cases} current={selected} onSelect={id=>{setActive(id);if(screen==="conversation")onNavigate("/support/cases/"+encodeURIComponent(id));}} status={status} setStatus={setStatus} group={group} setGroup={setGroup}/>}</ResourceView></Panel>
   <Chat key={selected} gateway={gateway} caseId={selected} onNavigate={onNavigate} compact={screen==="support"}/>
   <OrderSide gateway={gateway} caseId={selected} onNavigate={onNavigate}/>
  </div>
  {newOpen&&<NewCase gateway={gateway} onClose={()=>setNewOpen(false)} onCreated={id=>{resource.refresh();setNewOpen(false);onNavigate("/support/cases/"+encodeURIComponent(id));}}/>}
 </section>;
}
