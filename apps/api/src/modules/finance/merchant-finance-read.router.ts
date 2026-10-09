/** Merchant-safe read-only finance projections; never exposes operator ledger routes. */
import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireAuth } from '../auth/auth.middleware';
import { ownMerchant, durable, datesSchema, pageSchema } from '../merchant/merchant-experience.scope';
import { merchantScope, branchScope } from '../auth/scope';
import { ledgerRepository } from './ledger.repository';
import { AppError } from '../../middleware/error-handler';
export const merchantFinanceReadRouter=Router();
merchantFinanceReadRouter.use(requireAuth);
const run=(f:(req:AuthenticatedRequest,res:Response)=>Promise<void>)=>(req:AuthenticatedRequest,res:Response,next:NextFunction)=>{Promise.resolve().then(()=>f(req,res)).catch(next)};
const query=datesSchema.extend({branch_id:z.string().uuid().optional()});
async function financeScope(req:AuthenticatedRequest,branchId?:string){
  const id=await ownMerchant(req,true);
  if(branchId){
    await branchScope(req.user!,branchId);
    const row=await durable().query('SELECT 1 FROM merchant_branches WHERE id=$1 AND merchant_id=$2',[branchId,id]);
    if(!row.rowCount)throw new AppError(403,'FINANCE_BRANCH_FORBIDDEN','Branch does not belong to merchant');
  }
  return id;
}
merchantFinanceReadRouter.get('/overview',run(async(req,res)=>{
  const db=durable(),q=query.parse(req.query),id=await financeScope(req,q.branch_id);
  const range=[id,q.branch_id||null,q.from||null,q.to||null];
  const totals=await db.query(`
   SELECT COUNT(*)::int AS completed_orders,
      COALESCE(SUM(s.gmv_minor),0)::bigint AS gmv_minor,
      COALESCE(SUM(s.food_subtotal_minor),0)::bigint AS food_revenue_minor,
      COALESCE(SUM(s.commission_revenue_minor),0)::bigint AS commission_minor,
      COALESCE(SUM(s.payment_processing_cost_minor),0)::bigint AS processing_cost_minor,
      COALESCE(SUM(s.merchant_payable_minor),0)::bigint AS earned_payable_minor
   FROM order_financial_summaries s JOIN orders o ON o.id=s.order_id
   JOIN payment_capture_evidence e ON e.order_id=o.id
   WHERE s.merchant_id=$1 AND ($2::uuid IS NULL OR o.branch_id=$2::uuid)
      AND ($3::timestamptz IS NULL OR o.created_at >=$3::timestamptz)
      AND ($4::timestamptz IS NULL OR o.created_at <$4::timestamptz)
      AND o.status IN ('DELIVERED','COMPLETED')`,range);
  const daily=await db.query(`
   SELECT (o.created_at AT TIME ZONE 'Africa/Nairobi')::date AS day,
      COUNT(*)::int AS orders, SUM(s.food_subtotal_minor)::bigint AS revenue_minor,
      SUM(s.merchant_payable_minor)::bigint AS payable_minor
   FROM order_financial_summaries s JOIN orders o ON o.id=s.order_id
   JOIN payment_capture_evidence e ON e.order_id=o.id
   WHERE s.merchant_id=$1 AND ($2::uuid IS NULL OR o.branch_id=$2::uuid)
      AND ($3::timestamptz IS NULL OR o.created_at >=$3::timestamptz)
      AND ($4::timestamptz IS NULL OR o.created_at <$4::timestamptz)
      AND o.status IN ('DELIVERED','COMPLETED')
   GROUP BY (o.created_at AT TIME ZONE 'Africa/Nairobi')::date ORDER BY day ASC`,range);
  const methods=await db.query(`
   SELECT UPPER(p.method) AS method,COUNT(*)::int AS orders,
      SUM(p.amount_minor)::bigint AS captured_amount_minor FROM orders o
   JOIN payments p ON p.id=o.payment_id JOIN payment_capture_evidence e ON e.payment_id=p.id
   WHERE o.merchant_id=$1 AND ($2::uuid IS NULL OR o.branch_id=$2::uuid)
      AND ($3::timestamptz IS NULL OR o.created_at >=$3::timestamptz)
      AND ($4::timestamptz IS NULL OR o.created_at <$4::timestamptz)
      AND o.status IN ('DELIVERED','COMPLETED') GROUP BY UPPER(p.method)`,range);
  const settlement=await ledgerRepository.findSettlements({merchantId:id});
  const rule=await ledgerRepository.getCommissionRuleForMerchant(id);
  const destinations=await db.query(`SELECT id,method,masked_destination,verified_at FROM payout_destinations
    WHERE owner_type='MERCHANT' AND owner_id=$1 AND active=TRUE`,[id]);
  res.json({data:{currency:'KES',period:{from:q.from??null,to:q.to??null,timezone:'Africa/Nairobi'},
    totals:totals.rows[0],daily:daily.rows,methods:methods.rows,commission_rate:rule.percentage_rate,
    settlements:settlement.slice(0,10),payout_destinations:destinations.rows,
    upcoming_settlement:null,upcoming_reason:'No confirmed future settlement date can be inferred from calculated balances.'}});
}));
merchantFinanceReadRouter.get('/transactions',run(async(req,res)=>{
 const db=durable(),q=query.merge(pageSchema).extend({status:z.string().max(45).optional(),
   method:z.string().max(40).optional(),search:z.string().trim().max(80).optional()}).parse(req.query);
 const id=await financeScope(req,q.branch_id);
 const r=await db.query(`
    SELECT o.id AS order_id,o.public_code,o.created_at,o.status AS order_status,
       o.branch_id,s.food_subtotal_minor,s.commission_revenue_minor,s.merchant_payable_minor,
       p.method AS payment_method,p.status AS payment_status,p.captured_at
    FROM order_financial_summaries s JOIN orders o ON o.id=s.order_id
    JOIN payments p ON p.id=o.payment_id JOIN payment_capture_evidence e ON e.payment_id=p.id
    WHERE s.merchant_id=$1 AND ($2::uuid IS NULL OR o.branch_id=$2::uuid)
       AND ($3::timestamptz IS NULL OR o.created_at >=$3::timestamptz)
       AND ($4::timestamptz IS NULL OR o.created_at <$4::timestamptz)
       AND ($5::text IS NULL OR o.status=$5)
       AND ($6::text IS NULL OR UPPER(p.method)=UPPER($6))
       AND ($7::text IS NULL OR o.public_code ILIKE '%'||$7||'%')
    ORDER BY o.created_at DESC,o.id DESC LIMIT $8 OFFSET $9`,
    [id,q.branch_id||null,q.from||null,q.to||null,q.status||null,q.method||null,q.search||null,q.limit,q.offset]);
 res.json({data:r.rows,meta:{limit:q.limit,offset:q.offset,has_more:r.rows.length===q.limit}});
}));
merchantFinanceReadRouter.get('/settlements/:settlementId',run(async(req,res)=>{
 const db=durable(),id=await financeScope(req),settlementId=z.string().uuid().parse(req.params.settlementId);
 const r=await db.query('SELECT * FROM merchant_settlements WHERE id=$1 AND merchant_id=$2',[settlementId,id]);
 if(!r.rowCount)throw new AppError(404,'SETTLEMENT_NOT_FOUND','Settlement not found for merchant');
 const lines=await db.query(`SELECT entry_type,reference_id,gross_amount_minor,commission_amount_minor,net_amount_minor,description,created_at
   FROM merchant_settlement_lines WHERE settlement_id=$1 ORDER BY created_at,id`,[settlementId]);
 const attempts=await db.query(`SELECT a.status,a.amount_minor,a.currency,a.provider,a.provider_reference,a.completed_at,
   d.method,d.masked_destination FROM disbursement_attempts a JOIN payout_destinations d ON d.id=a.destination_id
   WHERE a.resource_type='SETTLEMENT' AND a.resource_id=$1 ORDER BY a.created_at DESC`,[settlementId]);
 res.json({data:{...r.rows[0],lines:lines.rows,disbursement_attempts:attempts.rows}});
}));
