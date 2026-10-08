import {useState} from "react";
import {AlertCircle,RefreshCw} from "lucide-react";
import type {ResourceState} from "./resource";
import {FoodArt} from "../components/FoodArt";
import type {Cuisine} from "../data/preview";

export const money=(minor:number):string=>"Ksh "+(minor/100).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
export function SafePhoto({src,alt="",kind="Burgers",className=""}:{src?:string|null;alt?:string;kind?:Cuisine;className?:string}){
 const [failed,setFailed]=useState(false);
 return <div className={"dt-shop-photo "+className}><FoodArt kind={kind}/>{src&&!failed&&<img src={src} alt={alt} loading="lazy" onError={()=>setFailed(true)}/>}</div>;
}
export function StatusPanel({title,description,onRetry,children,loading=false}:{title:string;description?:string;onRetry?:()=>void;children?:React.ReactNode;loading?:boolean}){
 return <section className="dt-live-state" aria-live="polite" role={loading?"status":undefined}><div className="dt-live-state-icon">{loading?<span className="dt-live-spinner"/>:<AlertCircle size={27}/>}</div><h2>{title}</h2>{description&&<p>{description}</p>}{children}{onRetry&&<button onClick={onRetry} type="button"><RefreshCw size={16}/> Try again</button>}</section>;
}
export function ResourceView<T>({resource,onRetry,empty,children}:{resource:ResourceState<T>;onRetry:()=>void;empty:string;children:(data:T)=>React.ReactNode}){
 switch(resource.status){
  case "idle": case "loading":return <StatusPanel loading title="Loading DeeToo…" description="Checking the latest information."/>;
  case "error":return <StatusPanel title="Unable to load this information" description={resource.message} onRetry={onRetry}/>;
  case "empty":return <StatusPanel title={empty} description="There are no results to show right now."/>;
  case "ready":return <>{children(resource.data)}</>;
 }
}
