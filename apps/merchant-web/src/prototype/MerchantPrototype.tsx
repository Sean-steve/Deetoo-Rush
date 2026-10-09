import React, { useEffect, useState, type ReactNode } from "react";
import { Bell, BookOpen, CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, Clock, Home, LifeBuoy, LogOut, MapPin, Menu, Search, Settings, ShieldCheck, Store, Users, Utensils, Wallet, X, CircleHelp, RotateCcw } from "lucide-react";
import { DemoProvider, foodPhotos, useDemo, type MerchantDemo } from "./model";
import { KitchenPage } from "./pages/KitchenPage";
import { MenuPage } from "./pages/MenuPage";
import { FinancePage } from "./pages/FinancePage";
import { TeamPage } from "./pages/TeamPage";
import "./prototype.css";

export const nav=[
 {id:"overview",title:"Overview",icon:Home,group:""},
 {id:"orders",title:"Kitchen orders",icon:Utensils,group:"Operations"},
 {id:"menu",title:"Menu & availability",icon:Store,group:"Operations"},
 {id:"finance",title:"Finance & settlements",icon:Wallet,group:"Business"},
 {id:"business",title:"Business & team",icon:Users,group:"Business"},
 {id:"branch",title:"Branch settings",icon:Store,group:"Business"},
 {id:"security",title:"Security & sessions",icon:ShieldCheck,group:"Account"},
 {id:"notifications",title:"Notifications",icon:Bell,group:"Account"},
 {id:"support",title:"Support",icon:LifeBuoy,group:"Account"}
];
type PageProps={search:string;navigate:(to:string)=>void};
export function HeaderTitle({eyebrow,title,description,children}:{eyebrow:string;title:string;description:string;children?:ReactNode}){
 return <div className="mp-page-head"><div><div className="mp-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children}</div>;
}
export function CountTile({icon:Icon,label,value,caption,accent="mint",action}:{icon:React.ElementType;label:string;value:ReactNode;caption:string;accent?:string;action?:()=>void}) {
 return <div className="mp-count-tile"><span className={"mp-tile-icon mp-"+accent}><Icon size={25}/></span><div className="mp-tile-copy"><div>{label}</div><strong>{value}</strong><small>{caption}</small></div>{action&&<button className="mp-tile-arrow" onClick={action} aria-label={"Show "+label}><ChevronRight size={17}/></button>}</div>;
}
export function Pill({children,tone="green"}:{children:ReactNode;tone?:"green"|"amber"|"red"|"blue"|"gray"|"purple"}){return <span className={"mp-pill mp-pill-"+tone}>{children}</span>;}
export function Modal({open,onClose,title,children,width="560px"}:{open:boolean;onClose:()=>void;title:string;children:ReactNode;width?:string}){
 useEffect(()=>{if(!open)return;const f=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose()};window.addEventListener("keydown",f);return()=>window.removeEventListener("keydown",f);},[open,onClose]);
 if(!open)return null;
 return <div className="mp-dialog-layer" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="mp-dialog" style={{maxWidth:width}} role="dialog" aria-modal="true" aria-label={title}>
 <header><h2>{title}</h2><button className="mp-icon-button" onClick={onClose} aria-label="Close dialog"><X size={21}/></button></header><div className="mp-dialog-body">{children}</div></section></div>;
}
export function Field({label,children,help}:{label:string;children:ReactNode;help?:string}){return <label className="mp-field"><span>{label}</span>{children}{help&&<small>{help}</small>}</label>;}
export function MerchantPrototype(){return <DemoProvider><PrototypeInner/></DemoProvider>;}
const pathFor=(page:string)=>"/prototype/"+page;
function PrototypeInner(){
 const {data,update,toast,announce,reset}=useDemo();
 const [page,setPage]=useState(()=>window.location.pathname.split("/")[2]||"orders");
 const [search,setSearch]=useState("");
 const [mobile,setMobile]=useState(false);
 const [storeMenu,setStoreMenu]=useState(false);
 const [alertMenu,setAlertMenu]=useState(false);
 const [userMenu,setUserMenu]=useState(false);
 const [branchMenu,setBranchMenu]=useState(false);
 const [hoursOpen,setHoursOpen]=useState(false);
 const [hours,setHours]=useState<Record<string,string>>({Mon:"08:00–23:00",Tue:"08:00–23:00",Wed:"08:00–23:00",Thu:"08:00–23:00",Fri:"08:00–00:00",Sat:"08:00–00:00",Sun:"08:00–23:00"});
 const [searchFocused,setSearchFocused]=useState(false);
 const [branchImageFailed,setBranchImageFailed]=useState(false);
 const navigate=(target:string)=>{setPage(target);setSearch("");setMobile(false);setAlertMenu(false);setStoreMenu(false);setUserMenu(false);setBranchMenu(false);window.history.pushState({},"",pathFor(target));window.scrollTo({top:0,behavior:"instant"});};
 useEffect(()=>{const pop=()=>{setPage(window.location.pathname.split("/")[2]||"orders");setSearch("");};window.addEventListener("popstate",pop);return()=>window.removeEventListener("popstate",pop);},[]);
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();document.getElementById("mp-global-search")?.focus();setSearchFocused(true);}if(event.key==="Escape"){setStoreMenu(false);setAlertMenu(false);setUserMenu(false);setBranchMenu(false);setSearchFocused(false);}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[]);
 const setStatus=(status:MerchantDemo["storeStatus"])=>{update(p=>({...p,storeStatus:status}));announce("Store status changed to "+status+" (prototype only)");setStoreMenu(false);};
 const noticeCount=data.notices.filter(n=>!n.read).length;
 const prototypeOnly=!["overview","orders","menu","finance","business"].includes(page);
 const searchResults=search.trim()?nav.filter(n=>n.title.toLowerCase().includes(search.toLowerCase())):[];
 const notifyRead=(id:string)=>update(p=>({...p,notices:p.notices.map(n=>n.id===id?{...n,read:true}:n)}));
 const branchCard=<div className="mp-branch-summary">
 {branchImageFailed?<div className="mp-branch-art"><Store size={26}/></div>:<img src={data.business.photo || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=250&q=85"} alt="Restaurant interior" onError={()=>setBranchImageFailed(true)}/>}
 <div><strong>{data.branch}</strong><small>Kalimoni, Juja</small></div><Pill>{data.storeStatus}</Pill>
 <button className="mp-outline mp-adjust" onClick={()=>page==="business"?document.querySelector(".mp-business-profile")?.scrollIntoView({behavior:"smooth"}):setHoursOpen(true)}>{page==="business"?<ChevronRight size={16}/>:<Clock size={16}/>} {page==="business"?"View profile":"Adjust hours"}</button>
 </div>;
 return <div className="mp-root">
 <aside className={"mp-sidebar "+(mobile?"mp-sidebar-open":"")}>
 <div className="mp-brand"><div className="mp-brand-symbol"><div/></div><div><strong>DeeToo</strong><small>Merchant</small></div><button aria-label="Collapse sidebar" className="mp-collapse" onClick={()=>setMobile(false)}><ChevronsLeft size={22}/></button></div>
 <div className="mp-branch-switch">
 <span className="mp-branch-circle"><Store size={24}/></span><button aria-expanded={branchMenu} onClick={()=>setBranchMenu(!branchMenu)}><strong>{data.branch}</strong><small>Kalimoni, Juja</small></button><ChevronDown size={16}/>
 {branchMenu&&<div className="mp-nav-popover">{data.branches.map(b=><button key={b} onClick={()=>{update(p=>({...p,branch:b}));setBranchMenu(false);announce("Showing "+b+" (demo scope)");}}>{b}{b===data.branch&&<Check size={15}/>}</button>)}<button onClick={()=>navigate("branch")}>+ Manage branches</button></div>}
 </div>
 <nav className="mp-navigation" aria-label="Merchant prototype navigation">{nav.map((item,index)=>{const Icon=item.icon;return <React.Fragment key={item.id}>{item.group&&(index===0||nav[index-1].group!==item.group)&&<div className="mp-nav-section">{item.group}</div>}
 <button className={"mp-nav-link "+(page===item.id?"mp-current":"")} aria-current={page===item.id?"page":undefined} onClick={()=>navigate(item.id)}><Icon size={21}/><span>{item.title}</span>{item.id==="notifications"&&noticeCount>0&&<b className="mp-bubble">{noticeCount}</b>}</button></React.Fragment>})}</nav>
 <button className="mp-profile-bottom" onClick={()=>navigate("business")}><span className="mp-avatar">TM</span><span><strong>test.merchant@deetoo.test</strong><small>Merchant Owner</small></span><ChevronRight size={17}/></button>
 </aside>
 {mobile&&<button className="mp-overlay" onClick={()=>setMobile(false)} aria-label="Close navigation"/>}
 <div className="mp-workspace">
 <header className="mp-topbar">
 <button className="mp-mobile-toggle" onClick={()=>setMobile(true)} aria-label="Open navigation"><Menu size={22}/></button>
 <div className="mp-searchbox"><Search size={22}/><input id="mp-global-search" aria-label="Search current page" value={search} onChange={e=>setSearch(e.target.value)} onFocus={()=>setSearchFocused(true)} onBlur={()=>setTimeout(()=>setSearchFocused(false),150)} placeholder={page==="orders"?"Search orders, customer name or order ID...":page==="menu"?"Search menu items, categories or SKUs...":page==="finance"?"Search transactions, orders or settlements...":page==="business"?"Search team members, roles or permissions...":"Search merchant pages..."}/><kbd>Ctrl K</kbd>
 {searchFocused&&searchResults.length>0&&<div className="mp-search-dropdown"><span>Go to page</span>{searchResults.map(p=><button key={p.id} onMouseDown={e=>e.preventDefault()} onClick={()=>navigate(p.id)}>{p.title}<ChevronRight size={15}/></button>)}</div>}</div>
 <div className="mp-header-right"><div className="mp-popover-anchor"><button className="mp-store-badge" aria-expanded={storeMenu} onClick={()=>setStoreMenu(!storeMenu)}><i/>{data.storeStatus==="Open"?"Store open":data.storeStatus==="Paused"?"Store paused":"Store closed"} <ChevronDown size={16}/></button>{storeMenu&&<div className="mp-menu-popup">{(["Open","Paused","Closed"] as const).map(status=><button key={status} onClick={()=>setStatus(status)}>{status} {data.storeStatus===status&&<Check size={15}/>}</button>)}<button onClick={()=>{setHoursOpen(true);setStoreMenu(false);}}>Adjust hours</button></div>}</div>
 <div className="mp-popover-anchor"><button className="mp-header-bell" onClick={()=>setAlertMenu(!alertMenu)} aria-label="Notifications" aria-expanded={alertMenu}><Bell size={21}/>{noticeCount>0&&<b>{noticeCount}</b>}</button>{alertMenu&&<div className="mp-menu-popup mp-wide-menu"><strong>Notifications</strong>{data.notices.map(n=><button key={n.id} onClick={()=>{notifyRead(n.id);announce(n.text+" marked as read");}}>{!n.read&&<i className="mp-dot"/>}<span>{n.text}<small>{n.time}</small></span></button>)}<button onClick={()=>navigate("notifications")}>View notification center</button></div>}</div>
 <div className="mp-popover-anchor"><button className="mp-user-trigger" onClick={()=>setUserMenu(!userMenu)} aria-expanded={userMenu}><span className="mp-avatar mp-dark-avatar">TM</span><strong>Deetoo Test Merchant</strong><ChevronDown size={16}/></button>{userMenu&&<div className="mp-menu-popup mp-user-popup"><button onClick={()=>navigate("business")}>Business profile</button><button onClick={()=>{reset();setUserMenu(false);}}>Reset prototype data</button><a href="/orders">Exit prototype</a></div>}</div>
 </div></header>
 <main className="mp-content">
 <div className="mp-prototype-mark" title="All Phase 1 data and actions are local simulations, not connected to production">INTERACTIVE UI PROTOTYPE · NOT LIVE DATA</div>
 {["orders","menu","business"].includes(page)&&<div className="mp-head-branch">{branchCard}</div>}
 {page==="orders"&&<KitchenPage search={search} navigate={navigate}/>}
 {page==="menu"&&<MenuPage search={search} navigate={navigate}/>}
 {page==="finance"&&<FinancePage search={search} navigate={navigate}/>}
 {page==="business"&&<TeamPage search={search} navigate={navigate}/>}
 {page==="overview"&&<><HeaderTitle eyebrow="Merchant workspace" title="Overview" description="Choose an operational area to explore the new merchant experience."/>{branchCard}<div className="mp-overview-grid">{nav.filter(x=>["orders","menu","finance","business"].includes(x.id)).map(x=><button className="mp-panel" onClick={()=>navigate(x.id)} key={x.id}><h2>{x.title}</h2><p>Open the fully interactive Phase 1 screen</p><ChevronRight/></button>)}</div></>}
 {prototypeOnly&&<><HeaderTitle eyebrow="Phase 2" title={nav.find(x=>x.id===page)?.title||"Merchant screen"} description="This section remains in the navigation. Its complete approved design will be implemented in Phase 2."/><div className="mp-panel mp-next-phase"><CircleHelp size={40}/><h2>Scheduled for Phase 2</h2><p>Branch Settings, Security & Sessions, Notifications, and Support are not removed. Their screen flows will be built in the next execution.</p><button className="mp-primary" onClick={()=>navigate("orders")}>Return to Kitchen orders</button></div></>}
 </main>
 </div>
 <Modal title="Branch opening hours" open={hoursOpen} onClose={()=>setHoursOpen(false)}><p className="mp-muted">Prototype hours for {data.branch}. Editing is simulated and saved for this session.</p><div className="mp-hours-list">{Object.entries(hours).map(([day,time])=><label key={day}><strong>{day}</strong><input aria-label={day+" hours"} value={time} onChange={e=>setHours(prev=>({...prev,[day]:e.target.value}))}/></label>)}</div><button className="mp-primary" onClick={()=>{setHoursOpen(false);announce("Operating hours saved locally");}}>Save opening hours</button></Modal>
 {toast&&<div className="mp-toast" role="status"><Check size={18}/>{toast}</div>}
 </div>;
}
