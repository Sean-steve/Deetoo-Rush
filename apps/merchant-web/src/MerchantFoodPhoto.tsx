import React,{useState} from "react";
import {ImagePlus} from "lucide-react";
import type {MerchantLiveBridge} from "./MerchantLiveApp";
import {merchantErrorMessage} from "./merchant-branch-errors";

export function MerchantFoodPhoto({live,itemId,currentUrl,onVerified,onUploading}:{
 live?:MerchantLiveBridge;itemId?:string;currentUrl?:string;
 onVerified:(url:string)=>void;onUploading:(uploading:boolean)=>void;
}){
 const [preview,setPreview]=useState(currentUrl||""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const select=async(e:React.ChangeEvent<HTMLInputElement>)=>{
  const file=e.currentTarget.files?.[0];if(!file)return;
  e.currentTarget.value="";
  if(!["image/jpeg","image/png","image/webp"].includes(file.type)||!file.size||file.size>5*1024*1024){
    setError("Choose a JPG, PNG or WebP image smaller than 5 MB.");return;
  }
  setBusy(true);onUploading(true);setError("");
  try{
   if(!live){
    const reader=new FileReader();
    const result=await new Promise<string>((resolve,reject)=>{reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Image preview failed"));reader.readAsDataURL(file)});
    setPreview(result);onVerified(result);return;
   }
   const id=itemId||live.merchantId;
   if(!id)throw new Error("Select a Merchant branch before uploading a photo.");
   const grant=(await live.api.request<any>("/media/uploads",{method:"POST",body:JSON.stringify({
     purpose:"MERCHANT_IMAGE",content_type:file.type,
     reference_type:itemId?"MENU_ITEM":"MENU_DRAFT",reference_id:id
   })})).data;
   if(!grant?.media_id||!/^https?:\/\//.test(String(grant.upload_url||"")))
      throw new Error("The private image storage service did not return a valid upload link.");
   const upload=await fetch(grant.upload_url,{method:"PUT",headers:grant.upload_headers||{"content-type":file.type},body:file});
   if(!upload.ok)throw new Error("Image storage rejected the upload (HTTP "+upload.status+"). Check local storage and CORS configuration.");
   const verified=(await live.api.request<any>("/media/uploads/"+encodeURIComponent(grant.media_id)+"/complete",{method:"POST"})).data;
   if(verified?.status!=="VERIFIED")throw new Error("The image was not verified. The food item has not changed.");
   const reader=new FileReader();
   const previewUrl=await new Promise<string>((resolve,reject)=>{reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Image preview failed"));reader.readAsDataURL(file)});
   setPreview(previewUrl);
   onVerified("/api/v1/media/catalogue/"+grant.media_id);
  }catch(err){setError(merchantErrorMessage(err));}
  finally{setBusy(false);onUploading(false);}
 };
 return <div className="mp-food-photo-upload">
  <label>Food image <small>JPG, PNG or WebP · maximum 5 MB</small></label>
  <div className="mp-food-photo-upload-row">
    {preview&&/^(data:image\/|https?:\/\/|\/api\/v1\/media\/catalogue\/)/.test(preview)
      ?<img src={preview} alt="Food item photo preview" />
      :<div className="mp-food-photo-placeholder"><ImagePlus size={30}/></div>}
    <label className="mp-outline mp-food-photo-button"><ImagePlus size={16}/>{busy?"Uploading photo…":"Choose food photo"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>void select(e)}/></label>
  </div>
  {error&&<p role="alert" className="mp-live-error">{error}</p>}
  {live&&<small>The image is verified privately first; save the food item to publish it.</small>}
 </div>;
}