import React from "react";
import { MerchantBranchImage } from "./MerchantBranchImage";
import {ArrowRight, Bell, ChefHat, CircleCheck, Clock3, LayoutGrid, Package, Store, Utensils, Wallet} from "lucide-react";

type Order = {status:"new"|"preparing"|"ready"|"completed";amount:number};
type Item = {available:boolean};
export function MerchantOverview({orders,items,branchName,coverUrl,loading=false,live,onNavigate}:{
  orders:Order[];items:Item[];branchName:string;coverUrl?:string|null;loading?:boolean;live:boolean;onNavigate:(screen:string)=>void;
}){
 const stages=[
  {key:"new",label:"New orders",icon:Utensils,tone:"red"},
  {key:"preparing",label:"Preparing",icon:ChefHat,tone:"orange"},
  {key:"ready",label:"Ready for pickup",icon:CircleCheck,tone:"green"},
  {key:"completed",label:"Completed",icon:Package,tone:"blue"}
 ] as const;
 const count=(s:Order["status"])=>orders.filter(o=>o.status===s).length;
 const pending=orders.filter(o=>o.status!=="completed").length;
 const total=orders.length||1;
 return <div className="mp-overview">
  <div className="mp-head"><div className="mp-overview-brand"><MerchantBranchImage src={coverUrl} name={branchName}/><div><span className="mp-eyebrow">MERCHANT OVERVIEW</span><h1>Business overview</h1>
    <p>Live operational snapshot for {branchName}. Use the shortcuts to manage orders, menus and branch settings.</p></div></div>
    <button className="mp-outline" onClick={()=>onNavigate("branch")}><Store size={17}/> Branch settings <ArrowRight size={16}/></button>
  </div>
  {loading&&<p role="status">Refreshing your merchant overview…</p>}
  <div className="mp-summary-grid">
   <div className="mp-summary"><span className="mp-summary-icon mp-red"><Utensils size={23}/></span><span><small>Orders requiring attention</small><strong>{pending}</strong><em>New, preparing and ready</em></span></div>
   <div className="mp-summary"><span className="mp-summary-icon mp-blue"><Package size={23}/></span><span><small>Orders in this view</small><strong>{orders.length}</strong><em>{live?"From authorized DeeToo order records":"Illustrative preview"}</em></span></div>
   <div className="mp-summary"><span className="mp-summary-icon mp-green"><LayoutGrid size={23}/></span><span><small>Available menu items</small><strong>{items.filter(i=>i.available).length}</strong><em>{items.length} items on this merchant account</em></span></div>
   <div className="mp-summary"><span className="mp-summary-icon mp-orange"><Clock3 size={23}/></span><span><small>Items unavailable</small><strong>{items.filter(i=>!i.available).length}</strong><em>Review availability before service</em></span></div>
  </div>
  <div className="mp-overview-grid">
   <section className="mp-white-card"><div className="mp-card-title"><div><h3>Kitchen pipeline</h3><p>Current order distribution, based on your authorized order history.</p></div><button className="mp-outline" onClick={()=>onNavigate("orders")}>Open kitchen <ArrowRight size={15}/></button></div>
    <div className="mp-overview-pipeline">{stages.map(({key,label,icon:Icon,tone})=><div key={key} className="mp-overview-stage"><span className={"mp-summary-icon mp-"+tone}><Icon size={20}/></span><div><strong>{label}</strong><div className="mp-overview-track"><span style={{width:(count(key)/total*100)+"%"}}/></div></div><b>{count(key)}</b></div>)}</div>
   </section>
   <section className="mp-white-card"><h3>Quick actions</h3><p>Jump directly to the workflow you need.</p>
    <div className="mp-overview-actions">{[
     {screen:"orders",label:"Manage kitchen orders",icon:ChefHat},
     {screen:"menu",label:"Update menu & availability",icon:LayoutGrid},
     {screen:"finance",label:"View finance & settlements",icon:Wallet},
     {screen:"notifications",label:"Read notifications",icon:Bell},
     {screen:"branch",label:"Edit branch settings",icon:Store}
    ].map(({screen,label,icon:Icon})=><button key={screen} onClick={()=>onNavigate(screen)}><Icon size={19}/><span>{label}</span><ArrowRight size={16}/></button>)}</div>
   </section>
  </div>
 </div>;
}
