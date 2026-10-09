import React,{useEffect,useState} from "react";
import type {MerchantLiveBridge} from "./MerchantLiveApp";
export function LiveMenuEditor({live,type,notify,onClose}:{live:MerchantLiveBridge;type:"categories"|"modifiers";notify:(s:string)=>void;onClose:()=>void}){
 const [categories,setCategories]=useState<any[]>([]),[groups,setGroups]=useState<any[]>([]),
   [name,setName]=useState(""),[price,setPrice]=useState("0"),[groupId,setGroupId]=useState(""),
   [busy,setBusy]=useState(false),[error,setError]=useState("");
 const menu=live.resource.menus?.[0]?.id;
 const load=async()=>{try{const cat=menu?(await live.api.listCategories(menu)).data:[];setCategories(cat||[]);
   const gr=(await live.api.listModifierGroups()).data;setGroups(gr||[]);setError("");
 }catch(e){setError(e instanceof Error?e.message:String(e));}};
 useEffect(()=>{void load();},[menu,live.branchId]);
 const perform=async(work:()=>Promise<unknown>)=>{setBusy(true);
  try{await work();await load();live.refresh();setName("");notify("Catalogue saved to DeeToo");}
  catch(e){notify("Unable to update catalogue: "+(e instanceof Error?e.message:String(e)));}
  finally{setBusy(false);}};
 return <div>
  <p>{type==="categories"?"Create, rename and remove food categories. Existing items must be reassigned before a category is removed.":"Manage modifier groups and optional extras, including their price additions."}</p>
  {error&&<p role="alert" className="mp-live-error">{error}</p>}
  {!menu&&type==="categories"&&<p>No menu is available. Create a menu before adding categories.</p>}
  {type==="categories"?<div>{categories.map(c=><div className="mp-modal-row" key={c.id}><span>{c.name}</span>
    <button className="mp-outline" onClick={()=>{const next=window.prompt("Rename category",c.name);if(next)void perform(()=>live.api.updateCategory(c.id,{name:next}));}}>Rename</button>
    <button className="mp-danger-light" onClick={()=>{if(window.confirm("Remove this category? Existing item links may block deletion."))void perform(()=>live.api.deleteCategory(c.id));}}>Delete</button></div>)}
    <form onSubmit={e=>{e.preventDefault();if(menu)void perform(()=>live.api.createCategory(menu,{name}));}}>
     <label>New food category<input required value={name} onChange={e=>setName(e.target.value)}/></label>
     <button type="submit" className="mp-primary mp-full" disabled={busy||!menu}>+ Add category</button></form></div>
   :<div>{groups.map(g=><div className="mp-modal-row" key={g.id}><span>{g.name} <small>Min {g.min_selections}, max {g.max_selections}</small></span>
     <button className="mp-outline" onClick={()=>{const name=window.prompt("Rename modifier group",g.name);if(name)void perform(()=>live.api.updateModifierGroup(g.id,{name}));}}>Rename</button>
     <button className="mp-danger-light" onClick={()=>{if(window.confirm("Delete modifier group and its links?"))void perform(()=>live.api.deleteModifierGroup(g.id));}}>Delete</button></div>)}
     <form onSubmit={e=>{e.preventDefault();void perform(()=>live.api.createModifierGroup({name,min_selections:0,max_selections:1}));}}>
       <label>New modifier group<input required value={name} onChange={e=>setName(e.target.value)}/></label>
       <button className="mp-primary mp-full" disabled={busy}>+ Add modifier group</button></form>
     <h3>Add an option</h3><form onSubmit={e=>{e.preventDefault();void perform(()=>live.api.createModifierOption(groupId,{name,price_delta_minor:Math.round(Number(price)*100)}));}}>
       <label>Group<select required value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">Select group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
       <label>Option name<input required value={name} onChange={e=>setName(e.target.value)}/></label>
       <label>Price addition (KES)<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label>
       <button className="mp-primary mp-full" disabled={!groupId||busy}>Add modifier option</button></form>
    </div>}
  <button className="mp-outline mp-full" onClick={onClose}>Done</button>
 </div>;
}
