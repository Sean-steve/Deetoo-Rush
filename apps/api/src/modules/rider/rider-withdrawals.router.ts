import { Router } from 'express';
import { z } from 'zod';
import { config } from '@deetoo/config';
import { randomUUID } from 'node:crypto';
import { getDbPool } from '../../db/client';
import { withTransaction } from '../../db/transaction';
import { AppError } from '../../middleware/error-handler';
import { requireAuth,requireRole,AuthenticatedRequest } from '../auth/auth.middleware';
import { riderRepository } from './rider.repository';
import { riderWalletService } from '../finance/rider-wallet.service';
import { ledgerRepository } from '../finance/ledger.repository';
import { riderResponse } from './rider-response';

/** Rider request is an intent only, not permission to disburse money. */
export const riderWithdrawalRouter=Router();
export const financeRiderWithdrawalRouter=Router();
const uuid=z.string().uuid();
const amountSchema=z.object({amount_minor:z.number().int().min(10000).max(100000000),idempotency_key:z.string().trim().min(8).max(120)}).strict();
function durable(){if(config.storage.mode!=='postgres')throw new AppError(503,'DURABLE_STORAGE_REQUIRED','Financial requests require durable PostgreSQL');}
async function own(req:AuthenticatedRequest){
  const p=await riderRepository.findProfileByUserId(req.user!.id);
  if(!p)throw new AppError(404,'RIDER_NOT_FOUND','Rider not found');
  return p;
}
function redacted(r:any){return {id:r.id,amount_minor:Number(r.amount_minor),currency:'KES',status:r.status,payout_id:r.payout_id||null,created_at:r.created_at,reviewed_at:r.reviewed_at||null,rejection_reason:r.rejection_reason||null};}
riderWithdrawalRouter.use(requireAuth,requireRole('rider'));
riderWithdrawalRouter.use((_req,res,next)=>{const json=res.json.bind(res);res.json=v=>json(riderResponse(v));next();});
riderWithdrawalRouter.get('/payout-requests',async(req:AuthenticatedRequest,res,next)=>{
  try{durable();const rider=await own(req);
    const found=await getDbPool().query('SELECT * FROM rider_withdrawal_requests WHERE rider_id=$1 ORDER BY created_at DESC LIMIT 100',[rider.id]);
    res.json({data:{requests:found.rows.map(redacted)}});
  }catch(e){next(e);}
});
riderWithdrawalRouter.post('/payout-requests',async(req:AuthenticatedRequest,res,next)=>{
  try{
    durable();const rider=await own(req),body=amountSchema.parse(req.body);
    const result=await withTransaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['rider-withdrawal:'+rider.id]);
      const previous=await client.query('SELECT * FROM rider_withdrawal_requests WHERE rider_id=$1 AND idempotency_key=$2',[rider.id,body.idempotency_key]);
      if(previous.rows[0]){
        if(Number(previous.rows[0].amount_minor)!==body.amount_minor)throw new AppError(409,'WITHDRAWAL_IDEMPOTENCY_CONFLICT','Reference was used for another amount');
        return {row:previous.rows[0],created:false};
      }
      const wallet=await riderWalletService.getWallet(rider.id);
      if(wallet.cash_restricted||!wallet.ledger_reconciled)throw new AppError(409,'WITHDRAWAL_RESTRICTED','Settle cash or ledger discrepancy first');
      const locked=await client.query("SELECT COALESCE(sum(amount_minor),0)::bigint AS n FROM rider_withdrawal_requests WHERE rider_id=$1 AND status IN ('REQUESTED','QUEUED_FOR_BATCH')",[rider.id]);
      const available=Math.max(0,Number(wallet.available_earnings_minor)-Number(locked.rows[0].n));
      if(body.amount_minor>available)throw new AppError(409,'WITHDRAWAL_INSUFFICIENT_FUNDS','Amount exceeds available earnings after existing withdrawal intents',{available_minor:available});
      const created=await client.query("INSERT INTO rider_withdrawal_requests(id,rider_id,amount_minor,idempotency_key) VALUES($1,$2,$3,$4) RETURNING *",[randomUUID(),rider.id,body.amount_minor,body.idempotency_key]);
      return {row:created.rows[0],created:true};
    });
    res.status(result.created?201:200).json({data:redacted(result.row)});
  }catch(e){next(e);}
});
financeRiderWithdrawalRouter.use(requireAuth,requireRole('admin','finance','super_admin'));
financeRiderWithdrawalRouter.get('/',async(req:AuthenticatedRequest,res,next)=>{
  try{durable();const params=z.object({status:z.enum(['REQUESTED','QUEUED_FOR_BATCH','BATCHED','REJECTED']).optional(),limit:z.coerce.number().int().min(1).max(100).default(50)}).parse(req.query);
    const found=await getDbPool().query('SELECT * FROM rider_withdrawal_requests WHERE ($1::text IS NULL OR status=$1) ORDER BY created_at DESC LIMIT $2',[params.status||null,params.limit]);
    res.json({data:found.rows.map(row=>({...redacted(row),rider_id:row.rider_id}))});
  }catch(e){next(e);}
});
financeRiderWithdrawalRouter.post('/:requestId/review',async(req:AuthenticatedRequest,res,next)=>{
  try{durable();const id=uuid.parse(req.params.requestId);const body=z.object({decision:z.enum(['QUEUED_FOR_BATCH','REJECTED']),reason:z.string().trim().min(5).max(500)}).strict().parse(req.body);
    const saved=await getDbPool().query("UPDATE rider_withdrawal_requests SET status=$2,reviewed_by=$3,reviewed_at=now(),rejection_reason=CASE WHEN $2='REJECTED' THEN $4 ELSE NULL END WHERE id=$1 AND status='REQUESTED' RETURNING *",[id,body.decision,req.user!.id,body.reason]);
    if(!saved.rows[0])throw new AppError(409,'WITHDRAWAL_REVIEW_INVALID','Request not pending review');
    res.json({data:redacted(saved.rows[0])});
  }catch(e){next(e);}
});
financeRiderWithdrawalRouter.post('/:requestId/link-payout',async(req:AuthenticatedRequest,res,next)=>{
  try{durable();const id=uuid.parse(req.params.requestId),body=z.object({payout_id:uuid}).strict().parse(req.body);
    const payout=await ledgerRepository.findRiderPayoutById(body.payout_id);
    if(!payout||!['DRAFT','APPROVED','PROCESSING','PAID'].includes(String(payout.status)))throw new AppError(409,'WITHDRAWAL_PAYOUT_INVALID','Link an existing finance payout batch');
    const linked=await getDbPool().query("UPDATE rider_withdrawal_requests SET status='BATCHED',payout_id=$2 WHERE id=$1 AND rider_id=$3 AND amount_minor<=$4 AND status='QUEUED_FOR_BATCH' RETURNING *",[id,payout.id,payout.rider_id,payout.amount_minor]);
    if(!linked.rows[0])throw new AppError(409,'WITHDRAWAL_LINK_INVALID','Payout batch must cover this queued Rider request');
    res.json({data:redacted(linked.rows[0]),note:'Finance approval and provider callback remain required'});
  }catch(e){next(e);}
});
