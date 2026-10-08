import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowRight, Bell, Bike, Check, ChevronDown, ChevronRight, Clock3, Compass,
  Gift, Heart, House, LifeBuoy, List, LocateFixed, Map as MapIcon, MapPin, Menu,
  Search, ShieldCheck, ShoppingBag, SlidersHorizontal, Star, Tag, Truck,
  UserRound, UtensilsCrossed, X, Zap,
} from "lucide-react";
import { Badge, Button, IconButton, Panel, classNames } from "../../../packages/customer-ui/src/index";
import { categories, heroBurger, previewLocation, previewRestaurants, type Cuisine, type PreviewRestaurant } from "./data/preview";
import { FoodArt } from "./components/FoodArt";
import { ShoppingPreview, type CartLine } from "./components/ShoppingPreview";

type Route = "discover" | "search" | "restaurant" | "bag" | "checkout" | "orders" | "profile" | "security" | "notifications" | "support";
type Sort = "recommended" | "rating" | "fastest" | "nearest";
type View = "grid" | "map";

const routes: Array<{id:Route; label:string; icon:typeof House; path:string}> = [
  {id:"discover", label:"Discover", icon:House, path:"/"},
  {id:"search", label:"Search", icon:Search, path:"/search"},
  {id:"bag", label:"Your bag", icon:ShoppingBag, path:"/bag"},
  {id:"orders", label:"Orders & tracking", icon:ShoppingBag, path:"/orders"},
  {id:"profile", label:"Profile & addresses", icon:UserRound, path:"/profile"},
  {id:"security", label:"Security", icon:ShieldCheck, path:"/security"},
  {id:"notifications", label:"Notifications", icon:Bell, path:"/notifications"},
  {id:"support", label:"Support", icon:LifeBuoy, path:"/support"},
];
const routeFromPath = (path:string):Route => path === "/restaurant" ? "restaurant" : path === "/checkout" ? "checkout" : routes.find(item => item.path === path)?.id || "discover";

function BrandLogo() {
  return (
    <div className="dt-brand" aria-label="DeeToo food delivery">
      <div className="dt-brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="url(#deeGradient)"/><defs><linearGradient id="deeGradient" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#00D78B"/><stop offset="1" stopColor="#009C5F"/></linearGradient></defs><path d="M8 26L20 10l13 16c-6-3.2-11.2-4.7-13-4.7C17 21.3 13 23 8 26Z" fill="#fff"/></svg>
      </div>
      <div className="dt-brand-title"><strong>DeeToo</strong><small>Food delivery, made for you</small></div>
    </div>
  );
}

function Header({query,onQueryChange,goTo,bagCount,notice}:{
  query:string;onQueryChange:(value:string)=>void;goTo:(route:Route)=>void;bagCount:number;notice:(value:string)=>void;
}) {
  const searchRef=useRef<HTMLInputElement>(null);
  return (
    <header className="dt-header">
      <BrandLogo />
      <button className="dt-location" type="button" onClick={()=>notice("Address selection is a preview in Phase 1. Live serviceability comes in Phase 2.")} aria-label="Deliver to Home, Juja, Kiambu County">
        <MapPin size={24} fill="currentColor" strokeWidth={2.7} aria-hidden="true"/>
        <span><small>Deliver to</small><strong>{previewLocation.shortLabel}</strong><small>{previewLocation.district}</small></span>
        <ChevronDown size={16} aria-hidden="true"/>
      </button>
      <div className="dt-search-wrap">
        <Search size={23} strokeWidth={2} aria-hidden="true"/>
        <input
          ref={searchRef}
          aria-label="Search restaurants, dishes or cuisines"
          placeholder="Search for restaurants, dishes or cuisines..."
          value={query}
          onFocus={()=>goTo("search")}
          onChange={event=>{onQueryChange(event.target.value);goTo("search");}}
        />
        {query && <IconButton label="Clear search" onClick={()=>{onQueryChange("");searchRef.current?.focus();}}><X size={18}/></IconButton>}
      </div>
      <div className="dt-header-actions">
        <button className="dt-bell" aria-label="Notifications" type="button" onClick={()=>goTo("notifications")}>
          <Bell size={23}/><span className="dt-unread-dot"/>
        </button>
        <button className="dt-profile-trigger" type="button" onClick={()=>goTo("profile")}>
          <span className="dt-avatar">T</span><strong>Test User</strong><ChevronDown size={17}/>
        </button>
        <Button className="dt-header-cart" onClick={()=>goTo("bag")} startIcon={<ShoppingBag size={23}/>} >
          <span className="dt-cart-count" aria-label={`${bagCount} items in preview bag`}>{bagCount}</span>
          Cart
        </Button>
      </div>
    </header>
  );
}

function Sidebar({active,goTo,open,onClose,bagCount}:{
  active:Route;goTo:(route:Route)=>void;open:boolean;onClose:()=>void;bagCount:number;
}) {
  return (
    <>
      {open && <button aria-label="Close navigation menu" className="dt-sidebar-scrim" onClick={onClose}/>}
      <aside className={classNames("dt-sidebar",open&&"dt-sidebar--open")} aria-label="Main navigation">
        <nav className="dt-sidebar-links" aria-label="Main navigation">
          {routes.map(({id,label,icon:Icon})=>(
            <button key={id} className={classNames("dt-nav-link",active===id&&"dt-nav-link--active")}
              type="button" aria-current={active===id?"page":undefined}
              onClick={()=>{goTo(id);onClose();}}>
              <Icon size={22} strokeWidth={2} aria-hidden="true"/><span>{label}</span>
              {id==="bag"&&bagCount>0&&<span className="dt-nav-count">{bagCount}</span>}
            </button>
          ))}
        </nav>
        <div className="dt-sidebar-footer"><span className="dt-preview-light"/> Design preview <small>Backend not connected</small></div>
      </aside>
    </>
  );
}

function HeroBanner({notice}: {notice:(value:string)=>void}) {
  const [slide,setSlide]=useState(0);
  const slides=[
    {eyebrow:"SPECIAL OFFER", title:"Tasty meals, faster", description:"Enjoy great food from your favourite restaurants with fast and reliable delivery.", cta:"Order now"},
    {eyebrow:"YOUR NEXT CRAVING",title:"Fresh food, delivered",description:"Find your favourite dishes from the kitchens around your neighborhood.",cta:"Explore nearby"},
    {eyebrow:"MADE FOR YOUR CITY",title:"Food worth sharing",description:"Explore familiar favourites and discover something delicious.",cta:"Find restaurants"},
  ];
  const current=slides[slide];
  return (
    <section className="dt-hero" aria-label="Featured DeeToo offers (visual preview)">
      <div className="dt-hero-copy" key={slide}>
        <span className="dt-hero-eyebrow">{current.eyebrow}</span>
        <h2>{current.title}</h2>
        <p>{current.description}</p>
        <Button variant="outline" className="dt-hero-cta" endIcon={<ArrowRight size={17}/>} onClick={()=>notice("Offer is for the visual prototype. Live promotions are mapped in Phase 2.")}>{current.cta}</Button>
      </div>
      <div className="dt-hero-photo" aria-hidden="true"><FoodArt kind="Burgers" hero /><img src={heroBurger} alt="" onError={event => {event.currentTarget.style.display="none";}} /></div>
      <div className="dt-hero-decoration" aria-hidden="true"><span className="dt-hero-flash">✦</span><span className="dt-hero-flash">✦</span></div>
      <div className="dt-hero-offer" aria-hidden="true"><strong>Free<br/>delivery</strong><small>on selected<br/>restaurants</small></div>
      <div className="dt-carousel-dots" aria-label="Promotional slides">
        {slides.map((item,index)=><button type="button" key={item.title} onClick={()=>setSlide(index)}
          aria-label={`Show promotion ${index+1}`} aria-current={slide===index?"true":undefined}/>)}
      </div>
    </section>
  );
}

function CategoryStrip({active,onSelect}: {active:"All"|Cuisine;onSelect:(value:"All"|Cuisine)=>void}) {
  return (
    <div className="dt-category-list" role="group" aria-label="Filter restaurants by category">
      {categories.map(({label,icon})=><button key={label} type="button"
        aria-pressed={active===label} className={classNames("dt-category",active===label&&"dt-category--selected")}
        onClick={()=>onSelect(label)}>
        <span className="dt-category-icon" aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </button>)}
    </div>
  );
}

function Filters({sort,onSortChange,onlyOpen,onOpenChange,active,isSearch,onReset,notice}:{
  sort:Sort;onSortChange:(sort:Sort)=>void;onlyOpen:boolean;onOpenChange:(value:boolean)=>void;
  active:"All"|Cuisine;isSearch:boolean;onReset:()=>void;notice:(value:string)=>void;
}) {
  const selectId=useId();
  return (
    <div className="dt-filter-list" role="group" aria-label="Restaurant filters">
      <label className="dt-filter-select" htmlFor={selectId}><span>Sort by</span>
        <select id={selectId} value={sort} onChange={event=>onSortChange(event.target.value as Sort)}>
          <option value="recommended">Relevance</option><option value="rating">Top rated</option>
          <option value="fastest">Fastest delivery</option><option value="nearest">Nearest</option>
        </select><ChevronDown size={15} aria-hidden="true"/>
      </label>
      <button type="button" className="dt-filter-pill" onClick={()=>notice("Delivery-time filter will use the backend's verified ETA capabilities in Phase 2.")}><Clock3 size={17}/> Delivery time <ChevronDown size={15}/></button>
      <button type="button" className="dt-filter-pill" onClick={()=>notice("Cuisine filter is available through the categories above.")}><UtensilsCrossed size={17}/> {active==="All"?"Cuisine":active} <ChevronDown size={15}/></button>
      <button type="button" className="dt-filter-pill" onClick={()=>notice("Price-range filtering requires the restaurant search contract in Phase 2.")}><Tag size={17}/> Price range <ChevronDown size={15}/></button>
      <button type="button" className="dt-filter-pill" onClick={()=>notice("Promotions shown here are visual fixtures; backend eligibility is integrated later.")}><Tag size={17}/> Offers <ChevronDown size={15}/></button>
      <button type="button" className="dt-filter-pill" onClick={()=>onSortChange("rating")}><Star size={17}/> Rating <ChevronDown size={15}/></button>
      {isSearch ? (
        <button type="button" className={classNames("dt-filter-pill dt-open-toggle",onlyOpen&&"dt-open-toggle--on")} aria-pressed={onlyOpen} onClick={()=>onOpenChange(!onlyOpen)}>
          <span className="dt-switch"><span/></span> Open now
        </button>
      ) : (
        <button type="button" className="dt-filter-reset" onClick={onReset}>Reset</button>
      )}
    </div>
  );
}

function RestaurantCard({restaurant,favourite,onToggleFavourite,onSelect,index}: {
  restaurant:PreviewRestaurant;favourite:boolean;onToggleFavourite:()=>void;onSelect:()=>void;index:number;
}) {
  return (
    <article className="dt-restaurant-card" style={{animationDelay:`${index*45}ms`}}>
      <button type="button" className="dt-restaurant-image-button" onClick={onSelect} aria-label={`Preview ${restaurant.name}`}>
        <span className="dt-photo-fallback"><FoodArt kind={restaurant.cuisines[0]} /></span>
        <img src={restaurant.image} alt={restaurant.imageAlt} loading={index<4?"eager":"lazy"} onError={event => {event.currentTarget.style.display="none";}}/>
        {restaurant.badge&&<span className={classNames("dt-restaurant-badge",restaurant.badgeColor==="mint"?"dt-restaurant-badge--mint":"dt-restaurant-badge--red")}>{restaurant.badge}</span>}
        <div className="dt-image-chips">
          <span><Clock3 size={13} aria-hidden="true"/> {restaurant.time[0]}–{restaurant.time[1]} min</span>
        </div>
      </button>
      <IconButton className={classNames("dt-favourite",favourite&&"dt-favourite--on")} label={favourite?`Remove ${restaurant.name} from favourites`:`Add ${restaurant.name} to favourites`} aria-pressed={favourite} onClick={onToggleFavourite}>
        <Heart size={20} fill={favourite?"currentColor":"none"}/>
      </IconButton>
      <button type="button" className="dt-restaurant-details" onClick={onSelect}>
        <strong>{restaurant.name}</strong>
        <div className="dt-rating"><Star size={15} fill="currentColor"/><b>{restaurant.rating.toFixed(1)}</b><span>({restaurant.reviews})</span></div>
        <p>{restaurant.cuisines.join(" · ")}</p>
        <div className="dt-restaurant-meta"><Clock3 size={14}/>{restaurant.time[0]}–{restaurant.time[1]} min<span className="dt-meta-separator">·</span><Truck size={14}/> Ksh {restaurant.feeKsh}</div>
        {restaurant.promo&&<Badge variant={restaurant.promo.includes("%")?"red":"mint"}>{restaurant.promo}</Badge>}
      </button>
    </article>
  );
}

const positions: Array<[number,number]> = [[13,20],[32,43],[53,23],[80,20],[89,53],[19,75],[65,68]];
function MapPreview({notice}: {notice:(value:string)=>void}) {
  return (
    <div className="dt-map" role="img" aria-label="Illustrative preview of restaurants around Juja, Kenya; not a live map">
      <div className="dt-map-roads" aria-hidden="true">
        <svg viewBox="0 0 360 280" preserveAspectRatio="none">
          <g fill="none" stroke="#fff" strokeWidth="10" opacity=".96"><path d="M-10 22L380 233M-20 183L380 40M55 -15L148 300M200 -20L262 315M-30 129L375 121"/></g>
          <g fill="none" stroke="#d5dedb" strokeWidth="1.5"><path d="M-10 22L380 233M-20 183L380 40M55 -15L148 300M200 -20L262 315M-30 129L375 121"/></g>
          <path d="M-5 274L360 0" stroke="#fae0a8" strokeWidth="7" fill="none"/><path d="M-5 274L360 0" stroke="#fff4da" strokeWidth="2" fill="none"/>
        </svg>
      </div>
      <span className="dt-map-city">Juja</span><span className="dt-map-mall">Juja City Mall</span>
      <span className="dt-map-user" aria-label="Sample current location" style={{left:"49%",top:"42%"}}/>
      {positions.map(([x,y],i)=><span key={i} className="dt-map-pin" style={{left:`${x}%`,top:`${y}%`}} aria-hidden="true"><UtensilsCrossed size={16}/></span>)}
      <button type="button" className="dt-map-search" onClick={()=>notice("Search this area will connect to serviceable geographic search in Phase 2.")}><LocateFixed size={17}/> Search this area</button>
      <small className="dt-map-preview">Preview map</small>
    </div>
  );
}

function RightRail({goTo,notice,onSelectRestaurant}: {goTo:(route:Route)=>void;notice:(value:string)=>void;onSelectRestaurant:(id:string)=>void}) {
  return (
    <aside className="dt-right-rail" aria-label="Nearby restaurants and suggestions">
      <Panel className="dt-rail-map"><MapPreview notice={notice}/></Panel>
      <Panel className="dt-referral">
        <div className="dt-gift" aria-hidden="true"><Gift size={28}/></div>
        <div><strong>Refer a friend</strong><p>Give Ksh 200, Get Ksh 200</p><small>Share your code and earn rewards.</small></div>
        <IconButton label="Referral programme preview" onClick={()=>notice("Referral rewards are a design preview until the referral ledger is implemented.")}><ArrowRight size={18}/></IconButton>
      </Panel>
      <Panel className="dt-top-picks">
        <div className="dt-panel-heading"><h3>Top picks for you</h3><button type="button" onClick={()=>goTo("search")}>See all <ArrowRight size={16}/></button></div>
        {previewRestaurants.slice(0,3).map(r=><button type="button" className="dt-pick" key={r.id} onClick={()=>onSelectRestaurant(r.id)}>
          <span className="dt-pick-photo"><FoodArt kind={r.cuisines[0]}/><img src={r.image} alt="" loading="lazy" onError={event => {event.currentTarget.style.display="none";}} /></span><div><strong>{r.name}</strong><small>{r.cuisines[0]} · Ksh {r.feeKsh}</small></div><span><Star size={13} fill="currentColor"/>{r.rating.toFixed(1)}</span>
        </button>)}
      </Panel>
      <Panel className="dt-hungry">
        <div className="dt-hungry-icon"><Zap size={24} fill="currentColor"/></div>
        <div><strong>Hungry now?</strong><p>Find restaurants with the fastest delivery near you.</p></div>
        <IconButton label="Find faster restaurants" onClick={()=>goTo("search")}><ArrowRight size={17}/></IconButton>
      </Panel>
    </aside>
  );
}

function Discovery({isSearch,query,onQueryChange,goTo,notice,onSelectRestaurant}:{
  isSearch:boolean;query:string;onQueryChange:(value:string)=>void;goTo:(route:Route)=>void;notice:(value:string)=>void;onSelectRestaurant:(id:string)=>void;
}) {
  const [selectedCategory,setSelectedCategory]=useState<"All"|Cuisine>("All");
  const [sort,setSort]=useState<Sort>("recommended");
  const [onlyOpen,setOnlyOpen]=useState(false);
  const [view,setView]=useState<View>("grid");
  const [favourites,setFavourites]=useState<string[]>([]);

  const restaurants=useMemo(()=>{
    let items=previewRestaurants.filter(r=>selectedCategory==="All"||r.cuisines.includes(selectedCategory));
    const search=query.trim().toLowerCase();
    if(isSearch&&search)items=items.filter(r=>r.name.toLowerCase().includes(search)||r.cuisines.some(c=>c.toLowerCase().includes(search)));
    if(onlyOpen)items=items.filter(()=>true); // All demo merchants are open; production open-hours logic in phase 2.
    if(sort==="rating")items=[...items].sort((a,b)=>b.rating-a.rating);
    if(sort==="fastest")items=[...items].sort((a,b)=>a.time[0]-b.time[0]);
    if(sort==="nearest")items=[...items].sort((a,b)=>a.distanceKm-b.distanceKm);
    return items;
  },[selectedCategory,sort,onlyOpen,isSearch,query]);

  return (
    <div className="dt-discovery-layout">
      <div className="dt-discovery-left">
        <div className="dt-page-heading">
          <div><h1>{isSearch?"Find your next craving":"Discover restaurants"}</h1><p>{isSearch?"Search for restaurants, dishes or cuisines around Juja.":"Delicious food from the best restaurants near you."}</p></div>
          <div className="dt-heading-actions">
            <Button variant={view==="map"?"soft":"outline"} size="sm" onClick={()=>setView("map")} startIcon={<MapPin size={17}/>}>Map view</Button>
            <Button variant={view==="grid"?"soft":"outline"} size="sm" onClick={()=>setView("grid")} startIcon={<List size={17}/>}>List view</Button>
          </div>
        </div>
        {isSearch ? (
          <section className="dt-search-hero"><span>SEARCH DEETOO</span><h2>Find exactly what<br/><em>you’re craving</em></h2><p>Search for restaurants, dishes or cuisines across Juja and nearby areas.</p><div aria-hidden="true" className="dt-search-hero-food"><FoodArt kind="Burgers" hero /><img src={heroBurger} alt="" onError={event => {event.currentTarget.style.display="none";}}/></div></section>
        ) : <HeroBanner notice={notice}/>}
        <CategoryStrip active={selectedCategory} onSelect={setSelectedCategory}/>
        <Filters sort={sort} onSortChange={setSort} onlyOpen={onlyOpen} onOpenChange={setOnlyOpen} active={selectedCategory} isSearch={isSearch} onReset={()=>{setSelectedCategory("All");setSort("recommended");setOnlyOpen(false);onQueryChange("");}} notice={notice}/>
        {isSearch && <div className="dt-results-label"><strong>{`${restaurants.length} restaurants found${query ? ` for “${query}”` : ""}`}</strong><span>Preview listings · Juja</span></div>}
        {view==="map"&&<div className="dt-main-map"><MapPreview notice={notice}/></div>}
        {restaurants.length>0 ? (
          <div className="dt-restaurants">
            {restaurants.map((restaurant,index)=><RestaurantCard key={restaurant.id} restaurant={restaurant} index={index}
              favourite={favourites.includes(restaurant.id)}
              onToggleFavourite={()=>setFavourites(prev=>prev.includes(restaurant.id)?prev.filter(id=>id!==restaurant.id):[...prev,restaurant.id])}
              onSelect={()=>onSelectRestaurant(restaurant.id)}/>)}
          </div>
        ) : (
          <div className="dt-no-results"><Search size={32}/><h2>No matching restaurants</h2><p>Try another dish or cuisine, or clear your filters.</p><Button onClick={()=>{setSelectedCategory("All");onQueryChange("");}}>Clear filters</Button></div>
        )}
      </div>
      <RightRail goTo={goTo} notice={notice} onSelectRestaurant={onSelectRestaurant}/>
    </div>
  );
}

const upcoming:Record<Exclude<Route,"discover"|"search"|"restaurant"|"checkout">,{title:string;body:string;stage:string}> = {
  bag:{title:"Your bag",body:"A separate shopping bag, empty state and checkout are scheduled for the Shopping wave.",stage:"Screens 05–07"},
  orders:{title:"Orders & tracking",body:"Order history, rider tracking and completed delivery interfaces follow in the Delivery wave.",stage:"Screens 08–10"},
  profile:{title:"My profile",body:"Profile, saved addresses and preferences will be reconstructed after the shopping and delivery screens.",stage:"Screen 11"},
  security:{title:"Security & devices",body:"The visual preview will show real security state only after the auth adapter is connected.",stage:"Screen 12"},
  notifications:{title:"Notifications Center",body:"Notification types and preferences will be reconstructed and mapped to their respective APIs.",stage:"Screen 13"},
  support:{title:"Help & Support",body:"The dedicated ticket dashboard and conversation views come in the Support wave.",stage:"Screens 14–15"},
};

function UpcomingScreen({route,goTo}: {route:Exclude<Route,"discover"|"search"|"restaurant"|"checkout">;goTo:(route:Route)=>void}) {
  const item=upcoming[route];
  return (
    <section className="dt-upcoming">
      <Badge>Upcoming design wave</Badge>
      <h1>{item.title}</h1>
      <p>{item.body}</p><strong>{item.stage}</strong>
      <Button onClick={()=>goTo("discover")} startIcon={<Compass size={17}/>}>Return to Discover</Button>
    </section>
  );
}

export function App() {
  const [route,setRoute]=useState<Route>(()=>routeFromPath(window.location.pathname));
  const [query,setQuery]=useState("");
  const [notice,setNotice]=useState<string|null>(null);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [restaurantId,setRestaurantId]=useState("smash");
  const [cart,setCart]=useState<CartLine[]>([]);
  const bagCount=cart.reduce((total,line)=>total+line.quantity,0);
  useEffect(()=>{
    const onPop=()=>setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate",onPop);
    return ()=>window.removeEventListener("popstate",onPop);
  },[]);
  useEffect(()=>{
    if(!notice)return;
    const id=window.setTimeout(()=>setNotice(null),4400);
    return ()=>window.clearTimeout(id);
  },[notice]);
  const goTo=(next:Route)=>{
    setRoute(next);
    const url=next==="restaurant"?"/restaurant":next==="checkout"?"/checkout":routes.find(item=>item.id===next)?.path || "/";
    if(window.location.pathname!==url)window.history.pushState({},"",url);
    window.scrollTo({top:0,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  };
  const selectRestaurant=(id:string)=>{setRestaurantId(id);goTo("restaurant");};
  const addToCart=(line:CartLine)=>{
    setCart(current=>{
      const exists=current.find(item=>item.key===line.key);
      return exists?current.map(item=>item.key===line.key?{...item,quantity:item.quantity+line.quantity}:item):[...current,line];
    });
    setNotice("Added to your demo bag. Review it whenever you're ready.");
  };
  const updateCart=(key:string,quantity:number)=>setCart(current=>current.map(item=>item.key===key?{...item,quantity}:item).filter(item=>item.quantity>0));
  return (
    <div className="dt-app">
      <Header query={query} onQueryChange={setQuery} goTo={goTo} bagCount={bagCount} notice={setNotice}/>
      <Sidebar active={route==="restaurant"?"discover":route==="checkout"?"bag":route} goTo={goTo} open={mobileOpen} onClose={()=>setMobileOpen(false)} bagCount={bagCount}/>
      <main className="dt-main" id="main-content">
        <button className="dt-mobile-menu" aria-label="Open navigation menu" onClick={()=>setMobileOpen(true)} type="button"><Menu size={21}/> Menu</button>
        {route==="discover"||route==="search" ? <Discovery isSearch={route==="search"} query={query} onQueryChange={setQuery} goTo={goTo} notice={setNotice} onSelectRestaurant={selectRestaurant}/> : route==="restaurant"||route==="bag"||route==="checkout" ? <ShoppingPreview screen={route} restaurantId={restaurantId} cart={cart} onAdd={addToCart} onUpdate={updateCart} onClear={()=>setCart([])} onNavigate={goTo} onNotice={setNotice}/> : <UpcomingScreen route={route} goTo={goTo}/>}
      </main>
      {notice&&<div className="dt-notice" role="status" aria-live="polite"><span className="dt-notice-dot"><Check size={16}/></span><span>{notice}</span><IconButton label="Dismiss message" onClick={()=>setNotice(null)}><X size={17}/></IconButton></div>}
    </div>
  );
}
