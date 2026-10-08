import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronRight, Clock3, CreditCard,
  Heart, House, Info, MapPin, Minus, Plus, Search, ShieldCheck, ShoppingBag,
  Star, Store, Tag, Trash2, Truck, UtensilsCrossed, X,
} from "lucide-react";
import { Badge, Button, IconButton, Panel, classNames } from "../../../../packages/customer-ui/src/index";
import { FoodArt } from "./FoodArt";
import { heroBurger, previewRestaurants, type Cuisine } from "../data/preview";

const photo = (id: string, width = 840) => "https://images.unsplash.com/" + id + "?auto=format&fit=crop&w=" + width + "&q=85";
const food = {
  burger: heroBurger,
  bacon: photo("photo-1568901346375-23c9450c58cd"),
  double: photo("photo-1550547660-d9450f859349"),
  chicken: photo("photo-1562967914-608f82629710"),
  pizza: photo("photo-1574071318508-1cdbab80d002"),
  fries: photo("photo-1573080496219-bb080dd4f877"),
  salad: photo("photo-1512621776951-a57141f2eefd"),
  cola: photo("photo-1622483767028-3f66f32aef97"),
};

type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  cuisine: Cuisine;
  label?: string;
};
export type CartLine = {
  key: string;
  productId: string;
  name: string;
  image: string;
  unitPrice: number;
  quantity: number;
  modifiers: string[];
};
export const catalog: Product[] = [
  { id:"smash", name:"Smash Burger", description:"Beef patty, cheese, fresh lettuce, tomatoes, onions and special sauce.", price:850, image:food.burger, cuisine:"Burgers", label:"Popular" },
  { id:"bacon", name:"Bacon Deluxe", description:"Beef patty, crispy bacon, cheese, lettuce, tomatoes and BBQ sauce.", price:950, image:food.bacon, cuisine:"Burgers" },
  { id:"swiss", name:"Mushroom Swiss", description:"Beef patty, Swiss cheese, sautéed mushrooms and garlic mayo.", price:900, image:food.double, cuisine:"Burgers" },
  { id:"double", name:"Double Smash", description:"Double beef patties, double cheese, lettuce and special sauce.", price:1250, image:food.double, cuisine:"Burgers" },
  { id:"crispy", name:"Chicken Burger", description:"Crispy chicken, lettuce, tomatoes and honey mustard sauce.", price:750, image:food.chicken, cuisine:"Burgers" },
  { id:"veggie", name:"Veggie Burger", description:"Plant-based patty, fresh vegetables and herb sauce.", price:700, image:food.salad, cuisine:"Burgers" },
  { id:"pizza", name:"Stone-Baked Pizza", description:"Tomato, mozzarella and fresh basil.", price:1200, image:food.pizza, cuisine:"Pizza" },
  { id:"fries", name:"French Fries", description:"Crisp golden fries with house seasoning.", price:350, image:food.fries, cuisine:"Snacks" },
  { id:"cola", name:"Coca Cola", description:"Chilled 500 ml bottle.", price:200, image:food.cola, cuisine:"Drinks" },
  { id:"salad", name:"Fresh Garden Bowl", description:"Crisp greens, vegetables and homemade dressing.", price:620, image:food.salad, cuisine:"Healthy" },
];
export const ksh = (price: number) => "Ksh " + price.toLocaleString("en-KE", {minimumFractionDigits:2,maximumFractionDigits:2});
const extras = [
  {name:"Extra cheese", price:50, icon:"🧀"},
  {name:"Bacon", price:100, icon:"🥓"},
  {name:"Caramelized onions", price:50, icon:"🧅"},
  {name:"Jalapeños", price:50, icon:"🌶"},
];
const menuSections: Array<{id:"All" | Cuisine; label:string; icon:string}> = [
  {id:"All",label:"All items",icon:"🍽️"}, {id:"Burgers",label:"Burgers",icon:"🍔"},
  {id:"Pizza",label:"Pizza",icon:"🍕"}, {id:"Chicken",label:"Chicken",icon:"🍗"},
  {id:"Snacks",label:"Snacks",icon:"🍟"}, {id:"Healthy",label:"Healthy",icon:"🥗"},
  {id:"Drinks",label:"Drinks",icon:"🥤"},
];

function FoodPhoto({src,kind = "Burgers", alt = "", className = ""}:{src:string;kind?:Cuisine;alt?:string;className?:string}) {
  const [failed,setFailed] = useState(false);
  return <div className={classNames("dt-shop-photo",className)}>
    <FoodArt kind={kind}/>
    {!failed && <img src={src} alt={alt} onError={()=>setFailed(true)} loading="lazy"/>}
  </div>;
}
function Quantity({quantity,onChange,min = 0}:{quantity:number;onChange:(value:number)=>void;min?:number}) {
  return <div className="dt-shop-quantity" aria-label="Quantity">
    <button aria-label="Decrease quantity" type="button" disabled={quantity <= min} onClick={()=>onChange(Math.max(min,quantity-1))}><Minus size={15}/></button>
    <strong aria-live="polite">{quantity}</strong>
    <button aria-label="Increase quantity" type="button" onClick={()=>onChange(quantity+1)}><Plus size={15}/></button>
  </div>;
}
function ProductDialog({item,onClose,onAdd}:{item:Product;onClose:()=>void;onAdd:(line:CartLine)=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  const [quantity,setQuantity]=useState(1);
  const [patty,setPatty]=useState("Beef");
  const [bun,setBun]=useState("Brioche");
  const [chosen,setChosen]=useState<string[]>([]);
  const [instructions,setInstructions]=useState("");
  const [photoIndex,setPhotoIndex]=useState(0);
  const thumbImages=[item.image,food.bacon,food.double,food.fries];
  useEffect(()=>{
    const node=ref.current;
    if(node&&!node.open)node.showModal();
    return ()=>node?.close();
  },[]);
  const modifierAmount=(patty==="Double Beef"?250:patty==="Chicken"?100:0)+extras.filter(extra=>chosen.includes(extra.name)).reduce((sum,extra)=>sum+extra.price,0);
  const unitPrice=item.price+modifierAmount;
  const toggle=(name:string)=>setChosen(prev=>prev.includes(name)?prev.filter(x=>x!==name):[...prev,name]);
  return <dialog ref={ref} className="dt-product-dialog" onCancel={event=>{event.preventDefault();onClose();}}>
    <div className="dt-product-dialog-grid">
      <div className="dt-product-gallery">
        <FoodPhoto src={thumbImages[photoIndex]} kind={item.cuisine} alt={item.name+" photo"} className="dt-product-large-photo"/>
        <Badge className="dt-product-popular">Popular</Badge>
        <button className="dt-gallery-arrow dt-gallery-arrow-prev" aria-label="Previous photo" onClick={()=>setPhotoIndex((photoIndex+3)%4)}><ArrowLeft size={19}/></button>
        <button className="dt-gallery-arrow dt-gallery-arrow-next" aria-label="Next photo" onClick={()=>setPhotoIndex((photoIndex+1)%4)}><ArrowRight size={19}/></button>
        <div className="dt-product-thumbnails">
          {thumbImages.map((src,index)=><button key={index} type="button" aria-label={"Show food photo "+(index+1)} aria-pressed={photoIndex===index} onClick={()=>setPhotoIndex(index)}><FoodPhoto src={src} kind={item.cuisine}/></button>)}
        </div>
      </div>
      <div className="dt-product-editor">
        <div className="dt-product-editor-head">
          <div><h2>{item.name}</h2><p>Tasty Burgers <Star size={14} fill="currentColor"/> 4.6 <span>(320 demo reviews)</span></p></div>
          <IconButton label="Close product customization" onClick={onClose}><X size={20}/></IconButton>
        </div>
        <div className="dt-product-options">
          <p className="dt-product-description">{item.description}</p>
          <strong className="dt-product-main-price">{ksh(item.price)}</strong>
          {item.cuisine==="Burgers"&&<>
            <div className="dt-product-group-title"><h3>Choose your patty</h3><Badge variant="red">Required</Badge></div>
            <div className="dt-product-option-grid">
              {[["Beef",0],["Double Beef",250],["Chicken",100]].map(([name,price])=><button type="button" key={name} className={classNames("dt-product-option",patty===name&&"dt-product-option--active")} aria-pressed={patty===name} onClick={()=>setPatty(String(name))}><span>🍔</span><strong>{name}</strong><small>{Number(price)===0?"Standard":"+ "+ksh(Number(price))}</small>{patty===name&&<Check size={13}/>}</button>)}
            </div>
          </>}
          <div className="dt-product-group-title"><h3>Add extras (optional)</h3></div>
          <div className="dt-product-extra-list">{extras.map(extra=><label key={extra.name}>
            <input type="checkbox" checked={chosen.includes(extra.name)} onChange={()=>toggle(extra.name)}/><span>{extra.icon}</span><strong>{extra.name}</strong><em>+ {ksh(extra.price)}</em>
          </label>)}</div>
          {item.cuisine==="Burgers"&&<>
            <div className="dt-product-group-title"><h3>Choose bun</h3></div>
            <div className="dt-product-option-grid">
              {["Brioche","Sesame","Whole grain"].map(name=><button type="button" className={classNames("dt-product-option",bun===name&&"dt-product-option--active")} aria-pressed={bun===name} onClick={()=>setBun(name)} key={name}><span>🍞</span><strong>{name}</strong><small>{name==="Brioche"?"Standard":"Included"}</small>{bun===name&&<Check size={13}/>}</button>)}
            </div>
          </>}
          <label className="dt-product-instructions">Special instructions (optional)<input maxLength={180} value={instructions} onChange={event=>setInstructions(event.target.value)} placeholder="E.g. no onions, extra spicy, etc."/></label>
        </div>
        <div className="dt-product-editor-footer">
          <Quantity min={1} quantity={quantity} onChange={setQuantity}/>
          <Button onClick={()=>{onAdd({key:item.id+"-"+patty+"-"+bun+"-"+chosen.join(","),productId:item.id,name:item.name,image:item.image,unitPrice,quantity,modifiers:[patty,bun,...chosen].filter(x=>x)});onClose();}} className="dt-product-add">
            Add to cart · {ksh(unitPrice*quantity)}
          </Button>
        </div>
      </div>
    </div>
  </dialog>;
}

function OrderRail({cart,onGo,shop}:{cart:CartLine[];onGo:(route:"bag"|"checkout")=>void;shop:()=>void}) {
  const subtotal=cart.reduce((sum,item)=>sum+item.unitPrice*item.quantity,0);
  return <aside className="dt-shop-rail">
    <Panel className="dt-shop-cart-summary">
      <header><ShoppingBag size={21}/><h2>Your order</h2><Badge>{cart.reduce((s,x)=>s+x.quantity,0)} items</Badge></header>
      {cart.length?cart.map(line=><div className="dt-mini-cart-line" key={line.key}>
        <FoodPhoto src={line.image} className="dt-mini-cart-photo"/>
        <div><strong>{line.name}</strong><small>{line.quantity} × {ksh(line.unitPrice)}</small></div>
      </div>):<p className="dt-cart-aside-empty">Your bag is empty. Add something delicious!</p>}
      <dl className="dt-shop-fees"><div><dt>Subtotal</dt><dd>{ksh(subtotal)}</dd></div><div><dt>Delivery fee</dt><dd>{ksh(100)}</dd></div><div><dt>Service fee</dt><dd>{ksh(35)}</dd></div></dl>
      <div className="dt-shop-total"><span>Estimated total</span><strong>{ksh(subtotal+135)}</strong></div>
      <Button className="dt-full-button" onClick={()=>cart.length?onGo("checkout"):shop()}>{cart.length?"Proceed to checkout":"Browse menu"}<ArrowRight size={17}/></Button>
    </Panel>
    <Panel className="dt-eta-note"><Truck size={21}/><div><strong>20–30 min</strong><small>Estimated delivery time (demo)</small></div></Panel>
  </aside>;
}
function Storefront({restaurantId,cart,onAdd,onGo,onNotice}:{restaurantId:string;cart:CartLine[];onAdd:(line:CartLine)=>void;onGo:(route:"bag"|"checkout"|"discover")=>void;onNotice:(text:string)=>void}) {
  const restaurant=previewRestaurants.find(r=>r.id===restaurantId)||previewRestaurants[0];
  const [category,setCategory]=useState<"All"|Cuisine>("Burgers");
  const [term,setTerm]=useState("");
  const [active,setActive]=useState<Product|null>(null);
  const [fave,setFave]=useState(false);
  const [tab,setTab]=useState("Menu");
  const visible=catalog.filter(item=>(category==="All"||item.cuisine===category)&&(!term||item.name.toLowerCase().includes(term.toLowerCase())));
  const storeName=restaurant.id==="smash"?"Deetoo Test Merchant":restaurant.name;
  return <div className="dt-storefront dt-screen-enter">
    <div className="dt-store-cover">
      <FoodPhoto src={restaurant.image} kind={restaurant.cuisines[0]} className="dt-store-cover-photo"/>
      <button className="dt-store-back" onClick={()=>onGo("discover")}><ArrowLeft size={17}/> Back to results</button>
      <div className="dt-store-tagline">Fresh<br/>Food<br/>Great Moments</div>
      <div className="dt-store-identity"><div className="dt-store-logo">D</div><div><h1>{storeName}</h1><p>{restaurant.cuisines.join(" · ")}</p><div className="dt-store-info"><Badge>Open</Badge><span><Clock3 size={15}/>{restaurant.time[0]}–{restaurant.time[1]} min</span><span><Star size={15} fill="currentColor"/>{restaurant.rating.toFixed(1)} ({restaurant.reviews})</span><span><MapPin size={15}/> Juja Branch · {restaurant.distanceKm.toFixed(1)} km</span></div></div></div>
    </div>
    <div className="dt-store-facts"><div><ShoppingBag size={20}/><span>Minimum order<small>Ksh 100</small></span></div><div><Truck size={21}/><span>Delivery fee<small>{ksh(restaurant.feeKsh)}</small></span></div><div><Tag size={20}/><span>Offers<small>Verified at checkout</small></span></div><div><Clock3 size={20}/><span>Available today<small>8:00 AM – 11:00 PM (demo)</small></span></div><button onClick={()=>{setFave(!fave);onNotice(fave?"Removed from demo favourites":"Added to demo favourites");}}><Heart size={18} fill={fave?"#ed4267":"none"} color={fave?"#ed4267":"currentColor"}/> Favourite</button></div>
    <div className="dt-store-tabs"><div role="tablist" aria-label="Restaurant information">{["Menu","Reviews","About","Location"].map(name=><button key={name} role="tab" aria-selected={tab===name} onClick={()=>setTab(name)}>{name}</button>)}</div><div className="dt-store-menu-search"><Search size={17}/><input value={term} onChange={event=>{setTerm(event.target.value);setTab("Menu");}} aria-label="Search menu items" placeholder="Search menu items..."/></div></div>
    {tab==="Menu"?<div className="dt-store-body">
      <nav className="dt-store-categories" aria-label="Menu categories">{menuSections.map(section=><button key={section.id} aria-pressed={category===section.id} onClick={()=>setCategory(section.id)}><span>{section.icon}</span><strong>{section.label}</strong><small>{section.id==="All"?catalog.length:catalog.filter(p=>p.cuisine===section.id).length}</small></button>)}</nav>
      <section className="dt-store-products"><h2>{category==="All"?"All items":category}</h2><p>Juicy, flavorful and made with the freshest ingredients.</p><div className="dt-store-product-grid">{visible.map(item=><article key={item.id} className="dt-product-card">
        <button type="button" className="dt-product-photo-button" aria-label={"Customize "+item.name} onClick={()=>setActive(item)}><FoodPhoto src={item.image} alt={item.name} kind={item.cuisine}/>{item.label&&<Badge className="dt-product-card-badge">{item.label}</Badge>}</button>
        <div><h3>{item.name}</h3><p>{item.description}</p><footer><strong>{ksh(item.price)}</strong><Button size="sm" onClick={()=>setActive(item)} startIcon={<Plus size={15}/>}>Add</Button></footer></div>
      </article>)}</div>{visible.length===0&&<Panel className="dt-store-no-items">No items match your menu search. Try another category.</Panel>}</section>
      <OrderRail cart={cart} onGo={onGo} shop={()=>setCategory("All")}/>
    </div>:<Panel className="dt-store-tab-placeholder"><h2>{tab}</h2><p>This section is a visual preview. Verified restaurant {tab.toLowerCase()} details will be connected during backend integration.</p><Button onClick={()=>setTab("Menu")}>Back to menu</Button></Panel>}
    {active&&<ProductDialog item={active} onAdd={onAdd} onClose={()=>setActive(null)}/>}
  </div>;
}

function EmptyBagArt() {
  return <div className="dt-empty-bag-picture" aria-hidden="true">
    <svg viewBox="0 0 380 270">
      <ellipse cx="204" cy="244" rx="145" ry="14" fill="#8DBDA5" opacity=".18"/>
      <path d="M73 206Q32 128 111 77Q154 29 220 66Q280 40 308 92Q353 156 310 214Z" fill="#e6f8ee"/>
      <path d="M154 79h130l24 146H145Z" fill="#efac73"/><path d="M284 79l16 12 25 134h-17Z" fill="#ce844f"/>
      <path d="M160 78Q164 42 216 44Q265 45 275 78" fill="none" stroke="#d68d5e" strokeWidth="12"/>
      <circle cx="225" cy="147" r="32" fill="#00a263"/><path d="M204 163l20-32 23 32q-23-15-43 0" fill="#fff"/>
      <path d="M103 209Q59 176 90 146Q119 126 144 157Q151 196 111 226Z" fill="#8bb944" stroke="#568b28" strokeWidth="6"/>
      <path d="M110 202Q90 177 110 155Q129 155 134 173Q140 193 111 207Z" fill="#f4eca4"/>
      <ellipse cx="111" cy="183" rx="12" ry="17" fill="#9d673b"/>
      <circle cx="146" cy="223" r="25" fill="#e84034"/><path d="M130 197l16 10 16-10" fill="none" stroke="#26854e" strokeWidth="6"/>
      <path d="M78 98l-7-23M307 47l10-27M325 61l21-15" stroke="#008a54" strokeWidth="7" strokeLinecap="round"/>
    </svg>
  </div>;
}
function EmptyBag({onBrowse}:{onBrowse:()=>void}) {
  return <div className="dt-bag-empty dt-screen-enter">
    <EmptyBagArt/><h1>Your bag is empty</h1>
    <p>Looks like you haven’t added any delicious items yet.<br/>Explore amazing restaurants and start your order.</p>
    <Button startIcon={<UtensilsCrossed size={19}/>} onClick={onBrowse}>Explore restaurants</Button>
    <section className="dt-empty-suggestions"><header><div><h2>Popular near you</h2><p>Check out some top picks from restaurants around Juja.</p></div><button onClick={onBrowse}>View all <ArrowRight size={16}/></button></header><div>{previewRestaurants.slice(0,4).map(restaurant=><button onClick={onBrowse} key={restaurant.id} className="dt-empty-restaurant"><FoodPhoto src={restaurant.image} kind={restaurant.cuisines[0]} alt={restaurant.name}/><div><strong>{restaurant.name}</strong><small>{restaurant.cuisines.join(" · ")}</small><small><MapPin size={13}/> Juja Branch · {restaurant.distanceKm.toFixed(1)} km</small></div></button>)}</div></section>
  </div>;
}
function Cart({cart,onUpdate,onClear,onBrowse,onCheckout}:{cart:CartLine[];onUpdate:(key:string,quantity:number)=>void;onClear:()=>void;onBrowse:()=>void;onCheckout:()=>void}) {
  const [promo,setPromo]=useState("");
  const [submitted,setSubmitted]=useState(false);
  const subtotal=cart.reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);
  if(!cart.length)return <EmptyBag onBrowse={onBrowse}/>;
  return <section className="dt-bag-page dt-screen-enter">
    <div className="dt-bag-content"><div className="dt-bag-heading"><div><h1>Your bag</h1><p>{cart.reduce((s,x)=>s+x.quantity,0)} items from 1 restaurant</p></div><button onClick={onClear}><Trash2 size={16}/> Clear bag</button></div>
      <Panel className="dt-bag-items"><header><div className="dt-store-logo">D</div><div><h2>Deetoo Test Merchant</h2><p>Juja Branch · 20–30 min · Ksh 100 delivery fee (demo)</p></div></header>
        {cart.map(line=><div key={line.key} className="dt-bag-line"><FoodPhoto src={line.image} alt={line.name}/><div><strong>{line.name}</strong><p>{line.modifiers.join(" · ")}</p><b>{ksh(line.unitPrice*line.quantity)}</b></div><Quantity quantity={line.quantity} onChange={quantity=>onUpdate(line.key,quantity)}/><IconButton label={"Remove "+line.name} onClick={()=>onUpdate(line.key,0)}><Trash2 size={17}/></IconButton></div>)}
        <button className="dt-bag-browse" onClick={onBrowse}><span><Plus size={24}/></span><span><strong>Add more items</strong><small>Browse the menu to add more delicious items</small></span><em>Browse menu <ArrowRight size={16}/></em></button>
      </Panel>
      <section className="dt-bag-upsell"><h2>People also added</h2><div>{catalog.filter(item=>!cart.some(line=>line.productId===item.id)).slice(0,4).map(item=><button onClick={onBrowse} key={item.id}><FoodPhoto src={item.image} alt={item.name}/><span><strong>{item.name}</strong><small>{ksh(item.price)}</small><em>+ Browse</em></span></button>)}</div></section>
    </div>
    <aside className="dt-bag-rail"><Panel className="dt-bag-promo"><form onSubmit={event=>{event.preventDefault();setSubmitted(true);}}><Tag size={18}/><input aria-label="Preview promotion code" placeholder="Enter promo code" value={promo} onChange={event=>{setPromo(event.target.value);setSubmitted(false);}}/><Button size="sm">Apply</Button></form>{submitted&&<p>Promotion validation will be connected in Phase 2. Your total is unchanged.</p>}</Panel>
      <Panel className="dt-bag-totals"><h2><ShoppingBag size={20}/> Order summary</h2><dl><div><dt>Items ({cart.reduce((s,x)=>s+x.quantity,0)})</dt><dd>{ksh(subtotal)}</dd></div><div><dt>Estimated delivery fee</dt><dd>{ksh(100)}</dd></div><div><dt>Estimated service fee</dt><dd>{ksh(35)}</dd></div><div><dt>Discount</dt><dd>{ksh(0)}</dd></div></dl><div><strong>Estimated total</strong><b>{ksh(subtotal+135)}</b></div></Panel>
      <Panel className="dt-bag-address"><div><MapPin size={25}/><span><strong>Delivering to</strong><b>Home <Badge>Primary</Badge></b><small>Juja, Kiambu County</small></span></div><label>Delivery instructions (optional)<textarea rows={2} placeholder="E.g. Gate code, landmark, or special instructions..."/></label><Button onClick={onCheckout}>Proceed to checkout <ArrowRight size={18}/></Button></Panel>
    </aside>
  </section>;
}
function Checkout({cart,onBack,onPlace}:{cart:CartLine[];onBack:()=>void;onPlace:()=>void}) {
  const [address,setAddress]=useState("Home");
  const [payment,setPayment]=useState<"mpesa"|"card">("mpesa");
  const [phone,setPhone]=useState("+254 792 659 500");
  const subtotal=cart.reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);
  return <section className="dt-checkout-page dt-screen-enter"><div className="dt-checkout-body"><button className="dt-checkout-back" onClick={onBack}><ArrowLeft size={16}/> Back to cart</button><h1>Checkout</h1><p>Almost there! Confirm your details and place your order.</p>
    <div className="dt-checkout-stepper"><span><b>1</b> Details</span><span><b>2</b> Payment</span><span><b>3</b> Review & place order</span></div>
    <Panel className="dt-checkout-block"><h2><span>1</span> Delivery address</h2>{["Home","Work"].map(label=><label key={label} className={classNames("dt-checkout-choice",address===label&&"dt-checkout-choice--on")}><input type="radio" name="address" checked={address===label} onChange={()=>setAddress(label)}/><House size={23}/><span><strong>{label} {label==="Home"&&<Badge>Default</Badge>}</strong><small>{label==="Home"?"Near Juja State Lodge, Juja":"Juja Business Centre, Juja"}<br/>Juja, Kiambu County</small></span></label>)}<small className="dt-checkout-demo">Saved address editing is available after backend integration.</small></Panel>
    <Panel className="dt-checkout-block"><h2><span>2</span> Delivery options</h2><div className="dt-checkout-twocol"><label className="dt-checkout-choice dt-checkout-choice--on"><input type="radio" checked readOnly/><Truck size={20}/><span><strong>Standard delivery</strong><small>20–30 min (preview) · Ksh 100</small></span></label><div className="dt-checkout-choice dt-checkout-choice--disabled"><Truck size={20}/><span><strong>Priority delivery</strong><small>Coming soon</small></span></div></div></Panel>
    <Panel className="dt-checkout-block"><h2><span>3</span> Payment method</h2><div className="dt-checkout-twocol">{[["mpesa","M-PESA","Pay with STK Push"],["card","Card payment","Visa or Mastercard"]].map(([id,label,description])=><label className={classNames("dt-checkout-choice",payment===id&&"dt-checkout-choice--on")} key={id}><input type="radio" name="payment" checked={payment===id} onChange={()=>setPayment(id as "mpesa"|"card")}/><CreditCard size={19}/><span><strong>{label}</strong><small>{description}</small></span></label>)}</div>{payment==="mpesa"&&<label className="dt-checkout-phone">M-PESA phone number<input type="tel" value={phone} onChange={event=>setPhone(event.target.value)} autoComplete="tel"/></label>}</Panel>
  </div><Panel className="dt-checkout-summary"><h2><ShoppingBag size={21}/> Order summary</h2><div className="dt-checkout-merchant"><div className="dt-store-logo">D</div><span><strong>Deetoo Test Merchant</strong><small>Juja Branch · 20–30 min (demo)</small></span></div>{cart.map(line=><div key={line.key} className="dt-checkout-line"><FoodPhoto src={line.image} alt=""/><span><strong>{line.name}</strong><small>{line.quantity} × {line.modifiers.join(" · ")}</small></span><b>{ksh(line.unitPrice*line.quantity)}</b></div>)}<dl><div><dt>Items</dt><dd>{ksh(subtotal)}</dd></div><div><dt>Delivery fee</dt><dd>{ksh(100)}</dd></div><div><dt>Service fee</dt><dd>{ksh(35)}</dd></div><div><dt>Discount</dt><dd>{ksh(0)}</dd></div></dl><div className="dt-checkout-total"><strong>Total to pay</strong><b>{ksh(subtotal+135)}</b></div><p className="dt-checkout-callout"><ShieldCheck size={20}/> This is a design preview. No actual payment or order will be created.</p><Button onClick={onPlace}><ShoppingBag size={18}/> Preview place order · {ksh(subtotal+135)}</Button></Panel></section>;
}

export function ShoppingPreview({screen,restaurantId,cart,onAdd,onUpdate,onClear,onNavigate,onNotice}:{
  screen:"restaurant"|"bag"|"checkout"; restaurantId:string;cart:CartLine[];
  onAdd:(line:CartLine)=>void;onUpdate:(key:string,quantity:number)=>void;onClear:()=>void;
  onNavigate:(route:"restaurant"|"discover"|"bag"|"checkout")=>void;onNotice:(text:string)=>void;
}) {
  if(screen==="restaurant")return <Storefront restaurantId={restaurantId} cart={cart} onAdd={onAdd} onGo={onNavigate} onNotice={onNotice}/>;
  if(screen==="bag")return <Cart cart={cart} onUpdate={onUpdate} onClear={onClear} onBrowse={()=>onNavigate("restaurant")} onCheckout={()=>onNavigate("checkout")}/>;
  if(!cart.length)return <EmptyBag onBrowse={()=>onNavigate("restaurant")}/>;
  return <Checkout cart={cart} onBack={()=>onNavigate("bag")} onPlace={()=>onNotice("Design preview only — no order or payment has been created.")}/>;
}
