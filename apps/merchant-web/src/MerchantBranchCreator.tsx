import React, {useState} from "react";
import {MapPin,Plus,Store} from "lucide-react";
import type {MerchantLiveBridge} from "./MerchantLiveApp";
import {merchantErrorMessage} from "./merchant-branch-errors";

export function MerchantBranchCreator({live,onClose,notify}:{
 live:MerchantLiveBridge;onClose:()=>void;notify:(message:string)=>void;
}){
 const [form,setForm]=useState({name:"",display_name:"",description:"",address_line1:"",city:"",region:"",latitude:"",longitude:"",phone:"",email:""});
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const patch=(key:keyof typeof form,value:string)=>setForm(v=>({...v,[key]:value}));
 const save=async(e:React.FormEvent)=>{
  e.preventDefault();setError("");
  const lat=Number(form.latitude),lon=Number(form.longitude);
  if(!form.latitude.trim()||!form.longitude.trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180){
    setError("Enter valid latitude (-90 to 90) and longitude (-180 to 180).");return;
  }
  setBusy(true);
  try{
    const result=await live.api.request<any>("/merchant/branches?merchant_id="+encodeURIComponent(live.merchantId),{method:"POST",body:JSON.stringify({
      name:form.name.trim(),display_name:(form.display_name||form.name).trim(),
      description:form.description,address_line1:form.address_line1.trim(),
      city:form.city.trim(),region:(form.region||form.city).trim(),
      country_code:"KE",latitude:lat,longitude:lon,
      ...(form.phone.trim()?{phone:form.phone.trim()}:{}),
      ...(form.email.trim()?{email:form.email.trim()}:{}),
    })});
    const id=String(result.data?.id||"");
    if(!id)throw new Error("Branch was created but no branch ID was returned. Refresh your branches before trying again.");
    // Existing backend provisions default hours and finds service zones; the new
    // branch remains closed until deliberately opened and given a menu.
    live.setBranchId(id);live.refresh();onClose();
    notify("Branch created. Set up its menu and hours before opening for orders.");
  }catch(err){setError(merchantErrorMessage(err));}finally{setBusy(false);}
 };
 return <form className="mp-create-branch" onSubmit={save}>
  <p>Add an authorized merchant branch. It starts closed, with default opening hours and service-zone checks. Your other branches are not changed.</p>
  <div className="mp-create-branch-grid">
    <label>Branch name *<input required minLength={2} maxLength={255} value={form.name} onChange={e=>patch("name",e.target.value)} placeholder="e.g. Westlands Kitchen"/></label>
    <label>Customer display name<input maxLength={255} value={form.display_name} onChange={e=>patch("display_name",e.target.value)} placeholder="Defaults to branch name"/></label>
    <label className="mp-full-row">Description<textarea maxLength={1000} value={form.description} onChange={e=>patch("description",e.target.value)}/></label>
    <label className="mp-full-row">Street address *<input required minLength={2} value={form.address_line1} onChange={e=>patch("address_line1",e.target.value)}/></label>
    <label>Town / city *<input required minLength={2} value={form.city} onChange={e=>patch("city",e.target.value)}/></label>
    <label>Region / county<input value={form.region} onChange={e=>patch("region",e.target.value)} placeholder="Defaults to city"/></label>
    <label>Latitude *<input required type="number" step="any" min={-90} max={90} value={form.latitude} onChange={e=>patch("latitude",e.target.value)}/></label>
    <label>Longitude *<input required type="number" step="any" min={-180} max={180} value={form.longitude} onChange={e=>patch("longitude",e.target.value)}/></label>
    <label>Contact phone<input value={form.phone} onChange={e=>patch("phone",e.target.value)}/></label>
    <label>Contact email<input type="email" value={form.email} onChange={e=>patch("email",e.target.value)}/></label>
  </div>
  <button type="button" className="mp-outline" onClick={()=>{
   if(!navigator.geolocation){setError("Geolocation is unavailable. Enter the coordinates manually.");return;}
   navigator.geolocation.getCurrentPosition(pos=>{setForm(v=>({...v,latitude:String(pos.coords.latitude),longitude:String(pos.coords.longitude)}));setError("");},()=>setError("Location permission unavailable. Enter coordinates manually."));
  }}><MapPin size={15}/> Use my coordinates</button>
  {error&&<p role="alert" className="mp-live-error">{error}</p>}
  <div className="mp-modal-actions"><button type="button" className="mp-outline" onClick={onClose}>Cancel</button><button type="submit" className="mp-primary" disabled={busy}><Plus size={15}/>{busy?"Creating branch…":"Create branch"}</button></div>
 </form>;
}
