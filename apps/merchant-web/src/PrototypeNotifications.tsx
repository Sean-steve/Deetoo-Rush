import type { MerchantLiveBridge } from "./MerchantLiveApp";
import React, { useEffect, useMemo, useState } from "react";
import { Bell, Check, ChevronDown, CircleCheck, Clock3, CreditCard, FileText, Filter, MapPin, MessageSquare, Phone, Search, Settings, ShieldCheck, Store, TriangleAlert, Utensils, Wallet, X } from "lucide-react";
import { DemoBadge, DemoCard, DemoHeading } from "./PrototypeBranch";

export type NoticeGroup="Orders"|"Payments"|"Payouts & settlements"|"Menu & availability"|"Business updates"|"System notifications"|"Support messages";
export type DemoNotice={id:number|string;kind:NoticeGroup;title:string;description:string;date:string;minutes:number;read:boolean;order?:string;customer?:string;amount?:number;item?:string;phone?:string;address?:string};
const seed:DemoNotice[]=[
{id:1,kind:"Orders",title:"New order received",description:"#DT-9HY6J · 1 × Smash Burger · Ksh 972.00",date:"Oct 9, 2026, 12:22 PM",minutes:2,read:false,order:"#DT-9HY6J",customer:"Mary Wanjiku",phone:"+254 712 345 678",amount:972,item:"1 × Smash Burger",address:"Kalimoni, Juja · Near Juja Police Station"},
{id:2,kind:"Orders",title:"Order completed",description:"#DT-K4HR9 has been marked as delivered.",date:"Oct 9, 2026, 12:12 PM",minutes:12,read:false,order:"#DT-K4HR9",customer:"Peter Mwangi",amount:1440,item:"2 × Chicken Burger"},
{id:3,kind:"Payouts & settlements",title:"Payout processed",description:"Ksh 16,686.00 has been sent to your M-PESA account.",date:"Oct 9, 2026, 11:24 AM",minutes:60,read:true,amount:16686},
{id:4,kind:"Menu & availability",title:"Low stock alert",description:"French Fries is running low (3 units left).",date:"Oct 9, 2026, 10:24 AM",minutes:120,read:true,item:"French Fries"},
{id:5,kind:"Support messages",title:"New support message",description:"You have a new message from DeeToo Support.",date:"Oct 9, 2026, 9:24 AM",minutes:180,read:false},
{id:6,kind:"Menu & availability",title:"Menu item updated",description:"Chicken Wrap has been updated successfully.",date:"Oct 9, 2026, 7:24 AM",minutes:300,read:true},
{id:7,kind:"System notifications",title:"System update",description:"New features have been added to the merchant portal.",date:"Oct 8, 2026",minutes:1440,read:true},
{id:8,kind:"Orders",title:"Order cancelled",description:"#DT-MN82P was cancelled by the customer.",date:"Oct 8, 2026",minutes:1700,read:true,order:"#DT-MN82P"},
{id:9,kind:"Payouts & settlements",title:"Settlement available",description:"Your weekly settlement of Ksh 12,480.00 is ready.",date:"Oct 7, 2026",minutes:2880,read:true},
{id:10,kind:"Orders",title:"Preparation time alert",description:"Order #DT-PL93K has been in preparation for 25 minutes.",date:"Oct 7, 2026",minutes:2900,read:true,order:"#DT-PL93K"},
{id:11,kind:"Orders",title:"Order dispatched",description:"#DT-Z72PQ was collected by the rider.",date:"Oct 6, 2026",minutes:4300,read:true,order:"#DT-Z72PQ"},
{id:12,kind:"Orders",title:"Order accepted",description:"#DT-A4Q93 was accepted by the kitchen.",date:"Oct 6, 2026",minutes:4550,read:true,order:"#DT-A4Q93"},
{id:13,kind:"Orders",title:"Order ready for pickup",description:"#DT-T2H77 is waiting for a rider.",date:"Oct 6, 2026",minutes:4700,read:true,order:"#DT-T2H77"},
{id:14,kind:"Orders",title:"New order received",description:"#DT-4QP18 · 2 × Chicken Wrap.",date:"Oct 5, 2026",minutes:5200,read:true,order:"#DT-4QP18"},
{id:15,kind:"Payments",title:"M-PESA payment received",description:"A payment of Ksh 972.00 was recorded.",date:"Oct 5, 2026",minutes:5800,read:true},
{id:16,kind:"Payments",title:"Card payment received",description:"A payment of Ksh 1,250.00 was recorded.",date:"Oct 5, 2026",minutes:5900,read:true},
{id:17,kind:"Payments",title:"Payment successful",description:"Order #DT-FN117 payment was confirmed.",date:"Oct 4, 2026",minutes:7200,read:true},
{id:18,kind:"Payments",title:"Refund processed",description:"A refund was issued for a cancelled order.",date:"Oct 4, 2026",minutes:7400,read:true},
{id:19,kind:"Payouts & settlements",title:"Settlement calculated",description:"Your latest settlement statement is available.",date:"Oct 3, 2026",minutes:8650,read:true},
{id:20,kind:"Business updates",title:"Branch profile reviewed",description:"Your merchant branch details were reviewed.",date:"Oct 3, 2026",minutes:8700,read:true},
{id:21,kind:"System notifications",title:"Service maintenance notice",description:"Scheduled platform maintenance has been announced.",date:"Oct 2, 2026",minutes:9700,read:true},
{id:22,kind:"System notifications",title:"New menu tools available",description:"The merchant portal has new tools.",date:"Oct 2, 2026",minutes:9750,read:true},
{id:23,kind:"Support messages",title:"Support case updated",description:"A support agent replied to your case.",date:"Oct 1, 2026",minutes:11500,read:true},
{id:24,kind:"Support messages",title:"Support conversation closed",description:"A previously resolved ticket was archived.",date:"Sep 30, 2026",minutes:13000,read:true}];
function saved<T>(key:string,fallback:T):T{try{const data=localStorage.getItem(key);return data?JSON.parse(data) as T:fallback;}catch{return fallback;}}
const groups:NoticeGroup[]=["Orders","Payments","Payouts & settlements","Menu & availability","Business updates","System notifications","Support messages"];
function NoticeIcon({kind}:{kind:NoticeGroup}){const i=kind==="Orders"?<Utensils/>:kind==="Payments"?<CreditCard/>:kind==="Payouts & settlements"?<Wallet/>:kind==="Menu & availability"?<TriangleAlert/>:kind==="Support messages"?<MessageSquare/>:kind==="Business updates"?<Store/>:<Settings/>;return <span className={"mp-p2-notice-icon mp-p2-notice-"+kind.split(" ")[0].toLowerCase()}>{i}</span>;}
export function PrototypeNotifications({search,onNavigate,notify,onUnreadChange,onPrepareOrder,live}:{search:string;onNavigate:(s:string)=>void;notify:(s:string)=>void;onUnreadChange?:(n:number)=>void;onPrepareOrder?:(orderId:string)=>void;live?:MerchantLiveBridge}){
 const [notices,setNotices]=useState<DemoNotice[]>(()=>saved("mp-demo-notices",seed));
 const [category,setCategory]=useState("All notifications");
 const [status,setStatus]=useState("All");
 const [period,setPeriod]=useState("All time");
 const [sort,setSort]=useState("Newest first");
 const [selected,setSelected]=useState<number|string>(1);
 const [dialog,setDialog]=useState<"prefs"|"more"|"contact"|null>(null);
 const [prefEmail,setPrefEmail]=useState(true),[prefPush,setPrefPush]=useState(true),[prefSound,setPrefSound]=useState(true);
 const countUnread=notices.filter(n=>!n.read).length;
 useEffect(()=>{if(!live)return;let active=true;const load=async()=>{
  try{
   const inbox=(await live.api.request<any[]>("/merchant/inbox?limit=100")).data;
   if(!active)return;
   const kinds:Record<string,NoticeGroup>={ORDERS:"Orders",PAYMENTS:"Payments",PAYOUTS:"Payouts & settlements",MENU:"Menu & availability",BUSINESS:"Business updates",SYSTEM:"System notifications",SUPPORT:"Support messages"};
   const normalized:DemoNotice[]=inbox.map((n:any)=>({
      id:n.id,kind:kinds[n.category]||"System notifications",
      title:n.subject||n.template_code||"Notification",
      description:String(n.payload?.message||n.payload?.description||n.subject||"An event was recorded"),
      date:new Date(n.created_at).toLocaleString("en-KE"),
      minutes:Math.max(0,Math.floor((Date.now()-new Date(n.created_at).getTime())/60000)),
      read:Boolean(n.read_at),order:n.payload?.order_id,customer:undefined,
      amount:typeof n.payload?.amount_minor==="number"?n.payload.amount_minor/100:undefined,
      item:n.payload?.item_name,address:undefined
   }));
   setNotices(normalized);
   setSelected(old=>normalized.some(n=>n.id===old)?old:normalized[0]?.id||0);
  }catch(e){if(active)notify("Unable to load notifications: "+(e instanceof Error?e.message:String(e)));}
 };
 const preferences=async()=>{try{const r=(await live.api.request<any>("/merchant/inbox/preferences")).data;if(!active)return;
   setPrefEmail(Boolean(r.email_enabled));setPrefPush(Boolean(r.push_enabled));setPrefSound(Boolean(r.sound_enabled));
 }catch(e){if(active)notify("Notification preferences unavailable: "+(e instanceof Error?e.message:String(e)));}};
 void load();void preferences();
 const timer=window.setInterval(()=>void load(),30000);
 return()=>{active=false;window.clearInterval(timer);};
 },[live?.branchId]);

 useEffect(()=>{onUnreadChange?.(countUnread);},[countUnread,onUnreadChange]);
 const mutate=(updater:(all:DemoNotice[])=>DemoNotice[])=>{setNotices(prev=>{const next=updater(prev);if(!live)localStorage.setItem("mp-demo-notices",JSON.stringify(next));return next;});};
 const mark=(id?:number|string)=>{if(live){
   void live.api.request(id==null?"/merchant/inbox/read-all":`/merchant/inbox/${id}/read`,{method:"POST"})
   .then(()=>{mutate(ns=>ns.map(n=>id==null||n.id===id?{...n,read:true}:n));
     notify("Notification read status saved");})
   .catch(e=>notify("Unable to mark read: "+(e instanceof Error?e.message:String(e))));return;
 }
 mutate(ns=>ns.map(n=>id==null||n.id===id?{...n,read:true}:n));notify(id==null?"All notifications marked as read":"Notification marked as read");};
 const filtered=useMemo(()=>notices.filter(n=>(category==="All notifications"||n.kind===category)&&(status==="All"||(status==="Unread"?!n.read:n.read))&&(period==="All time"||(period==="Today"?n.minutes<1440:period==="This week"?n.minutes<10080:n.minutes<43200))&&[n.title,n.description,n.kind,n.order||""].join(" ").toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==="Newest first"?a.minutes-b.minutes:b.minutes-a.minutes),[notices,category,status,period,sort,search]);
 const active=filtered.find(x=>x.id===selected)||filtered[0];
 const trigger=(kind:NoticeGroup)=>{if(kind==="Orders"){onNavigate("orders");return;}if(kind==="Menu & availability"){onNavigate("menu");return;}if(kind==="Support messages"){onNavigate("support");return;}if(kind==="Payments"||kind==="Payouts & settlements"){onNavigate("finance");return;}if(kind==="Business updates"){onNavigate("team");return;}notify("System update details are displayed above.");};
 return <div className="mp-p2">
  <DemoHeading eyebrow="ACCOUNT" title="Notifications" description="Stay updated with orders, payments, support messages and important updates." action={<div className="mp-p2-notification-actions"><button className="mp-outline" onClick={()=>mark()}><Check size={18}/>Mark all as read</button><button className="mp-outline" onClick={()=>setDialog("prefs")}><Settings size={18}/>Notification settings</button></div>}/>
  <div className="mp-p2-notify-grid">
    <DemoCard className="mp-p2-notify-filters"><h2>Filters</h2><div className="mp-p2-filter-list">{["All notifications",...groups].map(kind=><button className={category===kind?"active":""} onClick={()=>setCategory(kind)} key={kind}><span>{kind}</span><em>{kind==="All notifications"?notices.length:notices.filter(n=>n.kind===kind).length}</em></button>)}</div><h2>Status</h2><div className="mp-p2-filter-list">{["All","Unread","Read"].map(val=><button className={status===val?"active":""} onClick={()=>setStatus(val)} key={val}>◻ &nbsp; {val}<em>{val==="All"?notices.length:val==="Unread"?countUnread:notices.length-countUnread}</em></button>)}</div><h2>Time</h2><div className="mp-p2-filter-list">{["All time","Today","This week","This month"].map(val=><button className={period===val?"active":""} onClick={()=>setPeriod(val)} key={val}>◷ &nbsp; {val}<em>{notices.filter(n=>val==="All time"||val==="This month"&&n.minutes<43200||val==="Today"&&n.minutes<1440||val==="This week"&&n.minutes<10080).length}</em></button>)}</div></DemoCard>
    <DemoCard className="mp-p2-notify-list"><div className="mp-p2-card-head"><h2>Notifications ({filtered.length})</h2><select aria-label="Sort notifications" value={sort} onChange={e=>setSort(e.target.value)}><option>Newest first</option><option>Oldest first</option></select></div>{filtered.length?filtered.map(n=><button key={n.id} className={"mp-p2-notice-row "+(active?.id===n.id?"active":"")} onClick={()=>setSelected(n.id)}><NoticeIcon kind={n.kind}/><span><strong>{n.title}</strong><small>{n.description}</small></span><em>{n.minutes<60?n.minutes+" minutes ago":n.minutes<1440?Math.round(n.minutes/60)+" hours ago":Math.floor(n.minutes/1440)+" days ago"}</em>{!n.read&&<i className="mp-p2-unread-dot"/>}</button>):<div className="mp-p2-empty">No notifications match these filters. <button onClick={()=>{setCategory("All notifications");setStatus("All");setPeriod("All time");}}>Clear filters</button></div>}</DemoCard>
    <DemoCard className="mp-p2-notice-detail">{active?<><div className="mp-p2-notice-detail-top"><NoticeIcon kind={active.kind}/><div><h2>{active.title}</h2><small>{active.date}</small></div><DemoBadge kind={active.read?"blue":"red"}>{active.read?"Read":"Unread"}</DemoBadge><button className="mp-p2-more-button" aria-label="More notification options" onClick={()=>{setSelected(active.id);setDialog("more");}}>⋮</button></div><p className="mp-p2-notice-description">{active.description}</p>{active.order&&<section className="mp-p2-order-detail"><div className="mp-p2-card-head"><h3>Order details</h3><button className="mp-outline" onClick={()=>onNavigate("orders")}>View order</button></div><div className="mp-p2-data-row"><small>Order ID</small><strong>{active.order}</strong></div><div className="mp-p2-data-row"><small>Customer</small><strong>{active.customer||"Customer"}</strong></div><div className="mp-p2-data-row"><small>Items</small><strong>🍔 &nbsp; {active.item||"Order items"}</strong></div><div className="mp-p2-data-row"><small>Total amount</small><strong>Ksh {(active.amount||0).toFixed(2)}</strong></div></section>}
      {active.address&&<div className="mp-p2-notice-delivery"><h3>Delivery details</h3><p><MapPin size={20}/>{active.address}</p><button className="mp-p2-mini-map" onClick={()=>notify("Illustrative map; live delivery map needs backend mapping.")} aria-label="View delivery location"><MapPin/></button></div>}
      <div className="mp-p2-notice-ctas"><button className="mp-primary" onClick={()=>active.kind==="Orders"&&active.title==="New order received"&&active.order&&onPrepareOrder?onPrepareOrder(active.order):trigger(active.kind)}>{active.kind==="Orders"&&active.title==="New order received"?"▷ Mark as preparing":active.kind==="Orders"?"▷ View kitchen orders":active.kind==="Support messages"?"Open conversation":"View details"}</button>{active.phone&&<button className="mp-outline" onClick={()=>setDialog("contact")}><Phone size={16}/>Contact customer</button>}{!active.read&&<button className="mp-outline" onClick={()=>mark(active.id)}><Check size={16}/>Mark read</button>}</div>
    </>:<div className="mp-p2-empty">Select a notification to view its details.</div>}</DemoCard>
  </div>
  {dialog&&<div className="mp-modal-overlay" onMouseDown={e=>e.target===e.currentTarget&&setDialog(null)}><section className="mp-modal" role="dialog" aria-modal="true" aria-label={dialog}><div className="mp-modal-head"><h2>{dialog==="prefs"?"Notification settings":dialog==="contact"?"Contact customer":"Notification actions"}</h2><button aria-label="Close" onClick={()=>setDialog(null)}><X/></button></div>{dialog==="prefs"?<><p>Choose how example notifications are presented. {live?"Security-critical notices remain mandatory.":"These preferences are local to your prototype."}</p>{[["Email notifications",prefEmail,setPrefEmail],["Browser push alerts",prefPush,setPrefPush],["New order sound",prefSound,setPrefSound]].map(([label,val,setter]:any)=><div className="mp-p2-toggle-row" key={label}><strong>{label}</strong><button role="switch" className={"mp-switch "+(val?"on":"")} aria-label={label} aria-checked={val} onClick={()=>setter(!val)}><span/></button></div>)}<button className="mp-primary mp-full" onClick={()=>{if(live){void live.api.request("/merchant/inbox/preferences",{method:"PUT",body:JSON.stringify({
  email_enabled:prefEmail,push_enabled:prefPush,sound_enabled:prefSound})}).then(()=>{
    setDialog(null);notify("Notification preferences saved");
  }).catch(e=>notify("Unable to save preferences: "+(e instanceof Error?e.message:String(e))));return;}
 setDialog(null);notify("Notification preferences saved locally");}}>Save notification settings</button></>:dialog==="more"?<div className="mp-p2-menu-actions"><button onClick={()=>{if(active)mark(active.id);setDialog(null);}}><Check/>Mark as read</button><button onClick={()=>{if(active)trigger(active.kind);setDialog(null);}}>Open related screen</button><button onClick={()=>{if(active){if(live){void live.api.request(`/merchant/inbox/${active.id}/dismiss`,{method:"POST"})
  .then(()=>{mutate(all=>all.filter(n=>n.id!==active.id));setDialog(null);notify("Notification archived");})
  .catch(e=>notify("Unable to archive: "+(e instanceof Error?e.message:String(e))));}
 else {mutate(all=>all.filter(n=>n.id!==active.id));setDialog(null);notify("Demo notification dismissed");}}}}>Dismiss notification</button></div>:<><p>{live?"Customer contact is available through the authorized Kitchen Order contact workflow. Personal telephone numbers are not shown.":"Demo customer contact: "+(active?.customer||"")}</p><p>{live?"Open the related order to request a message.":active?.phone||"Contact information not provided"}</p><button className="mp-primary mp-full" onClick={()=>setDialog(null)}>Close</button></>}</section></div>}
 </div>;
}
