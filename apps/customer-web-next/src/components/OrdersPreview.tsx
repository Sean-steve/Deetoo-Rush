import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bike, CalendarDays, Check, CheckCircle2, ChefHat, ChevronDown, ChevronRight, Clock3, House, LifeBuoy, LocateFixed, MapPin, MessageSquare, Minus, Navigation, Phone, Plus, RefreshCw, Search, ShieldCheck, ShoppingBag, Star, Store, Truck, XCircle } from "lucide-react";
import { Badge, Button, IconButton, Panel, classNames } from "../../../../packages/customer-ui/src/index";
import { FoodArt } from "./FoodArt";
import { demoOrders, demoSnapshotDate, orderItemsTotal, orderTotal, type DemoOrder, type DemoOrderStatus } from "../data/orders-preview";
type Screen = "orders"|"tracking"|"delivered";
type OrderTab = "all"|"active"|"past"|"cancelled";
type Props = {
  screen:Screen;orderId:string;
  onOpen:(id:string,screen:"tracking"|"delivered")=>void;
  onBack:()=>void;onRestaurant:(id:string)=>void;onSupport:()=>void;onNotice:(text:string)=>void;
};
const fmt=(n:number)=>"Ksh "+n.toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
const statuses:Record<DemoOrderStatus,string>={on_the_way:"On the way",preparing:"Preparing",delivered:"Delivered",cancelled:"Cancelled"};
function DemoTag({short=false}:{short?:boolean}) {return <span className="dt-demo-tag">{short?"Sample data":"Design preview · sample order data"}</span>;}
function Status({status}:{status:DemoOrderStatus}) {return <Badge variant={status==="preparing"?"gold":status==="cancelled"?"red":"mint"}>{statuses[status]}</Badge>;}
function Photo({src,alt}:{src:string;alt:string}) {
  const [error,setError]=useState(false);
  return <div className="dt-order-photo"><FoodArt kind="Burgers"/>{!error&&<img src={src} loading="lazy" alt={alt} onError={()=>setError(true)}/>}</div>;
}
function Progress({order,large=false}:{order:DemoOrder;large?:boolean}) {
  const stages=large?["Confirmed","Preparing","Rider collecting","On the way","Delivered"]:["Confirmed","Preparing","On the way","Delivered"];
  const reached=order.status==="delivered"?stages.length:order.status==="on_the_way"?(large?4:3):order.status==="preparing"?2:0;
  return <ol className={classNames("dt-order-stages",large&&"dt-order-stages--large",order.status==="cancelled"&&"dt-order-stages--cancelled")}>
    {stages.map((name,i)=>{
      const active=i<reached;
      const time=large?(i===2?order.stageTimes[2]:i===3?undefined:i===4?order.stageTimes[3]:order.stageTimes[i]):order.stageTimes[i];
      return <li key={name} className={classNames(active&&"dt-stage-reached",active&&i===reached-1&&order.status!=="delivered"&&"dt-stage-current")}>
        <div className="dt-stage-node" aria-hidden="true">{active?(name==="On the way"&&order.status==="on_the_way"?<Bike size={18}/>:<Check size={17} strokeWidth={3}/>):<span/>}</div>
        <strong>{name}</strong><small>{active?(time||(name==="On the way"?"ETA 12 min":"")):""}</small>
      </li>;
    })}
  </ol>;
}
function RiderControls({onNotice}:{onNotice:(text:string)=>void}) {
  return <div className="dt-rider-buttons"><IconButton label="Call sample rider" onClick={()=>onNotice("Demo only: no phone call has been placed.")}><Phone size={16}/></IconButton><IconButton label="Message sample rider" onClick={()=>onNotice("Demo only: no rider message was sent.")}><MessageSquare size={17}/></IconButton></div>;
}
function HistoryCard({order,onOpen,onRestaurant,onNotice}:{order:DemoOrder;onOpen:()=>void;onRestaurant:()=>void;onNotice:(text:string)=>void}) {
  return <article className={classNames("dt-history-card",order.status==="on_the_way"&&"dt-history-card--active")} data-order-id={order.id}>
    <header className="dt-history-head"><div><strong>#{order.id}</strong> <Status status={order.status}/><p>{order.branch} <span>·</span> {order.placedTime}</p></div><div><Button variant="outline" size="sm" onClick={onOpen}>View details <ArrowRight size={16}/></Button>{order.status==="delivered"&&<Button size="sm" onClick={onRestaurant}><RefreshCw size={15}/> Reorder menu</Button>}</div></header>
    <div className="dt-history-body">
      <div className="dt-history-merchant"><Photo src={order.lines[0].image} alt={order.restaurant}/><div><h3>{order.restaurant}</h3><p>{order.lines.reduce((n,x)=>n+x.quantity,0)} items · {fmt(orderTotal(order))}</p><div className="dt-history-thumbs">{order.lines.map(x=><Photo key={x.id} src={x.image} alt={x.name}/>)}</div></div></div>
      <div className="dt-history-progress"><Progress order={order}/>
        {order.status==="on_the_way"&&<div className="dt-history-rider"><div className="dt-rider-avatar"><Bike size={20}/></div><strong>{order.rider?.name}</strong><span className="dt-rider-rating"><Star size={13} fill="currentColor"/> {order.rider?.rating} ({order.rider?.trips})</span><span><Bike size={17}/> {order.rider?.plate}</span><RiderControls onNotice={onNotice}/><button className="dt-history-track" onClick={onOpen}><MapPin size={16}/> Live track <ArrowRight size={15}/></button></div>}
        {order.status==="preparing"&&<p className="dt-history-caption"><ChefHat size={16}/> Restaurant preparing food · sample status</p>}
        {order.status==="delivered"&&<p className="dt-history-caption dt-history-caption--done"><CheckCircle2 size={17}/> Delivered · See receipt and rate your experience</p>}
        {order.status==="cancelled"&&<p className="dt-history-caption dt-history-caption--cancelled"><XCircle size={17}/> This sample order was cancelled</p>}
      </div>
    </div>
  </article>;
}
function History({onOpen,onRestaurant,onNotice}:{onOpen:(o:DemoOrder)=>void;onRestaurant:(id:string)=>void;onNotice:(m:string)=>void}) {
  const [tab,setTab]=useState<OrderTab>("all"),[query,setQuery]=useState(""),[period,setPeriod]=useState("3");
  const activeCount=demoOrders.filter(x=>x.status==="on_the_way"||x.status==="preparing").length;
  const visible=useMemo(()=>{
    const cutoff=new Date(demoSnapshotDate+"T23:59:59");
    if(period==="1")cutoff.setDate(cutoff.getDate()-30);
    if(period==="3")cutoff.setMonth(cutoff.getMonth()-3);
    const q=query.trim().toLowerCase();
    return demoOrders.filter(o=>{
      if(tab==="active"&&o.status!=="on_the_way"&&o.status!=="preparing")return false;
      if(tab==="past"&&o.status!=="delivered")return false;
      if(tab==="cancelled"&&o.status!=="cancelled")return false;
      if(period!=="all"&&new Date(o.placedAt)<cutoff)return false;
      return !q||[o.id,o.restaurant,o.branch,...o.lines.map(x=>x.name)].some(s=>s.toLowerCase().includes(q));
    }).sort((a,b)=>b.placedAt.localeCompare(a.placedAt));
  },[tab,query,period]);
  return <section className="dt-orders-page dt-screen-enter">
    <header className="dt-orders-header"><div><h1>Your orders</h1><p>Track current orders or view your order history.</p></div><div className="dt-orders-controls"><label className="dt-orders-search"><Search size={20}/><input type="search" aria-label="Search orders by restaurant or item" placeholder="Search orders by restaurant or item..." value={query} onChange={e=>setQuery(e.target.value)}/></label><label className="dt-orders-period"><CalendarDays size={19}/><select aria-label="Filter order date range" value={period} onChange={e=>setPeriod(e.target.value)}><option value="3">Last 3 months</option><option value="1">Last 30 days</option><option value="all">All time</option></select><ChevronDown size={15}/></label></div></header>
    <div className="dt-orders-tabsbar"><div role="tablist" aria-label="Order status filters">{([["all","All orders"],["active","Active"],["past","Past orders"],["cancelled","Cancelled"]] as const).map(([id,name])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{name}{id==="active"&&<span> ({activeCount})</span>}</button>)}</div><DemoTag/></div>
    <div className="dt-orders-list" aria-live="polite">{visible.length?visible.map(order=><HistoryCard key={order.id} order={order} onOpen={()=>onOpen(order)} onRestaurant={()=>onRestaurant(order.restaurantId)} onNotice={onNotice}/>):<Panel className="dt-orders-empty"><Search size={31}/><h2>No matching orders</h2><p>Try another restaurant, order ID, or date range.</p><Button onClick={()=>{setTab("all");setQuery("");setPeriod("all");}}>Clear filters</Button></Panel>}</div>
    <p className="dt-orders-disclaimer"><ShieldCheck size={14}/> All orders shown here are synthetic design fixtures, not real account history.</p>
  </section>;
}
function SampleMap({onNotice}:{onNotice:(m:string)=>void}) {
  const [zoom,setZoom]=useState(1),[terrain,setTerrain]=useState(false);
  return <div className={classNames("dt-tracking-map",terrain&&"dt-tracking-map--terrain")} aria-label="Illustrative Juja delivery route, not live GPS">
    <div className="dt-map-tabs"><button className={!terrain?"active":""} aria-pressed={!terrain} onClick={()=>setTerrain(false)}>Map</button><button className={terrain?"active":""} aria-pressed={terrain} onClick={()=>setTerrain(true)}>Terrain preview</button></div>
    <div className="dt-map-inner" style={{transform:"scale("+zoom+")"}}>
      <svg viewBox="0 0 900 480" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="900" height="480" fill="var(--dt-map-base)"/>
        <g fill="var(--dt-map-park)"><path d="M0 305L150 278L220 332L167 480H0Z"/><path d="M570 0L725 0L759 108L627 178L569 134Z"/><path d="M740 236L900 201L900 422L849 461L752 348Z"/></g>
        <g fill="none" stroke="var(--dt-map-small-road)" strokeWidth="2"><path d="M-30 28L850 480M-15 104L700 480M155 -15L-14 485M245 -25L70 500M360 -15L265 500M535 -10L450 500M698 -15L550 510M802 -15L745 510"/><path d="M0 169L925 123M0 266L920 250M0 382L930 341M17 458L800 -10M230 500L925 32M-20 52L520 482"/></g>
        <g fill="none" stroke="var(--dt-map-road)" strokeWidth="12"><path d="M-20 437C248 403 330 350 539 264S775 196 954 17"/><path d="M300 -35L520 505"/><path d="M-16 45L880 474"/></g>
        <g fill="none" stroke="#e4d5a9" strokeWidth="2"><path d="M-20 437C248 403 330 350 539 264S775 196 954 17"/><path d="M300 -35L520 505"/></g>
        <path d="M120 368L190 394L253 360L329 378L408 294L472 274L524 222L594 234L674 181L752 168" fill="none" stroke="#fff" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M120 368L190 394L253 360L329 378L408 294L472 274L524 222L594 234L674 181L752 168" fill="none" stroke="#008f54" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="dt-map-label dt-map-label--juja">Juja</span><span className="dt-map-label dt-map-label--mall">Juja City Mall</span><span className="dt-map-label dt-map-label--hospital">St. Jude Hospital</span><span className="dt-map-label dt-map-label--post">Juja Post Office</span><span className="dt-map-label dt-map-label--kalimoni">Kalimoni</span>
      <span className="dt-map-merchant-pin"><Store size={16}/><small>Deetoo Test Merchant<br/>Juja Branch</small></span><span className="dt-map-rider-pin"><Bike size={30}/><strong>12 min · demo</strong></span><span className="dt-map-home-pin"><House size={25}/></span>
    </div>
    <div className="dt-map-zoom"><IconButton label="Reset example map zoom" onClick={()=>setZoom(1)}><LocateFixed size={19}/></IconButton><IconButton label="Zoom in" onClick={()=>setZoom(s=>Math.min(1.6,Math.round((s+.15)*100)/100))}><Plus size={19}/></IconButton><IconButton label="Zoom out" onClick={()=>setZoom(s=>Math.max(1,Math.round((s-.15)*100)/100))}><Minus size={19}/></IconButton></div>
    <span className="dt-map-not-live">Illustrative route · NOT LIVE GPS</span><button className="dt-map-info" onClick={()=>onNotice("Route is illustrative. Production GPS, ETAs and maps require verified location data.")}><Navigation size={14}/> Demo route info</button>
  </div>;
}
function OrderSummary({order,onRestaurant}:{order:DemoOrder;onRestaurant:()=>void}) {
  return <Panel className="dt-order-detail-summary"><header><strong>#{order.id}</strong><Status status={order.status}/></header><p>{order.branch} · {order.placedTime}</p><button className="dt-order-merchant-link" onClick={onRestaurant}><span>D</span><strong>{order.restaurant}<small>{order.branch}</small></strong><ChevronRight size={17}/></button><h3>Order items ({order.lines.reduce((n,x)=>n+x.quantity,0)})</h3>
    {order.lines.map(line=><div className="dt-order-summary-item" key={line.id}><Photo src={line.image} alt={line.name}/><span><strong>{line.name}</strong><small>{line.quantity} × {fmt(line.unitPrice)}</small></span><b>{fmt(line.quantity*line.unitPrice)}</b></div>)}
    <dl><div><dt>Items total</dt><dd>{fmt(orderItemsTotal(order))}</dd></div><div><dt>Delivery fee</dt><dd>{fmt(order.deliveryFee)}</dd></div><div><dt>Service fee</dt><dd>{fmt(order.serviceFee)}</dd></div></dl><div className="dt-order-grand-total"><strong>{order.status==="delivered"?"Total paid":"Estimated total"}</strong><b>{fmt(orderTotal(order))}</b></div>
  </Panel>;
}
function RiderCard({order,onNotice}:{order:DemoOrder;onNotice:(m:string)=>void}) {
  return <Panel className="dt-rider-card"><header><div className="dt-rider-avatar dt-rider-avatar--big"><Bike size={27}/></div><div><small>Your rider (demo)</small><strong>{order.rider?.name||"Assignment pending"}</strong><span><Star size={13} fill="currentColor"/> {order.rider?.rating||"—"} ({order.rider?.trips||0} deliveries)</span></div><RiderControls onNotice={onNotice}/></header><div className="dt-rider-plate"><Bike size={23}/><div><strong>{order.rider?.plate||"Rider pending"}</strong><small>{order.rider?.vehicle||"Details will appear after assignment"}</small></div></div></Panel>;
}
function Tracking({order,onBack,onRestaurant,onSupport,onNotice}:{order:DemoOrder;onBack:()=>void;onRestaurant:()=>void;onSupport:()=>void;onNotice:(m:string)=>void}) {
  const dispatched=order.status==="on_the_way"&&Boolean(order.rider);
  return <section className="dt-tracking-page dt-screen-enter"><div className="dt-tracking-content">
    <button className="dt-orders-back" onClick={onBack}><ArrowLeft size={16}/> Back to orders</button>
    <header className="dt-tracking-heading"><div><h1>{dispatched?"Your order is on the way":"Your order is being prepared"}</h1><p>{dispatched?"This sample route demonstrates live tracking layout; GPS is not connected.":"Rider tracking and ETA appear only after verified assignment."}</p></div><DemoTag short/></header>
    <Progress order={order} large/>
    {dispatched?<Panel className="dt-tracking-map-panel"><SampleMap onNotice={onNotice}/><div className="dt-route-facts"><div><Clock3 size={25}/><span><small>Sample arrival estimate</small><strong>12 min</strong><em>Illustrative only</em></span></div><div><Bike size={25}/><span><small>Example distance</small><strong>4.2 km</strong><em>Not GPS</em></span></div><div><Navigation size={25}/><span><small>Route status</small><strong>Preview</strong><em>Awaiting map provider</em></span></div></div></Panel>:
      <Panel className="dt-tracking-pending"><ChefHat size={44}/><h2>Preparing your order</h2><p>Live route and ETA are hidden until rider assignment, valid GPS and routing are confirmed by the backend.</p></Panel>}
  </div><aside className="dt-tracking-aside"><OrderSummary order={order} onRestaurant={onRestaurant}/>{dispatched?<RiderCard order={order} onNotice={onNotice}/>:<Panel className="dt-no-rider"><Bike size={23}/><strong>Courier assignment pending</strong><p>No rider or location has been confirmed.</p></Panel>}<button className="dt-delivery-help-cta" onClick={onSupport}><LifeBuoy size={19}/> Need help with this order? <ChevronRight size={17}/></button></aside></section>;
}
function DeliveryChecklist({order}:{order:DemoOrder}) {
  const stages=[{name:"Order confirmed",desc:"We received your order.",icon:ShoppingBag},{name:"Preparing",desc:"The restaurant prepared your food.",icon:ChefHat},{name:"Out for delivery",desc:"Your rider picked up the order.",icon:Bike},{name:"Delivered",desc:"Enjoy your meal!",icon:House}];
  return <Panel className="dt-delivery-checklist"><h2>Delivery details</h2><ol>{stages.map((stage,i)=><li key={stage.name}><span className="dt-delivery-checkpoint"><Check size={13}/></span><span className="dt-delivery-checkicon"><stage.icon size={22}/></span><div><strong>{stage.name}</strong><small>{order.stageTimes[i]}</small><p>{stage.desc}</p></div><span className="dt-delivery-checkdone"><Check size={18}/></span></li>)}</ol></Panel>;
}
function RatingStars({name,value,onChange}:{name:string;value:number;onChange:(n:number)=>void}) {
  return <fieldset className="dt-rating-field"><legend>{name}</legend><div role="group" aria-label={"Rate "+name}>{[1,2,3,4,5].map(n=><button type="button" key={n} aria-pressed={value===n} aria-label={n+" star"+(n===1?"":"s")+" for "+name} onClick={()=>onChange(n)}><Star size={24} fill={n<=value?"currentColor":"none"}/></button>)}</div></fieldset>;
}
function Completed({order,onBack,onRestaurant,onSupport,onNotice}:{order:DemoOrder;onBack:()=>void;onRestaurant:()=>void;onSupport:()=>void;onNotice:(m:string)=>void}) {
  const [ratings,setRatings]=useState({food:0,delivery:0,restaurant:0}),[comment,setComment]=useState(""),[done,setDone]=useState(false);
  const ready=ratings.food>0&&ratings.delivery>0&&ratings.restaurant>0;
  return <section className="dt-completed-page dt-screen-enter"><div className="dt-completed-content">
    <button className="dt-orders-back" onClick={onBack}><ArrowLeft size={16}/> Back to orders</button>
    <div className="dt-delivered-banner"><div className="dt-delivered-check"><Check size={41} strokeWidth={3}/></div><div><DemoTag short/><h1>Order delivered!</h1><p>Your delicious food has been delivered. Enjoy!</p><strong>Oct 6, 2026 at 4:45 PM</strong></div><div className="dt-delivered-art" aria-hidden="true"><span>✦</span><span>🍜</span><span>🛍️</span><span>✦</span></div></div>
    <Panel className="dt-delivered-receipt"><header><h2>Order details</h2><Status status="delivered"/><strong>#{order.id}</strong><Button variant="outline" size="sm" onClick={onRestaurant}><RefreshCw size={15}/> Reorder menu</Button></header><div className="dt-delivered-merchant"><Photo src={order.lines[0].image} alt={order.restaurant}/><div><h3>{order.restaurant}</h3><p>{order.branch} · {order.placedTime}</p></div></div>
      <div className="dt-receipt-lines">{order.lines.map(line=><div key={line.id}><Photo src={line.image} alt={line.name}/><span><strong>{line.name}</strong><small>{line.description}</small></span><b>{line.quantity}</b><em>{fmt(line.quantity*line.unitPrice)}</em></div>)}</div>
      <dl className="dt-receipt-total"><div><dt>Items total</dt><dd>{fmt(orderItemsTotal(order))}</dd></div><div><dt>Delivery fee</dt><dd>{fmt(order.deliveryFee)}</dd></div><div><dt>Service fee</dt><dd>{fmt(order.serviceFee)}</dd></div><div className="dt-receipt-grand"><dt>Total paid (demo)</dt><dd>{fmt(orderTotal(order))}</dd></div></dl>
    </Panel>
    <Panel className="dt-delivered-feedback"><h2>How was your order?</h2><p>Your feedback helps us improve. This is a local-only preview.</p>{done?<div className="dt-rating-success" role="status"><CheckCircle2 size={23}/> Thanks! Demo feedback is visible on this screen only. Nothing was submitted.</div>:
      <form onSubmit={e=>{e.preventDefault();if(ready){setDone(true);onNotice("Feedback preview complete — no rating was sent to DeeToo.");}}}><div className="dt-ratings-grid"><RatingStars name="Food quality" value={ratings.food} onChange={n=>setRatings(s=>({...s,food:n}))}/><RatingStars name="Delivery experience" value={ratings.delivery} onChange={n=>setRatings(s=>({...s,delivery:n}))}/><RatingStars name="Restaurant service" value={ratings.restaurant} onChange={n=>setRatings(s=>({...s,restaurant:n}))}/></div><div className="dt-rating-submit"><input aria-label="Additional feedback (optional)" placeholder="Share more details (optional)..." maxLength={350} value={comment} onChange={e=>setComment(e.target.value)}/><Button disabled={!ready} type="submit">Preview feedback submission</Button></div>{!ready&&<small>Rate all three categories before submitting.</small>}</form>}
    </Panel>
  </div><aside className="dt-completed-aside"><DeliveryChecklist order={order}/><RiderCard order={order} onNotice={onNotice}/><Panel className="dt-delivery-address"><h2>Delivery address</h2><div><MapPin size={24}/><span><strong>Home</strong><small>Near Juja State Lodge, Juja<br/>Juja, Kiambu County (demo)</small></span></div></Panel><Panel className="dt-delivered-help"><h2><LifeBuoy size={20}/> Need help with this order?</h2>{["Report an issue","Get help with a refund","Contact support"].map(label=><button key={label} onClick={onSupport}>{label}<ChevronRight size={17}/></button>)}</Panel></aside></section>;
}
export function OrdersPreview({screen,orderId,onOpen,onBack,onRestaurant,onSupport,onNotice}:Props) {
  if(screen==="orders")return <History onOpen={order=>onOpen(order.id,order.status==="delivered"?"delivered":"tracking")} onRestaurant={onRestaurant} onNotice={onNotice}/>;
  const order=demoOrders.find(item=>item.id===orderId&&(screen==="delivered"?item.status==="delivered":item.status!=="delivered"))||demoOrders.find(item=>screen==="delivered"?item.status==="delivered":item.status==="on_the_way")!;
  const shared={order,onBack,onRestaurant:()=>onRestaurant(order.restaurantId),onSupport,onNotice};
  return screen==="delivered"?<Completed {...shared}/>:<Tracking {...shared}/>;
}
