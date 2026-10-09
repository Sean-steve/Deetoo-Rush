import React, { useMemo, useState } from "react";
import { ArrowDownToLine, CalendarDays, Check, ChevronDown, ChevronRight, CircleDollarSign, Clock3, CreditCard, Download, Landmark, MoreHorizontal, ReceiptText, Search, TrendingUp, Wallet } from "lucide-react";
import { cash, useDemo, type Settlement, type Tx } from "../model";
import { CountTile, Field, HeaderTitle, Modal, Pill } from "../MerchantPrototype";
const periods=["Sep 29","Sep 30","Oct 1","Oct 2","Oct 3","Oct 4","Oct 5","Oct 6"];
const grossData=[600,1200,1100,2100,3100,4100,2800,3540];
const coords=(data:number[])=>data.map((v,i)=>[40+i*81,175-v/4600*145] as const);
function chartPath(values:number[]){return coords(values).map(([x,y],i)=>(i?"L":"M")+x+","+y).join(" ");}
function CsvDownload({rows,label}:{rows:string[][];label:string}){return <button className="mp-outline" onClick={()=>{const contents=rows.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(",")).join("\n");const blob=new Blob([contents],{type:"text/csv;charset=utf-8"});const href=URL.createObjectURL(blob);const a=document.createElement("a");a.href=href;a.download="deetoo-prototype-"+label+".csv";a.click();URL.revokeObjectURL(href);}}><Download size={17}/> Export</button>;}
export function FinancePage({search,navigate}:{search:string;navigate:(page:string)=>void}){
 const {data,announce}=useDemo();
 const [tab,setTab]=useState("Transactions");
 const [method,setMethod]=useState("All payment methods");
 const [orderType,setOrderType]=useState("All order types");
 const [status,setStatus]=useState("All statuses");
 const [date,setDate]=useState("Sep 29, 2026 – Oct 6, 2026");
 const [query,setQuery]=useState("");
 const [detail,setDetail]=useState<Tx|null>(null);
 const [settlement,setSettlement]=useState<Settlement|null>(null);
 const [rangeOpen,setRangeOpen]=useState(false);
 const [from,setFrom]=useState("2026-09-29");
 const [to,setTo]=useState("2026-10-06");
 const [sort,setSort]=useState<"newest"|"oldest">("newest");
 const [chartVisible,setChartVisible]=useState({revenue:true,payout:true});
 const filtered=useMemo(()=>data.transactions.filter(t=>{
 if(method!=="All payment methods"&&t.payment!==method)return false;
 if(orderType!=="All order types"&&t.type!==orderType)return false;
 if(status!=="All statuses"&&t.status!==status)return false;
 if((search+query).trim()&&![t.id,t.customer,t.payment,t.type].some(x=>x.toLowerCase().includes((search+" "+query).trim().toLowerCase())))return false;
 return true;
 }).sort((a,b)=>sort==="newest"?data.transactions.indexOf(a)-data.transactions.indexOf(b):data.transactions.indexOf(b)-data.transactions.indexOf(a)),[data.transactions,method,orderType,status,query,search,sort]);
 const revenue=18540,commission=1854,payout=16686,fees=420;
 const selectRange=()=>{setDate(new Date(from+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})+" – "+new Date(to+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}));setRangeOpen(false);announce("Date range selected. Prototype metrics remain illustrative until integrated.");};
 const csvRows=[["Date","Order ID","Customer","Amount","Payment method","Status","Type"],...filtered.map(t=>[t.date,t.id,t.customer,String(t.amount),t.payment,t.status,t.type])];
 return <div className="mp-page mp-finance-page">
 <HeaderTitle eyebrow="Business" title="Finance & settlements" description="Track your earnings, view transactions and manage settlements.">
 <button className="mp-outline" onClick={()=>setRangeOpen(true)}><CalendarDays size={19}/> {date} <ChevronDown size={15}/></button></HeaderTitle>
 <div className="mp-stat-grid"><CountTile icon={CircleDollarSign} label="Total revenue" value={cash(revenue)} caption="↗ 12% vs. previous week · demo" accent="mint"/>
 <CountTile icon={Wallet} label="Commission fee" value={cash(commission)} caption="10.0% of total revenue" accent="orange"/>
 <CountTile icon={Landmark} label="Payout amount" value={cash(payout)} caption="↗ 12% after commission · demo" accent="blue"/>
 <CountTile icon={ReceiptText} label="Total orders" value="46" caption="↗ 28% completed orders · demo" accent="purple"/></div>
 <div className="mp-finance-summary">
 <section className="mp-panel mp-earnings-chart"><div className="mp-panel-heading"><div><h2>Earnings overview</h2><p>Daily revenue and payouts for the selected period.</p></div><div className="mp-chart-legend"><button onClick={()=>setChartVisible(p=>({...p,revenue:!p.revenue}))} aria-pressed={chartVisible.revenue}><i className="mp-legend-dark"/> Total revenue</button><button onClick={()=>setChartVisible(p=>({...p,payout:!p.payout}))} aria-pressed={chartVisible.payout}><i className="mp-legend-light"/> Payout amount</button></div></div>
 <div className="mp-chart"><div className="mp-chart-y"><span>Ksh 6,000</span><span>Ksh 4,000</span><span>Ksh 2,000</span><span>Ksh 0</span></div>
 <svg viewBox="0 0 630 215" preserveAspectRatio="none" role="img" aria-label="Illustrative daily revenue and payout trend from September 29 to October 6">
 <defs><linearGradient id="mp-revenue-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0f874f" stopOpacity=".26"/><stop offset="1" stopColor="#0f874f" stopOpacity=".015"/></linearGradient></defs>
 {[35,81,127,173].map(y=><line key={y} x1="40" x2="620" y1={y} y2={y} stroke="#e8f0ee" strokeWidth="1"/>)}
 {periods.map((d,i)=><line key={d} x1={40+i*81} x2={40+i*81} y1="30" y2="176" stroke="#f2f5f7"/>)}
 {chartVisible.revenue&&<><path d={chartPath(grossData)+" L 607,176 L 40,176 Z"} fill="url(#mp-revenue-fill)"/><path d={chartPath(grossData)} fill="none" stroke="#005c3b" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/>{coords(grossData).map(([x,y],i)=><circle key={i} cx={x} cy={y} r="5.3" fill="#005c3b" stroke="white" strokeWidth="2.4"><title>{periods[i]}: {cash(grossData[i])}</title></circle>)}</>}
 {chartVisible.payout&&<><path d={chartPath(grossData.map(v=>v*.9))} fill="none" stroke="#04c77e" strokeWidth="3" strokeLinecap="round"/>{coords(grossData.map(v=>v*.9)).map(([x,y],i)=><circle key={i} cx={x} cy={y} r="5" fill="#04c77e" stroke="white" strokeWidth="2.2"><title>{periods[i]} payout: {cash(grossData[i]*.9)}</title></circle>)}</>}
 {periods.map((d,i)=><text key={d} x={40+i*81} y="207" fontSize="12" textAnchor="middle" fill="#8291a6">{d}</text>)}
 </svg></div><p className="mp-demo-footnote">Illustrative chart data — awaiting finance reporting API.</p></section>
 <section className="mp-panel mp-payment-chart"><h2>Order payment methods</h2><p>Breakdown of payments received.</p><div className="mp-payment-body"><div className="mp-donut"><div><strong>46</strong><small>Orders</small></div></div><div className="mp-payment-legend"><div><i className="mp-green-dot"/>M-PESA <strong>61% (28)</strong></div><div><i className="mp-blue-dot"/>Card payments <strong>28% (13)</strong></div><div><i className="mp-orange-dot"/>Cash on delivery <strong>11% (5)</strong></div></div></div><p className="mp-demo-footnote">Illustrative payment-method distribution.</p></section>
 <div className="mp-finance-right"><section className="mp-panel"><h2>Commission breakdown</h2><p>How your earnings are calculated.</p><div className="mp-breakdown"><div><span>Total revenue</span><b>{cash(revenue)}</b></div><div><span>DeeToo commission (10%)</span><b className="mp-negative">- {cash(commission)}</b></div><div><span>Payment processing fees</span><b className="mp-negative">- {cash(fees)}</b></div><div className="mp-breakdown-net"><strong>Payout amount</strong><strong>{cash(payout)}</strong></div></div><small>Fees shown separately for reference in this mockup.</small></section>
 <section className="mp-panel mp-upcoming"><h2>Upcoming settlement</h2><p>Next payout to your bank or M-PESA account.</p><div><CalendarDays size={25}/><span><small>Scheduled for</small><strong>Oct 8, 2026</strong></span><Pill>In 2 days</Pill></div><small>Estimated amount</small><strong>{cash(payout)}</strong><button className="mp-primary" onClick={()=>setSettlement({id:"ST-NEXT",date:"Oct 8, 2026",amount:payout,status:"Scheduled",reference:"PENDING"})}>View settlement details</button></section>
 <section className="mp-panel mp-recent"><h2>Recent settlements <button onClick={()=>setTab("Settlements")}>View all</button></h2>{data.settlements.map(s=><div key={s.id}><span>{s.date}</span><Pill>{s.status}</Pill><strong>{cash(s.amount)}</strong><button aria-label={"Download "+s.id} onClick={()=>{setSettlement(s);announce("Open settlement details to export a statement");}}><Download size={18}/></button></div>)}</section></div></div>
 <div className="mp-finance-table-section">
 <div className="mp-list-toolbar"><div className="mp-tabs" role="tablist" aria-label="Finance views">{["Transactions","Settlements","Payouts","Invoices"].map(x=><button role="tab" aria-selected={tab===x} key={x} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</div><CsvDownload rows={csvRows} label={tab.toLowerCase()}/></div>
 <div className="mp-finance-filters">
 <select aria-label="Filter payment method" value={method} onChange={e=>setMethod(e.target.value)}><option>All payment methods</option><option>M-PESA</option><option>Card</option><option>Cash</option></select>
 <select aria-label="Filter order type" value={orderType} onChange={e=>setOrderType(e.target.value)}><option>All order types</option><option>Order</option><option>Adjustment</option></select>
 <select aria-label="Filter payment status" value={status} onChange={e=>setStatus(e.target.value)}><option>All statuses</option><option>Completed</option><option>Pending</option><option>Refunded</option></select>
 <button className="mp-outline" onClick={()=>setRangeOpen(true)}><CalendarDays size={16}/>{date}</button><label className="mp-local-search"><Search size={17}/><input aria-label="Search transactions" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search transactions..."/></label></div>
 <div className="mp-finance-table-wrap"><table className="mp-finance-table"><thead><tr>{(tab==="Transactions"?["Date & time","Order ID","Customer","Amount","Payment method","Status","Type","Actions"]:["Date","Reference","Amount","Status","Details"]).map((h,i)=><th key={h}><button onClick={()=>setSort(sort==="newest"?"oldest":"newest")}>{h}{i===0?" ↕":""}</button></th>)}</tr></thead>
 <tbody>{tab==="Transactions"?filtered.map(t=><tr key={t.id}><td>{t.date}</td><td><strong>#{t.id}</strong></td><td>{t.customer}</td><td>{cash(t.amount)}</td><td><span className={"mp-payment-method mp-method-"+t.payment.toLowerCase().replace("-","")}>{t.payment==="M-PESA"?"✚":t.payment==="Card"?"▣":"▤"}</span>{t.payment}</td><td><Pill>{t.status}</Pill></td><td>{t.type}</td><td><button aria-label={"View transaction "+t.id} onClick={()=>setDetail(t)}><MoreHorizontal size={22}/></button></td></tr>):
 tab==="Settlements"||tab==="Payouts"?data.settlements.map(s=><tr key={s.id}><td>{s.date}</td><td>{s.reference}</td><td>{cash(s.amount)}</td><td><Pill>{s.status}</Pill></td><td><button className="mp-outline" onClick={()=>setSettlement(s)}>View details</button></td></tr>):
 data.settlements.map(s=><tr key={s.id}><td>{s.date}</td><td>INV-{s.id}</td><td>{cash(s.amount)}</td><td><Pill>Generated</Pill></td><td><button className="mp-outline" onClick={()=>setSettlement(s)}>View invoice</button></td></tr>)}</tbody></table></div>
 {tab==="Transactions"&&!filtered.length&&<div className="mp-no-items"><h3>No transactions match</h3><p>Clear filters or search another order.</p></div>}
 </div>
 <Modal open={Boolean(detail)} title={"Transaction #"+(detail?.id||"")} onClose={()=>setDetail(null)}><div className="mp-detail-stack">{detail&&Object.entries({Date:detail.date,Customer:detail.customer,Amount:cash(detail.amount),"Payment method":detail.payment,Status:detail.status,Type:detail.type}).map(([k,v])=><div key={k}><small>{k}</small><strong>{v}</strong></div>)}</div><p className="mp-muted">Payment processing details are illustrative until the merchant finance API is mapped.</p></Modal>
 <Modal open={Boolean(settlement)} title={"Settlement "+(settlement?.id||"")} onClose={()=>setSettlement(null)}><div className="mp-detail-stack">{settlement&&Object.entries({Date:settlement.date,Amount:cash(settlement.amount),Status:settlement.status,Reference:settlement.reference}).map(([k,v])=><div key={k}><small>{k}</small><strong>{v}</strong></div>)}</div>{settlement&&<CsvDownload label={"settlement-"+settlement.id} rows={[["Reference","Date","Amount","Status"],[settlement.reference,settlement.date,String(settlement.amount),settlement.status]]}/>}</Modal>
 <Modal open={rangeOpen} title="Select date range" onClose={()=>setRangeOpen(false)}><div className="mp-form-grid"><Field label="From"><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></Field><Field label="To"><input type="date" min={from} value={to} onChange={e=>setTo(e.target.value)}/></Field></div><div className="mp-dialog-actions"><button className="mp-outline" onClick={()=>setRangeOpen(false)}>Cancel</button><button className="mp-primary" disabled={!to||to<from} onClick={selectRange}>Apply range</button></div></Modal>
 </div>;
}
