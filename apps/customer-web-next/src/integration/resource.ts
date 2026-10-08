import {useCallback,useEffect,useRef,useState} from "react";

/** Loading/error state shared by future screen adapters; no silent fixture fallback. */
export type ResourceState<T> =
 | {status:"idle"}
 | {status:"loading"}
 | {status:"ready";data:T}
 | {status:"empty";data:T}
 | {status:"error";message:string;code:string};
export function backendError(error:unknown):{code:string;message:string}{
  const detail=error&&typeof error==="object"&&"error" in error?(error as {error?:{code?:unknown;message?:unknown}}).error:null;
  const code=typeof detail?.code==="string"?detail.code:"UNKNOWN";
  if(code==="UNAUTHORIZED"||code==="HTTP_401")return {code:"UNAUTHORIZED",message:"Your session has expired. Please sign in again."};
  if(code==="FORBIDDEN"||code==="HTTP_403"||code==="FORBIDDEN_OPERATION")return {code:"FORBIDDEN",message:"You do not have permission to view this information."};
  if(code==="TIMEOUT")return {code:"TIMEOUT",message:"The DeeToo server took too long to respond. Try again."};
  if(code==="HTTP_404"||code==="NOT_FOUND")return {code:"NOT_FOUND",message:"We couldn't find the requested information."};
  if(code==="HTTP_409"||code==="CONFLICT")return {code:"CONFLICT",message:"This information changed. Refresh and try again."};
  if(code==="HTTP_429"||code==="RATE_LIMITED")return {code:"RATE_LIMITED",message:"Too many requests. Please wait before trying again."};
  if(error instanceof Error&&error.name==="IntegrationUnavailableError")return {code:"UNSUPPORTED",message:error.message};
  if(error instanceof Error&&error.name==="ContractMismatchError")return {code:"CONTRACT_MISMATCH",message:"The DeeToo API returned an unexpected response. Please retry."};
  return {code,message:"We couldn't load this information. Check your connection and try again."};
}
export function isEmptyData(value:unknown):boolean {
  return value===null||Array.isArray(value)&&value.length===0;
}
/**
 * Reject stale results on unmount, dependency change or refresh, including under
 * React StrictMode. Underlying legacy apiClient has its own timeout/retry logic.
 */
export function useBackendResource<T>(load:()=>Promise<T>,enabled:boolean,dependencies:readonly unknown[]=[]){
  const [state,setState]=useState<ResourceState<T>>({status:"idle"});
  const loaderRef=useRef(load);
  loaderRef.current=load;
  const [epoch,setEpoch]=useState(0);
  const refresh=useCallback(()=>setEpoch(n=>n+1),[]);
  useEffect(()=>{
    if(!enabled){setState({status:"idle"});return;}
    let active=true;
    setState({status:"loading"});
    void loaderRef.current().then(data=>{
      if(active)setState(isEmptyData(data)?{status:"empty",data}:{status:"ready",data});
    }).catch(error=>{
      if(active)setState({status:"error",...backendError(error)});
    });
    return ()=>{active=false;};
  // The caller supplies keys identifying the resource (including the signed-in identity).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[enabled,epoch,...dependencies]);
  return {state,refresh};
}
