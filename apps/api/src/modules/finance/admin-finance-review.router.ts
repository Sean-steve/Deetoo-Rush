import {Router,Request,Response,NextFunction} from 'express';
import {z} from 'zod';
import {config} from '@deetoo/config';
import {UserRole} from '@deetoo/types';
import {requireAuth,requireRole,AuthenticatedRequest} from '../auth/auth.middleware';
import {getDbPool} from '../../db/client';
import {AppError} from '../../middleware/error-handler';
import {withTransaction} from '../../db/transaction';

export const adminFinanceReviewRouter=Router();
adminFinanceReviewRouter.use(requireAuth,requireRole(UserRole.ADMIN,UserRole.FINANCE));
const params=z.object({id:z.string().uuid()});
const explanation=z.object({reason:z.string().trim().min(5).max(2000)});
const postgres=()=>{if(config.storage.mode!=='postgres')throw new AppError(409,'POSTGRES_REQUIRED','Financial review requires durable PostgreSQL');};
const fail=(handler:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{void handler(req,res).catch(next);};
const audit=async(client:any,actor:string,action:string,resource:string,id:string,reason:string,before:unknown,after:unknown)=>{
 await client.query('INSERT INTO admin_change_audit(actor_id,action,resource_type,resource_id,reason,before_values,after_values) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[actor,action,resource,id,reason,JSON.stringify(before),JSON.stringify(after)]);
};

/** Reject only still-unapproved refund reservations. Provider commands never get queued. */
adminFinanceReviewRouter.post('/refunds/:id/reject',fail(async(req,res)=>{
 postgres();
 const {id}=params.parse(req.params),{reason}=explanation.parse(req.body);
 const rejected=await withTransaction(async client=>{
  const result=await client.query('SELECT * FROM refunds WHERE id=$1 FOR UPDATE',[id]);
  const refund=result.rows[0];
  if(!refund)throw new AppError(404,'REFUND_NOT_FOUND','Refund not found');
  if(refund.status!=='REQUESTED')throw new AppError(409,'REFUND_NOT_REJECTABLE','Only REQUESTED refunds can be rejected');
  if(refund.requested_by===req.user!.id)throw new AppError(403,'SELF_REVIEW_NOT_ALLOWED','Refund requester cannot decide their own request');
  const updated=await client.query("UPDATE refunds SET status='CANCELLED',updated_at=now() WHERE id=$1 AND status='REQUESTED' RETURNING *",[id]);
  if(!updated.rows[0])throw new AppError(409,'REFUND_STATE_CHANGED','Refund status changed during review');
  await client.query("INSERT INTO refund_timeline(refund_id,from_status,to_status,reason_code,metadata) VALUES($1,'REQUESTED','CANCELLED','ADMIN_REJECTED',$2::jsonb)",[id,JSON.stringify({actor_id:req.user!.id,reason})]);
  await audit(client,req.user!.id,'REFUND_REJECTED','REFUND',id,reason,{status:'REQUESTED'},{status:'CANCELLED'});
  return updated.rows[0];
 });
 res.json({data:rejected});
}));

/** Cancel only unapproved merchant calculations, never queued or provider-confirmed payouts. */
adminFinanceReviewRouter.post('/settlements/:id/reject',fail(async(req,res)=>{
 postgres();
 const {id}=params.parse(req.params),{reason}=explanation.parse(req.body);
 const settlement=await withTransaction(async client=>{
  const result=await client.query('SELECT * FROM merchant_settlements WHERE id=$1 FOR UPDATE',[id]);
  const row=result.rows[0];
  if(!row)throw new AppError(404,'SETTLEMENT_NOT_FOUND','Settlement not found');
  if(!['DRAFT','CALCULATED'].includes(row.status))throw new AppError(409,'SETTLEMENT_NOT_REJECTABLE','Approved or disbursed settlements cannot be rejected');
  if(row.calculated_by===req.user!.id)throw new AppError(403,'SELF_REVIEW_NOT_ALLOWED','Calculating actor cannot reject their own batch');
  const updated=await client.query("UPDATE merchant_settlements SET status='CANCELLED',failure_reason=$2 WHERE id=$1 RETURNING *",[id,reason]);
  await audit(client,req.user!.id,'SETTLEMENT_REJECTED','SETTLEMENT',id,reason,{status:row.status},{status:'CANCELLED'});
  return updated.rows[0];
 });
 res.json({data:settlement});
}));

/** Release reserved rider earnings atomically when a draft is rejected. */
adminFinanceReviewRouter.post('/payouts/:id/reject',fail(async(req,res)=>{
 postgres();
 const {id}=params.parse(req.params),{reason}=explanation.parse(req.body);
 const payout=await withTransaction(async client=>{
  const result=await client.query('SELECT * FROM rider_payouts WHERE id=$1 FOR UPDATE',[id]);
  const row=result.rows[0];
  if(!row)throw new AppError(404,'PAYOUT_NOT_FOUND','Payout not found');
  if(row.status!=='DRAFT')throw new AppError(409,'PAYOUT_NOT_REJECTABLE','Only unapproved draft payouts can be rejected');
  if(row.calculated_by===req.user!.id)throw new AppError(403,'SELF_REVIEW_NOT_ALLOWED','Calculating actor cannot reject their own batch');
  // Guard against partial release and prevent a competing calculator from reserving twice.
  await client.query('SELECT id FROM rider_earnings WHERE id IN (SELECT earning_id FROM rider_payout_lines WHERE payout_id=$1) FOR UPDATE',[id]);
  const released=await client.query("UPDATE rider_earnings SET status='ELIGIBLE' WHERE status='RESERVED' AND id IN (SELECT earning_id FROM rider_payout_lines WHERE payout_id=$1) RETURNING id",[id]);
  const updated=await client.query("UPDATE rider_payouts SET status='CANCELLED',failure_reason=$2 WHERE id=$1 RETURNING *",[id,reason]);
  await audit(client,req.user!.id,'PAYOUT_REJECTED','PAYOUT',id,reason,{status:row.status},{status:'CANCELLED',released:released.rowCount});
  return {...updated.rows[0],released_earnings:released.rowCount};
 });
 res.json({data:payout});
}));

/** Financial exception review is an audit action, not permission to mark provider funds received. */
adminFinanceReviewRouter.post('/reconciliation/exceptions/:id/resolve',fail(async(req,res)=>{
 postgres();
 const {id}=params.parse(req.params);
 const body=z.object({reason:z.string().trim().min(10).max(2000),outcome:z.enum(['INVESTIGATED','ESCALATED','PROVIDER_VERIFIED'])}).parse(req.body);
 const result=await withTransaction(async client=>{
  const payment=await client.query('SELECT id,reconciliation_status FROM payments WHERE id=$1 FOR UPDATE',[id]);
  if(!payment.rows[0])throw new AppError(404,'PAYMENT_NOT_FOUND','Payment not found');
  if(body.outcome==='PROVIDER_VERIFIED')throw new AppError(409,'PROVIDER_RECONCILIATION_REQUIRED','Use the provider-backed reconciliation command; an audit note cannot confirm funds');
  await audit(client,req.user!.id,'RECONCILIATION_REVIEW','PAYMENT',id,body.reason,{reconciliation_status:payment.rows[0].reconciliation_status},{outcome:body.outcome});
  return {payment_id:id,outcome:body.outcome,reconciliation_status:payment.rows[0].reconciliation_status};
 });
 res.json({data:result});
}));
