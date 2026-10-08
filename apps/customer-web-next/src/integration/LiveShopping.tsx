import {useEffect,useRef,useState} from "react";
import {ArrowLeft,ArrowRight,Check,Clock3,CreditCard,Heart,House,Info,MapPin,Minus,Plus,RefreshCw,Search,ShieldCheck,ShoppingBag,Tag,Trash2,Truck,UtensilsCrossed,X} from "lucide-react";
import type {CustomerAddress,EnrichedCart,PublicMenuItem,PublicModifierGroup,PublicRestaurantMenu,CheckoutQuote,Payment,Order} from "@deetoo/types";
import {Badge,Button,IconButton,Panel,classNames} from "../../../../packages/customer-ui/src/index";
import type {CustomerGateway} from "./customer-gateway";
import {backendError,useBackendResource,type ResourceState} from "./resource";
import {money,SafePhoto,StatusPanel,ResourceView} from "./LiveUtilities";

type Screen="restaurant"|"bag"|"checkout"|"payment";
const paid=new Set(["CAPTURED"]);
const failed=new Set(["FAILED","CANCELLED","EXPIRED"]);
function Quantity({value,onChange,busy,min=0}:{value:number;onChange:(v:number)=>void;busy?:boolean;min?:number}){
 return <div className="dt-shop-quantity" aria-label="Quantity">
  <button disabled={busy||value<=min} aria-label="Decrease quantity" onClick={()=>onChange(Math.max(min,value-1))} type="button"><Minus size={15}/></button><strong>{value}</strong>
  <button disabled={busy||value>=99} aria-label="Increase quantity" onClick={()=>onChange(Math.min(99,value+1))} type="button"><Plus size={15}/></button>
 </div>;
}
function ProductDialog({item,onCancel,onAdd}:{item:PublicMenuItem;onCancel:()=>void;onAdd:(quantity:number,options:string[])=>Promise<void>}){
 const ref=useRef<HTMLDialogElement>(null);
 const [quantity,setQuantity]=useState(1);
 const [choices,setChoices]=useState<Record<string,string[]>>({});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{const element=ref.current;if(element&&!element.open)element.showModal();return()=>{if(element?.open)element.close();};},[]);
 const toggle=(group:PublicModifierGroup,id:string)=>{
  const prev=choices[group.id]||[];
  const next=prev.includes(id)?prev.filter(x=>x!==id):group.max_selections===1?[id]:prev.length<group.max_selections?[...prev,id]:prev;
  setChoices(v=>({...v,[group.id]:next}));setError("");
 };
 const valid=item.modifier_groups.every(g=>(choices[g.id]||[]).length>=g.min_selections&&(choices[g.id]||[]).length<=g.max_selections);
 const selected=item.modifier_groups.flatMap(g=>choices[g.id]||[]);
 const modifierMinor=item.modifier_groups.reduce((sum,g)=>sum+g.options.filter(o=>selected.includes(o.id)).reduce((n,o)=>n+o.price_delta_minor,0),0);
 const add=async()=>{if(!valid||busy)return;setBusy(true);setError("");try{await onAdd(quantity,selected);onCancel();}catch(err){setError(backendError(err).message);}finally{setBusy(false);}};
 return <dialog ref={ref} className="dt-product-dialog" onCancel={e=>{e.preventDefault();if(!busy)onCancel();}}>
   <div className="dt-product-dialog-grid"><div className="dt-product-gallery"><SafePhoto className="dt-product-large-photo" src={item.image_url} alt={item.name}/><div className="dt-product-thumbnails"><SafePhoto src={item.image_url} alt=""/></div></div>
    <div className="dt-product-editor"><div className="dt-product-editor-head"><div><h2>{item.name}</h2><p>Freshly prepared by this restaurant</p></div><IconButton label="Close product customization" disabled={busy} onClick={onCancel}><X size={20}/></IconButton></div>
     <div className="dt-product-options"><p className="dt-product-description">{item.description}</p><strong className="dt-product-main-price">{money(item.price_minor)}</strong>
     {item.modifier_groups.map(group=><section key={group.id}><div className="dt-product-group-title"><h3>{group.name}</h3>{group.min_selections>0?<Badge variant="red">Select at least {group.min_selections}</Badge>:<Badge>Optional</Badge>}</div><div className="dt-product-extra-list">{group.options.map(option=><label key={option.id} className={!option.is_available?"dt-live-disabled":""}>
       <input disabled={!option.is_available||busy} type={group.max_selections===1?"radio":"checkbox"} name={"modifier-"+group.id} aria-label={option.name} checked={(choices[group.id]||[]).includes(option.id)} onChange={()=>toggle(group,option.id)}/>
       <strong>{option.name}{!option.is_available?" · Unavailable":""}</strong><em>{option.price_delta_minor>0?"+ "+money(option.price_delta_minor):option.price_delta_minor<0?money(option.price_delta_minor):"Included"}</em></label>)}
      </div><p className="dt-live-option-help">Choose {group.min_selections}–{group.max_selections} options.</p></section>)}
     </div>
     {error&&<p className="dt-live-error" role="alert">{error}</p>}
     <div className="dt-product-editor-footer"><Quantity min={1} busy={busy} value={quantity} onChange={setQuantity}/><Button disabled={!valid||busy} className="dt-product-add" onClick={()=>void add()}>{busy?"Adding…":"Add to bag · "+money((item.price_minor+modifierMinor)*quantity)}</Button></div>
    </div>
   </div>
 </dialog>;
}
function MerchantStore({gateway,branchId,cart,onCartChanged,onBrowse,requestSignIn,isAuthenticated}:{gateway:CustomerGateway;branchId:string;cart:EnrichedCart|null;onCartChanged:()=>void;onBrowse:()=>void;requestSignIn:()=>void;isAuthenticated:boolean}){
 const branch=useBackendResource(()=>gateway.discovery.restaurant(branchId),Boolean(branchId),[branchId]);
 const menu=useBackendResource(()=>gateway.discovery.menu(branchId),Boolean(branchId),[branchId]);
 const [category,setCategory]=useState("all");
 const [search,setSearch]=useState("");
 const [active,setActive]=useState<PublicMenuItem|null>(null);
 const [tab,setTab]=useState("Menu");
 const [error,setError]=useState("");
 const [conflict,setConflict]=useState<{item:PublicMenuItem;qty:number;options:string[]}|null>(null);
 const cartTotal=cart?.pricing.estimated_total_minor;
 const add=async(qty:number,options:string[],force=false,item=active)=>{
  if(!item)return;
  if(!isAuthenticated){requestSignIn();throw new Error("Please sign in to add this item to your bag.");}
  try {await gateway.cart.add({branch_id:branchId,menu_item_id:item.id,quantity:qty,modifier_option_ids:options,force_clear_existing:force});setError("");setConflict(null);onCartChanged();}
  catch(err){
   const code=err&&typeof err==="object"&&"error" in err?(err as {error?:{code?:string}}).error?.code:"";
   if(!force&&cart&&cart.branch_id!==branchId||!force&&/BRANCH|CART.*MERCHANT/i.test(code||"")){setConflict({item,qty,options});setActive(null);throw new Error("Your bag contains items from another restaurant. Confirm replacement below.");}
   throw err;
  }
 };
 const detail=branch.state.status==="ready"?branch.state.data:null;
 return <div className="dt-storefront dt-screen-enter">
 <ResourceView resource={menu.state} onRetry={()=>{menu.refresh();branch.refresh();}} empty="Menu unavailable">
 {(data:PublicRestaurantMenu)=>{
 const entries=data.categories.flatMap(c=>c.items);
 const visible=data.categories.filter(c=>category==="all"||category===c.id).flatMap(c=>c.items).filter(i=>i.name.toLowerCase().includes(search.toLowerCase()));
 return <>
  <div className="dt-store-cover"><SafePhoto className="dt-store-cover-photo" src={detail?.branch.cover_url||data.merchant.logo_url} alt=""/><button className="dt-store-back" onClick={onBrowse}><ArrowLeft size={17}/> Back to results</button><div className="dt-store-identity"><div className="dt-store-logo">{data.merchant.display_name.slice(0,1)}</div><div><h1>{data.merchant.display_name}</h1><p>{data.branch.name}</p><div className="dt-store-info"><Badge variant={detail?.branch.is_open_now?"mint":"red"}>{detail?.branch.status_badge_text||data.branch.operational_status}</Badge>{detail&&<span><Clock3 size={15}/> Prep ~{detail.branch.prep_default_min} min</span>}<span><MapPin size={15}/> {data.branch.address_text}</span></div></div></div></div>
  <div className="dt-store-facts"><div><ShoppingBag size={20}/><span>Minimum order<small>{money(detail?.branch.min_order_minor||0)}</small></span></div><div><Truck size={21}/><span>Delivery fee<small>Calculated at checkout</small></span></div><div><Tag size={20}/><span>Promotions<small>Verified by DeeToo</small></span></div><div><Clock3 size={20}/><span>Availability<small>{detail?.branch.status_badge_text||data.branch.operational_status}</small></span></div></div>
  {detail?.serviceability&&!detail.serviceability.serviceable&&<Panel className="dt-live-alert" role="status">This branch may not deliver to your current address. Change your address before ordering.</Panel>}
  <div className="dt-store-tabs"><div role="tablist" aria-label="Restaurant information">{["Menu","About","Location"].map(t=><button role="tab" key={t} aria-selected={tab===t} onClick={()=>setTab(t)}>{t}</button>)}</div><div className="dt-store-menu-search"><Search size={17}/><input aria-label="Search menu items" placeholder="Search menu items…" value={search} onChange={e=>{setSearch(e.target.value);setTab("Menu");}}/></div></div>
  {tab==="Menu"?<div className="dt-store-body"><nav className="dt-store-categories" aria-label="Menu categories"><button aria-pressed={category==="all"} onClick={()=>setCategory("all")}><span>🍽️</span><strong>All items</strong><small>{entries.length}</small></button>{data.categories.map(c=><button key={c.id} aria-pressed={category===c.id} onClick={()=>setCategory(c.id)}><span>🍴</span><strong>{c.name}</strong><small>{c.items.length}</small></button>)}</nav>
    <section className="dt-store-products"><h2>{category==="all"?"All items":data.categories.find(c=>c.id===category)?.name}</h2><p>Live menu · items and prices verified by this restaurant.</p><div className="dt-store-product-grid">{visible.map(item=><article className="dt-product-card" key={item.id}><button type="button" className="dt-product-photo-button" disabled={!item.is_available} onClick={()=>setActive(item)} aria-label={"Customize "+item.name}><SafePhoto src={item.image_url} alt={item.name}/>{!item.is_available&&<Badge>Unavailable</Badge>}</button><div><h3>{item.name}</h3><p>{item.description}</p><footer><strong>{money(item.price_minor)}</strong><Button size="sm" disabled={!item.is_available||!detail?.branch.is_open_now} onClick={()=>setActive(item)} startIcon={<Plus size={15}/>}>Customize</Button></footer></div></article>)}</div>{!visible.length&&<Panel className="dt-store-no-items">No available menu items match your search.</Panel>}
    </section>
    <aside className="dt-shop-rail"><Panel className="dt-shop-cart-summary"><header><ShoppingBag size={20}/><h2>Your bag</h2><Badge>{cart?.total_quantity||0} items</Badge></header>{cart?.branch_id===branchId&&cart.items.map(i=><div className="dt-mini-cart-line" key={i.id}><SafePhoto src={i.item_image_url} className="dt-mini-cart-photo"/><div><strong>{i.item_name}</strong><small>{i.quantity} × {money(i.unit_total_price_minor)}</small></div></div>)}<dl className="dt-shop-fees"><div><dt>Items subtotal</dt><dd>{cart&&cart.branch_id===branchId?money(cart.pricing.subtotal_minor):"—"}</dd></div><div><dt>Delivery and service</dt><dd>Estimate in bag</dd></div></dl><div className="dt-shop-total"><span>Estimated total</span><strong>{cart&&cart.branch_id===branchId?money(cartTotal||0):"—"}</strong></div><Button className="dt-full-button" onClick={()=>window.location.assign("/bag")}>View bag <ArrowRight size={17}/></Button></Panel></aside>
   </div>:<Panel className="dt-store-tab-placeholder"><h2>{tab}</h2><p>{tab==="About"?data.merchant.description||"No additional restaurant description provided.":data.branch.address_text}</p><Button onClick={()=>setTab("Menu")}>Back to menu</Button></Panel>}
  {error&&<p className="dt-live-error" role="alert">{error}</p>}
  {conflict&&<Panel className="dt-live-conflict" role="alertdialog" aria-label="Replace bag confirmation"><h3>Replace your existing bag?</h3><p>DeeToo permits one restaurant per bag. Continuing clears the previous restaurant's items.</p><div><Button variant="outline" onClick={()=>setConflict(null)}>Keep my bag</Button><Button onClick={()=>void add(conflict.qty,conflict.options,true,conflict.item).catch(e=>setError(backendError(e).message))}>Replace bag and add</Button></div></Panel>}
  {active&&<ProductDialog item={active} onCancel={()=>setActive(null)} onAdd={(qty,ids)=>add(qty,ids)}/>}
 </>;}}</ResourceView>
 </div>;
}
function EmptyBag({onBrowse}:{onBrowse:()=>void}){return <section className="dt-bag-empty dt-screen-enter"><div className="dt-empty-bag-picture" aria-hidden="true"><ShoppingBag size={125} strokeWidth={1} color="#009f68"/></div><h1>Your bag is empty</h1><p>Choose a restaurant and add something delicious to get started.</p><Button onClick={onBrowse} startIcon={<UtensilsCrossed size={18}/>}>Explore restaurants</Button></section>;}
function Bag({gateway,cart,refresh,onBrowse,onCheckout}:{gateway:CustomerGateway;cart:EnrichedCart|null;refresh:()=>void;onBrowse:()=>void;onCheckout:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[promo,setPromo]=useState("");
 const [confirmClear,setConfirmClear]=useState(false);
 const action=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError("");try{await fn();refresh();}catch(e){setError(backendError(e).message);}finally{setBusy(false);}};
 if(!cart||!cart.items.length)return <EmptyBag onBrowse={onBrowse}/>;
 return <section className="dt-bag-page dt-screen-enter"><div className="dt-bag-content"><div className="dt-bag-heading"><div><h1>Your bag</h1><p>{cart.total_quantity} items from {cart.branch.merchant_name}</p></div><button onClick={()=>setConfirmClear(true)} disabled={busy}><Trash2 size={16}/> Clear bag</button></div>
 {confirmClear&&<Panel className="dt-live-conflict" role="alertdialog" aria-label="Clear bag confirmation"><h3>Clear all items?</h3><p>This cannot be undone.</p><div><Button variant="outline" onClick={()=>setConfirmClear(false)}>Keep items</Button><Button onClick={()=>void action(()=>gateway.cart.clear()).then(()=>setConfirmClear(false))}>Clear bag</Button></div></Panel>}
 <Panel className="dt-bag-items"><header><div className="dt-store-logo">{cart.branch.merchant_name.slice(0,1)}</div><div><h2>{cart.branch.merchant_name}</h2><p>{cart.branch.name} · {cart.branch.address_text}</p></div></header>
 {cart.items.map(i=><div key={i.id} className="dt-bag-line"><SafePhoto src={i.item_image_url} alt={i.item_name}/><div><strong>{i.item_name}</strong><p>{i.modifiers.map(m=>m.option_name).join(" · ")}</p><b>{money(i.line_total_minor)}</b>{i.price_changed&&<small>Price updated by restaurant</small>}</div><Quantity value={i.quantity} busy={busy} onChange={q=>void action(()=>q?gateway.cart.update(i.id,{quantity:q}):gateway.cart.remove(i.id))}/><IconButton label={"Remove "+i.item_name} disabled={busy} onClick={()=>void action(()=>gateway.cart.remove(i.id))}><Trash2 size={16}/></IconButton></div>)}
 <button className="dt-bag-browse" onClick={onBrowse}><span><Plus size={22}/></span><span><strong>Add more items</strong><small>Browse the restaurant's live menu</small></span><em>Browse menu <ArrowRight size={16}/></em></button></Panel>
 {cart.warnings.length>0&&<Panel className="dt-live-alert" role="status">{cart.warnings.map(w=><p key={w.code+(w.item_id||"")}>{w.message}</p>)}</Panel>}
 {error&&<p className="dt-live-error" role="alert">{error}</p>}
 </div><aside className="dt-bag-rail"><Panel className="dt-bag-promo"><form onSubmit={e=>{e.preventDefault();void action(()=>gateway.cart.promo(promo.trim()));}}><Tag size={18}/><input value={promo} disabled={busy} onChange={e=>setPromo(e.target.value)} placeholder="Enter promo code" aria-label="Promotion code"/><Button disabled={busy||!promo.trim()} size="sm" type="submit">Apply</Button></form>{cart.applied_promo&&<button type="button" onClick={()=>void action(()=>gateway.cart.removePromo())}>{cart.applied_promo.code} applied · Remove</button>}</Panel>
 <Panel className="dt-bag-totals"><h2><ShoppingBag size={20}/> Order summary</h2><dl><div><dt>Items ({cart.total_quantity})</dt><dd>{money(cart.pricing.subtotal_minor)}</dd></div><div><dt>Estimated delivery</dt><dd>{money(cart.pricing.estimated_delivery_fee_minor)}</dd></div><div><dt>Estimated service</dt><dd>{money(cart.pricing.estimated_service_fee_minor)}</dd></div><div><dt>Discount</dt><dd>- {money(cart.pricing.discount_minor)}</dd></div></dl><div><strong>Estimated total</strong><b>{money(cart.pricing.estimated_total_minor)}</b></div><p className="dt-live-option-help">Final fees and discounts are confirmed by a server checkout quote.</p></Panel>
 <Panel className="dt-bag-address"><div><MapPin size={22}/><span><strong>Delivering to</strong><b>Confirm address during checkout</b><small>Delivery cost and serviceability checked before ordering</small></span></div>{!cart.pricing.minimum_order_met&&<p className="dt-live-error">Add {money(cart.pricing.minimum_order_remaining_minor)} to reach the minimum order.</p>}<Button disabled={busy||!cart.pricing.minimum_order_met||cart.items.some(i=>!i.is_available)} onClick={onCheckout}>Proceed to checkout <ArrowRight size={16}/></Button></Panel></aside></section>;
}
function Checkout({gateway,cart,addresses,addressId,onAddress,onBack,onPayment}:{gateway:CustomerGateway;cart:EnrichedCart;addresses:CustomerAddress[];addressId:string;onAddress:()=>void;onBack:()=>void;onPayment:(id:string)=>void}){
 const [currentAddress,setCurrentAddress]=useState(addressId);
 const [notes,setNotes]=useState("");
 const [quote,setQuote]=useState<CheckoutQuote|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [seconds,setSeconds]=useState(0);
 const key=useRef<string|null>(null);
 useEffect(()=>{setCurrentAddress(addressId);setQuote(null);key.current=null;},[addressId,cart.updated_at]);
 useEffect(()=>{const timer=setInterval(()=>setSeconds(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const validQuote=quote&&new Date(quote.expires_at).getTime()>seconds;
 const chosen=addresses.find(a=>a.id===currentAddress);
 const review=async()=>{if(!chosen)return;setBusy(true);setError("");try{
  const service=await gateway.discovery.serviceability(chosen.latitude,chosen.longitude);
  if(!service.serviceable)throw new Error("Delivery is not available to this address. Choose another address.");
  const q=await gateway.cart.quote({address_id:chosen.id,notes,payment_method:"MPESA"});
  setQuote(q);key.current=crypto.randomUUID();
 }catch(e){setQuote(null);setError(backendError(e).code==="UNKNOWN"&&e instanceof Error?e.message:backendError(e).message);}finally{setBusy(false);}};
 const place=async()=>{if(!quote||!validQuote||busy)return;setBusy(true);setError("");try{
  key.current ||=crypto.randomUUID();
  const order=await gateway.orders.create({quote_id:quote.quote_id,special_instructions:notes},key.current);
  onPayment(order.id);
 }catch(e){setError(backendError(e).message);}finally{setBusy(false);}};
 return <section className="dt-checkout-page dt-screen-enter"><div className="dt-checkout-body"><button className="dt-checkout-back" onClick={onBack}><ArrowLeft size={16}/> Back to bag</button><h1>Checkout</h1><p>Confirm the delivery details and review your verified total.</p>
 <div className="dt-checkout-stepper"><span><b>1</b> Details</span><span><b>2</b> Server quote</span><span><b>3</b> Payment</span></div>
 <Panel className="dt-checkout-block"><h2><span>1</span> Delivery address</h2>{addresses.map(a=><label key={a.id} className={classNames("dt-checkout-choice",currentAddress===a.id&&"dt-checkout-choice--on")}><input type="radio" checked={currentAddress===a.id} name="address" onChange={()=>{setCurrentAddress(a.id);setQuote(null);key.current=null;}}/><House size={23}/><span><strong>{a.label} {a.is_default&&<Badge>Default</Badge>}</strong><small>{a.address_text||a.address_line1}<br/>{a.city}, {a.region}</small></span></label>)}
 {!addresses.length&&<p>No delivery address saved.</p>}<Button variant="outline" size="sm" onClick={onAddress}>+ Add a delivery address</Button></Panel>
 <Panel className="dt-checkout-block"><h2><span>2</span> Delivery options</h2><div className="dt-checkout-twocol"><label className="dt-checkout-choice dt-checkout-choice--on"><input type="radio" checked readOnly/><Truck size={20}/><span><strong>Standard delivery</strong><small>Calculated from your address in the server quote</small></span></label><div className="dt-checkout-choice dt-checkout-choice--disabled"><Truck size={20}/><span><strong>Priority delivery</strong><small>Unavailable until supported by operations</small></span></div></div></Panel>
 <Panel className="dt-checkout-block"><h2><span>3</span> Payment method</h2><div className="dt-checkout-twocol"><label className="dt-checkout-choice dt-checkout-choice--on"><input type="radio" checked readOnly/><CreditCard size={19}/><span><strong>M-PESA</strong><small>Secure STK prompt after order creation</small></span></label><div className="dt-checkout-choice dt-checkout-choice--disabled"><CreditCard size={19}/><span><strong>Card payment</strong><small>Awaiting secure card tokenization</small></span></div></div><label className="dt-product-instructions">Delivery instructions (optional)<input maxLength={500} value={notes} onChange={e=>{setNotes(e.target.value);setQuote(null);key.current=null;}} placeholder="Gate, landmark or directions…"/></label></Panel>
 </div><Panel className="dt-checkout-summary"><h2><ShoppingBag size={21}/> Order summary</h2><div className="dt-checkout-merchant"><div className="dt-store-logo">{cart.branch.merchant_name.slice(0,1)}</div><span><strong>{cart.branch.merchant_name}</strong><small>{cart.branch.name}</small></span></div>
 {cart.items.map(i=><div className="dt-checkout-line" key={i.id}><SafePhoto src={i.item_image_url} alt=""/><span><strong>{i.item_name}</strong><small>{i.quantity} × {i.modifiers.map(m=>m.option_name).join(" · ")}</small></span><b>{money(i.line_total_minor)}</b></div>)}
 <dl><div><dt>Items</dt><dd>{money(quote?.net_subtotal_minor??cart.pricing.subtotal_minor)}</dd></div><div><dt>Delivery</dt><dd>{quote?money(quote.delivery_fee_minor):"Review to calculate"}</dd></div><div><dt>Service fee</dt><dd>{quote?money(quote.service_fee_minor):"Review to calculate"}</dd></div>{quote&&<div><dt>Tax</dt><dd>{money(quote.tax_minor)}</dd></div>}</dl>
 <div className="dt-checkout-total"><strong>{quote?"Verified total to pay":"Total awaiting quote"}</strong><b>{quote?money(quote.total_minor):"—"}</b></div>
 <p className="dt-checkout-callout"><ShieldCheck size={20}/>{quote?(validQuote?"Secure quote valid until "+new Date(quote.expires_at).toLocaleTimeString("en-KE"):"Quote expired — review again"):"DeeToo verifies prices, availability and fees before you place an order."}</p>
 {error&&<p className="dt-live-error" role="alert">{error}</p>}
 {!validQuote?<Button disabled={busy||!chosen} onClick={()=>void review()}><RefreshCw size={16}/> {busy?"Verifying…":"Review checkout"}</Button>:
 <Button disabled={busy} onClick={()=>void place()}><ShoppingBag size={18}/>{busy?"Creating order…":"Create order · "+money(quote!.total_minor)}</Button>}
 </Panel></section>;
}
function PaymentPending({gateway,orderId,onBrowse}:{gateway:CustomerGateway;orderId:string;onBrowse:()=>void}){
 const order=useBackendResource(()=>gateway.orders.detail(orderId),Boolean(orderId),[orderId]);
 const payments=useBackendResource(()=>gateway.payments.forOrder(orderId),Boolean(orderId),[orderId]);
 const [phone,setPhone]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const attemptKey=useRef<string>(crypto.randomUUID());
 const list=payments.state.status==="ready"?payments.state.data:[];
 const latest=[...list].sort((a,b)=>Date.parse(a.created_at||"")-Date.parse(b.created_at||"")).at(-1) as Payment|undefined;
 const confirmed=latest&&paid.has(latest.status);
 const needsRetry=!latest||failed.has(latest.status);
 useEffect(()=>{if(!latest||confirmed||failed.has(latest.status))return;const t=setInterval(payments.refresh,6000);return()=>clearInterval(t);},[latest?.id,latest?.status,confirmed,payments.refresh]);
 const initiate=async()=>{if(busy)return;setBusy(true);setError("");try{
  if(!/^(?:\+?254|0)?[17]\d{8}$/.test(phone.replace(/\s/g,"")))throw new Error("Enter a valid Kenyan mobile number.");
  if(latest&&failed.has(latest.status))attemptKey.current=crypto.randomUUID();
  await gateway.payments.initiate(orderId,"MPESA",attemptKey.current,phone.trim());
  payments.refresh();
 }catch(e){setError(backendError(e).code==="UNKNOWN"&&e instanceof Error?e.message:backendError(e).message);}finally{setBusy(false);}};
 return <section className="dt-live-payment dt-screen-enter"><Panel className="dt-checkout-summary"><div className="dt-live-payment-icon"><ShieldCheck size={44}/></div>
  <h1>{confirmed?"Payment received":failed.has(latest?.status||"")?"Payment not completed":"Complete your payment"}</h1>
  <p>Order {order.state.status==="ready"?"#"+order.state.data.order_number:"reference "+orderId} has been submitted to DeeToo.</p>
  {order.state.status==="ready"&&<div className="dt-checkout-total"><strong>Amount due</strong><b>{money(order.state.data.total_minor)}</b></div>}
  {confirmed?<p role="status">Your payment is confirmed by DeeToo. Your order can now proceed.</p>:<>
  <p>{latest&&!needsRetry?"Waiting for payment confirmation from Safaricom. Approve the prompt on your phone; updates will refresh automatically.":"Enter your M-PESA number to receive a secure STK push."}</p>
  {needsRetry&&<label className="dt-checkout-phone">M-PESA mobile number<input aria-label="M-PESA mobile number" autoComplete="tel" type="tel" value={phone} placeholder="2547XXXXXXXX" onChange={e=>{setPhone(e.target.value);setError("");}}/></label>}
  {error&&<p className="dt-live-error" role="alert">{error}</p>}
  {needsRetry?<Button disabled={busy||order.state.status!=="ready"||order.state.data.status!=="PENDING_PAYMENT"} onClick={()=>void initiate()}>{busy?"Sending request…":"Send M-PESA prompt"}</Button>:<Button variant="outline" onClick={payments.refresh}><RefreshCw size={16}/> Check payment status</Button>}
  </>}
  <Button variant="outline" onClick={onBrowse}>Back to restaurants <ArrowRight size={16}/></Button>
  <small>Your order and payment status are verified by DeeToo. Do not pay cash to the rider for an already paid order.</small>
 </Panel></section>;
}
export function LiveShopping({gateway,screen,branchId,orderId,cartState,refreshCart,addresses,addressId,onAddress,onNavigate,isAuthenticated,requestSignIn}:{gateway:CustomerGateway;screen:Screen;branchId:string;orderId:string;cartState:ResourceState<EnrichedCart|null>;refreshCart:()=>void;addresses:CustomerAddress[];addressId:string;onAddress:()=>void;onNavigate:(path:string)=>void;isAuthenticated:boolean;requestSignIn:()=>void}){
 if(screen==="restaurant")return <MerchantStore gateway={gateway} branchId={branchId} cart={cartState.status==="ready"?cartState.data:null} onCartChanged={refreshCart} onBrowse={()=>onNavigate("/")} requestSignIn={requestSignIn} isAuthenticated={isAuthenticated}/>;
 if(!isAuthenticated)return <StatusPanel title="Sign in to see your bag" description="Your cart and checkout are tied to your DeeToo customer account."><Button onClick={requestSignIn}>Sign in</Button></StatusPanel>;
 if(screen==="payment")return <PaymentPending gateway={gateway} orderId={orderId} onBrowse={()=>onNavigate("/")}/>;
 if(cartState.status==="loading"||cartState.status==="idle")return <StatusPanel loading title="Loading your bag…"/>;
 if(cartState.status==="error")return <StatusPanel title="Bag unavailable" description={cartState.message} onRetry={refreshCart}/>;
 const cart=cartState.data;
 if(screen==="bag")return <Bag gateway={gateway} cart={cart} refresh={refreshCart} onBrowse={()=>onNavigate(cart?"/restaurant/"+cart.branch_id:"/")} onCheckout={()=>onNavigate("/checkout")}/>;
 if(!cart||!cart.items.length)return <EmptyBag onBrowse={()=>onNavigate("/")}/>;
 return <Checkout gateway={gateway} cart={cart} addresses={addresses} addressId={addressId} onAddress={onAddress} onBack={()=>onNavigate("/bag")} onPayment={id=>{refreshCart();onNavigate("/payment/"+id);}}/>;
}
