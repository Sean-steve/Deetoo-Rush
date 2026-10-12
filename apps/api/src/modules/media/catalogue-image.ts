/**
 * Stable, public-to-display catalogue image URLs. The S3 object remains private:
 * a visitor can only obtain a short-lived signed URL for a VERIFIED Merchant
 * image that is actually attached to a saved food item.
 */
import { config } from "@deetoo/config";
import { getDbPool } from "../../db/client";
import { AppError } from "../../middleware/error-handler";
import { mediaRepository } from "./media.repository";
import { mediaService } from "./media.service";

export const catalogueImagePattern = /^\/api\/v1\/media\/catalogue\/([0-9a-f]{8}-[0-9a-f-]{27,})$/i;
export const catalogueImageUrl = (id:string) => "/api/v1/media/catalogue/" + id;

export async function validateCatalogueImageForItem(
 imageUrl:string|undefined,
 actorUserId:string,
 merchantId:string,
 itemId?:string,
):Promise<void>{
 if(!imageUrl?.startsWith("/api/v1/media/catalogue/"))return;
 const mediaId = catalogueImagePattern.exec(imageUrl)?.[1];
 if(!mediaId)throw new AppError(400,"INVALID_MENU_IMAGE","Invalid food photo reference");
 const media=await mediaRepository.findById(mediaId);
 if(!media || media.status!=="VERIFIED" || media.purpose!=="MERCHANT_IMAGE" ||
    media.owner_user_id!==actorUserId ||
    !(media.reference_type==="MENU_DRAFT" && media.reference_id===merchantId ||
      media.reference_type==="MENU_ITEM" && media.reference_id===itemId)) {
  throw new AppError(403,"MENU_IMAGE_FORBIDDEN","Upload and verify your own food image before attaching it to this item");
 }
}

export async function publicCatalogueImageRedirect(mediaId:string):Promise<string>{
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(mediaId))throw new AppError(404,"MENU_IMAGE_NOT_FOUND","Food image not found");
 if(config.storage.mode!=="postgres")throw new AppError(404,"MENU_IMAGE_NOT_FOUND","Food image not found");
 const media=await mediaRepository.findById(mediaId);
 if(!media||media.status!=="VERIFIED"||media.purpose!=="MERCHANT_IMAGE"||!media.content_type.startsWith("image/"))
  throw new AppError(404,"MENU_IMAGE_NOT_FOUND","Food image not found");
 const rows=await getDbPool().query(
  "SELECT i.id FROM menu_items i JOIN menus m ON m.id=i.menu_id WHERE i.image_url=$1 AND m.is_active=true LIMIT 1",
  [catalogueImageUrl(mediaId)]
 );
 if(!rows.rowCount)throw new AppError(404,"MENU_IMAGE_NOT_FOUND","Food image not found");
 // Explicitly authorize this previously verified catalogue object; no generic
 // public /media/:id endpoint is exposed.
 return mediaService.getPublicVerifiedCatalogueImageUrl(mediaId);
}
