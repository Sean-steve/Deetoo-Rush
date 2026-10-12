import {seedPhaseFour} from "./phase4Data";
import {seedPhaseThree} from "./phase3Data";
import {seedPhaseTwo} from "./phase2Data";
import React,{createContext,useContext,useEffect,useReducer,useState,useCallback,useRef} from "react";
import {AdminRole,DemoAction,DemoState,reducer,seedDemo} from "./data";
import {emptyLiveData,loadLive,liveIdentityRole,LiveApiError,performLiveAction,signIn,signOut,apiMutation} from "./live-api";
import type {ResourceName,ResourceState,Json} from "./live-api";
const KEY="deetoo.admin-next.phase1.v1";
export const ADMIN_NEXT_MODE: "demo"|"live"=import.meta.env.VITE_ADMIN_NEXT_MODE==="demo"?"demo":"live";
function load():DemoState {
 try {
  const saved=JSON.parse(localStorage.getItem(KEY)||"null");
  if(saved&&[1,2,3,4].includes(saved.version)&&Array.isArray(saved.orders)&&Array.isArray(saved.riders)&&saved.orders.length&&saved.riders.length)return {...saved,version:4,phase2:saved.phase2||seedPhaseTwo(),phase3:saved.phase3||seedPhaseThree(),phase4:saved.phase4||seedPhaseFour()};
 }catch{}
 return seedDemo();
}
type Store={
 data:DemoState;act:(a:DemoAction)=>void;role:AdminRole;setRole:(r:AdminRole)=>void;reset:()=>void;
 mode:"demo"|"live";phase:"loading"|"ready"|"auth"|"error";identity:Json|null;
 resources:Partial<Record<ResourceName,ResourceState>>;notice:string;clearNotice:()=>void;refresh:()=>Promise<void>;
 login:(identifier:string,password:string)=>Promise<void>;logout:()=>Promise<void>;verifyMfa:(code:string)=>Promise<void>;
};
const Context=createContext<Store|null>(null);
export function DemoProvider({children,forceLive=false}:{children:React.ReactNode;forceLive?:boolean}){
 // The default Admin deployment cannot display fixture data, even when
 // the independent design-preview server is explicitly configured for demo mode.
 return !forceLive&&ADMIN_NEXT_MODE==="demo"?<DemoStore>{children}</DemoStore>:<LiveStore>{children}</LiveStore>;
}
function DemoStore({children}:{children:React.ReactNode}){
 const [data,dispatch]=useReducer(reducer,undefined,load);
 const [role,setRole]=useState<AdminRole>("SUPER_ADMIN");
 useEffect(()=>{localStorage.setItem(KEY,JSON.stringify(data));},[data]);
 const value:Store={mode:"demo",phase:"ready",identity:null,resources:{},notice:"",clearNotice:()=>{},refresh:async()=>{},login:async()=>{},logout:async()=>{},verifyMfa:async()=>{},data,act:dispatch,role,setRole,reset:()=>dispatch({type:"RESET"})};
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
function LiveStore({children}:{children:React.ReactNode}){
 const [data,setData]=useState<DemoState>(emptyLiveData);
 const [phase,setPhase]=useState<Store["phase"]>("loading");
 const [role,setLiveRole]=useState<AdminRole>("VIEWER");
 const [identity,setIdentity]=useState<Json|null>(null);
 const [resources,setResources]=useState<Store["resources"]>({});
 const [notice,setNotice]=useState("");
 const latestRequest=useRef(0);
 const refresh=useCallback(async()=>{
  const request=++latestRequest.current;
  try {
   const snapshot=await loadLive();
   if(request!==latestRequest.current)return;
   setData(snapshot.data);setResources(snapshot.resources);setIdentity(snapshot.identity);
   setLiveRole(liveIdentityRole(snapshot.identity));setPhase("ready");
  }catch(e){
   if(request!==latestRequest.current)return;
   setData(emptyLiveData());setIdentity(null);setResources({});
   if(e instanceof LiveApiError&&(e.status===401||e.status===403)){setPhase("auth");setNotice(e.message);}
   else{setPhase("error");setNotice(e instanceof Error?e.message:"Unable to load the DeeToo API.");}
  }
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 // Events contain only invalidation metadata; all sensitive resources are reloaded through
 // authorized REST endpoints. Focus and bounded polling cover roles without admin stream rights.
 useEffect(()=>{
   if(phase!=="ready"||!identity)return;
   let last=0,queued:ReturnType<typeof setTimeout>|null=null;
   const invalidated=()=>{if(document.visibilityState==="hidden")return;
      const delay=Math.max(0,8000-(Date.now()-last));
      if(queued)return;
      queued=setTimeout(()=>{queued=null;last=Date.now();void refresh();},delay);
   };
   const visible=()=>{if(document.visibilityState==="visible")invalidated();};
   window.addEventListener("focus",invalidated);
   document.addEventListener("visibilitychange",visible);
   const periodic=setInterval(invalidated,45000);
   let stream:EventSource|null=null;
   if(["SUPER_ADMIN","ADMIN","OPERATIONS"].includes(role)&&typeof EventSource!=="undefined"){
     stream=new EventSource("/api/v1/realtime/stream?channels="+encodeURIComponent("admin:orders,admin:dispatch,admin:operations"),{withCredentials:true});
     stream.onmessage=invalidated;
     stream.addEventListener("order.updated",invalidated);
     stream.addEventListener("support.case_created",invalidated);
     // Auth can expire; browser EventSource reconnects. REST refresh remains authoritative.
   }
   return ()=>{if(queued)clearTimeout(queued);clearInterval(periodic);
      window.removeEventListener("focus",invalidated);document.removeEventListener("visibilitychange",visible);stream?.close();};
 },[phase,identity?.id,role,refresh]);
 const act=(a:DemoAction)=>{
  if(!identity){setNotice("Sign in to DeeToo before changing operational data.");return;}
  void (async()=>{
   try{const message=await performLiveAction(a as unknown as {type:string;[key:string]:unknown},data,identity);await refresh();setNotice(message);}
   catch(e){setNotice(e instanceof LiveApiError?e.code+": "+e.message:e instanceof Error?e.message:"Action failed without saving.");}
  })();
 };
 const login=async(identifier:string,password:string)=>{
  try{await signIn(identifier,password);setNotice("");await refresh();}
  catch(e){setNotice(e instanceof Error?e.message:"Sign-in failed.");setPhase("auth");throw e;}
 };
 const logout=async()=>{try{await signOut();}catch{}setData(emptyLiveData());setIdentity(null);setRoleNoop();setPhase("auth");setNotice("Signed out of DeeToo.");};
 const setRoleNoop=()=>setLiveRole("VIEWER");
 const verifyMfa=async(code:string)=>{await apiMutation("/auth/mfa/verify","POST",{code});setNotice("MFA verified by DeeToo for your active session.");};
 const value:Store={data,act,role,verifyMfa,setRole:()=>setNotice("Your role is assigned by the DeeToo identity service; it cannot be simulated in live mode."),reset:()=>setNotice("Reset is disabled in live mode; no server data was changed."),mode:"live",phase,identity,resources,notice,clearNotice:()=>setNotice(""),refresh,login,logout};
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDemo(){const context=useContext(Context);if(!context)throw new Error("Admin data provider is missing");return context;}
export function canAct(role:AdminRole,action:"order"|"dispatch"|"rider"|"review"|"reset"|"incident"|"support"|"resolve"|"merchant"|"customer"|"delete"|"geography"|"payment"|"refund"|"settlement"|"payout"|"finance"|"analytics"|"communications"|"security"|"system"):boolean{
 if(role==="SUPER_ADMIN")return true;
 if(role==="ADMIN")return !["reset","security","system","delete"].includes(action);
 if(role==="OPERATIONS")return !["reset","customer","delete","refund","settlement","payout","finance","security","system","communications"].includes(action);
 if(role==="FINANCE")return ["payment","refund","settlement","payout","finance","analytics"].includes(action);
 if(role==="SUPPORT")return ["support","communications"].includes(action);
 return false;
}
