import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
 ArrowLeft, ArrowRight, Bell, Bike, BookOpen, Check, CheckCircle2, ChevronDown,
 ChevronRight, CircleAlert, Clock3, CreditCard, FileImage, Headphones, Heart,
 House, LifeBuoy, MapPin, MessageCircle, MoreVertical, Package, Paperclip,
 Plus, Send, ShieldAlert, ShoppingBag, Store, Tag, UserRound, X, Zap
} from "lucide-react";
import {Badge,Button,IconButton,Panel,classNames} from "../../../../packages/customer-ui/src/index";
import {caseTopicLabels,mockupOrder,sampleCases,supportDemoBurger,type CaseMessage,type CaseStatus,type CaseTopic,type SupportCase} from "../data/support-preview";

type Screen="support"|"conversation";
type Dest="orders"|"profile"|"security"|"notifications"|"support"|"tracking"|"delivered";
type Props={screen:Screen;caseId:string;onOpenCase:(id:string)=>void;onBack:()=>void;onNavigate:(to:Dest)=>void;onNotice:(message:string)=>void};
type Filter="all"|CaseStatus;
const topicItems:Array<{id:"all"|CaseTopic;name:string;hint:string;icon:typeof ShoppingBag}>= [
 {id:"all",name:"All topics",hint:"View all support",icon:LifeBuoy},
 {id:"orders",name:"Orders",hint:"Delivery, missing items",icon:ShoppingBag},
 {id:"payments",name:"Payments",hint:"Refunds, charges",icon:CreditCard},
 {id:"account",name:"Account",hint:"Profile, login, settings",icon:UserRound},
 {id:"merchants",name:"Merchants",hint:"Restaurant related",icon:Store},
 {id:"riders",name:"Riders",hint:"Delivery related",icon:Bike},
 {id:"other",name:"Other",hint:"Something else",icon:MoreVertical}
];
const statusNames:Record<CaseStatus,string>={open:"Open",waiting:"Waiting",resolved:"Resolved"};
const safeAttachTypes=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
function Status({value}:{value:CaseStatus}) {return <Badge variant={value==="open"?"mint":value==="waiting"?"gold":"neutral"}>{statusNames[value]}</Badge>;}
function FixtureTag(){return <span className="dt-support-fixture">Sample conversations · no messages are sent</span>;}
function CaseArt({topic}:{topic:CaseTopic}) {
 const Icon=(topicItems.find(x=>x.id===topic)?.icon||LifeBuoy);
 return <span className={"dt-case-icon dt-case-icon--"+topic}><Icon size={25}/></span>;
}
function Thumb({alt="Demo food photo"}:{alt?:string}){return <span className="dt-support-food-thumb"><img src={supportDemoBurger} loading="lazy" alt={alt} onError={e=>{e.currentTarget.style.display="none";}}/><ShoppingBag size={22}/></span>;}
function PreviewAgentArt(){return <svg viewBox="0 0 232 122" aria-hidden="true" focusable="false"><g fill="#d5fae7"><circle cx="137" cy="76" r="62"/><circle cx="193" cy="89" r="31"/></g><path d="M97 122C97 100 113 88 138 88c30 0 49 12 49 34" fill="#00a969"/><ellipse cx="142" cy="62" rx="31" ry="36" fill="#ffd1ae"/><path d="M111 68C90 19 135-2 167 26c10 10 10 28 6 44l-12-18c-18 0-32-5-39-14-4 16-8 23-11 30Z" fill="#163a37"/><ellipse cx="112" cy="67" rx="8" ry="15" fill="#00a463"/><ellipse cx="172" cy="67" rx="8" ry="15" fill="#00a463"/><path d="M107 67c-1-28 15-50 37-50 25 0 37 19 35 51" fill="none" stroke="#006747" strokeWidth="7"/><path d="M173 85c-6 12-18 14-29 12" fill="none" stroke="#036d55" strokeWidth="3"/><rect x="136" y="93" width="14" height="6" rx="3" fill="#046a52"/><ellipse cx="132" cy="64" rx="2" ry="3" fill="#18352e"/><ellipse cx="154" cy="64" rx="2" ry="3" fill="#18352e"/><path d="M137 79q8 5 14-1" fill="none" stroke="#c76b64" strokeWidth="3" strokeLinecap="round"/><path d="M30 25h39q13 0 13 14v9q0 14-13 14H57l-10 10 2-10H30q-13 0-13-14v-9q0-14 13-14Z" fill="#00a15e"/><circle cx="39" cy="44" r="3" fill="#fff"/><circle cx="50" cy="44" r="3" fill="#fff"/><circle cx="61" cy="44" r="3" fill="#fff"/><path d="M91 16l4-7 5 7M197 20l5-7 4 7" fill="#52d6a1"/></svg>;}
function CaseTabs({value,onChange,cases}:{value:Filter;onChange:(value:Filter)=>void;cases:SupportCase[]}) {
 return <div role="tablist" aria-label="Support case status" className="dt-support-tabs">{(["all","open","waiting","resolved"] as const).map(id=><button type="button" role="tab" aria-selected={value===id} onClick={()=>onChange(id)} key={id}>{id==="all"?"All":statusNames[id]} <span>{id==="all"?cases.length:cases.filter(c=>c.status===id).length}</span></button>)}</div>;
}
function CaseList({cases,selectedId,onChoose,filter,onFilter,variant}:{cases:SupportCase[];selectedId:string;onChoose:(id:string)=>void;filter:Filter;onFilter:(filter:Filter)=>void;variant:"dashboard"|"conversation"}) {
 const filtered=cases.filter(c=>filter==="all"||c.status===filter);
 return <><CaseTabs cases={cases} value={filter} onChange={onFilter}/><div className="dt-support-case-list">{filtered.length?filtered.map(c=><button key={c.id} type="button" className={classNames("dt-support-case",selectedId===c.id&&"is-selected")} onClick={()=>onChoose(c.id)} aria-pressed={selectedId===c.id}><CaseArt topic={c.topic}/><span className="dt-support-case-copy"><strong>{c.subject}</strong><small>{variant==="dashboard"?(c.orderId?"#"+c.orderId+" · "+c.createdAt:c.createdAt):c.summary}</small></span><span className="dt-support-case-meta"><Status value={c.status}/><small>{variant==="conversation"?c.relative:""}</small></span><ChevronRight size={17}/></button>):<p className="dt-support-no-cases">No matching sample conversations.</p>}</div></>;
}
function ChatMessages({caseData,compact=false}:{caseData:SupportCase;compact?:boolean}) {
 return <div className={classNames("dt-support-messages",compact&&"dt-support-messages--compact")} aria-live="polite" aria-label={"Conversation messages for "+caseData.subject}>
 {caseData.messages.map(m=><div key={m.id} className={classNames("dt-support-message","dt-support-message--"+m.author)}>
   <span className="dt-support-message-avatar">{m.author==="customer"?"T":m.author==="agent"?<Headphones size={21}/>:<CheckCircle2 size={18}/>}</span>
   <div className="dt-support-message-content"><span className="dt-support-message-author">{m.name} <time>{m.at}</time></span><div className="dt-support-message-bubble"><p>{m.text}</p>{m.attachment&&<div className="dt-support-message-attachment"><FileImage size={19}/><span>{m.attachment}</span><small>Sample evidence</small></div>}</div></div>
 </div>)}
 </div>;
}
function Composer({caseData,onSend,onAttach,onNotice}:{caseData:SupportCase;onSend:(id:string,message:string)=>void;onAttach:(id:string,file:File)=>void;onNotice:(text:string)=>void}) {
 const [text,setText]=useState("");const fileRef=useRef<HTMLInputElement>(null);
 const fileChange=(e:ChangeEvent<HTMLInputElement>)=>{
   const file=e.target.files?.[0];e.target.value="";
   if(!file)return;
   if(!safeAttachTypes.has(file.type)||file.size>5*1024*1024){onNotice("Choose a JPG, PNG, WebP or PDF under 5 MB. Nothing was uploaded.");return;}
   onAttach(caseData.id,file);
 };
 const submit=(e:FormEvent)=>{e.preventDefault();const message=text.trim();if(!message)return;onSend(caseData.id,message);setText("");};
 return <form className="dt-support-composer" onSubmit={submit}><input ref={fileRef} onChange={fileChange} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="dt-sr-only" aria-label="Attach sample evidence"/>
 <IconButton label="Attach sample evidence" onClick={()=>fileRef.current?.click()}><Paperclip size={21}/></IconButton>
 <input aria-label="Type a support message" value={text} maxLength={2000} placeholder={caseData.status==="resolved"?"Ask a follow-up about this case...":"Type a message..."} onChange={e=>setText(e.target.value)}/>
 <Button type="submit" aria-label="Send preview message" disabled={!text.trim()}><Send size={18}/></Button>
 </form>;
}
function Proposal({item,onRespond}:{item:SupportCase;onRespond:(id:string,decision:"accepted"|"disputed")=>void}) {
 if(!item.resolutionProposal)return null;
 return <div className="dt-support-proposal" role="region" aria-label="Proposed resolution"><strong><ShieldAlert size={17}/> Resolution proposal (sample)</strong><p>{item.resolutionProposal}</p>
 {item.resolutionResponse?<p className="dt-proposal-responded">Your sample response: <b>{item.resolutionResponse}</b>. An administrator must confirm the final case status.</p>:<div><Button size="sm" variant="soft" onClick={()=>onRespond(item.id,"accepted")}><Check size={16}/> I agree</Button><Button variant="outline" size="sm" onClick={()=>onRespond(item.id,"disputed")}>I need more help</Button></div>}
 </div>;
}
function ConversationPanel({item,onSend,onAttach,onRespond,onNotice,variant,onOpenDedicated}:{item:SupportCase;onSend:(id:string,body:string)=>void;onAttach:(id:string,file:File)=>void;onRespond:(id:string,decision:"accepted"|"disputed")=>void;onNotice:(s:string)=>void;variant:"dashboard"|"conversation";onOpenDedicated?:()=>void}) {
 return <Panel className={classNames("dt-support-chat-panel",variant==="conversation"&&"dt-support-chat-panel--full")}>
   <header className="dt-support-chat-head"><div className="dt-support-chat-heading"><CaseArt topic={item.topic}/><div><h2>{variant==="conversation"&&item.orderId?"Order #"+item.orderId:item.subject} <Status value={item.status}/></h2><p>{item.summary}{item.orderId&&variant==="dashboard"? " · #"+item.orderId:""}</p></div></div>
     {variant==="dashboard"?<Button variant="outline" size="sm" onClick={onOpenDedicated}>Open conversation <ArrowRight size={14}/></Button>:<IconButton label="Conversation details" onClick={()=>onNotice("Case details are shown on the right. No backend operations are active.")}><MoreVertical size={19}/></IconButton>}
   </header>
   {variant==="conversation"&&item.orderId&&<div className="dt-support-order-progress"><span><Check size={17}/>Order placed<small>6:32 PM</small></span><span><Check size={17}/>Preparing<small>6:45 PM</small></span><span><Bike size={17}/>On the way<small>Sample</small></span><span className="dt-progress-pending"><House size={17}/>Delivered<small>Not verified</small></span></div>}
   <div className="dt-support-conversation-day">Today, Oct 8, 2026 <span>· Sample timeline</span></div>
   <ChatMessages caseData={item} compact={variant==="dashboard"}/>
   <Proposal item={item} onRespond={onRespond}/>
   {item.status==="resolved"&&<p className="dt-support-resolved-note"><CheckCircle2 size={17}/> This sample case was closed after customer acceptance. Messages remain visible; follow-ups require review.</p>}
   <Composer key={item.id} caseData={item} onSend={onSend} onAttach={onAttach} onNotice={onNotice}/>
   <p className="dt-support-composer-disclaimer">Preview only — no messages or files are transmitted.</p>
 </Panel>;
}
function OrderSide({item,onNavigate,onNotice}:{item:SupportCase;onNavigate:(dest:Dest)=>void;onNotice:(txt:string)=>void}) {
 const linked=Boolean(item.orderId);
 return <Panel className="dt-support-order-side"><header><h2>{linked?"Related order":"Support case"}</h2>{linked&&<button onClick={()=>onNavigate("orders")}>View order <ChevronRight size={15}/></button>}</header>
 {linked?<><div className="dt-support-order-card"><Thumb/><div><strong>{mockupOrder.item}</strong><small>#{item.orderId}</small><small>{item.restaurant}</small></div><Status value={item.status}/></div>
 <dl><div><dt>Order reference</dt><dd>{item.orderId}</dd></div><div><dt>Restaurant</dt><dd>{item.restaurant}</dd></div><div><dt>Estimated arrival</dt><dd>Not verified</dd></div><div><dt>Amount (sample)</dt><dd>{mockupOrder.amount}</dd></div></dl>
 <div className="dt-support-side-actions"><Button variant="outline" size="sm" onClick={()=>onNotice("Reordering from a support case requires an authenticated order adapter.")}>Reorder</Button><Button variant="outline" size="sm" onClick={()=>onNotice("Receipts require an authenticated order and payment adapter.")}>View receipt</Button></div>
 </>:<p className="dt-support-no-order">This case isn't linked to an order. You can still discuss it in the conversation.</p>}
 </Panel>;
}
function AttachmentsSide({item,onPick,onNotice}:{item:SupportCase;onPick:(file:File)=>void;onNotice:(s:string)=>void}) {
 const ref=useRef<HTMLInputElement>(null);
 return <Panel className="dt-support-attachments"><header><h2>Attachments ({item.attachments.length})</h2><button onClick={()=>ref.current?.click()}><Plus size={17}/> Add more</button></header>
 <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" ref={ref} className="dt-sr-only" aria-label="Add case attachment" onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;if(file.size>5*1024*1024||!safeAttachTypes.has(file.type))onNotice("Supported: JPG, PNG, WebP or PDF under 5 MB.");else onPick(file);}}/>
 {item.attachments.length?item.attachments.map(name=><div className="dt-support-attached-file" key={name}><FileImage size={24}/><span><strong>{name}</strong><small>Sample evidence · not uploaded</small></span></div>):<p>No evidence attached to this sample case.</p>}
 </Panel>;
}
function HelpLinks({onNotice}:{onNotice:(s:string)=>void}){return <Panel className="dt-support-help-links"><h2>Need more help?</h2>
 {([{icon:BookOpen,name:"Frequently asked questions",detail:"Common questions about orders"},{icon:ShieldAlert,name:"Report a safety issue",detail:"Urgent concerns about a delivery"},{icon:MessageCircle,name:"Contact us",detail:"Start a customer support request"}] as const).map(x=><button key={x.name} onClick={()=>onNotice(x.name+" will be connected to the actual support workflow during backend integration.")}><x.icon size={21}/><span><strong>{x.name}</strong><small>{x.detail}</small></span><ChevronRight size={17}/></button>)}
 </Panel>;}
function PreviewTracker({onNavigate}:{onNavigate:(d:Dest)=>void}) {
 return <Panel className="dt-support-tracker"><header><h2>Sample order tracking</h2><button onClick={()=>onNavigate("orders")}>View orders <ChevronRight size={15}/></button></header><div className="dt-support-tracker-stages"><span><Store size={23}/><strong>Restaurant</strong><small>Juja Grill House</small></span><span><Bike size={24}/><strong>Rider</strong><small>Live location unavailable</small></span><span><House size={23}/><strong>Delivery</strong><small>Juja, Kiambu</small></span></div><p>Tracking shown for layout only; no ETA or location is verified.</p></Panel>;
}
function NewRequestDialog({onClose,onCreate,onNotice,initialTopic}:{onClose:()=>void;onCreate:(category:CaseTopic,subject:string,body:string,file?:File)=>void;onNotice:(s:string)=>void;initialTopic:CaseTopic}) {
 const [topic,setTopic]=useState<CaseTopic>(initialTopic),[subject,setSubject]=useState(""),[description,setDescription]=useState(""),[file,setFile]=useState<File|null>(null);
 const ref=useRef<HTMLDivElement>(null);const lastFocus=useRef<Element|null>(null);
 useEffect(()=>{lastFocus.current=document.activeElement;const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();if(e.key==="Tab"){const focusable=ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)');if(focusable?.length){const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}};window.addEventListener("keydown",escape);return ()=>{window.removeEventListener("keydown",escape);(lastFocus.current as HTMLElement|null)?.focus?.();};},[]);
 const chooseFile=(e:ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];if(f){if(!safeAttachTypes.has(f.type)||f.size>5*1024*1024){onNotice("Supported files: JPG, PNG, WebP, PDF up to 5 MB.");e.target.value="";return;}setFile(f);}};
 return <div className="dt-support-modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="dt-support-modal" role="dialog" aria-modal="true" aria-labelledby="dt-request-title" ref={ref}>
   <header><div><h2 id="dt-request-title">New support request</h2><p>Tell us what happened. This request stays in your browser preview.</p></div><IconButton label="Close new support request" onClick={onClose}><X size={20}/></IconButton></header>
   <form onSubmit={e=>{e.preventDefault();if(!subject.trim()||!description.trim())return;onCreate(topic,subject.trim(),description.trim(),file||undefined);}}>
    <label>What do you need help with?<select aria-label="Support topic" value={topic} onChange={e=>setTopic(e.target.value as CaseTopic)}>{(Object.keys(caseTopicLabels) as CaseTopic[]).map(t=><option key={t} value={t}>{caseTopicLabels[t]}</option>)}</select></label>
    <label>Subject<input autoFocus aria-label="Request subject" value={subject} required minLength={4} maxLength={110} placeholder="Summarize your issue" onChange={e=>setSubject(e.target.value)}/></label>
    <label>What happened?<textarea aria-label="Request description" value={description} required minLength={10} maxLength={2000} rows={4} placeholder="Share the key details so support can help..." onChange={e=>setDescription(e.target.value)}/></label>
    <label>Evidence (optional, preview only)<input aria-label="Request evidence" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={chooseFile}/>{file&&<small>Selected: {file.name} · not uploaded</small>}</label>
    <footer><Button type="submit"><Plus size={17}/> Create sample request</Button><Button variant="outline" onClick={onClose}>Cancel</Button></footer>
   </form>
  </div>
 </div>;
}
export function SupportPreview({screen,caseId,onOpenCase,onBack,onNavigate,onNotice}:Props) {
 const [cases,setCases]=useState<SupportCase[]>(()=>sampleCases.map(item=>({...item,messages:item.messages.map(m=>({...m})),attachments:[...item.attachments]})));
 const [selected,setSelected]=useState(screen==="conversation"?(caseId||"case-arrival"):"case-missing");
 const [statusFilter,setStatusFilter]=useState<Filter>("all"),[topicFilter,setTopicFilter]=useState<"all"|CaseTopic>("all"),[newRequest,setNewRequest]=useState(false),[requestTopic,setRequestTopic]=useState<CaseTopic>("orders");
 const activeId=screen==="conversation"?(caseId||selected):selected;
 const filteredByTopic=useMemo(()=>topicFilter==="all"?cases:cases.filter(c=>c.topic===topicFilter),[topicFilter,cases]);
 const visibleCases=filteredByTopic.filter(c=>statusFilter==="all"||c.status===statusFilter);
 const item=visibleCases.find(c=>c.id===activeId)||visibleCases[0]||cases.find(c=>c.id===activeId)||cases[0];
 const pick=(id:string)=>{setSelected(id);if(screen==="conversation")onOpenCase(id);};
 const send=(id:string,body:string)=>{setCases(prev=>prev.map(c=>c.id!==id?c:{...c,messages:[...c.messages,{id:"local-msg-"+Date.now(),author:"customer",name:"You (preview)",text:body,at:"Just now"}]}));onNotice("Message added locally to the sample conversation. Nothing was sent.");};
 const attach=(id:string,file:File)=>{setCases(prev=>prev.map(c=>c.id!==id?c:{...c,attachments:[...c.attachments,file.name],messages:[...c.messages,{id:"local-file-"+Date.now(),author:"customer",name:"You (preview)",text:"Attached evidence for review (local only).",attachment:file.name,at:"Just now"}]}));onNotice("File name added locally. No evidence was uploaded.");};
 const respond=(id:string,decision:"accepted"|"disputed")=>{setCases(prev=>prev.map(c=>c.id!==id?c:{...c,resolutionResponse:decision,messages:[...c.messages,{id:"local-decision-"+Date.now(),author:"customer",name:"You (preview)",text:decision==="accepted"?"I agree with the proposed outcome.":"I'm not satisfied and need further review.",at:"Just now"}]}));onNotice("Sample response recorded locally; only authorized staff can finalize a case.");};
 const create=(topic:CaseTopic,subject:string,description:string,file?:File)=>{const id="local-case-"+Date.now().toString(36);const newCase:SupportCase={id,topic,subject,summary:description.slice(0,85),status:"open",createdAt:"Just now",relative:"Just now",attachments:file?[file.name]:[],messages:[{id:id+"-first",author:"customer",name:"You (preview)",text:description,at:"Just now",...(file?{attachment:file.name}:{})}]};setCases(prev=>[newCase,...prev]);setSelected(id);setTopicFilter("all");setStatusFilter("all");setNewRequest(false);if(screen==="conversation")onOpenCase(id);onNotice("Support request created locally. No real support case was submitted.");};
 const openRequest=(topic:CaseTopic="orders")=>{setRequestTopic(topic);setNewRequest(true);};
 const onCaseChoose=(id:string)=>{pick(id);};
 return <section className={classNames("dt-support-page","dt-screen-enter",screen==="conversation"&&"dt-support-page--conversation")}>
  {screen==="support"?<>
    <div className="dt-support-banner"><div><h1>Help &amp; Support</h1><p>We're here to help with your orders, payments, account and more.</p><FixtureTag/></div><PreviewAgentArt/><Panel className="dt-support-urgent"><div><span><Zap size={26}/></span><div><h2>Need urgent help?</h2><p>For active orders, review your conversation and order details.</p></div></div><Button onClick={()=>onOpenCase("case-arrival")}>Open conversation <ArrowRight size={16}/></Button></Panel></div>
    <nav className="dt-support-topics" aria-label="Support topics">{topicItems.map(({id,name,hint,icon:Icon})=><button type="button" key={id} aria-pressed={topicFilter===id} className={classNames(topicFilter===id&&"is-selected")} onClick={()=>{setTopicFilter(id);setStatusFilter("all");}}><Icon size={25}/><span><strong>{name}</strong><small>{hint}</small></span></button>)}</nav>
  </>:<div className="dt-support-thread-heading"><div><h1>Support Conversation</h1><p>Get help with orders, payments, account or anything else related to DeeToo.</p><FixtureTag/></div><Button size="sm" variant="outline" startIcon={<ArrowLeft size={17}/>} onClick={onBack}>Back to Support</Button></div>}
  <div className={classNames("dt-support-columns",screen==="conversation"&&"dt-support-columns--conversation")}>
   <Panel className="dt-support-cases-panel"><header><h2>{screen==="support"?"Your support tickets":"Your conversations"}</h2><Button size="sm" onClick={()=>openRequest()} startIcon={<Plus size={19}/>}>New request</Button></header><CaseList cases={filteredByTopic} selectedId={item.id} filter={statusFilter} onFilter={setStatusFilter} onChoose={onCaseChoose} variant={screen==="support"?"dashboard":"conversation"}/></Panel>
   <ConversationPanel item={item} key={item.id} onSend={send} onAttach={attach} onRespond={respond} onNotice={onNotice} variant={screen==="support"?"dashboard":"conversation"} onOpenDedicated={()=>onOpenCase(item.id)}/>
   <aside className="dt-support-side">
     <OrderSide item={item} onNavigate={onNavigate} onNotice={onNotice}/>
     {screen==="conversation"&&<PreviewTracker onNavigate={onNavigate}/>}
     {screen==="conversation"&&<Panel className="dt-support-quick-actions"><h2>Quick actions</h2><div>
       <button onClick={()=>openRequest("orders")}><CircleAlert size={17}/> Report an issue</button>
       <button onClick={()=>openRequest("payments")}><CreditCard size={17}/> Request a refund</button>
       <button onClick={()=>onNotice("Cancellation review requires a verified order and authorized backend workflow.")}><X size={17}/> Cancel order</button>
       <button onClick={()=>onNavigate("profile")}><MapPin size={17}/> Change delivery address</button>
     </div></Panel>}
     <AttachmentsSide item={item} onPick={file=>attach(item.id,file)} onNotice={onNotice}/>
     <HelpLinks onNotice={onNotice}/>
   </aside>
  </div>
  {newRequest&&<NewRequestDialog onClose={()=>setNewRequest(false)} onCreate={create} onNotice={onNotice} initialTopic={requestTopic}/>}
 </section>;
}
