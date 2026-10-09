import React,{useEffect,useState} from "react";
import type {MerchantLiveBridge} from "./MerchantLiveApp";
export function LiveInventoryControls({live,itemId,notify}:{live:MerchantLiveBridge;itemId:string;notify:(message:string)=>void}){
 const row=(live.resource.inventory||[]).find((x:any)=>x.item_id===itemId);
 const [delta,setDelta]=useState(""),[reason,setReason]=useState("Stock count correction"),
       [threshold,setThreshold]=useState("3"),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{setThreshold(String(row?.low_stock_threshold??3));},[row?.low_stock_threshold,itemId]);
 const run=async(path:string,method:string,payload:unknown)=>{setBusy(true);setError("");
   try{await live.api.request(path,{method,body:JSON.stringify(payload)});live.refresh();setDelta("");
      notify("Inventory saved to DeeToo");
   }catch(e){const detail=e instanceof Error?e.message:String(e);setError(detail);notify("Inventory update failed: "+detail);}
   finally{setBusy(false);}
 };
 const base=`/merchant/experience/branches/${live.branchId}/inventory/${itemId}`;
 return <section className="mp-live-inventory">
   <h3>Tracked inventory</h3>
   <p>{row?<>Available stock: <strong>{row.quantity}</strong> · Low-stock threshold: <strong>{row.low_stock_threshold}</strong></>:
     "This item is not yet inventory-managed. An initial positive adjustment starts tracking its stock."}</p>
   {error&&<div className="mp-live-error" role="alert">{error}</div>}
   <form onSubmit={e=>{e.preventDefault();const amount=Number(delta);
     if(!Number.isSafeInteger(amount)||amount===0){setError("Use a nonzero whole-number adjustment");return;}
     void run(base+"/adjust","POST",{delta:amount,reason,idempotency_key:crypto.randomUUID()});
   }}>
    <label>Quantity change (+ restock, − count correction)<input type="number" required step="1" value={delta} onChange={e=>setDelta(e.target.value)}/></label>
    <label>Reason<input minLength={4} required maxLength={120} value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <button className="mp-primary mp-full" disabled={busy||!delta}>Record stock adjustment</button>
   </form>
   <form onSubmit={e=>{e.preventDefault();void run(base+"/threshold","PUT",{low_stock_threshold:Number(threshold)});}}>
    <label>Low-stock alert threshold<input type="number" min="0" step="1" value={threshold} onChange={e=>setThreshold(e.target.value)}/></label>
    <button className="mp-outline mp-full" disabled={busy||!row}>Save stock alert threshold</button>
   </form>
   <p>Tracked checkout stock holds and automatic expiry are enforced server-side. Untracked products remain available until inventory is initialized.</p>
 </section>;
}
