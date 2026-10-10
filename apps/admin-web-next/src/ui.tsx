import React, {useState} from "react";
import {AlertTriangle, Bike, Check, ChevronDown, ChevronRight, CircleAlert, Clock3, MapPin, Minus, Package, Plus, Search, Shield, Truck, X} from "lucide-react";
import {areas, Order, Rider, RiderStatus, OrderStatus, formatMoney, displayTime} from "./data";
export {formatMoney,displayTime};
export type Screen = "command"|"dispatch"|"orders"|"riders";
export function Chip({value}:{value:string|undefined|null}) {
  const status=(value||"Not set").toUpperCase();
  const kind=/DELIVERED|COMPLETED|AVAILABLE|VERIFIED|APPROVED|PAID|ACTIVE/.test(status)?"success":/CANCELLED|SUSPENDED|FAILED|DELAYED|CRITICAL/.test(status)?"danger":/PENDING|PREPARING|WAITING|PICKUP|OFFLINE|UNASSIGNED/.test(status)?"warning":/ASSIGNED|TRANSIT|DELIVERY|REVIEW|INVESTIGATING/.test(status)?"info":"neutral";
  return <span className={"dn-chip "+kind}>{status.replaceAll("_"," ").toLowerCase()}</span>;
}
export function IconStat({label,value,icon,change,tone="green",foot}:{label:string;value:string|number;icon:React.ReactNode;change?:string;tone?:string;foot?:string}) {
  return <div className="dn-stat"><span className={"dn-stat-ico "+tone}>{icon}</span><div className="dn-stat-content"><div className="dn-stat-label">{label}</div><strong>{value}</strong>{change&&<small className={change.startsWith("↑")?"up":change.startsWith("↓")?"down":""}>{change}</small>}{foot&&<small className="muted">{foot}</small>}</div></div>;
}
export function Card({title,desc,action,children,className="",testId}:{title?:string;desc?:string;action?:React.ReactNode;children:React.ReactNode;className?:string;testId?:string}){
 return <section className={"dn-card "+className} data-testid={testId}><div className="dn-card-title">{(title||desc)&&<div><h2>{title}</h2>{desc&&<p>{desc}</p>}</div>}{action}</div>{children}</section>;
}
export function Tabs({tabs,value,onChange,ariaLabel="Filters"}:{tabs:{key:string;label:string}[];value:string;onChange:(s:string)=>void;ariaLabel?:string}) {return <div className="dn-tabs" role="tablist" aria-label={ariaLabel}>{tabs.map(t=><button key={t.key} role="tab" aria-selected={value===t.key} className={value===t.key?"selected":""} onClick={()=>onChange(t.key)}>{t.label}</button>)}</div>;}
export function SearchBox({value,onChange,placeholder="Search...",ariaLabel}:{value:string;onChange:(s:string)=>void;placeholder?:string;ariaLabel?:string}) {return <label className="dn-search"><Search size={16}/><input aria-label={ariaLabel||placeholder} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>;}
export function SelectBox({value,onChange,options,label}:{value:string;onChange:(s:string)=>void;options:{value:string;label:string}[];label:string}) {return <label className="dn-select"><span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select><ChevronDown size={12}/></label>;}
export function Modal({title,subtitle,children,onClose,onConfirm,confirmText="Confirm",disabled=false,danger=false}:{title:string;subtitle?:string;children:React.ReactNode;onClose:()=>void;onConfirm:()=>void;confirmText?:string;disabled?:boolean;danger?:boolean}){
return <div className="dn-overlay" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-label={title} className="dn-modal" onMouseDown={e=>e.stopPropagation()}><div className="dn-modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button aria-label="Close dialog" onClick={onClose}><X size={18}/></button></div><div className="dn-modal-body">{children}</div><div className="dn-modal-actions"><button className="dn-btn outline" onClick={onClose}>Cancel</button><button className={"dn-btn "+(danger?"red":"primary")} disabled={disabled} onClick={onConfirm}>{confirmText}</button></div></section></div>;
}
export function Empty({label="No records match your filters",detail="Try a different filter or search term."}:{label?:string;detail?:string}){return <div className="dn-empty"><Package size={27}/><strong>{label}</strong><p>{detail}</p></div>;}
export function Initials({name,className=""}:{name:string;className?:string}){return <span className={"dn-avatar "+className}>{name.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}</span>;}
export function TimeSeries({values,labels,color="#01a65f",fill=false}:{values:number[];labels?:string[];color?:string;fill?:boolean}){
const max=Math.max(1,...values);const step=values.length>1?100/(values.length-1):100;const points=values.map((v,i)=>(i*step).toFixed(2)+","+(95-(v/max)*80).toFixed(2)).join(" ");
return <div className="dn-timeseries"><svg viewBox="0 0 600 115" preserveAspectRatio="none" role="img" aria-label="Illustrative demo time-series chart">{[15,35,55,75,95].map(y=><line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#e8eef2" strokeWidth=".6"/>)}{fill&&<polygon points={"0,100 "+points+" 600,100"} fill={color} opacity=".10"/>}<polyline points={points.split(" ").map(s=>{const [x,y]=s.split(",");return (Number(x)*6)+","+y}).join(" ")} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="dn-chart-labels">{(labels||["12AM","4AM","8AM","12PM","4PM","8PM"]).map((label,i)=><span key={i}>{label}</span>)}</div></div>;
}
export function Bars({values,labels,color="#00ab65"}:{values:number[];labels?:string[];color?:string}){const max=Math.max(1,...values);return <div className="dn-bars" role="img" aria-label="Demo category bar chart">{values.map((v,i)=><div className="dn-barcol" key={i} title={(labels?.[i]||"Group")+" · "+v}><div style={{height:Math.max(2,v/max*100)+"%",background:color}}/><small>{labels?.[i]||""}</small></div>)}</div>;}
export function Ring({number,label,parts}:{number:string|number;label:string;parts:{name:string;value:number;color:string}[]}) {
const total=parts.reduce((a,b)=>a+b.value,0)||1;let count=0;const stops=parts.map(p=>{const from=count/total*100;count+=p.value;return p.color+" "+from+"% "+count/total*100+"%";}).join(", ");
return <div className="dn-ring-wrap"><div className="dn-ring" style={{background:"conic-gradient("+stops+")"}}><div><b>{number}</b><small>{label}</small></div></div><div className="dn-ring-key">{parts.map(p=><div key={p.name}><span style={{background:p.color}}></span>{p.name}<b>{p.value}</b></div>)}</div></div>;
}
const minLat=-1.36,maxLat=-1.18,minLng=36.65,maxLng=36.97;
type Marker = {id:string;lat:number;lng:number;type:"rider"|"merchant"|"order"|"delay";label:string;click:()=>void};
export function DemoMap({orders=[],riders=[],height=370,onSelectOrder,onSelectRider,layers}:{orders?:Order[];riders?:Rider[];height?:number;onSelectOrder?:(id:string)=>void;onSelectRider?:(id:string)=>void;layers?:{riders:boolean;orders:boolean;merchants:boolean}}){
 const [zoom,setZoom]=useState(1);
 const show=layers||{riders:true,orders:true,merchants:true};
 const markers:Marker[]=[];
 if(show.merchants)orders.slice(0,10).forEach(o=>markers.push({id:"m"+o.id,lat:o.pickup.lat,lng:o.pickup.lng,type:"merchant",label:o.merchant+" — "+o.pickup.name,click:()=>onSelectOrder?.(o.id)}));
 if(show.orders)orders.slice(0,25).forEach(o=>markers.push({id:"o"+o.id,lat:o.destination.lat+.001*(Number(o.id.slice(-2))%5),lng:o.destination.lng+.003*(Number(o.id.slice(-2))%5),type:o.status==="DELAYED"?"delay":"order",label:o.id+" — "+o.customer,click:()=>onSelectOrder?.(o.id)}));
 if(show.riders)riders.slice(0,26).forEach((r,i)=>markers.push({id:r.id,lat:r.area.lat+.002*(i%4),lng:r.area.lng+.003*(i%3),type:"rider",label:r.name+" — "+r.status,click:()=>onSelectRider?.(r.id)}));
 return <div className="dn-map" style={{height}} aria-label="Illustrative Nairobi demo location map" role="group">
 <div className="dn-map-content" style={{transform:"scale("+zoom+")"}}>
 <svg viewBox="0 0 750 540" preserveAspectRatio="xMidYMid slice" className="dn-map-base" aria-hidden="true">
  <rect width="750" height="540" fill="#edf0e9"/>
  <path fill="#cce8c9" d="M0 10L105 0 155 90 110 195 0 158ZM520 0H750V180L700 230 610 170 580 90ZM0 382L175 340 205 420 120 540H0ZM490 356L750 282V540H560L515 465Z"/>
  <path fill="#d6eada" d="M235 0h170l30 78-78 94-105-23-52-52ZM300 390l135-64 80 59-34 145-135 10Z"/>
  <path d="M0 75Q180 40 275 163T750 230M-20 320Q245 270 375 220T770 55M20 540Q250 345 397 283T745 510M355 0Q385 170 495 300T580 560" stroke="#fff" strokeWidth="26" fill="none"/>
  <path d="M0 75Q180 40 275 163T750 230M-20 320Q245 270 375 220T770 55M20 540Q250 345 397 283T745 510M355 0Q385 170 495 300T580 560" stroke="#f7d57d" strokeWidth="6" fill="none"/>
  <g stroke="#fff" strokeWidth="9" fill="none" opacity=".97">
    <path d="M-30 170L100 225 220 185 310 340 560 325 760 405"/><path d="M115-20L190 150 250 270 300 540"/><path d="M700-20L590 105 490 200 445 425 400 550"/><path d="M0 470L225 390 310 305 425 180 565 20"/><path d="M-20 240L260 240 400 180 760 130"/><path d="M60 0L70 315 185 500"/>
  </g>
  <g stroke="#d1ded9" strokeWidth="1.7" fill="none" opacity=".8">
    {Array.from({length:16},(_,i)=><path key={i} d={"M"+(i*54-50)+" 0l"+(i%3===0?150:-30)+" 540"}/>)}
    {Array.from({length:12},(_,i)=><path key={i} d={"M0 "+(i*55)+" Q350 "+(i*50-80)+" 750 "+(i*58+10)}/>)}
  </g>
  <path d="M0 385Q150 350 255 415T500 440Q620 470 750 385" fill="none" stroke="#a7ddeb" strokeWidth="7"/>
  <g fontFamily="Arial,sans-serif" fill="#49556b" fontSize="17" paintOrder="stroke" stroke="#ffffffaa" strokeWidth="3">
   <text x="120" y="155">Westlands</text><text x="205" y="310">Kilimani</text><text x="405" y="255">Upper Hill</text><text x="407" y="355" fontWeight="bold" fontSize="25" fill="#17212e">Nairobi</text><text x="45" y="405">Lavington</text><text x="525" y="135">Kasarani</text><text x="550" y="465">Embakasi</text><text x="85" y="485">Karen</text><text x="310" y="185">Parklands</text><text x="575" y="335">Eastlands</text>
  </g>
 </svg>
 {markers.map(marker=><button key={marker.id} className={"dn-pin "+marker.type} title={marker.label} aria-label={marker.label} style={{left:((marker.lng-minLng)/(maxLng-minLng)*100)+"%",top:((maxLat-marker.lat)/(maxLat-minLat)*100)+"%"}} onClick={marker.click}>{marker.type==="rider"?<Bike size={14}/>:marker.type==="merchant"?<StoreGlyph/>:marker.type==="delay"?<AlertTriangle size={13}/>:<MapPin size={13}/>}</button>)}
 </div>
 <div className="dn-map-ctrl"><button aria-label="Zoom in" onClick={()=>setZoom(v=>Math.min(1.7,v+.15))}><Plus size={16}/></button><button aria-label="Zoom out" onClick={()=>setZoom(v=>Math.max(1,v-.15))}><Minus size={16}/></button><button aria-label="Reset zoom" onClick={()=>setZoom(1)}>⌖</button></div>
 <div className="dn-map-key"><span>🟢 Riders</span><span>🔵 Orders</span><span>🟠 Merchants</span><span>🔴 Delayed</span></div>
 <span className="dn-map-watermark">DEMO MAP · NOT LIVE TRACKING</span>
 </div>;
}
function StoreGlyph(){return <span style={{fontWeight:900,fontSize:14}}>▣</span>;}
export function Journey({order}:{order:Order}){const steps=["Placed","Accepted","Preparing","Rider Assigned","Picked Up","Delivered"];const indexes:Record<string,number>={PREPARING:2,RIDER_ASSIGNED:3,PICKED_UP:4,IN_TRANSIT:4,DELIVERED:5,DELAYED:order.riderId?3:2,CANCELLED:-1};const active=indexes[order.status]??0;return <div className="dn-journey">{steps.map((s,i)=><div className={i<=active?"done":""} key={s}><span>{i<=active?<Check size={13}/>:i+1}</span><small>{s}</small></div>)}</div>;}
export function DeliveryOrderRow({order,selected,onClick,riderName}:{order:Order;selected:boolean;onClick:()=>void;riderName:string}){return <button className={"dn-list-order "+(selected?"on":"")} onClick={onClick}><div><b>#{order.id}</b><Chip value={order.status}/></div><strong>{order.merchant} <span>— {order.area}</span></strong><small>{order.customer} · {order.destination.name} · {riderName}</small><ChevronRight size={16} className="dn-row-arrow"/></button>;}
export function DetailLine({label,children}:{label:string;children:React.ReactNode}){return <div className="dn-detail-line"><span>{label}</span><strong>{children}</strong></div>;}
export function DemoNotice(){return <span className="dn-demo-tag">FRONTEND DEMO · changes saved in this browser</span>;}
