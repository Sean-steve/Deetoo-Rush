import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { config } from '@deetoo/config';
import { requireAuth,requireRole,AuthenticatedRequest } from '../auth/auth.middleware';
import { riderRepository } from './rider.repository';
import { riderVerificationService,riderDocumentTypes } from './rider-verification.service';
import { mediaService } from '../media/media.service';
import { getDbPool } from '../../db/client';
import { AppError } from '../../middleware/error-handler';
import { riderResponse } from './rider-response';

export const riderVerificationRouter=Router();
export const riderVerificationAdminRouter=Router();
const uuid=z.string().uuid();
const documentInput=z.object({
  media_id:uuid,document_type:z.enum(riderDocumentTypes),
  expires_on:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();
async function myProfile(req:AuthenticatedRequest){
  const profile=await riderRepository.findProfileByUserId(req.user!.id);
  if(!profile)throw new AppError(404,'RIDER_NOT_FOUND','Rider profile not found');
  return profile;
}
function durable(){
  if(config.storage.mode!=='postgres')throw new AppError(503,'DURABLE_STORAGE_REQUIRED','Rider verification must be stored durably');
}
riderVerificationRouter.use(requireAuth,requireRole('rider'));
riderVerificationRouter.use((_req,res,next)=>{const json=res.json.bind(res);res.json=v=>json(riderResponse(v));next();});
riderVerificationRouter.get('/verification/checklist',async(req:AuthenticatedRequest,res,next)=>{
  try{const rider=await myProfile(req);const data=await riderVerificationService.checklist(rider.id,rider.vehicleType);res.json({data});}catch(e){next(e);}
});
riderVerificationRouter.post('/verification/documents',async(req:AuthenticatedRequest,res,next)=>{
  try{
    durable();const rider=await myProfile(req);const body=documentInput.parse(req.body);
    const media=await mediaService.assertVerifiedOwnedMedia(body.media_id,req.user!.id,'RIDER_DOCUMENT');
    const pool=getDbPool();
    const existing=await pool.query('SELECT id FROM rider_verification_documents WHERE media_object_id=$1',[media.id]);
    if(existing.rows[0])throw new AppError(409,'RIDER_DOCUMENT_DUPLICATE','This private document was already submitted');
    const record=await pool.query(
      'INSERT INTO rider_verification_documents(rider_id,media_object_id,document_type,expires_on) VALUES($1,$2,$3,$4) RETURNING id,document_type,status,expires_on,created_at',
      [rider.id,media.id,body.document_type,body.expires_on||null]);
    res.status(201).json({data:record.rows[0]});
  }catch(e){next(e);}
});
riderVerificationRouter.post('/verification/equipment',async(req:AuthenticatedRequest,res,next)=>{
  try{
    durable();const rider=await myProfile(req);
    const data=z.object({delivery_bag:z.boolean(),reflective_vest:z.boolean(),helmet:z.boolean()}).strict().parse(req.body);
    const row=await getDbPool().query(
      "INSERT INTO rider_equipment_reviews(rider_id,delivery_bag,reflective_vest,helmet,status) VALUES($1,$2,$3,$4,'PENDING_REVIEW') ON CONFLICT(rider_id) DO UPDATE SET delivery_bag=EXCLUDED.delivery_bag,reflective_vest=EXCLUDED.reflective_vest,helmet=EXCLUDED.helmet,status='PENDING_REVIEW',reviewed_at=NULL,reviewed_by=NULL,rejection_reason=NULL RETURNING delivery_bag,reflective_vest,helmet,status",
      [rider.id,data.delivery_bag,data.reflective_vest,data.helmet]);
    res.status(202).json({data:row.rows[0]});
  }catch(e){next(e);}
});
riderVerificationAdminRouter.use(requireAuth,requireRole('admin','ops','super_admin'));
riderVerificationAdminRouter.get('/:riderId/verification',async(req:AuthenticatedRequest,res,next)=>{
  try{
    durable();const riderId=uuid.parse(req.params.riderId);
    const profile=await riderRepository.findProfileById(riderId);
    if(!profile)throw new AppError(404,'RIDER_NOT_FOUND','Rider profile not found');
    res.json({data:await riderVerificationService.checklist(riderId,profile.vehicleType)});
  }catch(e){next(e);}
});
riderVerificationAdminRouter.post('/:riderId/verification/documents/:documentId/review',async(req:AuthenticatedRequest,res,next)=>{
  try{
    durable();const riderId=uuid.parse(req.params.riderId),docId=uuid.parse(req.params.documentId);
    const data=z.object({decision:z.enum(['APPROVED','REJECTED']),reason:z.string().trim().min(5).max(600)}).strict().parse(req.body);
    const row=await getDbPool().query(
      "UPDATE rider_verification_documents SET status=$3,reviewed_by=$4,reviewed_at=now(),rejection_reason=CASE WHEN $3='REJECTED' THEN $5 ELSE NULL END WHERE id=$1 AND rider_id=$2 AND status='PENDING_REVIEW' RETURNING id,document_type,status,rejection_reason,reviewed_at",
      [docId,riderId,data.decision,req.user!.id,data.reason]);
    if(!row.rows[0])throw new AppError(409,'RIDER_DOCUMENT_REVIEW_INVALID','Document not found or already reviewed');
    res.json({data:row.rows[0]});
  }catch(e){next(e);}
});
riderVerificationAdminRouter.post('/:riderId/verification/equipment/review',async(req:AuthenticatedRequest,res,next)=>{
  try{
    durable();const riderId=uuid.parse(req.params.riderId);
    const data=z.object({decision:z.enum(['APPROVED','REJECTED']),reason:z.string().trim().min(5).max(600)}).strict().parse(req.body);
    const row=await getDbPool().query(
      "UPDATE rider_equipment_reviews SET status=$2,reviewed_by=$3,reviewed_at=now(),rejection_reason=CASE WHEN $2='REJECTED' THEN $4 ELSE NULL END WHERE rider_id=$1 AND status='PENDING_REVIEW' RETURNING rider_id,status,rejection_reason,reviewed_at",
      [riderId,data.decision,req.user!.id,data.reason]);
    if(!row.rows[0])throw new AppError(409,'RIDER_EQUIPMENT_REVIEW_INVALID','Equipment submission not found or already reviewed');
    res.json({data:row.rows[0]});
  }catch(e){next(e);}
});
