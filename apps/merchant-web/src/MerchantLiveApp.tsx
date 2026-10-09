import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AuthProvider, useAuth } from "../../../packages/auth/src/react";
import type { DeetooApiClient } from "../../../packages/api-client/src";
import MerchantPrototype from "./MerchantPrototype";
import { MerchantApp } from "../../merchant/src/MerchantApp";

export type LiveResource = {
  orders: any[];
  metrics: any | null;
  menus: any[];
  categories: any[];
  items: any[];
  inventory: any[];
  team: { members: any[]; invitations: any[] };
  profile: any | null;
  finance: any | null;
  transactions: any[];
  roleMatrix: any | null;
  documents: any[];
};
const empty:LiveResource={orders:[],metrics:null,menus:[],categories:[],items:[],inventory:[],
  team:{members:[],invitations:[]},profile:null,finance:null,transactions:[],roleMatrix:null,documents:[]};
export type MerchantLiveBridge={
  api:DeetooApiClient;
  user:any;
  branchId:string;
  merchantId:string;
  branch:any;
  branches:any[];
  resource:LiveResource;
  loading:boolean;
  errors:Record<string,string>;
  refresh:()=>void;
  logout:()=>Promise<void>;
  setBranchId:(id:string)=>void;
  run:<T=any>(path:string,options?:RequestInit)=>Promise<T>;
};
function message(e:unknown){return e instanceof Error?e.message:String(e);}
const encode=(s:string)=>encodeURIComponent(s);
/** Browser cookies/CSRF are managed by the shared client; never store tokens in localStorage. */
export function MerchantLiveApp(){
  return <AuthProvider clientApp="merchant"><MerchantLiveGate/></AuthProvider>;
}
function MerchantLiveGate(){
 const {apiClient,user,isAuthenticated,isLoading,login,logout}=useAuth();
 const [identifier,setIdentifier]=useState(""),[password,setPassword]=useState(""),
       [authError,setAuthError]=useState(""),[signing,setSigning]=useState(false);
 const [branches,setBranches]=useState<any[]>([]),[branchId,setBranchId]=useState(""),
       [branchBusy,setBranchBusy]=useState(true),[branchError,setBranchError]=useState("");
 const [revision,setRevision]=useState(0),[resources,setResources]=useState<LiveResource>(empty),
       [busy,setBusy]=useState(false),[errors,setErrors]=useState<Record<string,string>>({});
 const refresh=useCallback(()=>setRevision(v=>v+1),[]);
 const run=useCallback(async <T,>(path:string,options:RequestInit={})=>{
    const result=await apiClient.request<T>(path,options);
    refresh();return result.data;
 },[apiClient,refresh]);
 const authorized=Boolean(user?.roles?.some((x:string)=>["merchant","merchant_owner","merchant_manager","merchant_staff","admin"].includes(x)));
 useEffect(()=>{
  if(!isAuthenticated||!authorized){setBranches([]);setBranchBusy(false);return;}
  let alive=true;setBranchBusy(true);setBranchError("");
  apiClient.request<any[]>("/merchant/branches").then(({data})=>{
    if(!alive)return;setBranches(Array.isArray(data)?data:[]);
    setBranchId(previous=>(data||[]).some((b:any)=>b.id===previous)?previous:data?.[0]?.id||"");
  }).catch(e=>{if(alive){setBranchError(message(e));setBranches([]);}}).finally(()=>{if(alive)setBranchBusy(false);});
  return()=>{alive=false;};
 },[apiClient,isAuthenticated,authorized,revision]);
 useEffect(()=>{
  if(!isAuthenticated||!authorized||!branchId)return;
  let alive=true;setBusy(true);
  const url=(part:string)=>part+"?branch_id="+encode(branchId);
  const requests:Record<string,Promise<any>>={
    orders:apiClient.request<any[]>(url("/merchant/orders")+"\u0026limit=100"),
    metrics:apiClient.request(url("/merchant/experience/orders/metrics")),
    menus:apiClient.request<any[]>("/merchant/menus"),
    inventory:apiClient.request<any[]>(`/merchant/experience/branches/${encode(branchId)}/inventory`),
    team:apiClient.request("/merchant/team"),
    profile:apiClient.request("/merchant/profile"),
    finance:apiClient.request(url("/finance/merchant/experience/overview")),
    transactions:apiClient.request(url("/finance/merchant/experience/transactions")+"\u0026limit=100"),
    roleMatrix:apiClient.request("/merchant/experience/roles/capabilities"),
    documents:apiClient.request<any[]>("/merchant/experience/documents")
  };
  Promise.allSettled(Object.entries(requests).map(async ([key,p])=>[key,(await p).data] as const)).then(async res=>{
    if(!alive)return;
    const patch:any={},issues:Record<string,string>={};
    res.forEach((entry,i)=>{const name=Object.keys(requests)[i];
      if(entry.status==="fulfilled")patch[name]=entry.value[1];
      else issues[name]=message(entry.reason);
    });
    const menus=Array.isArray(patch.menus)?patch.menus:[];
    // Query categories/items through existing catalogue endpoints, respecting menu ownership.
    const menuResults=await Promise.allSettled(menus.flatMap((m:any)=>[
      apiClient.request<any[]>(`/merchant/menus/${encode(m.id)}/categories`),
      apiClient.request<any[]>(`/merchant/menus/${encode(m.id)}/items`)
    ]));
    if(!alive)return;
    const categories:any[]=[],items:any[]=[];
    menuResults.forEach((r,i)=>{
      if(r.status==="fulfilled"&&Array.isArray(r.value.data)){
        const subset=r.value.data.map((v:any)=>({...v,menu_id:v.menu_id||menus[Math.floor(i/2)]?.id}));
        (i%2===0?categories:items).push(...subset);
      }else if(r.status==="rejected")issues.catalogue=message(r.reason);
    });
    patch.categories=categories;patch.items=items;
    setResources({...empty,...patch});
    setErrors(issues);
  }).catch(e=>{if(alive)setErrors({all:message(e)});}).finally(()=>{if(alive)setBusy(false);});
  return()=>{alive=false;};
 },[apiClient,isAuthenticated,authorized,branchId,revision]);
 useEffect(()=>{
  if(!isAuthenticated||!branchId)return;
  const timer=window.setInterval(refresh,30_000);
  const onFocus=()=>refresh();window.addEventListener("focus",onFocus);
  return()=>{window.clearInterval(timer);window.removeEventListener("focus",onFocus);};
 },[isAuthenticated,branchId,refresh]);
 const branch=branches.find(b=>b.id===branchId)||null;
 const merchantId=String(branch?.merchant_id||user?.merchant_ids?.[0]||"");
 const live=useMemo<MerchantLiveBridge>(()=>({api:apiClient,user,branchId,merchantId,
    branch,branches,resource:resources,loading:busy,errors,refresh,logout,setBranchId,run}),
  [apiClient,user,branchId,merchantId,branch,branches,resources,busy,errors,refresh,logout,run]);
 if(isLoading)return <main className="mp-live-gate" role="status">Checking your Merchant session…</main>;
 if(!isAuthenticated)return <main className="mp-live-gate"><div className="mp-live-auth">
   <div className="mp-live-brand">▰ DeeToo <small>Merchant</small></div>
   <h1>Sign in to your restaurant</h1><p>Use your authorized merchant account to manage your kitchen and business.</p>
   <form onSubmit={async e=>{e.preventDefault();setAuthError("");setSigning(true);
    try{await login(identifier,password);}catch(e){setAuthError(message(e));}finally{setSigning(false);}}}>
    <label>Email or phone<input autoComplete="username" required value={identifier} onChange={e=>setIdentifier(e.target.value)}/></label>
    <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {authError&&<p role="alert">{authError}</p>}
    <button disabled={signing} className="mp-primary">{signing?"Signing in…":"Sign in"}</button>
   </form></div></main>;
 if(!authorized)return <main className="mp-live-gate"><h1>Merchant access required</h1>
   <p>Your account does not have an authorized Merchant role.</p><button onClick={()=>void logout()}>Sign out</button></main>;
 if(branchBusy)return <main className="mp-live-gate" role="status">Loading authorized branches…</main>;
 if(branchError)return <main className="mp-live-gate" role="alert"><h1>Unable to load branches</h1><p>{branchError}</p>
  <button onClick={()=>window.location.reload()}>Retry</button></main>;
 if(!branch)return <main className="mp-live-gate"><h1>No branch access</h1>
  <p>Your Merchant account does not currently have an assigned branch. Ask the owner or an administrator to assign one.</p>
  <button onClick={()=>void logout()}>Sign out</button></main>;
 return <MerchantPrototype live={live}/>;
}
