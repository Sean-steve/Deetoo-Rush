/** Admin-owned Merchant document review, published help, verified contacts and lifecycle decisions. */
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireAuth, requireRole } from '../auth/auth.middleware';
import { durable } from '../merchant/merchant-experience.scope';
import { AppError } from '../../middleware/error-handler';
export const merchantExperienceAdminRouter=Router();
merchantExperienceAdminRouter.use(requireAuth);
merchantExperienceAdminRouter.use(requireRole('super_admin','admin'));
const run=(f:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{Promise.resolve().then(()=>f(req,res)).catch(next)};
merchantExperienceAdminRouter.get('/documents',run(async(req,res)=>{
 const db=durable(),q=z.object({merchant_id:z.string().uuid(),limit:z.coerce.number().int().min(1).max(100).default(50)}).parse(req.query);
 const r=await db.query(`SELECT id,merchant_id,document_type,review_status,expires_at,media_id,created_at,reviewed_at
    FROM merchant_document_records WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT $2`,[q.merchant_id,q.limit]);
 res.json({data:r.rows});
}));
merchantExperienceAdminRouter.post('/documents/:id/review',run(async(req,res)=>{
 const db=durable(),id=z.string().uuid().parse(req.params.id),
  q=z.object({decision:z.enum(['VERIFIED','REJECTED']),note:z.string().trim().min(5).max(1000)}).parse(req.body);
 const r=await db.query(`UPDATE merchant_document_records SET review_status=$3,reviewed_by=$2,reviewed_at=NOW(),review_note=$4
  WHERE id=$1 AND review_status='PENDING' RETURNING id,document_type,review_status,reviewed_at`,
  [id,req.user!.id,q.decision,q.note]);
 if(!r.rowCount)throw new AppError(409,'DOCUMENT_REVIEW_INVALID','Document is not awaiting review');
 res.json({data:r.rows[0]});
}));
merchantExperienceAdminRouter.put('/help/articles/:slug',run(async(req,res)=>{
 const db=durable(),slug=z.string().regex(/^[a-z0-9-]{3,120}$/).parse(req.params.slug);
 const q=z.object({title:z.string().trim().min(4).max(255),category:z.string().trim().min(2).max(50),
   body:z.string().trim().min(20).max(40000),published:z.boolean()}).parse(req.body);
 const r=await db.query(`INSERT INTO merchant_help_articles(slug,title,category,body,published,updated_by)
   VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(slug) DO UPDATE SET title=EXCLUDED.title,category=EXCLUDED.category,
   body=EXCLUDED.body,published=EXCLUDED.published,updated_by=EXCLUDED.updated_by,updated_at=NOW()
   RETURNING id,slug,title,category,published,updated_at`,
   [slug,q.title,q.category,q.body,q.published,req.user!.id]);
 res.json({data:r.rows[0]});
}));
merchantExperienceAdminRouter.put('/help/contacts/:code',run(async(req,res)=>{
 const db=durable(),code=z.string().regex(/^[A-Z_]{3,40}$/).parse(req.params.code);
 const q=z.object({label:z.string().trim().min(3).max(120),
   phone_e164:z.string().regex(/^\+[1-9][0-9]{7,14}$/).nullable().optional(),
   email:z.string().email().nullable().optional(),hours_text:z.string().max(180).nullable().optional(),
   active:z.boolean().default(true)}).refine(v=>Boolean(v.phone_e164||v.email),{message:'Phone or email is required'}).parse(req.body);
 const r=await db.query(`INSERT INTO merchant_support_contacts(code,label,phone_e164,email,hours_text,active,verified_by)
   VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(code) DO UPDATE SET
   label=EXCLUDED.label,phone_e164=EXCLUDED.phone_e164,email=EXCLUDED.email,
   hours_text=EXCLUDED.hours_text,active=EXCLUDED.active,verified_by=EXCLUDED.verified_by,
   verified_at=NOW() RETURNING code,label,phone_e164,email,hours_text,active,verified_at`,
   [code,q.label,q.phone_e164||null,q.email||null,q.hours_text||null,q.active,req.user!.id]);
 res.json({data:r.rows[0]});
}));
merchantExperienceAdminRouter.get('/deactivation-requests',run(async(req,res)=>{
 const db=durable();
 const r=await db.query(`SELECT id,merchant_id,user_id,reason,status,created_at,reviewed_at
    FROM merchant_deactivation_requests ORDER BY created_at DESC LIMIT 100`);
 res.json({data:r.rows});
}));
merchantExperienceAdminRouter.post('/deactivation-requests/:id/review',run(async(req,res)=>{
 const db=durable(),id=z.string().uuid().parse(req.params.id),
  q=z.object({decision:z.enum(['APPROVED','REJECTED'])}).parse(req.body);
 // Approval records governance consent, but does not suspend an active multi-member
 // merchant account or terminate in-flight orders. Operations must execute separately.
 const r=await db.query(`UPDATE merchant_deactivation_requests
   SET status=$2,reviewed_by=$3,reviewed_at=NOW()
   WHERE id=$1 AND status='REQUESTED'
   RETURNING id,merchant_id,user_id,status,reviewed_at`,[id,q.decision,req.user!.id]);
 if(!r.rowCount)throw new AppError(409,'REQUEST_ALREADY_REVIEWED','Deactivation request is not pending');
 res.json({data:r.rows[0],account_changed:false});
}));
