import {Router,Response,NextFunction} from 'express';
import {z} from 'zod';
import {config} from '@deetoo/config';
import {requireAuth,AuthenticatedRequest} from '../auth/auth.middleware';
import {getDbPool} from '../../db/client';
import {withTransaction} from '../../db/transaction';
import {AppError} from '../../middleware/error-handler';

/** Self-service consent ONLY. No administrator can subscribe another user to broadcasts.
 * Applies to all broadcast classifications. Transactional receipts/order notifications are separate. */
export const adminNextConsentRouter=Router();
adminNextConsentRouter.use(requireAuth);
const run=(handler:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{void handler(req,res).catch(next);};
const requirePg=()=>{if(config.storage.mode!=='postgres')throw new AppError(409,'POSTGRES_REQUIRED','Consent preferences require durable storage');};
const body=z.object({channel:z.enum(['IN_APP','EMAIL','SMS','PUSH']),consented:z.boolean()});
adminNextConsentRouter.get('/broadcast-consent',run(async(req,res)=>{
 requirePg();
 const result=await getDbPool().query('SELECT channel,consented,recorded_at,source FROM admin_broadcast_consents WHERE user_id=$1 ORDER BY channel',[req.user!.id]);
 res.json({data:{preferences:result.rows,default_opt_in:false}});
}));
adminNextConsentRouter.put('/broadcast-consent',run(async(req,res)=>{
 requirePg();const parsed=body.parse(req.body);
 const result=await withTransaction(async client=>{
  const row=await client.query('INSERT INTO admin_broadcast_consents(user_id,channel,consented,recorded_at,source) VALUES($1,$2,$3,now(),$4) ON CONFLICT(user_id,channel) DO UPDATE SET consented=EXCLUDED.consented,recorded_at=now(),source=EXCLUDED.source RETURNING channel,consented,recorded_at,source',[req.user!.id,parsed.channel,parsed.consented,'SELF_SERVICE']);
  await client.query("INSERT INTO admin_change_audit(actor_id,action,resource_type,resource_id,reason,after_values) VALUES($1,'BROADCAST_CONSENT_CHANGED','USER',$1,'Authenticated self-service preference',$2::jsonb)",[req.user!.id,JSON.stringify({channel:parsed.channel,consented:parsed.consented})]);
  return row.rows[0];
 });
 res.json({data:result});
}));
