/** Merchant may message a customer of a paid assigned order through a queued SMS notification.
 * A customer number is never returned to Merchant and external acceptance is never shown as delivery. */
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireAuth, requireRole } from '../auth/auth.middleware';
import { orderScope } from '../auth/scope';
import { durable } from './merchant-experience.scope';
import { notificationService } from '../operations/notification.service';
import { AppError } from '../../middleware/error-handler';
export const merchantContactRouter=Router();
merchantContactRouter.use(requireAuth);
merchantContactRouter.use(requireRole('merchant','merchant_owner','merchant_manager','merchant_staff'));
const run=(f:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{Promise.resolve().then(()=>f(req,res)).catch(next)};
merchantContactRouter.get('/orders/:orderId/contact',run(async(req,res)=>{
 const order=await orderScope(req.user!,z.string().uuid().parse(req.params.orderId));
 res.json({data:{order_id:order.id,channels:{
   message:{available:Boolean(process.env.AFRICASTALKING_API_KEY&&process.env.AFRICASTALKING_USERNAME)},
   phone_call:{available:false,reason:'Masked calling provider not configured'}
 },privacy:'Customer telephone number is not shared with merchants.'}});
}));
merchantContactRouter.post('/orders/:orderId/contact/message',run(async(req,res)=>{
 const db=durable(),order=await orderScope(req.user!,z.string().uuid().parse(req.params.orderId));
 const q=z.object({message:z.string().trim().min(4).max(420)
   .refine(s=>!/(https?:\/\/|www\.)/i.test(s),{message:'Links cannot be included in merchant order contact messages'}),
   idempotency_key:z.string().min(8).max(64)}).parse(req.body);
 if(['CANCELLED','DELIVERED','COMPLETED'].includes(String(order.status)))
   throw new AppError(409,'ORDER_CONTACT_CLOSED','Customer contact is unavailable for closed orders');
 if(!process.env.AFRICASTALKING_API_KEY||!process.env.AFRICASTALKING_USERNAME)
   throw new AppError(503,'MERCHANT_SMS_UNCONFIGURED','Merchant-to-customer messages require a configured SMS provider');
 const existing=await db.query(`SELECT COUNT(*)::int AS count FROM notifications
   WHERE recipient_type='CUSTOMER' AND recipient_id=$1 AND template_code='MERCHANT_ORDER_MESSAGE'
     AND payload->>'order_id'=$2 AND created_at>NOW()-interval '1 hour'`,
   [order.customer_id,order.id]);
 if(Number(existing.rows[0]?.count||0)>=10)
   throw new AppError(429,'ORDER_CONTACT_RATE_LIMIT','Maximum of ten customer messages per order per hour');
 const queued=await notificationService.sendNotification({
   recipientType:'CUSTOMER' as any,recipientId:order.customer_id,channel:'SMS' as any,
   templateCode:'MERCHANT_ORDER_MESSAGE',
   subject:'Message from your DeeToo restaurant',
   payload:{order_id:order.id,message:q.message},
   referenceId:order.id+':'+q.idempotency_key
 });
 res.status(202).json({data:{notification_id:queued.id,status:queued.status,queued:true,delivered:false}});
}));
