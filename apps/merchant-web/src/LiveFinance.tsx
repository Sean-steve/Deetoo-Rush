import React, {useEffect,useMemo,useState} from "react";
import {CalendarDays,ChevronDown,CreditCard,Download,FilePlus2,Search,Store,Wallet} from "lucide-react";
import type {MerchantLiveBridge} from "./MerchantLiveApp";

const kes=(minor:unknown)=>"Ksh "+(Number(minor||0)/100).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
const dateText=(value:unknown)=>value?new Date(String(value)).toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short"}):"—";
type Data={currency:string;totals:any;daily:any[];methods:any[];settlements:any[];commission_rate:unknown;upcoming_settlement:any;upcoming_reason:string;payout_destinations:any[]};
const query=(from:string,to:string,branchId:string)=>{const p=new URLSearchParams({branch_id:branchId});if(from)p.set("from",new Date(from+"T00:00:00+03:00").toISOString());if(to)p.set("to",new Date(to+"T00:00:00+03:00").toISOString());return p.toString();};
export function LiveFinance({live,notify}:{live:MerchantLiveBridge;notify:(s:string)=>void}){
 const [from,setFrom]=useState(""),[to,setTo]=useState(""),[data,setData]=useState<Data|null>(null);
 const [transactions,setTransactions]=useState<any[]>([]),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[tab,setTab]=useState("Transactions"),[method,setMethod]=useState("All payment methods"),[status,setStatus]=useState("All statuses"),[search,setSearch]=useState("");
 const [settlement,setSettlement]=useState<any|null>(null);
 useEffect(()=>{let active=true;setLoading(true);setError("");
 const q=query(from,to,live.branchId);
 Promise.all([live.api.request<Data>("/finance/merchant/experience/overview?"+q),
   live.api.request<any[]>("/finance/merchant/experience/transactions?"+q+"&limit=100")])
   .then(([summary,tx])=>{if(!active)return;setData(summary.data);setTransactions(tx.data||[]);})
   .catch(e=>{if(active){setData(null);setTransactions([]);setError(e instanceof Error?e.message:String(e));}})
   .finally(()=>{if(active)setLoading(false);});
 return()=>{active=false;};},[live.api,live.branchId,from,to]);
 const filtered=useMemo(()=>transactions.filter(x=>(method==="All payment methods"||String(x.payment_method).toUpperCase()===method.toUpperCase())&&
 (status==="All statuses"||x.order_status===status)&&
 [x.public_code,x.order_id,x.payment_method].join(" ").toLowerCase().includes(search.toLowerCase())),[transactions,method,status,search]);
 const totals=data?.totals||{},days=data?.daily||[],methods=data?.methods||[];
 const top=days.reduce((n,d)=>Math.max(n,Number(d.revenue_minor||0),Number(d.payable_minor||0)),1);
 const x=(i:number)=>days.length<=1?360:i*720/(days.length-1);
 const y=(v:unknown)=>210-Math.min(205,Number(v||0)/top*190);
 const poly=(key:string)=>days.map((d,i)=>x(i)+","+y(d[key])).join(" ");
 const methodTotal=methods.reduce((n,m)=>n+Number(m.orders||0),0);
 const chooseSettlement=async(row:any)=>{try{const r=await live.api.request<any>(`/finance/merchant/experience/settlements/${row.id}`);setSettlement(r.data);}
 catch(e){notify("Settlement detail unavailable: "+(e instanceof Error?e.message:String(e)));}};
 const download=(url:string,filename:string)=>{const a=document.createElement("a");a.href="/api/v1"+url;a.target="_blank";a.rel="noopener noreferrer";a.download=filename;document.body.append(a);a.click();a.remove();};
 const q=query(from,to,live.branchId);
 return <div className="mp-live-finance">
  <div className="mp-toolbar" id="mp-live-finance-period"><div className="mp-toolbar-end"><label>From <input aria-label="Finance period from" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>To (exclusive) <input aria-label="Finance period to" type="date" min={from} value={to} onChange={e=>setTo(e.target.value)}/></label><button className="mp-outline" onClick={()=>{setFrom("");setTo("");}}>All time</button></div></div>
  {loading&&<p role="status" className="mp-live-loading">Loading verified financial records…</p>}
  {error&&<div role="alert" className="mp-live-error">{error}</div>}
  <div className="mp-summary-grid">
   <div className="mp-summary"><span className="mp-summary-icon mp-green"><Wallet size={23}/></span><span><small>Total revenue</small><strong>{loading?"…":kes(totals.food_revenue_minor)}</strong><em>Ledger-derived food revenue</em></span></div>
   <div className="mp-summary"><span className="mp-summary-icon mp-orange"><CreditCard size={23}/></span><span><small>Commission fee</small><strong>{loading?"…":kes(totals.commission_minor)}</strong><em>Actual commission after reversals</em></span></div>
   <div className="mp-summary"><span className="mp-summary-icon mp-blue"><Store size={23}/></span><span><small>Earned payable</small><strong>{loading?"…":kes(totals.earned_payable_minor)}</strong><em>Not a confirmed disbursement</em></span></div>
   <div className="mp-summary"><span className="mp-summary-icon mp-violet"><FilePlus2 size={23}/></span><span><small>Total completed orders</small><strong>{loading?"…":Number(totals.completed_orders||0)}</strong><em>Verified captured orders</em></span></div>
  </div>
  <div className="mp-finance-top">
   <section className="mp-white-card mp-earnings"><div className="mp-card-title"><div><h3>Earnings overview</h3><p>Daily ledger-derived revenue and earned payable (Africa/Nairobi).</p></div><span>● Food revenue &nbsp; <i>● Merchant payable</i></span></div>
    {days.length?<div className="mp-chart"><div className="mp-y-labels"><span>{kes(top)}</span><span>{kes(top/2)}</span><span>Ksh 0</span></div><svg viewBox="0 0 720 220" preserveAspectRatio="none" aria-label="Verified daily earnings chart">
      {[0,1,2].map(i=><line key={i} x1="0" x2="720" y1={i*105} y2={i*105} stroke="#e5f0eb"/>)}
      <polyline fill="none" stroke="#005739" strokeWidth="4" points={poly("revenue_minor")}/>
      <polyline fill="none" stroke="#04c47b" strokeWidth="4" points={poly("payable_minor")}/>
      {days.map((d,i)=><circle key={i} cx={x(i)} cy={y(d.revenue_minor)} r="5" fill="#005739"/>)}
     </svg><div className="mp-x-labels">{days.map((d,i)=><span key={i}>{String(d.day).slice(0,10)}</span>)}</div></div>:<p className="mp-live-empty">No verified revenue exists for this period.</p>}
   </section>
   <section className="mp-white-card mp-payment"><h3>Order payment methods</h3><p>Only provider-verified captures; refunds shown separately.</p><div className="mp-payment-body"><div className="mp-donut"><strong>{methodTotal}<small>Orders</small></strong></div><div>{methods.length?methods.map((m,i)=><p key={i}>● {m.method}<b>{methodTotal?Math.round(Number(m.orders)*100/methodTotal):0}% ({m.orders})</b><small>Net: {kes(m.net_captured_minor)}</small></p>):<p>No captured payments in this period.</p>}</div></div></section>
   <section className="mp-finance-side">
    <div className="mp-white-card"><h3>Commission breakdown</h3><p>Actual recorded economics.</p><div className="mp-breakdown">{[
      ["Food revenue",kes(totals.food_revenue_minor)],["DeeToo commission","− "+kes(totals.commission_minor)],
      ["Processing fees","− "+kes(totals.processing_cost_minor)],["Successful refunds",kes(totals.refunded_minor)],
      ["Earned payable",kes(totals.earned_payable_minor)]
    ].map(([name,value])=><div key={name}><span>{name}</span><b>{value}</b></div>)}</div></div>
    <div className="mp-white-card"><h3>Upcoming settlement</h3><p>Next verified payout schedule.</p>
      <h2>{data?.upcoming_settlement?.date||"Not scheduled"}</h2>
      <strong>{data?.upcoming_settlement?.amount_minor!=null?kes(data.upcoming_settlement.amount_minor):"Unconfirmed"}</strong>
      <p>{data?.upcoming_reason||"No confirmed future payout date has been provided."}</p>
      <button className="mp-primary" onClick={()=>setTab("Settlements")}>View settlement details</button>
    </div>
   </section>
  </div>
  <div className="mp-finance-bottom"><section className="mp-white-card">
   <div className="mp-toolbar"><div className="mp-tabs">{["Transactions","Settlements","Payouts","Invoices"].map(t=><button key={t} className={tab===t?"selected":""} onClick={()=>setTab(t)}>{t}</button>)}</div>
   <button className="mp-outline" onClick={()=>download("/finance/merchant/experience/export/transactions.csv?"+q,"merchant-transactions.csv")}><Download size={16}/> Export CSV</button></div>
   <div className="mp-toolbar mp-finance-filters"><select value={method} onChange={e=>setMethod(e.target.value)}><option>All payment methods</option><option>M-PESA</option><option>CARD</option><option>CASH</option></select><select value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option><option>COMPLETED</option><option>DELIVERED</option></select><div className="mp-inline-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search verified transactions…"/></div></div>
   {tab==="Transactions"?<div className="mp-table-scroll"><table><thead><tr>{["Date & time","Order ID","Customer","Amount","Payment method","Status","Actions"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{filtered.map(t=><tr key={t.order_id}><td>{dateText(t.created_at)}</td><td>{t.public_code}</td><td>Private</td><td>{kes(t.merchant_payable_minor)}</td><td>{t.payment_method}</td><td>{t.order_status}</td><td><button onClick={()=>notify("This is a ledger-derived merchant transaction. Customer details require order access.")}>⋯</button></td></tr>)}{!filtered.length&&<tr><td colSpan={7}>No matching merchant transactions.</td></tr>}</tbody></table></div>
   :tab==="Invoices"?<div className="mp-finance-tab-content"><h3>Tax invoices</h3><p>KRA/eTIMS issuance is unavailable until the certified fiscal integration and legal merchant tax identity are configured. Statements are available below; they are not tax invoices.</p><button className="mp-outline" onClick={()=>setTab("Settlements")}>View settlement statements</button></div>
   :<div className="mp-finance-tab-content"><h3>{tab}</h3><p>{tab==="Payouts"?"Payouts are confirmed only after an authorized provider callback.":"Merchant settlements and downloadable statements."}</p>
     {data?.settlements?.length?data.settlements.map((row:any)=><div className="mp-modal-row" key={row.id}>
       <span>{row.settlement_number||row.id}<small>{row.status}</small></span>
       <strong>{kes(row.net_settlement_amount_minor)}</strong>
       <button className="mp-outline" onClick={()=>void chooseSettlement(row)}>Details</button>
       <button className="mp-outline" onClick={()=>download(`/finance/merchant/experience/settlements/${row.id}/statement.pdf`,"merchant-settlement.pdf")}><Download size={15}/> PDF</button>
     </div>):<p>No settlements are available for this merchant.</p>}
   </div>}
  </section></div>
  {settlement&&<div className="mp-modal-overlay" onMouseDown={e=>e.target===e.currentTarget&&setSettlement(null)}><section className="mp-modal" role="dialog" aria-label="Settlement details" aria-modal="true">
    <div className="mp-modal-head"><h2>{settlement.settlement_number||"Settlement details"}</h2><button onClick={()=>setSettlement(null)}>✕</button></div>
    <p>Settlement status: <strong>{settlement.status}</strong>. Provider disbursements are not implied by calculation alone.</p>
    {(settlement.lines||[]).map((line:any,i:number)=><div className="mp-modal-row" key={i}>{line.entry_type} {line.reference_id}<strong>{kes(line.net_amount_minor)}</strong></div>)}
    {(settlement.disbursement_attempts||[]).map((a:any,i:number)=><div className="mp-modal-row" key={i}>Provider: {a.provider} · {a.status}<strong>{kes(a.amount_minor)}</strong></div>)}
    <button className="mp-primary mp-full" onClick={()=>setSettlement(null)}>Close</button>
   </section></div>}
 </div>;
}
