import {config} from "@deetoo/config";
import {getDbPool} from "../../db/client";
import {AppError} from "../../middleware/error-handler";
import {mediaService} from "./media.service";

/** A customer-facing cover has a stable URL, never a persisted presigned S3 URL. */
export const branchCoverImageUrl=(branchId:string)=>"/api/v1/media/branches/"+branchId+"/cover";

// Only publish photos that are verified and attached to an active, approved branch.
const verifiedBranchCoverJoin=`FROM merchant_branch_policies p
 JOIN merchant_branches b ON b.id=p.branch_id
 JOIN merchants merchant ON merchant.id=b.merchant_id
 JOIN media_objects media ON media.id=p.cover_media_id
 WHERE b.status='ACTIVE' AND merchant.status='ACTIVE'
   AND merchant.approval_status='APPROVED'
   AND media.status='VERIFIED' AND media.purpose='MERCHANT_IMAGE'
   AND media.reference_type='BRANCH' AND media.reference_id=b.id
   AND media.content_type LIKE 'image/%'`;

export async function publishedBranchCoverIds(branchIds:string[]):Promise<Set<string>>{
 if(config.storage.mode!=="postgres"||branchIds.length===0)return new Set();
 const rows=await getDbPool().query(
  "SELECT p.branch_id "+verifiedBranchCoverJoin+" AND p.branch_id=ANY($1::uuid[])",
  [branchIds]
 );
 return new Set(rows.rows.map((x:any)=>String(x.branch_id)));
}

export async function publicBranchCoverRedirect(branchId:string):Promise<string>{
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(branchId)||config.storage.mode!=="postgres")
  throw new AppError(404,"BRANCH_COVER_NOT_FOUND","Restaurant cover not found");
 const result=await getDbPool().query(
  "SELECT media.id,media.owner_user_id "+verifiedBranchCoverJoin+" AND p.branch_id=$1 LIMIT 1",
  [branchId]
 );
 if(!result.rowCount)throw new AppError(404,"BRANCH_COVER_NOT_FOUND","Restaurant cover not found");
 // The publication conditions above authorize this specific image. The media
 // service still validates its verified state and issues a 5-minute signed URL.
 return mediaService.getReadUrl(result.rows[0].id,result.rows[0].owner_user_id);
}
