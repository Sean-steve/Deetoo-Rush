import {SettlementsLive} from "./settlements-live";
import React,{useMemo,useState} from "react";
import {ArrowRight, Banknote, CheckCircle2, ChevronRight, Clock3, CreditCard, Download, FileCheck2, Landmark, ListChecks, Plus, ShieldCheck, Truck, Users, Wallet, XCircle} from "lucide-react";
import {displayTime,formatMoney} from "../data";
import {amount,eligiblePayoutItems,payoutTotal} from "../phase3Data";
import type {PayoutBatch,PayoutKind,PayoutStatus} from "../phase3Data";
import {useDemo,canAct} from "../store";
import {Bars,Card,Chip,DetailLine,Empty,IconStat,Modal,Ring,SearchBox,SelectBox,Tabs} from "../ui";
const statuses:PayoutStatus[]=["DRAFT","APPROVED","PAID","REJECTED"];
export function SettlementsScreen({navigate,toast}:{navigate:(screen:string)=>void;toast:(message:string)=>void}){
 const {data,act,role,mode}=useDemo(),state=data.phase3,canCreate=canAct(role,"settlement"),canApprove=canAct(role,"payout");
 const [tab,setTab]=useState("all"),[kind,setKind]=useState<PayoutKind>("MERCHANT"),[search,setSearch]=useState(""),[selectedId,setSelectedId]=useState<string|null>(null),[detail,setDetail]=useState("breakdown");
 const [modal,setModal]=useState<"create"|"approve"|"reject"|"paid"|null>(null),[reason,setReason]=useState(""),[reference,setReference]=useState(""),[period,setPeriod]=useState("October 2026 · Demo"),[includeAll,setIncludeAll]=useState(true);
 const eligible=eligiblePayoutItems(state,data.orders,data.riders,kind),preview=includeAll?eligible:eligible.slice(0,15);
 const filters=state.payouts.filter(b=>(tab==="all"||b.status===tab)&&b.kind===kind&&(b.id+" "+b.period+" "+b.items.map(i=>i.payeeName).join(" ")).toLowerCase().includes(search.toLowerCase()));
 const selected=state.payouts.find(b=>b.id===selectedId)||filters[0];
 const pending=state.payouts.filter(b=>b.status==="DRAFT"),approved=state.payouts.filter(b=>b.status==="APPROVED"),paid=state.payouts.filter(b=>b.status==="PAID"),rejected=state.payouts.filter(b=>b.status==="REJECTED");
 const waitingTotal=eligiblePayoutItems(state,data.orders,data.riders,"MERCHANT").reduce((n,i)=>n+i.amount,0)+eligiblePayoutItems(state,data.orders,data.riders,"RIDER").reduce((n,i)=>n+i.amount,0);
 const selectedGroup=useMemo(()=>selected?Array.from(selected.items.reduce((map,item)=>{const v=map.get(item.payeeId)||{id:item.payeeId,name:item.payeeName,amount:0,orders:0};v.amount+=item.amount;v.orders++;map.set(item.payeeId,v);return map;},new Map<string,{id:string;name:string;amount:number;orders:number}>()).values()):[],[selected]);
 const start=()=>{setModal("create");setPeriod("October 2026 · Demo");setIncludeAll(true);};
 const save=()=>{
  if(modal==="create"){if(!canCreate||!preview.length)return;act({type:"PHASE3_PAYOUT_CREATE",kind,period,items:preview});setTab("all");setSearch("");setSelectedId(null);toast("Payout draft created. Approval and payment remain separate demo actions.");}
  if((modal==="approve"||modal==="reject")&&selected){if(!canApprove||reason.trim().length<5)return;act({type:"PHASE3_PAYOUT_REVIEW",id:selected.id,status:modal==="approve"?"APPROVED":"REJECTED",reason});toast("Batch "+selected.id+" reviewed: "+modal+".");}
  if(modal==="paid"&&selected){if(!canApprove||reference.trim().length<5||reason.trim().length<5||state.payouts.some(x=>x.reference===reference.trim()))return;act({type:"PHASE3_PAYOUT_MARK_PAID",id:selected.id,reference,reason});toast("Batch marked paid in the simulation; no funds transferred.");}
  setModal(null);setReason("");setReference("");
 };
 const exportBatches=()=>{const rows=[["Batch","Kind","Status","Amount","Items"],...filters.map(b=>[b.id,b.kind,b.status,String(payoutTotal(b)),String(b.items.length)])];const csv=rows.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(",")).join("\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="deetoo-demo-settlements.csv";a.click();URL.revokeObjectURL(url);toast("Simulated settlement batches exported.");};
 if(mode==="live")return <SettlementsLive navigate={navigate}/>;
 return <div className="dn-screen" data-testid="screen-settlements">
  <div className="dn-title-row"><div><h1>Settlements & Payouts</h1><p>Review partner earnings, create payout batches and control simulated disbursements.</p></div><div className="dn-title-buttons"><button className="dn-btn outline" onClick={exportBatches}><Download size={14}/> Export</button><button className="dn-btn primary" disabled={!canCreate} onClick={start}><Plus size={15}/> Create Payout Batch</button></div></div>
  <div className="dn-metrics five">
   <IconStat label="Eligible For Settlement" value={amount(waitingTotal)} icon={<Wallet/>} foot="From completed demo orders"/>
   <IconStat label="Awaiting Approval" value={pending.length} tone="amber" icon={<Clock3/>} foot={amount(pending.reduce((a,b)=>a+payoutTotal(b),0))}/>
   <IconStat label="Approved Batches" value={approved.length} tone="blue" icon={<FileCheck2/>} foot={amount(approved.reduce((a,b)=>a+payoutTotal(b),0))}/>
   <IconStat label="Marked Paid" value={amount(paid.reduce((a,b)=>a+payoutTotal(b),0))} icon={<CheckCircle2/>} foot="Simulated payment markers"/>
   <IconStat label="Rejected Batches" value={rejected.length} tone="red" icon={<XCircle/>}/>
  </div>
  <div className="dn-settlement-layout">
   <div className="dn-settlement-main">
    <Card className="dn-settlement-register">
     <div className="dn-settlement-controls"><Tabs ariaLabel="Settlement payout type" value={kind} onChange={x=>{setKind(x as PayoutKind);setSelectedId(null);}} tabs={[{key:"MERCHANT",label:"Merchant Settlements"},{key:"RIDER",label:"Rider Payouts"}]}/><SelectBox label="Settlement period" value="demo" onChange={()=>{}} options={[{value:"demo",label:"October 2026 Demo"}]}/></div>
     <Tabs ariaLabel="Settlement status" value={tab} onChange={setTab} tabs={[{key:"all",label:"All Batches ("+state.payouts.filter(x=>x.kind===kind).length+")"},...statuses.map(s=>({key:s,label:s+" ("+state.payouts.filter(x=>x.kind===kind&&x.status===s).length+")"}))]}/>
     <div className="dn-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search batch, payee or reference..."/><button className="dn-btn outline" onClick={()=>{setSearch("");setTab("all");}}>Clear Filters</button></div>
     <div className="dn-table-scroll"><table className="dn-table dn-settlement-table"><thead><tr><th>Batch #</th><th>Period</th><th>Payees</th><th>Orders</th><th>Total Payable</th><th>Status</th><th>Created</th></tr></thead><tbody>{filters.map(b=><tr key={b.id} tabIndex={0} className={selected?.id===b.id?"selected":""} onClick={()=>{setSelectedId(b.id);setDetail("breakdown");}} onKeyDown={e=>e.key==="Enter"&&setSelectedId(b.id)}><td><b>{b.id}</b></td><td>{b.period}</td><td>{new Set(b.items.map(i=>i.payeeId)).size}</td><td>{b.items.length}</td><td><b>{amount(payoutTotal(b))}</b></td><td><Chip value={b.status}/></td><td>{displayTime(b.createdAt)}</td></tr>)}</tbody></table></div>
     {!filters.length&&<Empty label="No payout batches yet" detail="Use Create Payout Batch to prepare a simulated merchant or rider settlement."/>}
     <div className="dn-settlement-tip"><ShieldCheck size={16}/> Batches are snapshots of eligible completed orders. Drafting reserves those orders against duplicate batching; rejecting a draft releases them. No transfer runs automatically.</div>
    </Card>
    <div className="dn-settlement-secondary">
     <Card title="Pending Earnings" desc="Based on currently eligible orders"><div className="dn-settlement-earnings"><div><span>Merchants</span><strong>{amount(eligiblePayoutItems(state,data.orders,data.riders,"MERCHANT").reduce((a,i)=>a+i.amount,0))}</strong></div><div><span>Riders</span><strong>{amount(eligiblePayoutItems(state,data.orders,data.riders,"RIDER").reduce((a,i)=>a+i.amount,0))}</strong></div></div><Bars values={[11,17,13,21,19,14,16,25,20,23,17,24]} labels={["1","","","","8","","","","16","","","24"]}/></Card>
     <Card title="Batch Status Overview"><Ring number={state.payouts.length} label="Batches" parts={statuses.map((s,i)=>({name:s,value:state.payouts.filter(b=>b.status===s).length,color:["#f7a928","#0a81db","#04aa69","#fa5263"][i]}))}/></Card>
    </div>
   </div>
   <div className="dn-settlement-sidebar">
    <Card title="Payout Batch Details" desc="Review allocation, authorization and simulated provider reference">
     {selected?<><div className="dn-settlement-selected"><div><h2>{selected.id}</h2><p>{selected.kind} · {selected.period}</p></div><Chip value={selected.status}/></div>
      <Tabs ariaLabel="Batch details" value={detail} onChange={setDetail} tabs={[{key:"breakdown",label:"Allocation"},{key:"orders",label:"Orders"},{key:"audit",label:"Review & Audit"}]}/>
      <DetailLine label="Batch total">{amount(payoutTotal(selected))}</DetailLine><DetailLine label="Payee count">{selectedGroup.length}</DetailLine><DetailLine label="Included orders">{selected.items.length}</DetailLine><DetailLine label="Status"><Chip value={selected.status}/></DetailLine>
      {detail==="breakdown"&&<div className="dn-settlement-payee-list">{selectedGroup.slice(0,14).map(x=><div key={x.id}><span><b>{x.name}</b><small>{x.orders} orders</small></span><strong>{amount(x.amount)}</strong></div>)}{selectedGroup.length>14&&<p>+ {selectedGroup.length-14} additional payees in this batch.</p>}</div>}
      {detail==="orders"&&<div className="dn-settlement-payee-list">{selected.items.slice(0,16).map(x=><button key={x.orderId} onClick={()=>{sessionStorage.setItem("deetoo.demo.focusOrder",x.orderId);navigate("orders");}}><span><b>#{x.orderId}</b><small>{x.payeeName}</small></span><strong>{amount(x.amount)}</strong><ChevronRight size={14}/></button>)}{selected.items.length>16&&<p>+ {selected.items.length-16} more included orders.</p>}</div>}
      {detail==="audit"&&<div className="dn-panel-information"><DetailLine label="Created">{displayTime(selected.createdAt)}</DetailLine><DetailLine label="Approved">{selected.approvedAt?displayTime(selected.approvedAt):"—"}</DetailLine><DetailLine label="Marked paid">{selected.paidAt?displayTime(selected.paidAt):"—"}</DetailLine><DetailLine label="Provider reference">{selected.reference||"Not marked paid"}</DetailLine><p>{selected.reason||"No review reason yet."}</p></div>}
      <div className="dn-fin-actionbar">{selected.status==="DRAFT"&&<><button className="dn-btn primary" disabled={!canApprove} onClick={()=>{setModal("approve");setReason("");}}>Approve Batch</button><button className="dn-btn red" disabled={!canApprove} onClick={()=>{setModal("reject");setReason("");}}>Reject</button></>}{selected.status==="APPROVED"&&<button className="dn-btn primary" disabled={!canApprove} onClick={()=>{setModal("paid");setReason("");setReference("");}}>Mark Paid (Demo)</button>}<button className="dn-btn outline" onClick={()=>navigate("financial")}>Financial Control <ArrowRight size={13}/></button></div>
     </>:<Empty label="Select a payout batch" detail="Newly created batches will appear here with a complete allocation preview."/>}
    </Card>
    <Card title="Settlement Methodology"><div className="dn-fin-note">Merchant share = item subtotal less {state.control.commissionRate}% commission and {state.control.reservePercent}% reserve. Rider share = {state.control.riderDeliveryShare}% of delivery fee. Only delivered, paid, non-refunded and unreserved orders qualify. Changes to rates only affect newly drafted batches.</div></Card>
    <Card title="Recent Payout Activity"><div className="dn-simple-activity">{state.logs.filter(l=>l.action.toLowerCase().includes("payout")).slice(0,5).map(l=><p key={l.id}>{l.action} — {l.detail}</p>)}{!state.payouts.length&&<p>No batches have been drafted yet.</p>}</div></Card>
   </div>
  </div>
  {modal==="create"&&<Modal title="Create payout batch" subtitle="Preview recipient allocations before reserving eligible orders" onClose={()=>setModal(null)} onConfirm={save} confirmText="Create draft batch" disabled={!canCreate||!preview.length}><label className="dn-field">Payout category<select aria-label="Payout category" value={kind} onChange={e=>setKind(e.target.value as PayoutKind)}><option value="MERCHANT">Merchant settlements</option><option value="RIDER">Rider payouts</option></select></label><label className="dn-field">Settlement period<input value={period} onChange={e=>setPeriod(e.target.value)}/></label><label className="dn-field">Scope<select aria-label="Batch scope" value={includeAll?"all":"sample"} onChange={e=>setIncludeAll(e.target.value==="all")}><option value="all">All eligible orders</option><option value="sample">First 15 eligible orders</option></select></label><DetailLine label="Eligible orders">{preview.length}</DetailLine><DetailLine label="Draft allocation">{amount(preview.reduce((a,i)=>a+i.amount,0))}</DetailLine><p>Creating a draft never sends real money. Approval and the payment marker are separate steps.</p></Modal>}
  {(modal==="approve"||modal==="reject")&&selected&&<Modal title={(modal==="approve"?"Approve":"Reject")+" payout batch"} subtitle={selected.id+" · "+amount(payoutTotal(selected))} onClose={()=>setModal(null)} onConfirm={save} confirmText={modal==="approve"?"Approve batch":"Reject batch"} danger={modal==="reject"} disabled={!canApprove||reason.trim().length<5}><label className="dn-field">Required review note<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Record approval checks and allocation review"/></label><p>Only a simulated Super Admin can approve or reject a payout batch.</p></Modal>}
  {modal==="paid"&&selected&&<Modal title="Mark payout as paid (simulation)" subtitle={selected.id+" · no bank or M-PESA payment is made"} onClose={()=>setModal(null)} onConfirm={save} confirmText="Save simulated paid marker" disabled={!canApprove||reference.trim().length<5||reason.trim().length<5||state.payouts.some(b=>b.reference===reference.trim())}><label className="dn-field">Unique demo settlement reference<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="SIM-PAYOUT-12345"/></label><label className="dn-field">Required audit evidence<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label><p>Marking paid adds an outgoing entry to Financial Control. It does not transfer any funds.</p></Modal>}
 </div>;
}
