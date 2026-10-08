import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {Check,ChevronRight,House,LocateFixed,MapPin,Menu,Plus,ShoppingBag,X} from "lucide-react";
import type {CustomerAddress} from "@deetoo/types";
import {AuthProvider,useAuth} from "@deetoo/auth-web";
import {Button,IconButton,Panel} from "../../../../packages/customer-ui/src/index";
import {Header,Sidebar,type Route} from "../App";
import {createCustomerGateway} from "./customer-gateway";
import {backendError,useBackendResource} from "./resource";
import {LiveDiscovery} from "./LiveDiscovery";
import {LiveShopping} from "./LiveShopping";
import {LiveOrders} from "./LiveOrders";
import {StatusPanel} from "./LiveUtilities";

const pathFor=(route:Route)=>({
 discover:"/",search:"/search",restaurant:"/restaurant",bag:"/bag",checkout:"/checkout",orders:"/orders",
 tracking:"/orders",delivered:"/orders",profile:"/profile",security:"/security",notifications:"/notifications",support:"/support",conversation:"/support"
})[route];
const classify=(pathname:string):{screen:Route|"payment";branchId:string;orderId:string}=>{
 const segments=pathname.split("/").filter(Boolean);
 if(segments[0]==="restaurant"&&segments[1])return {screen:"restaurant",branchId:segments[1],orderId:""};
 if(segments[0]==="payment"&&segments[1])return {screen:"payment",branchId:"",orderId:segments[1]};
 if(segments[0]==="orders"&&segments[1]&&/^[a-zA-Z0-9_-]{1,128}$/.test(segments[1]))
   return {screen:segments[2]==="completed"?"delivered":"tracking",branchId:"",orderId:segments[1]};
 const screen=(["search","bag","checkout","orders","profile","security","notifications","support"].includes(segments[0]||"")?segments[0]:"discover") as Route;
 return {screen,branchId:"",orderId:""};
};
function LoginPanel({onDismiss}:{onDismiss:()=>void}){
 const {login,registerCustomer,error}=useAuth();
 const [mode,setMode]=useState<"login"|"register">("login");
 const [identifier,setIdentifier]=useState(""),[password,setPassword]=useState(""),[name,setName]=useState("");
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const submit=async(e:FormEvent)=>{
  e.preventDefault();if(busy)return;setBusy(true);setMessage("");
  try{const user=mode==="login"?await login(identifier,password):await registerCustomer({
   name,email:identifier.includes("@")?identifier:undefined,phone_e164:identifier.includes("@")?undefined:identifier,password
  });
   if(!user.roles.some(role=>String(role).toLowerCase()==="customer")){setMessage("This login does not have customer access.");return;}
   onDismiss();
  }catch(e){setMessage(backendError(e).code==="UNKNOWN"&&e instanceof Error?e.message:backendError(e).message);}
  finally{setBusy(false);}
 };
 return <dialog open aria-label="DeeToo customer sign in" className="dt-live-auth" onCancel={e=>{e.preventDefault();onDismiss();}}>
  <div className="dt-live-auth-card"><header><h2>{mode==="login"?"Sign in to DeeToo":"Create a customer account"}</h2><IconButton label="Close sign in" onClick={onDismiss}><X size={19}/></IconButton></header>
  <p>Shop using your DeeToo account. We never store passwords or access tokens in the browser.</p>
  <form onSubmit={e=>void submit(e)}>{mode==="register"&&<label>Full name<input required autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>}
   <label>Email or phone<input required autoComplete="username" value={identifier} onChange={e=>setIdentifier(e.target.value)}/></label>
   <label>Password<input type="password" required autoComplete={mode==="login"?"current-password":"new-password"} minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <Button type="submit" disabled={busy}>{busy?"Please wait…":mode==="login"?"Sign in":"Create account"}</Button></form>
  {(message||error)&&<p role="alert" className="dt-live-error">{message||error}</p>}
  <button className="dt-live-auth-switch" onClick={()=>{setMode(mode==="login"?"register":"login");setMessage("");}}>{mode==="login"?"New customer? Create an account":"Have an account? Sign in"}</button>
  </div>
 </dialog>;
}
function LocationPicker({gateway,addresses,currentId,onChoose,onSaved,onClose}:{gateway:ReturnType<typeof createCustomerGateway>;addresses:CustomerAddress[];currentId:string;onChoose:(id:string)=>void;onSaved:()=>void;onClose:()=>void}){
 const [creating,setCreating]=useState(false),[locating,setLocating]=useState(false),[saving,setSaving]=useState(false);
 const [coordinate,setCoordinate]=useState<{latitude:number;longitude:number}|null>(null);
 const [address,setAddress]=useState(""),[label,setLabel]=useState("Home"),[city,setCity]=useState(""),[region,setRegion]=useState("");
 const [service,setService]=useState<boolean|null>(null),[message,setMessage]=useState("");
 const locate=()=>{
  if(!navigator.geolocation){setMessage("Location permission is not available in this browser.");return;}
  setLocating(true);setMessage("");
  navigator.geolocation.getCurrentPosition(async pos=>{
   const point={latitude:pos.coords.latitude,longitude:pos.coords.longitude};
   try{const check=await gateway.discovery.serviceability(point.latitude,point.longitude);
    setService(check.serviceable);setCoordinate(point);
    try {
      const result=await gateway.discovery.reverseGeocode(point.latitude,point.longitude);
      if(result?.formatted_address)setAddress(result.formatted_address);
      if(result?.city)setCity(result.city);
    } catch { /* Reverse geocoding is optional; customer enters a precise street address. */ }
   }catch(e){setMessage(backendError(e).message);}finally{setLocating(false);}
  },()=>{setMessage("Location permission was denied or unavailable. Allow access in your browser to save a verified address.");setLocating(false);},{enableHighAccuracy:true,timeout:12000,maximumAge:120000});
 };
 const save=async()=>{if(!coordinate||!service||!address.trim()||!city.trim()||saving)return;
  setSaving(true);setMessage("");try{
   const saved=await gateway.account.addAddress({label, address_line1:address.trim(),city:city.trim(),region:region.trim()||city.trim(),country_code:"KE",latitude:coordinate.latitude,longitude:coordinate.longitude,is_default:addresses.length===0});
   onChoose(saved.id);onSaved();onClose();
  }catch(e){setMessage(backendError(e).message);}finally{setSaving(false);}
 };
 return <dialog open className="dt-live-location-dialog" aria-label="Choose delivery address" onCancel={e=>{e.preventDefault();onClose();}}><div className="dt-live-location-card">
   <header><div><h2>Delivering to</h2><p>Choose an address inside DeeToo's service zones.</p></div><IconButton label="Close location picker" onClick={onClose}><X size={20}/></IconButton></header>
   {!creating?<><div className="dt-live-address-list">{addresses.map(a=><button key={a.id} type="button" className={currentId===a.id?"dt-live-address-on":""} onClick={()=>{onChoose(a.id);onClose();}}><House size={19}/><span><strong>{a.label}{a.is_default?" · Default":""}</strong><small>{a.address_text||a.address_line1} · {a.city}</small></span>{currentId===a.id&&<Check size={18}/>}</button>)}</div><Button onClick={()=>setCreating(true)}><Plus size={16}/> Add new address</Button></>:
    <div className="dt-live-address-form">
     <p>Use your current position to verify delivery availability. Your location is used only for serviceability and the address you choose to save.</p>
     <Button variant="outline" disabled={locating} onClick={locate}><LocateFixed size={18}/>{locating?"Locating…":"Use my current location"}</Button>
     {coordinate&&<p role="status">{service?"Delivery zone active":"Outside DeeToo's active delivery zones"} · Coordinates verified ({coordinate.latitude.toFixed(4)}, {coordinate.longitude.toFixed(4)})</p>}
     <label>Address label<input value={label} onChange={e=>setLabel(e.target.value)} maxLength={50} required/></label>
     <label>Street / building / landmark<input value={address} onChange={e=>setAddress(e.target.value)} maxLength={255} required placeholder="Street or building name"/></label>
     <label>Town or city<input value={city} onChange={e=>setCity(e.target.value)} maxLength={100} required placeholder="Juja"/></label>
     <label>County<input value={region} onChange={e=>setRegion(e.target.value)} maxLength={100} placeholder="Kiambu County"/></label>
     <Button disabled={!coordinate||!service||!address.trim()||!city.trim()||saving} onClick={()=>void save()}>{saving?"Saving address…":"Save verified delivery address"}</Button>
     <button type="button" onClick={()=>setCreating(false)}>Back to saved addresses</button>
    </div>}
   {message&&<p role="alert" className="dt-live-error">{message}</p>}
  </div></dialog>;
}
function ConnectedInner(){
 const {apiClient,user,isLoading,isAuthenticated,logout}=useAuth();
 const isCustomer=isAuthenticated&&Boolean(user?.roles.some(role=>String(role).toLowerCase()==="customer"));
 const gateway=useMemo(()=>createCustomerGateway(apiClient),[apiClient]);
 const [path,setPath]=useState(window.location.pathname),[query,setQuery]=useState(""),[notice,setNotice]=useState<string|null>(null);
 const [mobile,setMobile]=useState(false),[authOpen,setAuthOpen]=useState(false),[locationOpen,setLocationOpen]=useState(false);
 const [addressId,setAddressId]=useState("");
 const route=classify(path);
 const addresses=useBackendResource(()=>gateway.account.addresses(),isCustomer,[user?.id]);
 const cart=useBackendResource(()=>gateway.cart.read(),isCustomer,[user?.id]);
 const list=addresses.state.status==="ready"?addresses.state.data:addresses.state.status==="empty"?addresses.state.data:[];
 const chosen=list.find(a=>a.id===addressId)||list.find(a=>a.is_default)||list[0]||null;
 useEffect(()=>{if(!addressId&&chosen)setAddressId(chosen.id);},[chosen?.id,addressId]);
 useEffect(()=>{const handler=()=>setPath(window.location.pathname);window.addEventListener("popstate",handler);return()=>window.removeEventListener("popstate",handler);},[]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(null),5000);return()=>clearTimeout(t);},[notice]);
 const navigate=(url:string)=>{if(window.location.pathname!==url)window.history.pushState({},"",url);setPath(url);setMobile(false);window.scrollTo({top:0,behavior:"auto"});};
 const goTo=(next:Route)=>navigate(pathFor(next));
 const branchId=route.branchId;
 const remembered=useRef("");
 if(branchId)remembered.current=branchId;
 const routeId=(route.screen==="payment"?"checkout":route.screen==="tracking"||route.screen==="delivered"?"orders":route.screen) as Route;
 const bagCount=cart.state.status==="ready"?cart.state.data?.total_quantity||0:0;
 if(isLoading)return <StatusPanel loading title="Checking DeeToo session…"/>;
 if(isAuthenticated&&!isCustomer)return <StatusPanel title="Customer access required" description="This account does not have the customer role. DeeToo keeps merchant, rider and admin access separate."><Button onClick={()=>void logout()}>Sign out</Button></StatusPanel>;
 return <div className="dt-app">
  <Header goTo={goTo} bagCount={bagCount} query={query} onQueryChange={setQuery} notice={setNotice} userLabel={user?.name||"Sign in"} locationLabel={chosen?.label||"Choose address"} locationDistrict={chosen?.city||"Select delivery location"} onLocationClick={()=>{if(!isAuthenticated)setAuthOpen(true);else setLocationOpen(true);}} onProfileClick={()=>{if(!isAuthenticated)setAuthOpen(true);else goTo("profile");}}/>
  <Sidebar active={routeId} goTo={goTo} bagCount={bagCount} live open={mobile} onClose={()=>setMobile(false)}/>
  <main className="dt-main" id="main-content"><button className="dt-mobile-menu" onClick={()=>setMobile(true)}><Menu size={20}/> Menu</button>
   {route.screen==="discover"||route.screen==="search"?<LiveDiscovery key="discovery" gateway={gateway} screen={route.screen} query={query} selectedAddress={chosen} onRestaurant={id=>navigate("/restaurant/"+id)} onAddress={()=>{if(!isAuthenticated)setAuthOpen(true);else setLocationOpen(true);}}/>:
    route.screen==="restaurant"||route.screen==="bag"||route.screen==="checkout"||route.screen==="payment"?
     <LiveShopping gateway={gateway} screen={route.screen} branchId={branchId} orderId={route.orderId}
      cartState={cart.state} refreshCart={cart.refresh} addresses={list} addressId={chosen?.id||""}
      onAddress={()=>setLocationOpen(true)} onNavigate={navigate} isAuthenticated={isAuthenticated} requestSignIn={()=>setAuthOpen(true)}/>:
     route.screen==="orders"||route.screen==="tracking"||route.screen==="delivered"?
     <LiveOrders gateway={gateway} screen={route.screen==="orders"?"history":route.screen==="delivered"?"completed":"tracking"} orderId={route.orderId}
       onNavigate={navigate} authenticated={isCustomer} requestSignIn={()=>setAuthOpen(true)}/>:
     <StatusPanel title="This section is coming in the next integration stage" description="The approved account and support screens remain in the visual preview; real account, notification and support data will be connected in Phase B4."><Button onClick={()=>navigate("/")}>Back to live discovery <ChevronRight size={17}/></Button></StatusPanel>}
  </main>
  {notice&&<div className="dt-notice" role="status"><Check size={16}/>{notice}<IconButton label="Dismiss notification" onClick={()=>setNotice(null)}><X size={16}/></IconButton></div>}
  {authOpen&&<LoginPanel onDismiss={()=>{setAuthOpen(false);addresses.refresh();cart.refresh();}}/>}
  {locationOpen&&<LocationPicker gateway={gateway} addresses={list} currentId={chosen?.id||""} onChoose={setAddressId} onSaved={()=>addresses.refresh()} onClose={()=>setLocationOpen(false)}/>}
 </div>;
}
/** Strictly opt-in while we verify real API flows and protect the 15 approved previews. */
export function ConnectedCustomerShopping(){
 return <AuthProvider clientApp="customer"><ConnectedInner/></AuthProvider>;
}
