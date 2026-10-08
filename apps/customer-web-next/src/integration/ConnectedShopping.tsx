import {useCallback,useMemo,useState} from "react";
import type {PublicRestaurantBranch,PublicRestaurantMenu,PublicMenuItem,EnrichedCart,CheckoutQuote,CustomerAddress} from "@deetoo/types";
import {AuthProvider,useAuth} from "@deetoo/auth-web";
import {ArrowLeft,ArrowRight,Bell,Check,Clock3,MapPin,Search,ShoppingBag,ShieldCheck,Plus,Minus,X,RefreshCw} from "lucide-react";
import {createCustomerGateway} from "./customer-gateway";
import {backendError,useBackendResource} from "./resource";

type Screen="discover"|"search"|"restaurant"|"bag"|"checkout";
const money=(n:number)=>"Ksh "+(n/100).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
const validCoordinates=(x:number,y:number)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=-90&&x<=90&&y>=-180&&y<=180;
function Notice({message,onDismiss}:{message:string;onDismiss:()=>void}){return <div className="dt-notice" role="alert"><span>{message}</span><button aria-label="Dismiss message" onClick={onDismiss}><X size={17}/></button></div>;}
function Gate(){
 const {apiClient,user,isAuthenticated,isLoading,login,logout}=useAuth();
 const gateway=useMemo(()=>createCustomerGateway(apiClient),[apiClient]);
 const [screen,setScreen]=useState<Screen>("discover");
 const [search,setSearch]=useState("");
 const [category,setCategory]=useState("");
 const [openOnly,setOpenOnly]=useState(false);
 const [branchId,setBranchId]=useState("");
 const [choice,setChoice]=useState<PublicMenuItem|null>(null);
 const [quantity,setQuantity]=useState(1);
 const [modifiers,setModifiers]=useState<Record<string,string[]>>({});
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [credentials,setCredentials]=useState({identifier:"",password:""});
 const [location,setLocation]=useState<{lat:number;lng:number}|null>(null);
 const [addressId,setAddressId]=useState("");
 const [promo,setPromo]=useState("");
 const [notes,setNotes]=useState("");
 const [quote,setQuote]=useState<CheckoutQuote|null>(null);
 const [paymentMethod,setPaymentMethod]=useState<"MPESA"|"CARD">("MPESA");
 const customer=isAuthenticated&&user?.roles.some(x=>String(x).toLowerCase()==="customer");
 const discovery=useBackendResource(()=>gateway.discovery.restaurants({...(location?{latitude:location.lat,longitude:location.lng}:{}),search:search||undefined,category:category||undefined,open_now:openOnly,page:1,limit:30}),true,[search,category,openOnly,location?.lat,location?.lng]);
 const categories=useBackendResource(()=>gateway.discovery.categories(),true,[]);
 const detail=useBackendResource(()=>gateway.discovery.restaurant(branchId,location?.lat,location?.lng),Boolean(branchId),[branchId,location?.lat,location?.lng]);
 const menu=useBackendResource(()=>gateway.discovery.menu(branchId),Boolean(branchId),[branchId]);
 const cart=useBackendResource(()=>gateway.cart.read(),Boolean(customer),[user?.id]);
 const addresses=useBackendResource(()=>gateway.account.addresses(),Boolean(customer),[user?.id]);
 const service=useBackendResource(()=>gateway.discovery.serviceability(location!.lat,location!.lng),Boolean(location),[location?.lat,location?.lng]);
 const currentCart=cart.state.status==="ready"?cart.state.data:null;
 const addressList=addresses.state.status==="ready"?addresses.state.data:[] as CustomerAddress[];
 const nav=(next:Screen)=>{setScreen(next);setMessage("");if(next==="bag"||next==="checkout")cart.refresh();if(next==="checkout"){addresses.refresh();setQuote(null);} };
 const run=async<T,>(action:()=>Promise<T>,success:(result:T)=>void)=>{
   if(busy)return;setBusy(true);setMessage("");
   try{success(await action());}catch(error){setMessage(backendError(error).message);}finally{setBusy(false);}
 };
 const chooseRestaurant=(id:string)=>{setBranchId(id);setChoice(null);nav("restaurant");};
 const locate=()=>{if(!navigator.geolocation){setMessage("This browser cannot provide a location.");return;}navigator.geolocation.getCurrentPosition(
   p=>{const {latitude:lat,longitude:lng}=p.coords;if(validCoordinates(lat,lng))setLocation({lat,lng});else setMessage("Could not verify your location.");},
   ()=>setMessage("Location permission was not granted. You can still browse, but delivery serviceability must be verified before checkout."),{enableHighAccuracy:false,timeout:12000,maximumAge:60000});
 };
 const selectedOptions=Object.values(modifiers).flat();
 const selectionValid=Boolean(choice)&&choice!.modifier_groups.every(g=>{
   const n=(modifiers[g.id]||[]).length;return n>=g.min_selections&&n<=g.max_selections;
 });
 const resetChoice=()=>{setChoice(null);setQuantity(1);setModifiers({});};
 const addItem=()=>{if(!choice||!selectionValid||!branchId)return;run(()=>gateway.cart.add({branch_id:branchId,menu_item_id:choice.id,quantity,modifier_option_ids:selectedOptions}),()=>{
   resetChoice();cart.refresh();setMessage("Item added to your bag.");});};
 const requestQuote=()=>{if(!addressId){setMessage("Choose a verified delivery address first.");return;}run(()=>gateway.cart.quote({address_id:addressId,payment_method:paymentMethod,notes}),value=>{setQuote(value);setMessage("Quote verified. The displayed total is issued by DeeToo.");});};
 const verifyPayment=()=>{setMessage("Payment authorization is not yet certified for this new frontend. No order has been placed or charged.");};
 const status=(state:{status:string;message?:string},retry?:()=>void)=>
   state.status==="loading"?<div className="dt-live-state" role="status">Loading real DeeToo information…</div>:
   state.status==="error"?<div className="dt-live-state" role="alert">{state.message}<button onClick={retry}>Try again</button></div>:null;
 const disabled=busy;
 if(isLoading)return <div className="dt-live-auth">Checking your session…</div>;
 return <div className="dt-app dt-live-app">
 <header className="dt-header">
  <div className="dt-brand"><div className="dt-brand-symbol"><span>➤</span></div><div className="dt-brand-title"><strong>DeeToo</strong><small>Food delivery, made for you</small></div></div>
  <button className="dt-location" onClick={locate}><MapPin/><span><small>Deliver to</small><strong>{location?"Current location":"Choose location"}</strong><small>{location?location.lat.toFixed(4)+", "+location.lng.toFixed(4):"Location not verified"}</small></span></button>
  <div className="dt-search-wrap"><Search/><input aria-label="Search restaurants or cuisines" placeholder="Search for restaurants, dishes or cuisines…" value={search} onFocus={()=>setScreen("search")} onChange={e=>{setSearch(e.target.value);setScreen("search");}} /></div>
  <div className="dt-header-actions"><button className="dt-bell" title="Notifications available in a later phase"><Bell/></button>
  <span className="dt-profile-trigger">{customer?user?.name||"Customer":"Guest"}</span>
  {customer?<button onClick={()=>void logout()} className="dt-live-logout">Sign out</button>:null}
  <button className="dt-header-cart dt-live-primary" onClick={()=>nav("bag")}><ShoppingBag size={20}/> Bag {currentCart?.total_quantity??0}</button></div>
 </header>
 <aside className="dt-sidebar"><nav className="dt-sidebar-links">
  {([["discover","Discover"],["search","Search"],["bag","Your bag"],["checkout","Checkout"]] as const).map(([id,label])=><button key={id} className={"dt-nav-link "+(screen===id?"dt-nav-link--active":"")} onClick={()=>nav(id)}><span>{label}</span></button>)}
  </nav><div className="dt-sidebar-footer"><span className="dt-preview-light"/> Connected customer shopping <small>Server-authoritative prices and availability</small></div></aside>
 <main className="dt-main dt-live-main">
 {!customer&&<section className="dt-live-guest"><ShieldCheck size={18}/> Browsing real restaurants. Sign in to use your bag or checkout.
 <form onSubmit={e=>{e.preventDefault();run(()=>login(credentials.identifier,credentials.password),()=>{setCredentials({identifier:"",password:""});cart.refresh();});}}>
 <input aria-label="Email or phone" autoComplete="username" placeholder="Phone or email" required value={credentials.identifier} onChange={e=>setCredentials({...credentials,identifier:e.target.value})}/>
 <input aria-label="Password" type="password" autoComplete="current-password" placeholder="Password" required value={credentials.password} onChange={e=>setCredentials({...credentials,password:e.target.value})}/>
 <button disabled={disabled}>Sign in</button></form></section>}
 {location&&service.state.status==="ready"&&!service.state.data.serviceable&&<div className="dt-live-state" role="status">Delivery to this location is currently outside DeeToo's active service zones. Browse only; checkout remains unavailable.</div>}
 {(screen==="discover"||screen==="search")&&<section className="dt-live-discover">
  <div className="dt-page-heading"><div><h1>{screen==="search"?"Find what you're craving":"Discover restaurants"}</h1><p>Explore DeeToo restaurants available from the live catalogue.</p></div><button className="dt-live-secondary" onClick={locate}><MapPin size={17}/> Set delivery location</button></div>
  <div className="dt-hero"><div className="dt-hero-copy"><span className="dt-hero-eyebrow">DEETOO · FOOD DELIVERY</span><h2>Tasty meals, faster</h2><p>Find food from nearby kitchens. Actual availability is confirmed by the restaurant.</p></div></div>
  <div className="dt-live-filters"><button className={!category?"dt-live-selected":""} onClick={()=>setCategory("")}>All</button>
   {categories.state.status==="ready"&&categories.state.data.map(c=><button key={c.id} onClick={()=>setCategory(c.id)} className={category===c.id?"dt-live-selected":""}>{c.name}</button>)}
   <label><input type="checkbox" checked={openOnly} onChange={e=>setOpenOnly(e.target.checked)}/> Open now</label></div>
  {status(discovery.state,discovery.refresh)}
  {discovery.state.status==="empty"&&<div className="dt-live-state">No restaurants match your search or service area.</div>}
  {discovery.state.status==="ready"&&<div className="dt-restaurants">{discovery.state.data.map(branch=><article className="dt-restaurant-card" key={branch.branch_id}>
  <button className="dt-restaurant-image-button" onClick={()=>chooseRestaurant(branch.branch_id)}>{branch.cover_url?<img src={branch.cover_url} alt="" loading="lazy"/>:<div className="dt-live-no-photo"><ShoppingBag size={32}/></div>}</button>
  <button className="dt-restaurant-body dt-live-restaurant-body" onClick={()=>chooseRestaurant(branch.branch_id)}>
  <strong>{branch.merchant_name}</strong><span>{branch.branch_name} · {branch.categories.join(" · ")}</span>
  <span>{branch.address_text}</span><span>{branch.is_open_now?"Open":"Closed"} · {branch.prep_default_min} min preparation</span>
  {branch.distance_km!=null&&<span>{branch.distance_km.toFixed(1)} km</span>}</button></article>)}</div>}
 </section>}
 {screen==="restaurant"&&<section>
  <button className="dt-live-back" onClick={()=>nav("discover")}><ArrowLeft size={17}/> Back to restaurants</button>
  {status(detail.state,detail.refresh)}{status(menu.state,menu.refresh)}
  {detail.state.status==="ready"&&<div className="dt-live-restaurant-hero"><h1>{detail.state.data.merchant.display_name}</h1><p>{detail.state.data.branch.branch_name} · {detail.state.data.branch.address_text}</p><p>{detail.state.data.branch.is_open_now?"Open now":"Restaurant closed"} {detail.state.data.branch.serviceable?"· Delivery available":"· Serviceability not confirmed"}</p></div>}
  {menu.state.status==="ready"&&menu.state.data.categories.map(c=><section key={c.id}><h2>{c.name}</h2>{c.description&&<p>{c.description}</p>}<div className="dt-live-menu-grid">{c.items.map(item=><article className="dt-live-menu-item" key={item.id}>{item.image_url&&<img src={item.image_url} alt="" loading="lazy"/>}<div><h3>{item.name}</h3><p>{item.description}</p><strong>{money(item.price_minor)}</strong></div><button disabled={!item.is_available||!customer||disabled} onClick={()=>{setChoice(item);setQuantity(1);setModifiers({});}}>{item.is_available?"Customize +":"Unavailable"}</button></article>)}</div></section>)}
 </section>}
 {screen==="bag"&&<section><h1>Your bag</h1>{!customer?<p>Sign in to view your DeeToo bag.</p>:<>{status(cart.state,cart.refresh)}{cart.state.status==="empty"&&<div className="dt-live-empty"><ShoppingBag size={60}/><h2>Your bag is empty</h2><p>Explore restaurants and add something delicious.</p><button onClick={()=>nav("discover")}>Explore restaurants</button></div>}
 {currentCart&&<div className="dt-live-two"><div><h2>{currentCart.branch.merchant_name} · {currentCart.branch.name}</h2>
 {currentCart.warnings.map((w,i)=><p className="dt-live-warning" key={i} role="alert">{w.message}</p>)}
 {currentCart.items.map(item=><div className="dt-live-bag-line" key={item.id}>{item.item_image_url&&<img src={item.item_image_url} alt=""/>}<div><strong>{item.item_name}</strong><small>{item.modifiers.map(m=>m.option_name).join(" · ")}</small><p>{money(item.line_total_minor)}</p>{item.price_changed&&<span className="dt-live-warning">Price changed</span>}</div><div className="dt-live-qty"><button disabled={disabled} onClick={()=>run(()=>item.quantity===1?gateway.cart.remove(item.id):gateway.cart.update(item.id,{quantity:item.quantity-1}),()=>cart.refresh())}><Minus size={16}/></button><span>{item.quantity}</span><button disabled={disabled} onClick={()=>run(()=>gateway.cart.update(item.id,{quantity:item.quantity+1}),()=>cart.refresh())}><Plus size={16}/></button></div></div>)}
 <div className="dt-live-promo"><input value={promo} onChange={e=>setPromo(e.target.value)} placeholder="Promotion code"/><button disabled={disabled||!promo.trim()} onClick={()=>run(()=>gateway.cart.promo(promo.trim()),()=>cart.refresh())}>Apply</button></div></div>
 <aside className="dt-live-summary"><h2>Order summary</h2><p>Items subtotal <strong>{money(currentCart.pricing.subtotal_minor)}</strong></p><p>Estimated delivery <strong>{money(currentCart.pricing.estimated_delivery_fee_minor)}</strong></p><p>Estimated service fee <strong>{money(currentCart.pricing.estimated_service_fee_minor)}</strong></p><p>Discount <strong>-{money(currentCart.pricing.discount_minor)}</strong></p><h3>Estimated total <strong>{money(currentCart.pricing.estimated_total_minor)}</strong></h3>
 <button className="dt-live-primary" disabled={disabled||currentCart.warnings.length>0||currentCart.items.some(i=>!i.is_available)} onClick={()=>nav("checkout")}>Proceed to checkout <ArrowRight size={16}/></button><small>Final pricing is confirmed by a fresh backend checkout quote.</small></aside></div>}</>}</section>}
 {screen==="checkout"&&<section><button className="dt-live-back" onClick={()=>nav("bag")}><ArrowLeft size={17}/> Back to bag</button><h1>Checkout</h1><p>Review your delivery address and payment method. Prices are issued by DeeToo.</p>
 {!customer?<div className="dt-live-state">Sign in to continue checkout.</div>:<div className="dt-live-two"><div className="dt-live-summary"><h2>1 · Delivery address</h2>{status(addresses.state,addresses.refresh)}
 {addressList.length===0&&<p>Add a real delivery address under your existing Customer account before continuing. No demo address is used.</p>}
 {addressList.map(a=><label className="dt-live-address" key={a.id}><input type="radio" name="address" checked={addressId===a.id} onChange={()=>{setAddressId(a.id);setQuote(null);}}/><div><strong>{a.label}</strong><p>{a.address_text}</p></div></label>)}
 <h2>2 · Payment method</h2><label className="dt-live-address"><input type="radio" checked={paymentMethod==="MPESA"} onChange={()=>{setPaymentMethod("MPESA");setQuote(null);}}/> M-PESA</label><label className="dt-live-address"><input type="radio" checked={paymentMethod==="CARD"} onChange={()=>{setPaymentMethod("CARD");setQuote(null);}}/> Card</label>
 <label>Delivery instructions<textarea value={notes} onChange={e=>{setNotes(e.target.value);setQuote(null);}} maxLength={500} placeholder="Gate, floor, landmark or handover instructions"/></label>
 <button className="dt-live-primary" onClick={requestQuote} disabled={disabled||!currentCart?.items.length||!addressId||currentCart.warnings.length>0}>Verify checkout quote <RefreshCw size={16}/></button>
 </div><aside className="dt-live-summary"><h2>3 · Review price</h2>{quote?<><p>Restaurant <strong>{quote.branch_name}</strong></p><p>Items <strong>{money(quote.net_subtotal_minor)}</strong></p><p>Delivery <strong>{money(quote.delivery_fee_minor)}</strong></p><p>Service <strong>{money(quote.service_fee_minor)}</strong></p><p>Tax <strong>{money(quote.tax_minor)}</strong></p><h3>Total to pay <strong>{money(quote.total_minor)}</strong></h3><p>Quote expires: {new Date(quote.expires_at).toLocaleTimeString("en-KE")}</p>
 <button className="dt-live-primary" disabled={disabled||new Date(quote.expires_at).getTime()<=Date.now()} onClick={verifyPayment}>Continue to payment <ArrowRight size={16}/></button>
 <small>Payment authorization and order placement remain locked pending an end-to-end transactional certification. No charge is triggered.</small></>:<p>Choose an address and verify the latest authoritative quote to display the final total.</p>}</aside></div>}</section>}
 </main>
 {choice&&<div className="dt-live-modal-backdrop" role="presentation"><section className="dt-live-modal" role="dialog" aria-modal="true" aria-label={"Customize "+choice.name}><button className="dt-live-close" onClick={resetChoice} aria-label="Close"><X/></button>{choice.image_url&&<img className="dt-live-modal-image" src={choice.image_url} alt=""/>}<h2>{choice.name}</h2><p>{choice.description}</p><strong>{money(choice.price_minor)}</strong>
 {choice.modifier_groups.map(g=><fieldset key={g.id}><legend>{g.name} ({g.min_selections===0?"Optional":g.min_selections+" required"})</legend>{g.options.map(o=><label key={o.id} className="dt-live-address"><input type={g.max_selections===1?"radio":"checkbox"} name={g.id} disabled={!o.is_available} checked={(modifiers[g.id]||[]).includes(o.id)} onChange={e=>setModifiers(current=>{const old=current[g.id]||[];const updated=g.max_selections===1?(e.target.checked?[o.id]:[]):e.target.checked?[...old.filter(id=>id!==o.id),o.id].slice(0,g.max_selections):old.filter(id=>id!==o.id);return {...current,[g.id]:updated};})}/><span>{o.name} {o.price_delta_minor>0?"+ "+money(o.price_delta_minor):""}</span></label>)}</fieldset>)}
 <div className="dt-live-qty"><button onClick={()=>setQuantity(n=>Math.max(1,n-1))}><Minus/></button><strong>{quantity}</strong><button onClick={()=>setQuantity(n=>Math.min(50,n+1))}><Plus/></button></div>
 <button className="dt-live-primary" disabled={!selectionValid||disabled} onClick={addItem}>Add to bag</button></section></div>}
 {message&&<Notice message={message} onDismiss={()=>setMessage("")}/>}
 </div>;
}
export function ConnectedShopping(){return <AuthProvider clientApp="customer"><Gate/></AuthProvider>;}
