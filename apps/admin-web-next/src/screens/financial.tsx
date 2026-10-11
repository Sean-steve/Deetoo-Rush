import React,{useMemo,useState} from "react";
import {Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, CheckCircle2, ClipboardCheck, CreditCard, Download, FileSearch, Landmark, ListChecks, Settings2, ShieldAlert, TrendingUp, Wallet} from "lucide-react";
import {displayTime,formatMoney,orderTotal} from "../data";
import {amount,eligiblePayoutItems,financeEntries,payoutTotal} from "../phase3Data";
import {useDemo,canAct} from "../store";
import {Bars,Card,Chip,DetailLine,Empty,IconStat,Modal,Ring,SearchBox,SelectBox,Tabs,TimeSeries} from "../ui";
export function FinancialScreen({navigate,toast}:{navigate:(screen:string)=>void;toast:(s:string)=>void}){
 const {data,act,role}=useDemo(),state=data.phase3,canControl=canAct(role,"finance");
 const [tab,setTab]=useState("ledger"),[search,setSearch]=useState(""),[entryType,setEntryType]=useState("all"),[period,setPeriod]=useState("all"),[selectedId,setSelectedId]=useState<string|null>(null),[modal,setModal]=useState(false),[reason,setReason]=useState("");
 const [commission,setCommission]=useState(String(state.control.commissionRate)),[riderShare,setRiderShare]=useState(String(state.control.riderDeliveryShare)),[reserve,setReserve]=useState(String(state.control.reservePercent));
 const entries=financeEntries(state,data.orders);
 const filtered=entries.filter(e=>(entryType==="all"||e.type===entryType)&&(e.id+" "+e.reference+" "+e.description+" "+(e.orderId||"")).toLowerCase().includes(search.toLowerCase())&&(period==="all"||e.date.startsWith(period)));
 const selected=entries.find(e=>e.id===selectedId)||filtered[0];
 const collected=entries.filter(e=>e.type==="Collection").reduce((n,e)=>n+e.credit,0);
 const out=entries.reduce((n,e)=>n+e.debit,0);
 const refunded=entries.filter(e=>e.type==="Refund").reduce((n,e)=>n+e.debit,0);
 const payout=entries.filter(e=>e.type.includes("payout")).reduce((n,e)=>n+e.debit,0);
 const openExceptions=state.issues.filter(i=>i.status==="OPEN").length+state.refunds.filter(r=>r.status==="PENDING").length;
 const monthly=useMemo(()=>Array.from({length:12},(_,i)=>data.orders.filter((_,n)=>n%12===i).reduce((sum,o)=>sum+(o.paymentStatus==="Paid"?orderTotal(o):0),0)),[data.orders]);
 const payoutLiability=state.payouts.filter(b=>b.status!=="REJECTED"&&b.status!=="PAID").reduce((s,b)=>s+payoutTotal(b),0)+eligiblePayoutItems(state,data.orders,data.riders,"MERCHANT").concat(eligiblePayoutItems(state,data.orders,data.riders,"RIDER")).reduce((s,i)=>s+i.amount,0);
 const postSettlementRefunds=state.refunds.filter(r=>r.status==="APPROVED"&&state.payouts.some(b=>b.status==="PAID"&&b.items.some(i=>i.orderId===r.orderId)));
 const saveControl=()=>{
  const nums=[Number(commission),Number(riderShare),Number(reserve)];
  if(!canControl||nums.some(x=>!Number.isFinite(x)||x<0||x>100)||reason.trim().length<5)return;
  act({type:"PHASE3_FINANCE_CONFIG",commissionRate:nums[0],riderDeliveryShare:nums[1],reservePercent:nums[2],reason});
  setModal(false);setReason("");toast("Commercial rules saved for future demo settlements; existing batches remain unchanged.");
 };
 const gotoOrder=(id:string)=>{sessionStorage.setItem("deetoo.demo.focusOrder",id);navigate("orders");};
 const exportLedger=()=>{const values=[["Entry","Type","Reference","Debit KES","Credit KES","Status"],...filtered.map(e=>[e.id,e.type,e.reference,String(e.debit),String(e.credit),e.status])];const csv=values.map(r=>r.map(x=>'"'+x.replaceAll('"','""')+'"').join(",")).join("\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="deetoo-demo-financial-ledger.csv";a.click();URL.revokeObjectURL(url);toast("Financial demo ledger exported as CSV.");};
 const diffByPeriod=monthly.map(v=>Math.max(0,v*0.63));
 const net=collected-out;
 return <div className="dn-screen" data-testid="screen-financial">
  <div className="dn-title-row"><div><h1>Financial Control Center</h1><p>Monitor collections, refunds, settlement liabilities, reconciliation and commercial policies.</p></div><div className="dn-title-buttons"><button className="dn-btn outline" onClick={exportLedger}><Download size={15}/> Export Ledger</button><button className="dn-btn primary" onClick={()=>{setCommission(String(state.control.commissionRate));setRiderShare(String(state.control.riderDeliveryShare));setReserve(String(state.control.reservePercent));setModal(true);}} disabled={!canControl}><Settings2 size={15}/> Commercial Controls</button></div></div>
  <div className="dn-metrics five">
   <IconStat label="Recorded Collections" value={amount(collected)} icon={<ArrowUpRight/>} change="Simulated gross inflow"/>
   <IconStat label="Approved Refunds" value={amount(refunded)} tone="red" icon={<ArrowDownRight/>}/>
   <IconStat label="Marked Payouts" value={amount(payout)} tone="blue" icon={<Landmark/>}/>
   <IconStat label="Net Recorded Flow" value={amount(net)} icon={<Wallet/>} foot="Inflow less recorded outflow"/>
   <IconStat label="Open Review Items" value={openExceptions+postSettlementRefunds.length} tone="amber" icon={<AlertTriangle/>}/>
  </div>
  <div className="dn-financial-top">
   <Card title="Financial Performance Overview" desc="Derived from sample order records — illustrative period distribution" action={<SelectBox label="Performance window" value={period} onChange={setPeriod} options={[{value:"all",label:"All demo dates"},{value:"2026-10",label:"October 2026"},{value:"2026-09",label:"September 2026"}]}/>}>
    <div className="dn-fin-performance"><div><span>Gross Collections</span><strong>{amount(collected)}</strong><small>Order payments recorded in the demo</small></div><div><span>Recorded Outflow</span><strong>{amount(out)}</strong><small>Approved refunds and marked payouts</small></div><div><span>Outstanding Partner Liability</span><strong>{amount(payoutLiability)}</strong><small>Unbatched, draft and approved earnings</small></div></div>
    <div className="dn-fin-dual-chart"><TimeSeries values={monthly} labels={["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]} color="#07a867" fill/><Bars values={diffByPeriod} labels={["Jan","","Mar","","May","","Jul","","Sep","","Nov",""]} color="#1683df"/></div>
    <div className="dn-legend"><span className="g">● Sample collections</span><span className="b">● Illustrative trend</span></div>
   </Card>
   <Card title="Financial Distribution" desc="Recorded inflows and outflows">
    <Ring number={amount(out)} label="Outflow" parts={[{name:"Refunds",value:refunded,color:"#fa5164"},{name:"Merchant payouts",value:entries.filter(e=>e.type==="Merchant payout").reduce((n,e)=>n+e.debit,0),color:"#008e59"},{name:"Rider payouts",value:entries.filter(e=>e.type==="Rider payout").reduce((n,e)=>n+e.debit,0),color:"#2488e7"}]}/>
    <DetailLine label="Unreconciled collections">{entries.filter(e=>e.type==="Collection"&&e.status==="Unreconciled").length}</DetailLine>
    <DetailLine label="Pending refund approvals">{state.refunds.filter(r=>r.status==="PENDING").length}</DetailLine>
    <DetailLine label="Unpaid batches">{state.payouts.filter(b=>b.status==="APPROVED").length}</DetailLine>
    <button className="dn-btn outline full" onClick={()=>navigate("payments")}>Review Payments <ArrowRight size={13}/></button>
   </Card>
   <Card title="Operational Finance Controls" desc="Configurable policies for newly created demo batches">
    <DetailLine label="Platform Commission">{state.control.commissionRate}%</DetailLine>
    <DetailLine label="Rider Delivery Share">{state.control.riderDeliveryShare}%</DetailLine>
    <DetailLine label="Merchant Reserve">{state.control.reservePercent}%</DetailLine>
    <DetailLine label="Accounting Currency">{state.control.currency}</DetailLine>
    <DetailLine label="Payment Provider">Demo only</DetailLine>
    <DetailLine label="Payout Provider">Demo only</DetailLine>
    <div className="dn-fin-policy-warning"><ShieldAlert size={16}/> Changing policy will not retroactively change a drafted or marked-paid settlement.</div>
    <button className="dn-btn outline full" disabled={!canControl} onClick={()=>{setCommission(String(state.control.commissionRate));setRiderShare(String(state.control.riderDeliveryShare));setReserve(String(state.control.reservePercent));setModal(true);}}>Edit Policy</button>
   </Card>
  </div>
  <div className="dn-financial-bottom">
   <Card className="dn-fin-ledger-card">
    <Tabs ariaLabel="Financial control sections" value={tab} onChange={setTab} tabs={[{key:"ledger",label:"Financial Ledger ("+entries.length+")"},{key:"exceptions",label:"Exceptions & Reconciliation"},{key:"audit",label:"Audit Log ("+state.logs.length+")"},{key:"controls",label:"Policy Summary"}]}/>
    {tab==="ledger"&&<><div className="dn-toolbar"><SearchBox value={search} onChange={setSearch} placeholder="Search entries, references and orders..."/><SelectBox label="Ledger entry type" value={entryType} onChange={setEntryType} options={[{value:"all",label:"All Types"},...["Collection","Refund","Merchant payout","Rider payout"].map(x=>({value:x,label:x}))]}/></div>
     <div className="dn-table-scroll"><table className="dn-table dn-fin-table"><thead><tr><th>Entry</th><th>Type</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Status</th><th>Time</th></tr></thead><tbody>{filtered.slice(0,35).map(e=><tr key={e.id} tabIndex={0} className={selected?.id===e.id?"selected":""} onClick={()=>setSelectedId(e.id)} onKeyDown={x=>x.key==="Enter"&&setSelectedId(e.id)}><td><b>{e.id}</b></td><td>{e.type}</td><td>{e.reference}</td><td>{e.description}</td><td className="danger-text">{e.debit?amount(e.debit):"—"}</td><td className="dn-positive">{e.credit?amount(e.credit):"—"}</td><td><Chip value={e.status}/></td><td>{displayTime(e.date)}</td></tr>)}</tbody></table></div>{filtered.length>35&&<p className="dn-helper">Showing first 35 of {filtered.length} entries. Export CSV to review all filtered demo rows.</p>}{!filtered.length&&<Empty label="No ledger entries match your filters"/>}</>}
    {tab==="exceptions"&&<div className="dn-financial-exceptions"><div><h3>Provider Mismatches</h3>{state.issues.map(x=><div className="dn-fin-alert-row" key={x.id}><AlertTriangle size={17}/><div><b>{x.issue}</b><small>{x.reference} · {x.orderId||"Unmatched payment"}</small></div><Chip value={x.status}/></div>)}<button className="dn-btn outline" onClick={()=>navigate("payments")}>Investigate in Payments <ArrowRight size={13}/></button></div><div><h3>Settlement & Refund Review</h3><DetailLine label="Awaiting refund approval">{state.refunds.filter(r=>r.status==="PENDING").length}</DetailLine><DetailLine label="Approved payout batches">{state.payouts.filter(b=>b.status==="APPROVED").length}</DetailLine><DetailLine label="Post-settlement refunds">{postSettlementRefunds.length}</DetailLine><button className="dn-btn outline" onClick={()=>navigate("settlements")}>Open Settlements</button><p className="dn-helper">Refunds processed after a marked-paid batch require manual finance review; this demo does not silently reverse previous payouts.</p></div></div>}
    {tab==="audit"&&<div className="dn-table-scroll"><table className="dn-table"><thead><tr><th>Time</th><th>Action</th><th>Detail</th><th>Operator</th></tr></thead><tbody>{state.logs.map(l=><tr key={l.id}><td>{displayTime(l.at)}</td><td>{l.action}</td><td>{l.detail}</td><td>{l.actor}</td></tr>)}</tbody></table>{!state.logs.length&&<Empty label="No financial control changes yet"/>}</div>}
    {tab==="controls"&&<div className="dn-fin-rules"><div><b>Commission Policy</b><p>{state.control.commissionRate}% of eligible merchant item subtotal retained as platform commission.</p></div><div><b>Delivery Share</b><p>{state.control.riderDeliveryShare}% of each delivered order's delivery fee allocated to its rider.</p></div><div><b>Reserve</b><p>{state.control.reservePercent}% of the merchant net after commission held in the simulated payout calculation.</p></div><div><b>Reconciliation</b><p>Use per-payment investigation and acknowledgement in Payments & Refunds. There is no one-click reconcile-all without provider evidence.</p></div></div>}
   </Card>
   <div className="dn-financial-side">
    <Card title="Selected Ledger Entry">{selected?<><div className="dn-fin-inspector"><span className="dn-fin-inspect-icon"><Wallet size={22}/></span><div><h2>{selected.id}</h2><Chip value={selected.status}/><p>{selected.type}</p></div></div><DetailLine label="Reference">{selected.reference}</DetailLine><DetailLine label="Debit">{amount(selected.debit)}</DetailLine><DetailLine label="Credit">{amount(selected.credit)}</DetailLine><DetailLine label="Description">{selected.description}</DetailLine><div className="dn-fin-actionbar">{selected.orderId?<button className="dn-btn outline" onClick={()=>gotoOrder(selected.orderId!)}>View Order</button>:<button className="dn-btn outline" onClick={()=>navigate("settlements")}>View Payouts</button>}</div></>:<Empty label="Choose an entry to inspect"/>}</Card>
    <Card title="Finance Audit Readiness"><div className="dn-fin-note">This is a deterministic demonstration of commercial logic, review queues and money-flow records—not an actual bank ledger, provider statement, settlement engine or accounting reconciliation. Backend authorization and real posting will be designed after all 16 screens are approved.</div></Card>
   </div>
  </div>
  {modal&&<Modal title="Edit commercial controls" subtitle="Super Admin demo role · future draft batches only" onClose={()=>setModal(false)} onConfirm={saveControl} confirmText="Save commercial policy" disabled={!canControl||[commission,riderShare,reserve].some(x=>x.trim()===""||!Number.isFinite(Number(x))||Number(x)<0||Number(x)>100)||reason.trim().length<5}><label className="dn-field">Merchant commission (%)<input type="number" min="0" max="100" step=".1" value={commission} onChange={e=>setCommission(e.target.value)}/></label><label className="dn-field">Rider delivery share (%)<input type="number" min="0" max="100" step=".1" value={riderShare} onChange={e=>setRiderShare(e.target.value)}/></label><label className="dn-field">Merchant reserve (%)<input type="number" min="0" max="100" step=".1" value={reserve} onChange={e=>setReserve(e.target.value)}/></label><label className="dn-field">Required approval note<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Document why the financial policy is changing"/></label><p>Existing payout batches retain their original KES allocation; all changes are recorded in the demo audit trail.</p></Modal>}
 </div>;
}
