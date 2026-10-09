import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireAuth, requireRole } from '../auth/auth.middleware';
import { AppError } from '../../middleware/error-handler';
import { ownBranch, ownMerchant, durable, datesSchema, pageSchema } from './merchant-experience.scope';
import { merchantScope } from '../auth/scope';
import { effectiveMerchantCapabilities, platformRoleCan, roleCapabilities, requireMerchantCapability } from './merchant-role-policy.service';

export const merchantExperienceRouter=Router();
merchantExperienceRouter.use(requireAuth);
merchantExperienceRouter.use(requireRole('merchant','merchant_owner','merchant_manager','merchant_staff'));
const run=(fn:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{Promise.resolve().then(()=>fn(req,res)).catch(next)};
const branchQuery=z.object({branch_id:z.string().uuid()}).merge(datesSchema);

merchantExperienceRouter.get('/orders/history',run(async(req,res)=>{
  const db=durable(),q=branchQuery.merge(pageSchema).extend({
    status:z.string().trim().max(45).optional(),q:z.string().trim().max(100).optional(),
    sort:z.enum(['oldest','newest']).default('oldest')}).parse(req.query);
  const {id}=await ownBranch(req);
  const rows=await db.query(`SELECT o.id,o.public_code,o.status,o.branch_id,o.subtotal_minor,o.total_minor,
     o.placed_at,o.created_at,o.completed_at,o.updated_at FROM orders o
     WHERE o.branch_id=$1
     AND EXISTS(SELECT 1 FROM payment_capture_evidence e WHERE e.order_id=o.id)
     AND ($2::timestamptz IS NULL OR o.created_at >=$2::timestamptz)
     AND ($3::timestamptz IS NULL OR o.created_at <$3::timestamptz)
     AND ($4::text IS NULL OR o.status=$4)
     AND ($5::text IS NULL OR o.public_code ILIKE '%'||$5||'%')
     ORDER BY CASE WHEN $6='oldest' THEN o.created_at END ASC,
       CASE WHEN $6='newest' THEN o.created_at END DESC,o.id ASC LIMIT $7 OFFSET $8`,
     [id,q.from||null,q.to||null,q.status||null,q.q||null,q.sort,q.limit,q.offset]);
  res.json({data:rows.rows,meta:{limit:q.limit,offset:q.offset,has_more:rows.rows.length===q.limit}});
}));

merchantExperienceRouter.get('/orders/metrics',run(async(req,res)=>{
  const db=durable(),q=branchQuery.parse(req.query),{id}=await ownBranch(req);
  const result=await db.query(`WITH paid AS (
    SELECT o.id,o.status,o.created_at FROM orders o
    WHERE o.branch_id=$1
      AND EXISTS(SELECT 1 FROM payment_capture_evidence e WHERE e.order_id=o.id)
       AND ($2::timestamptz IS NULL OR o.created_at >=$2::timestamptz)
       AND ($3::timestamptz IS NULL OR o.created_at <$3::timestamptz)
   ), preparation AS (
     SELECT p.id,MIN(h.created_at) FILTER(WHERE h.to_status='PREPARING') AS began,
       MIN(h.created_at) FILTER(WHERE h.to_status='READY') AS ready
     FROM paid p JOIN order_status_history h ON h.order_id=p.id GROUP BY p.id)
   SELECT (SELECT COUNT(*)::int FROM paid) AS total,
     (SELECT COUNT(*)::int FROM paid WHERE status IN ('PLACED','PENDING_MERCHANT_ACCEPTANCE')) AS new_orders,
     (SELECT COUNT(*)::int FROM paid WHERE status IN ('ACCEPTED','PREPARING')) AS preparing,
     (SELECT COUNT(*)::int FROM paid WHERE status='READY') AS ready,
     (SELECT COUNT(*)::int FROM paid WHERE status IN ('DELIVERED','COMPLETED')) AS completed,
     (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ready-began))/60)::numeric,1)
         FROM preparation WHERE began IS NOT NULL AND ready IS NOT NULL AND ready>=began) AS avg_prep_minutes`,
    [id,q.from||null,q.to||null]);
  res.json({data:result.rows[0]});
}));

merchantExperienceRouter.get('/branches/:branchId/policies',run(async(req,res)=>{
  const db=durable(),{id}=await ownBranch(req);
  const r=await db.query('SELECT * FROM merchant_branch_policies WHERE branch_id=$1',[id]);
  res.json({data:r.rows[0]||{branch_id:id,delivery_enabled:true,pickup_enabled:false,dine_in_enabled:false,table_qr_enabled:false,max_concurrent_orders:30,cover_media_id:null}});
}));
merchantExperienceRouter.put('/branches/:branchId/policies',run(async(req,res)=>{
  const db=durable(),{id,merchantId}=await ownBranch(req,true);
  await requireMerchantCapability(req.user!.id,merchantId,'BRANCH_WRITE');
  const q=z.object({delivery_enabled:z.boolean(),pickup_enabled:z.boolean(),dine_in_enabled:z.boolean(),
    table_qr_enabled:z.boolean(),max_concurrent_orders:z.number().int().min(1).max(500),
    cover_media_id:z.string().uuid().nullable().optional()
  }).refine(v=>!v.table_qr_enabled||v.dine_in_enabled,{message:'QR tables require dine-in enabled'}).parse(req.body);
  if(q.cover_media_id){
    const media=await db.query(`SELECT 1 FROM media_objects WHERE id=$1 AND owner_user_id=$2
       AND purpose='MERCHANT_IMAGE' AND status='VERIFIED'`,[q.cover_media_id,req.user!.id]);
    if(!media.rowCount)throw new AppError(403,'MEDIA_ACCESS_DENIED','Only verified merchant images uploaded by you may be attached');
  }
  const r=await db.query(`INSERT INTO merchant_branch_policies(branch_id,delivery_enabled,pickup_enabled,dine_in_enabled,table_qr_enabled,max_concurrent_orders,cover_media_id,updated_by)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(branch_id) DO UPDATE
  SET delivery_enabled=EXCLUDED.delivery_enabled,pickup_enabled=EXCLUDED.pickup_enabled,
  dine_in_enabled=EXCLUDED.dine_in_enabled,table_qr_enabled=EXCLUDED.table_qr_enabled,
  max_concurrent_orders=EXCLUDED.max_concurrent_orders,cover_media_id=EXCLUDED.cover_media_id,
  updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING *`,
  [id,q.delivery_enabled,q.pickup_enabled,q.dine_in_enabled,q.table_qr_enabled,q.max_concurrent_orders,q.cover_media_id??null,req.user!.id]);
  res.json({data:r.rows[0]});
}));

merchantExperienceRouter.get('/documents',run(async(req,res)=>{
  const db=durable(),id=await ownMerchant(req);
  const r=await db.query(`SELECT id,document_type,review_status,expires_at,reviewed_at,created_at,media_id
     FROM merchant_document_records WHERE merchant_id=$1 ORDER BY created_at DESC`,[id]);
  res.json({data:r.rows});
}));
merchantExperienceRouter.post('/documents',run(async(req,res)=>{
  const db=durable(),id=await ownMerchant(req,true);
  await requireMerchantCapability(req.user!.id,id,'DOCUMENTS_WRITE');
  const input=z.object({media_id:z.string().uuid(),document_type:z.enum(['BUSINESS_REGISTRATION','KRA_PIN','FOOD_HANDLING','OTHER']),expires_at:z.string().date().nullable().optional()}).parse(req.body);
  const r=await db.query(`INSERT INTO merchant_document_records(merchant_id,media_id,document_type,expires_at,uploaded_by)
    SELECT $1,m.id,$3,$4,$2 FROM media_objects m WHERE m.id=$5 AND m.owner_user_id=$2
       AND m.purpose='MERCHANT_DOCUMENT' AND m.status='VERIFIED'
    RETURNING id,media_id,document_type,review_status,expires_at,created_at`,
    [id,req.user!.id,input.document_type,input.expires_at||null,input.media_id]);
  if(!r.rowCount)throw new AppError(403,'DOCUMENT_MEDIA_FORBIDDEN','Verified document belonging to uploader required');
  res.status(201).json({data:r.rows[0]});
}));
merchantExperienceRouter.get('/help/articles',run(async(req,res)=>{
  const db=durable();await ownMerchant(req);
  const q=z.string().trim().max(80).optional().parse(req.query.q);
  const r=await db.query(`SELECT id,slug,title,category,body,updated_at FROM merchant_help_articles
   WHERE published=TRUE AND ($1::text IS NULL OR title ILIKE '%'||$1||'%' OR body ILIKE '%'||$1||'%')
   ORDER BY category,title LIMIT 60`,[q||null]);
  res.json({data:r.rows});
}));
// Configuration observability, not a declaration of successful provider delivery.
// Never include credential bytes, customer payment details or secrets in this response.
merchantExperienceRouter.get('/roles/capabilities',run(async(req,res)=>{
 const merchantId=await ownMerchant(req);
 res.json({data:{merchant_id:merchantId,roles:await effectiveMerchantCapabilities(merchantId),
   semantics:'Owner may restrict existing capabilities; cannot grant permissions beyond platform RBAC.'}});
}));
merchantExperienceRouter.put('/roles/capabilities/:role',run(async(req,res)=>{
 const db=durable(),merchantId=await ownMerchant(req);
 await merchantScope(req.user!,merchantId,true,false,false);
 const role=z.enum(['merchant_manager','merchant_staff']).parse(req.params.role);
 const input=z.object({capability:z.enum(roleCapabilities),allowed:z.boolean()}).strict().parse(req.body);
 if(!platformRoleCan(role,input.capability))
   throw new AppError(403,'CAPABILITY_ESCALATION_FORBIDDEN','Cannot grant a capability not permitted by platform RBAC');
 const saved=await db.query(`INSERT INTO merchant_role_capability_controls
   (merchant_id,role_code,capability,allowed,updated_by)
   VALUES($1,$2,$3,$4,$5)
   ON CONFLICT (merchant_id,role_code,capability) DO UPDATE
   SET allowed=EXCLUDED.allowed,updated_by=EXCLUDED.updated_by,updated_at=NOW()
   RETURNING role_code,capability,allowed,updated_at`,
   [merchantId,role,input.capability,input.allowed,req.user!.id]);
 res.json({data:saved.rows[0]});
}));

merchantExperienceRouter.get('/providers/readiness',run(async(req,res)=>{
  await ownMerchant(req);
  const keys=(...names:string[])=>names.every(n=>Boolean(process.env[n]?.trim()));
  const checks={
    geocoding:keys('MAPBOX_ACCESS_TOKEN'),
    object_storage:keys('OBJECT_STORAGE_BUCKET','OBJECT_STORAGE_REGION','OBJECT_STORAGE_ACCESS_KEY_ID','OBJECT_STORAGE_SECRET_ACCESS_KEY'),
    push:keys('FCM_PROJECT_ID','FCM_CLIENT_EMAIL','FCM_PRIVATE_KEY'),
    email:keys('RESEND_API_KEY','AUTH_EMAIL_FROM'),
    sms:keys('AFRICASTALKING_API_KEY','AFRICASTALKING_USERNAME','AUTH_SMS_FROM'),
    mpesa:keys('MPESA_CONSUMER_KEY','MPESA_CONSUMER_SECRET'),
  };
  res.json({data:{
    providers:Object.fromEntries(Object.entries(checks).map(([name,configured])=>[name,{
      status:configured?'CONFIGURATION_PRESENT':'NOT_CONFIGURED',
      configured,delivery_verified:false,
      note:'Credential presence is not a health check. Complete provider sandbox and callback tests in staging.'
    }])),
    production_ready:false,reason:'External provider readiness requires successful authenticated staging probes and audited callbacks.'
  }});
}));

merchantExperienceRouter.get('/help/contact',run(async(req,res)=>{
  const db=durable();await ownMerchant(req);
  const r=await db.query('SELECT code,label,phone_e164,email,hours_text FROM merchant_support_contacts WHERE active=TRUE ORDER BY code');
  res.json({data:r.rows,configured:(r.rowCount||0)>0});
}));
