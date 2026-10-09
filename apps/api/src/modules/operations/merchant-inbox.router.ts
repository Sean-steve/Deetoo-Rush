import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../auth/auth.middleware';
import { durable, ownMerchant, pageSchema } from '../merchant/merchant-experience.scope';
import { AppError } from '../../middleware/error-handler';
export const merchantInboxRouter=Router();
merchantInboxRouter.use(requireAuth);
const run=(f:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{Promise.resolve().then(()=>f(req,res)).catch(next)};
const inboxFilter=z.object({
  category:z.enum(['ORDERS','PAYMENTS','PAYOUTS','MENU','BUSINESS','SYSTEM','SUPPORT']).optional(),
  state:z.enum(['all','unread','read']).default('all'),
  from:z.string().datetime({offset:true}).optional(),
  sort:z.enum(['newest','oldest']).default('newest'),
}).merge(pageSchema);
function categorySql(alias:string){
 return `CASE
   WHEN ${alias}.template_code ILIKE '%ORDER%' OR ${alias}.template_code ILIKE '%PREP%' THEN 'ORDERS'
   WHEN ${alias}.template_code ILIKE '%PAYMENT%' THEN 'PAYMENTS'
   WHEN ${alias}.template_code ILIKE '%PAYOUT%' OR ${alias}.template_code ILIKE '%SETTLEMENT%' THEN 'PAYOUTS'
   WHEN ${alias}.template_code ILIKE '%MENU%' OR ${alias}.template_code ILIKE '%STOCK%' THEN 'MENU'
   WHEN ${alias}.template_code ILIKE '%SUPPORT%' OR ${alias}.template_code ILIKE '%CASE%' THEN 'SUPPORT'
   WHEN ${alias}.template_code ILIKE '%MERCHANT%' OR ${alias}.template_code ILIKE '%BRANCH%' THEN 'BUSINESS'
   ELSE 'SYSTEM' END`;
}
async function viewers(req:AuthenticatedRequest){
 const merchantId=await ownMerchant(req);
 return {merchantId,recipientIds:[merchantId,req.user!.id]};
}
merchantInboxRouter.get('/',run(async(req,res)=>{
 const db=durable(),q=inboxFilter.parse(req.query),v=await viewers(req);
 const r=await db.query(`WITH inbox AS (
   SELECT n.id,n.template_code,n.subject,n.payload,n.status,n.created_at,n.recipient_id,
     COALESCE(viewer.read_at,CASE WHEN n.recipient_id=$2 THEN n.read_at ELSE NULL END) AS read_at,
     viewer.archived_at,${categorySql('n')} AS category
   FROM notifications n LEFT JOIN merchant_notification_views viewer
     ON viewer.notification_id=n.id AND viewer.user_id=$2
   WHERE n.recipient_type='MERCHANT' AND n.channel='IN_APP'
     AND n.recipient_id=ANY($1::text[])
 )
 SELECT * FROM inbox WHERE archived_at IS NULL
  AND ($3::text IS NULL OR category=$3)
  AND ($4='all' OR ($4='read' AND read_at IS NOT NULL) OR ($4='unread' AND read_at IS NULL))
  AND ($5::timestamptz IS NULL OR created_at>=$5::timestamptz)
 ORDER BY CASE WHEN $6='newest' THEN created_at END DESC,
          CASE WHEN $6='oldest' THEN created_at END ASC,id DESC
 LIMIT $7 OFFSET $8`,[v.recipientIds,req.user!.id,q.category||null,q.state,q.from||null,q.sort,q.limit,q.offset]);
 res.json({data:r.rows,meta:{limit:q.limit,offset:q.offset,has_more:r.rows.length===q.limit}});
}));
async function authorizedNotification(req:AuthenticatedRequest,id:string){
 const db=durable(),v=await viewers(req);
 const r=await db.query(`SELECT id FROM notifications WHERE id=$1 AND recipient_type='MERCHANT'
   AND channel='IN_APP' AND recipient_id=ANY($2::text[])`,[id,v.recipientIds]);
 if(!r.rowCount)throw new AppError(404,'NOTIFICATION_NOT_FOUND','Notification not found');
}
merchantInboxRouter.post('/read-all',run(async(req,res)=>{
 const db=durable(),v=await viewers(req);
 const r=await db.query(`INSERT INTO merchant_notification_views(notification_id,user_id,read_at)
 SELECT n.id,$2,NOW() FROM notifications n
 WHERE n.recipient_type='MERCHANT' AND n.channel='IN_APP' AND n.recipient_id=ANY($1::text[])
 ON CONFLICT(notification_id,user_id) DO UPDATE SET read_at=COALESCE(merchant_notification_views.read_at,NOW())
 RETURNING notification_id`,[v.recipientIds,req.user!.id]);
 res.json({data:{updated:r.rowCount||0}});
}));
merchantInboxRouter.post('/:id/read',run(async(req,res)=>{
 const db=durable(),id=z.string().uuid().parse(req.params.id);await authorizedNotification(req,id);
 const r=await db.query(`INSERT INTO merchant_notification_views(notification_id,user_id,read_at)
 VALUES($1,$2,NOW()) ON CONFLICT(notification_id,user_id) DO UPDATE
 SET read_at=COALESCE(merchant_notification_views.read_at,NOW()) RETURNING *`,[id,req.user!.id]);
 res.json({data:r.rows[0]});
}));
merchantInboxRouter.post('/:id/dismiss',run(async(req,res)=>{
 const db=durable(),id=z.string().uuid().parse(req.params.id);await authorizedNotification(req,id);
 const r=await db.query(`INSERT INTO merchant_notification_views(notification_id,user_id,archived_at)
 VALUES($1,$2,NOW()) ON CONFLICT(notification_id,user_id) DO UPDATE SET archived_at=NOW()
 RETURNING *`,[id,req.user!.id]);
 res.json({data:r.rows[0]});
}));
merchantInboxRouter.get('/preferences',run(async(req,res)=>{
 const db=durable(),v=await viewers(req);
 const r=await db.query('SELECT push_enabled,email_enabled,sound_enabled FROM merchant_notification_preferences WHERE merchant_id=$1 AND user_id=$2',
   [v.merchantId,req.user!.id]);
 res.json({data:r.rows[0]||{push_enabled:true,email_enabled:true,sound_enabled:true}});
}));
merchantInboxRouter.put('/preferences',run(async(req,res)=>{
 const db=durable(),v=await viewers(req);
 const q=z.object({push_enabled:z.boolean(),email_enabled:z.boolean(),sound_enabled:z.boolean()}).parse(req.body);
 const r=await db.query(`INSERT INTO merchant_notification_preferences(merchant_id,user_id,push_enabled,email_enabled,sound_enabled)
 VALUES($1,$2,$3,$4,$5) ON CONFLICT(merchant_id,user_id) DO UPDATE SET
 push_enabled=EXCLUDED.push_enabled,email_enabled=EXCLUDED.email_enabled,sound_enabled=EXCLUDED.sound_enabled,
 updated_at=NOW() RETURNING push_enabled,email_enabled,sound_enabled`,
 [v.merchantId,req.user!.id,q.push_enabled,q.email_enabled,q.sound_enabled]);
 res.json({data:r.rows[0],note:'Critical authentication and security notices remain mandatory.'});
}));
