import {useEffect,useMemo,useState} from "react";
import {ArrowRight,ChevronDown,Clock3,Gift,Heart,LocateFixed,MapPin,Search,Star,Store,Tag,Truck,UtensilsCrossed} from "lucide-react";
import {Badge,Button,Panel,classNames} from "../../../../packages/customer-ui/src/index";
import {FoodArt} from "../components/FoodArt";
import {heroBurger} from "../data/preview";
import type {CustomerAddress,PublicRestaurantBranch,RestaurantCategory,RestaurantDiscoveryQuery} from "@deetoo/types";
import type {CustomerGateway} from "./customer-gateway";
import {useBackendResource} from "./resource";
import {ResourceView,SafePhoto,money,StatusPanel} from "./LiveUtilities";

const iconFor=(value:string)=>/burger/i.test(value)?"🍔":/pizza/i.test(value)?"🍕":/chicken/i.test(value)?"🍗":/breakfast/i.test(value)?"🍳":/drink/i.test(value)?"🥤":/snack/i.test(value)?"🍟":/healthy|salad/i.test(value)?"🥗":"🍽️";
export function LiveDiscovery({gateway,screen,query,selectedAddress,onRestaurant,onAddress}:{gateway:CustomerGateway;screen:"discover"|"search";query:string;selectedAddress:CustomerAddress|null;onRestaurant:(id:string)=>void;onAddress:()=>void}){
 const [category,setCategory]=useState("");
 const [sort,setSort]=useState<"recommended"|"distance"|"open_now">("recommended");
 const [onlyOpen,setOnlyOpen]=useState(false);
 const [view,setView]=useState<"grid"|"map">("grid");
 const [debounced,setDebounced]=useState(query);
 useEffect(()=>{const id=setTimeout(()=>setDebounced(query),240);return()=>clearTimeout(id);},[query]);
 const search=screen==="search"?debounced.trim():"";
 const request:RestaurantDiscoveryQuery=useMemo(()=>({
  ...(selectedAddress?{latitude:selectedAddress.latitude,longitude:selectedAddress.longitude}:{}),
  ...(search?{search}:{}),...(category?{category}:{}),open_now:onlyOpen,sort,page:1,limit:40
 }),[selectedAddress?.id,selectedAddress?.latitude,selectedAddress?.longitude,search,category,onlyOpen,sort]);
 const resources=useBackendResource(()=>gateway.discovery.restaurants(request),true,[JSON.stringify(request)]);
 const categories=useBackendResource(()=>gateway.discovery.categories(),true,[]);
 const service=useBackendResource(()=>gateway.discovery.serviceability(selectedAddress!.latitude,selectedAddress!.longitude),Boolean(selectedAddress),[selectedAddress?.id]);
 const results=resources.state.status==="ready"?resources.state.data:resources.state.status==="empty"?resources.state.data:[];
 return <div className="dt-discovery-layout dt-live-discovery">
  <div className="dt-discovery-left">
   <div className="dt-page-heading"><div><h1>{screen==="search"?"Find your next craving":"Discover restaurants"}</h1><p>Browse real restaurants {selectedAddress?"delivering near "+selectedAddress.city:"— choose a delivery address for accurate nearby results"}.</p></div>
    <Button size="sm" variant="outline" onClick={onAddress}><MapPin size={16}/> {selectedAddress?"Change location":"Choose location"}</Button></div>
   {screen==="search"?<section className="dt-search-hero"><span>SEARCH DEETOO</span><h2>Find exactly what<br/><em>you’re craving</em></h2><p>Search live restaurants and cuisines in your serviceable area.</p><div aria-hidden="true" className="dt-search-hero-food"><FoodArt kind="Burgers" hero/><img src={heroBurger} alt=""/></div></section>:
    <section className="dt-hero" aria-label="Discover food near you"><div className="dt-hero-copy"><span className="dt-hero-eyebrow">DISCOVER DEETOO</span><h2>Tasty meals,<br/>made for you</h2><p>Browse available kitchens and see real menus before ordering.</p><Button className="dt-hero-cta" variant="outline" onClick={onAddress}>Choose delivery location <ArrowRight size={17}/></Button></div><div className="dt-hero-photo" aria-hidden="true"><FoodArt kind="Burgers" hero/><img src={heroBurger} alt=""/></div><div className="dt-hero-offer" aria-label="Offers require verified eligibility"><strong>Fresh<br/>picks</strong><small>Verified offers<br/>at checkout</small></div></section>}
   <div className="dt-category-list" role="group" aria-label="Cuisine categories">
    <button type="button" className={classNames("dt-category",!category&&"dt-category--selected")} aria-pressed={!category} onClick={()=>setCategory("")}><span className="dt-category-icon">🍽️</span>All</button>
    {categories.state.status==="ready"&&categories.state.data.filter(c=>c.is_active).map((c:RestaurantCategory)=><button type="button" key={c.id} className={classNames("dt-category",category===c.id&&"dt-category--selected")} aria-pressed={category===c.id} onClick={()=>setCategory(c.id)}><span className="dt-category-icon">{iconFor(c.name)}</span>{c.name}</button>)}
   </div>
   <div className="dt-filter-list" aria-label="Verified restaurant filters">
    <label className="dt-filter-select"><span>Sort by</span><select aria-label="Sort restaurants" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="recommended">Recommended</option><option value="distance" disabled={!selectedAddress}>Nearest</option><option value="open_now">Open first</option></select></label>
    <button className={classNames("dt-filter-pill dt-open-toggle",onlyOpen&&"dt-open-toggle--on")} aria-pressed={onlyOpen} onClick={()=>setOnlyOpen(!onlyOpen)} type="button"><span className="dt-switch"><span/></span> Open now</button>
    <button className="dt-filter-pill" disabled title="Verified delivery ETA filtering is not available"><Clock3 size={16}/> Delivery time <ChevronDown size={14}/></button>
    <button className="dt-filter-pill" type="button" onClick={()=>document.querySelector('[aria-label="Cuisine categories"]')?.scrollIntoView({behavior:"smooth",block:"center"})}><UtensilsCrossed size={16}/> Cuisine <ChevronDown size={14}/></button>
    <button className="dt-filter-pill" disabled title="Restaurant price filtering is not supported"><Tag size={16}/> Price range <ChevronDown size={14}/></button>
    <button className="dt-filter-pill" disabled title="Offers are verified at checkout"><Gift size={16}/> Offers <ChevronDown size={14}/></button>
    <button className="dt-filter-pill" disabled title="Review scores are not verified"><Star size={16}/> Rating <ChevronDown size={14}/></button>
    <button className="dt-filter-reset" onClick={()=>{setSort("recommended");setOnlyOpen(false);setCategory("");}} type="button">Reset</button>
   </div>
   {selectedAddress&&service.state.status==="ready"&&!service.state.data.serviceable&&<Panel className="dt-live-alert" role="status"><MapPin size={21}/><p>Delivery is not available at this address ({service.state.data.reason_code}). You can browse, but checkout will require a serviceable address.</p><Button variant="outline" size="sm" onClick={onAddress}>Change address</Button></Panel>}
   {screen==="search"&&<div className="dt-results-label"><strong>{resources.state.status==="ready"?results.length+" restaurants found"+(search?' for “'+search+'”':""):"Searching restaurants…"}</strong><span>Live DeeToo listings</span></div>}
   <div className="dt-parity-view-actions"><strong>Explore restaurants</strong><div role="group" aria-label="Restaurant display mode"><button type="button" aria-pressed={view==="grid"} onClick={()=>setView("grid")}>List view</button><button type="button" aria-pressed={view==="map"} onClick={()=>setView("map")}>Map view</button></div></div>
   {view==="map"&&<Panel className="dt-parity-map-inline"><div className="dt-live-map-placeholder"><MapPin size={39}/><strong>Verified restaurant map</strong><p>Geocoded restaurant map data is not yet available from this response.</p><Button variant="outline" onClick={onAddress}>Choose location</Button></div></Panel>}
   <ResourceView resource={resources.state} onRetry={resources.refresh} empty="No restaurants match your search">
    {(restaurants)=><div className="dt-restaurants">{restaurants.map((r:PublicRestaurantBranch,i)=><article key={r.branch_id} className="dt-restaurant-card" style={{animationDelay:Math.min(i,12)*40+"ms"}}>
      <button className="dt-restaurant-image-button" type="button" onClick={()=>onRestaurant(r.branch_id)} aria-label={"Open "+r.merchant_name}>
       <span className="dt-photo-fallback"><FoodArt kind="Burgers"/></span>{r.cover_url&&<img src={r.cover_url} loading="lazy" alt="" onError={e=>{e.currentTarget.style.display="none";}}/>}
       <span className={classNames("dt-restaurant-badge",r.is_open_now?"dt-restaurant-badge--mint":"dt-restaurant-badge--red")}>{r.status_badge_text|| (r.is_open_now?"Open":"Closed")}</span>
       <div className="dt-image-chips"><span><Clock3 size={13}/> Prep ~{r.prep_default_min} min</span></div><span className="dt-parity-favourite" title="Favourites coming soon"><Heart size={16}/></span>
      </button>
      <button className="dt-restaurant-summary" type="button" onClick={()=>onRestaurant(r.branch_id)}><strong>{r.merchant_name}</strong><span>{r.categories.join(" · ")||"Restaurant"}</span><div className="dt-restaurant-meta"><MapPin size={14}/> {r.branch_name} {typeof r.distance_km==="number"?" · "+r.distance_km.toFixed(1)+" km":""}</div><div className="dt-restaurant-foot"><span>Min order {money(r.min_order_minor)}</span><Badge variant={r.serviceable?"mint":"red"}>{r.serviceable?"Serviceable":"Address required"}</Badge></div></button>
     </article>)}</div>}
   </ResourceView>
  </div>
  <aside className="dt-right-rail" aria-label="Delivery information">
    <Panel className="dt-rail-map"><div className="dt-live-map-placeholder"><MapPin size={38}/><strong>{selectedAddress?selectedAddress.label:"Your delivery location"}</strong><p>{selectedAddress?selectedAddress.address_text:"Choose a saved address to search your delivery zone."}</p><Button size="sm" variant="outline" onClick={onAddress}><LocateFixed size={15}/> {selectedAddress?"Change address":"Choose address"}</Button></div></Panel>
    <Panel className="dt-referral dt-parity-referral"><span className="dt-gift"><Gift size={24}/></span><div><strong>Share DeeToo</strong><p>Referral rewards appear when verified by DeeToo.</p></div></Panel>
    <Panel className="dt-top-picks"><div className="dt-panel-heading"><h3>Available nearby</h3><span>Live catalogue</span></div>{results.slice(0,3).map(r=><button className="dt-pick" key={r.branch_id} onClick={()=>onRestaurant(r.branch_id)}><span className="dt-pick-photo"><FoodArt kind="Burgers"/>{r.cover_url&&<img src={r.cover_url} alt="" loading="lazy" onError={e=>{e.currentTarget.style.display="none";}}/>}</span><div><strong>{r.merchant_name}</strong><small>{r.branch_name}</small></div><span><ArrowRight size={16}/></span></button>)}
     {!results.length&&<p>Verified nearby restaurants will appear after the discovery request succeeds.</p>}</Panel>
    <Panel className="dt-hungry"><div className="dt-hungry-icon"><Truck size={25}/></div><div><strong>Delivery you can trust</strong><p>Prices, availability and delivery costs are confirmed by DeeToo at checkout.</p></div></Panel>
  </aside>
 </div>;
}
