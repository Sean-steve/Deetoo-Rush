import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AuthProvider, useAuth } from "../../../packages/auth/src/react";
import type { DeetooApiClient } from "../../../packages/api-client/src";
import MerchantPrototype from "./MerchantPrototype";
import { MerchantApp } from "../../merchant/src/MerchantApp";
import { normalizeMerchantBranchError, merchantErrorMessage, type MerchantBranchError } from "./merchant-branch-errors";

export type LiveResource = {
  orders: any[];
  history: any[];
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
const empty:LiveResource={orders:[],history:[],metrics:null,menus:[],categories:[],items:[],inventory:[],
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
const message = merchantErrorMessage;
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
       [branchBusy,setBranchBusy]=useState(true),[branchError,setBranchError]=useState<MerchantBranchError|null>(null),
       [branchRetry,setBranchRetry]=useState(0);
 const [revision,setRevision]=useState(0),[resources,setResources]=useState<LiveResource>(empty),[loadedBranchId,setLoadedBranchId]=useState(""),
       [busy,setBusy]=useState(false),[errors,setErrors]=useState<Record<string,string>>({});
 const refresh=useCallback(()=>setRevision(v=>v+1),[]);
 const run=useCallback(async <T,>(path:string,options:RequestInit={})=>{
    const result=await apiClient.request<T>(path,options);
    refresh();return result.data;
 },[apiClient,refresh]);
 const authorized=Boolean(user?.roles?.some((x:string)=>["merchant","merchant_owner","merchant_manager","merchant_staff","admin"].includes(x)));
 useEffect(()=>{
  if(!isAuthenticated||!authorized){setBranches([]);setBranchId("");setBranchError(null);setBranchBusy(false);return;}
  let alive=true;setBranchBusy(true);setBranchError(null);
  apiClient.request<any[]>("/merchant/branches").then(({data})=>{
    if(!alive)return;
    // Never turn a malformed API response into "no branches" or a made-up success.
    if(!Array.isArray(data))throw new Error("The Merchant branch service returned an invalid response. Retry or contact support.");
    setBranches(data);
    setBranchId(previous=>data.some((b:any)=>b.id===previous)?previous:data[0]?.id||"");
  }).catch(e=>{if(alive){setBranchError(normalizeMerchantBranchError(e));setBranches([]);setBranchId("");}})
    .finally(()=>{if(alive)setBranchBusy(false);});
  return()=>{alive=false;};
 },[apiClient,isAuthenticated,authorized,revision,branchRetry]);
 useEffect(()=>{
  if(!isAuthenticated||!authorized||!branchId)return;
  let alive=true;setBusy(true);
  const url=(part:string)=>part+"?branch_id="+encode(branchId);
  const requests:Record<string,Promise<any>>={
    orders:apiClient.request<any[]>(url("/merchant/orders")+"\u0026limit=100"),
    history:apiClient.request<any[]>(url("/merchant/experience/orders/history")+"\u0026limit=100\u0026sort=newest"),
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
    setResources({...empty,...patch});setLoadedBranchId(branchId);
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
 const currentResource=loadedBranchId===branchId?resources:empty;
 const live=useMemo<MerchantLiveBridge>(()=>({api:apiClient,user,branchId,merchantId,
    branch,branches,resource:currentResource,loading:busy||loadedBranchId!==branchId,errors:loadedBranchId===branchId?errors:{},refresh,logout,setBranchId,run}),
  [apiClient,user,branchId,merchantId,branch,branches,currentResource,busy,loadedBranchId,errors,refresh,logout,run]);
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
 if(branchError)return <main className="mp-live-gate" role="alert"><h1>{branchError.title}</h1><p>{branchError.message}</p>
  {branchError.referenceId&&<p><small>Support reference: {branchError.referenceId}</small></p>}
  <button onClick={()=>setBranchRetry(v=>v+1)}>Retry branch connection</button>
  {branchError.kind==="membership"&&<button type="button" onClick={()=>void logout()}>Sign out</button>}
 </main>;
 if(!branch)return <main className="mp-live-gate"><h1>No branches available</h1>
  <p>Your Merchant organization has no branches assigned to this account yet. An owner or administrator must provision a branch or assign your account to an existing branch.</p>
  <button onClick={()=>setBranchRetry(v=>v+1)}>Refresh branches</button>
  <button onClick={()=>void logout()}>Sign out</button></main>;
 return <MerchantPrototype live={live}/>;
}
