import React,{useEffect,useState} from "react";
import {Store} from "lucide-react";

/** One authoritative, branch-scoped cover across the Merchant workspace. */
export function MerchantBranchImage({src,name,className="mp-restaurant-photo"}:{
 src?:string|null;name?:string;className?:string;
}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[src]);
 return <span className={className+" mp-branch-image"}>
  {src&&!failed
   ?<img src={src} alt={(name||"Branch")+" cover"} onError={()=>setFailed(true)}/>
   :<Store size={22} aria-label="Branch cover not yet uploaded"/>}
 </span>;
}
