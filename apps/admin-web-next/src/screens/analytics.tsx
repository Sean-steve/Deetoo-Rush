import React,{useMemo,useState} from "react";
import {Activity,ArrowRight,BarChart3,CalendarDays,CheckCircle2,Download,FileBarChart2,FilePlus2,Filter,LineChart,Package,Plus,Save,TrendingUp,Users,Wallet} from "lucide-react";
import {orderTotal} from "../data";
import {amount} from "../phase3Data";
import type {ReportMetric,ReportRange,SavedReport} from "../phase4Data";
import {useDemo,canAct} from "../store";
import {Bars,Card,Chip,DetailLine,Empty,IconStat,Modal,Ring,SearchBox,SelectBox,Tabs,TimeSeries} from "../ui";
const metrics:[ReportMetric,string][]=[["ORDERS","Orders"],["REVENUE","Revenue"],["DELIVERIES","Deliveries"],["MERCHANTS","Merchants"],["CUSTOMERS","Customers"],["SUPPORT","Support"],["INCIDENTS","Incidents"],["PAYOUTS","Payouts"]];
const ranges:[ReportRange,string][]=[["TODAY","Latest sample day"],["7D","Last 7 sample days"],["30D","Last 30 sample days"],["ALL","All sample records"]];
const downloadCsv=(name:string,headers:string[],rows:(string|number)[][])=>{
 const encode=(value:string|number)=>'"'+String(value).replaceAll('"','""')+'"';
 const csv=[headers,...rows].map(row=>row.map(encode).join(",")).join("\n");
 const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
 const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url);
};
export function AnalyticsScreen({navigate,toast}:{navigate:(s:string)=>void;toast:(s:string)=>void}){
 const {data,act,role}=useDemo(),canSave=canAct(role,"analytics");
 const [tab,setTab]=useState("overview"),[metric,setMetric]=useState<ReportMetric>("ORDERS"),[range,setRange]=useState<ReportRange>("ALL"),[county,setCounty]=useState("all"),[query,setQuery]=useState(""),[selectedReport,setSelectedReport]=useState<string|null>(null);
 const [modal,setModal]=useState<"save"|"remove"|null>(null),[name,setName]=useState(""),[reason,setReason]=useState(""),[cadence,setCadence]=useState<SavedReport["cadence"]>("MANUAL"),[notes,setNotes]=useState("");
 const anchorTime=Math.max(...data.orders.map(o=>Date.parse(o.createdAt)));
 const days=range==="TODAY"?1:range==="7D"?7:range==="30D"?30:Infinity;
 const eligibleDate=(value:string)=>range==="ALL"||Date.parse(value)>=anchorTime-(days*86400000);
 const orders=useMemo(()=>data.orders.filter(o=>(county==="all"||o.pickup.county===county)&&eligibleDate(o.createdAt)),[data.orders,county,range,anchorTime]);
 const completed=orders.filter(o=>o.status==="DELIVERED"),cancelled=orders.filter(o=>o.status==="CANCELLED");
 const gross=orders.filter(o=>o.paymentStatus==="Paid").reduce((v,o)=>v+orderTotal(o),0);
 const customers=new Set(orders.map(o=>o.customer)).size;
 const merchantCount=new Set(orders.map(o=>o.merchant)).size;
 const activeRiders=new Set(orders.filter(o=>o.riderId).map(o=>o.riderId)).size;
 const incidents=data.phase2.incidents.filter(x=>eligibleDate(x.createdAt)&&(county==="all"||x.location.includes(county)));
 const support=data.phase2.support.filter(x=>eligibleDate(x.createdAt));
 const payout=data.phase3.payouts.filter(x=>eligibleDate(x.createdAt));
 const indicators:Record<ReportMetric,number>={ORDERS:orders.length,REVENUE:gross,DELIVERIES:completed.length,MERCHANTS:merchantCount,CUSTOMERS:customers,SUPPORT:support.length,INCIDENTS:incidents.length,PAYOUTS:payout.length};
 const countyOptions=["all",...new Set([...data.phase3.coverage.map(c=>c.county)])];
 const trend=Array.from({length:10},(_,i)=>orders.filter((_,idx)=>idx%10===i));
 const series=trend.map(group=>metric==="REVENUE"?group.filter(o=>o.paymentStatus==="Paid").reduce((n,o)=>n+orderTotal(o),0):metric==="DELIVERIES"?group.filter(o=>o.status==="DELIVERED").length:group.length);
 const categories=["PREPARING","RIDER_ASSIGNED","PICKED_UP","IN_TRANSIT","DELAYED","DELIVERED","CANCELLED"];
 const topMerchants=Array.from(orders.reduce((map,o)=>{map.set(o.merchant,(map.get(o.merchant)||0)+1);return map;},new Map<string,number>()).entries()).sort((a,b)=>b[1]-a[1]).slice(0,7);
 const saved=data.phase4.reports.filter(r=>(r.name+" "+r.metric+" "+r.county).toLowerCase().includes(query.toLowerCase()));
 const metricText=(m:ReportMetric,value:number)=>m==="REVENUE"?amount(value):String(value);
 const csvRows=():{headers:string[];rows:(string|number)[][]}=>{
  if(["ORDERS","REVENUE","DELIVERIES"].includes(metric))return {headers:["Order","Date","County","Merchant","Customer","Status","Method","Total KES"],rows:orders.map(o=>[o.id,o.createdAt,o.pickup.county,o.merchant,o.customer,o.status,o.paymentMethod,o.paymentStatus==="Paid"?orderTotal(o):0])};
  if(metric==="MERCHANTS")return {headers:["Merchant","Status","Branches","County"],rows:data.phase2.merchants.filter(m=>county==="all"||m.branches.some(b=>b.county===county)).map(m=>[m.name,m.status,m.branches.length,m.branches[0]?.county||"—"])};
  if(metric==="CUSTOMERS")return {headers:["Customer","Status","County","Verified"],rows:data.phase2.customers.filter(c=>county==="all"||c.county===county).map(c=>[c.name,c.status,c.county,c.verified?"Yes":"No"])};
  if(metric==="SUPPORT")return {headers:["Ticket","Subject","Status","Priority"],rows:support.map(c=>[c.id,c.subject,c.status,c.priority])};
  if(metric==="INCIDENTS")return {headers:["Incident","Title","Severity","Status"],rows:incidents.map(i=>[i.id,i.title,i.severity,i.status])};
  return {headers:["Batch","Category","Status","Amount KES"],rows:payout.map(b=>[b.id,b.kind,b.status,b.items.reduce((n,i)=>n+i.amount,0)])};
 };
 const exportReport=()=>{const {headers,rows}=csvRows();downloadCsv("deetoo-demo-report-"+metric.toLowerCase()+".csv",headers,rows);toast("Filtered demo report exported; no server generated this file.");};
 const save=()=>{
  if(!canSave)return;
  if(modal==="save"&&name.trim().length>=3&&!data.phase4.reports.some(x=>x.name.toLowerCase()===name.trim().toLowerCase())){
   act({type:"PHASE4_REPORT_SAVE",name,metric,range,county,cadence,notes});setTab("saved");setQuery("");toast("Report view saved locally. Scheduling is a preference only.");
  }
  if(modal==="remove"&&selectedReport&&reason.trim().length>=3){act({type:"PHASE4_REPORT_DELETE",id:selectedReport,reason});toast("Saved report definition removed.");}
  setModal(null);setReason("");
 };
 const openReport=(r:SavedReport)=>{setMetric(r.metric);setRange(r.range);setCounty(r.county);setTab("overview");toast("Saved reporting filters restored.");};
 return <div className="dn-screen" data-testid="screen-analytics">
  <div className="dn-title-row"><div><h1>Analytics & Reports</h1><p>Explore operational performance, business trends and shareable reports from a connected demo dataset.</p></div><div className="dn-title-buttons"><button className="dn-btn outline" onClick={exportReport}><Download size={15}/> Export CSV</button><button className="dn-btn primary" disabled={!canSave} onClick={()=>{setName("");setNotes("");setCadence("MANUAL");setModal("save");}}><FilePlus2 size={15}/> Save Report</button></div></div>
  <div className="dn-metrics six">
   <IconStat label="Orders" value={orders.length} icon={<Package/>} foot="Current selected filters"/>
   <IconStat label="Gross Paid Value" value={amount(gross)} icon={<Wallet/>}/>
   <IconStat label="Completed Deliveries" value={completed.length} icon={<CheckCircle2/>}/>
   <IconStat label="Unique Customers" value={customers} tone="blue" icon={<Users/>}/>
   <IconStat label="Completion Rate" value={(orders.length?(completed.length/orders.length*100):0).toFixed(1)+"%"} icon={<TrendingUp/>}/>
   <IconStat label="Support Cases" value={support.length} tone="amber" icon={<Activity/>}/>
  </div>
  <Card className="dn-analytics-filterbar"><div className="dn-toolbar"><SelectBox label="Analytics metric" value={metric} onChange={x=>setMetric(x as ReportMetric)} options={metrics.map(([value,label])=>({value,label}))}/><SelectBox label="Analytics date range" value={range} onChange={x=>setRange(x as ReportRange)} options={ranges.map(([value,label])=>({value,label}))}/><SelectBox label="Analytics county" value={county} onChange={setCounty} options={countyOptions.map(c=>({value:c,label:c==="all"?"Kenya (All Counties)":c}))}/><span className="dn-inline-demo">Sample-period reporting · no live analytics</span><button className="dn-text-btn" onClick={()=>{setMetric("ORDERS");setRange("ALL");setCounty("all");}}>Reset filters</button></div></Card>
  <Tabs ariaLabel="Analytics sections" tabs={[{key:"overview",label:"Performance Overview"},{key:"merchants",label:"Merchant & Category"},{key:"delivery",label:"Delivery Quality"},{key:"saved",label:"Saved Reports ("+data.phase4.reports.length+")"}]} value={tab} onChange={setTab}/>
  {tab!=="saved"&&<div className="dn-analytics-grid">
   <Card title={metrics.find(x=>x[0]===metric)?.[1]+" Trend"} desc="Ten deterministic bins from filtered sample records" action={<span className="dn-inline-demo">{metricText(metric,indicators[metric])} total</span>}>
    <TimeSeries values={series} labels={["1","","","","5","","","","","10"]} fill/><div className="dn-legend"><span className="g">● Dataset total {metricText(metric,indicators[metric])}</span><span>Sample distribution — not time-series telemetry</span></div>
   </Card>
   <Card title="Order Status Mix" desc="Share of currently filtered order records"><Ring number={orders.length} label="Orders" parts={categories.map((s,i)=>({name:s.replaceAll("_"," "),value:orders.filter(o=>o.status===s).length,color:["#ffb02c","#3393e4","#6e89ed","#17b0ae","#f45d52","#00a96c","#a5aebe"][i]}))}/></Card>
   <Card title="Operational Highlights" desc="Drill into the underlying demo workspaces">
    <DetailLine label="Cancelled orders">{cancelled.length}</DetailLine><DetailLine label="Orders with riders">{activeRiders} unique riders</DetailLine><DetailLine label="Open incidents">{incidents.filter(i=>!["RESOLVED","CLOSED"].includes(i.status)).length}</DetailLine><DetailLine label="Unresolved support">{support.filter(c=>!["RESOLVED","CLOSED"].includes(c.status)).length}</DetailLine><DetailLine label="Payout batches">{payout.length}</DetailLine>
    <div className="dn-p4-actions"><button className="dn-btn outline" onClick={()=>navigate("orders")}>Orders <ArrowRight size={13}/></button><button className="dn-btn outline" onClick={()=>navigate("financial")}>Financial Control <ArrowRight size={13}/></button></div>
   </Card>
   <Card title={tab==="delivery"?"Delivery Performance":"Top Merchant Demand"} desc={tab==="delivery"?"Order lifecycle completion and exceptions":"Merchants ranked by orders in the current view"}>
    {tab==="delivery"?<div className="dn-p4-breakdown">{categories.map(s=><div key={s}><span>{s.replaceAll("_"," ")}</span><b>{orders.filter(o=>o.status===s).length}</b><div className="dn-geo-progress"><div style={{width:(orders.length?orders.filter(o=>o.status===s).length/orders.length*100:0)+"%"}}/></div></div>)}</div>:<div className="dn-p4-ranking">{topMerchants.map(([m,count],i)=><button key={m} onClick={()=>navigate("merchants")}><span>{String(i+1).padStart(2,"0")}</span><b>{m}</b><span>{count} orders</span></button>)}{!topMerchants.length&&<Empty label="No merchant orders in current range"/>}</div>}
   </Card>
   <Card title="Completed vs Cancelled" desc="Order outcomes in the selected county"><Bars values={[completed.length,cancelled.length,orders.length-completed.length-cancelled.length]} labels={["Delivered","Cancelled","In progress"]}/><div className="dn-p4-actions"><button className="dn-text-btn" onClick={()=>navigate("dispatch")}>Open Live Dispatch →</button></div></Card>
   <Card title="Delivery & Business Insights"><div className="dn-p4-notes"><p><strong>{merchantCount}</strong> merchants represented in filtered sample orders.</p><p><strong>{customers}</strong> unique customers placed those orders.</p><p><strong>{amount(gross)}</strong> recorded as paid order collections.</p><p>Reports use current browser demo data, including changes from earlier phases.</p></div><button className="dn-btn outline" onClick={()=>setTab("saved")}>View Saved Reports</button></Card>
  </div>}
  {tab==="saved"&&<div className="dn-p4-saved"><Card title="Saved Report Definitions" desc="Reusable local filters, not scheduled email deliveries"><div className="dn-toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search saved reports..."/></div><div className="dn-table-scroll"><table className="dn-table"><thead><tr><th>Report</th><th>Metric</th><th>Range</th><th>County</th><th>Cadence preference</th><th>Actions</th></tr></thead><tbody>{saved.map(r=><tr key={r.id}><td><b>{r.name}</b><small>{r.notes}</small></td><td>{r.metric}</td><td>{r.range}</td><td>{r.county==="all"?"All":r.county}</td><td><Chip value={r.cadence}/></td><td><button className="dn-smalloutline" onClick={()=>openReport(r)}>Open</button> <button className="dn-smalloutline" disabled={!canSave} onClick={()=>{setSelectedReport(r.id);setReason("");setModal("remove");}}>Remove</button></td></tr>)}</tbody></table></div>{!saved.length&&<Empty label="No saved reports match your search"/>}</Card><Card title="Report Scheduling Preview"><p className="dn-p4-description">Weekly and monthly selections save your preferred cadence only. No job scheduler, mail delivery, or report distribution is connected during the design-first stage.</p><button className="dn-btn primary" disabled={!canSave} onClick={()=>setModal("save")}>Save Reporting View</button></Card></div>}
  {modal==="save"&&<Modal title="Save analytical report" subtitle="Filters are saved in this browser only" onClose={()=>setModal(null)} onConfirm={save} confirmText="Save report view" disabled={!canSave||name.trim().length<3||data.phase4.reports.some(x=>x.name.toLowerCase()===name.trim().toLowerCase())}><label className="dn-field">Report name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Monthly Nairobi Operations"/></label><DetailLine label="Metric">{metric}</DetailLine><DetailLine label="Date range">{range}</DetailLine><DetailLine label="County">{county}</DetailLine><label className="dn-field">Cadence preference<select value={cadence} onChange={e=>setCadence(e.target.value as SavedReport["cadence"])}><option value="MANUAL">Manual only</option><option value="WEEKLY">Weekly preference (inactive)</option><option value="MONTHLY">Monthly preference (inactive)</option></select></label><label className="dn-field">Notes<input value={notes} onChange={e=>setNotes(e.target.value)}/></label></Modal>}
  {modal==="remove"&&<Modal title="Remove saved report?" onClose={()=>setModal(null)} onConfirm={save} confirmText="Remove definition" danger disabled={!canSave||reason.trim().length<3}><label className="dn-field">Required removal reason<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label></Modal>}
 </div>;
}
