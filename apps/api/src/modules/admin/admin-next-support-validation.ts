/**
 * Phase 5: the legacy Operations and approved Admin case-creation routes share
 * one authoritative participant/order ownership check. Names are NOT identities.
 */
import {z} from 'zod';
import {config} from '@deetoo/config';
import {getDbPool} from '../../db/client';
import {AppError} from '../../middleware/error-handler';

const uuid=z.string().uuid();
const schema=z.object({
 customer_id:uuid.optional(),merchant_id:uuid.optional(),rider_id:uuid.optional(),order_id:uuid.optional(),
 category:z.enum(['ORDER_ISSUE','PAYMENT_ISSUE','REFUND','MISSING_ITEM','WRONG_ITEM','DELIVERY_DELAY','CUSTOMER_UNREACHABLE','RIDER_ISSUE','MERCHANT_ISSUE','ACCOUNT_ISSUE','OTHER']).default('OTHER'),
 priority:z.enum(['LOW','MEDIUM','HIGH','URGENT']).default('MEDIUM'),
 subject:z.string().trim().min(4).max(180),
 description:z.string().trim().min(8).max(4000)
}).strict().refine(v=>[v.customer_id,v.merchant_id,v.rider_id].filter(Boolean).length===1,{
 message:'Exactly one registered participant is required'
});

export async function verifyAdminSupportCase(raw:unknown){
 if(config.storage.mode!=='postgres')
  throw new AppError(409,'POSTGRES_REQUIRED','Verified staff support cases require durable PostgreSQL');
 const input=schema.parse(raw);
 const lookup=input.customer_id
  ? {table:'customer_profiles',column:'user_id',id:input.customer_id}
  : input.merchant_id
    ? {table:'merchants',column:'id',id:input.merchant_id}
    : {table:'rider_profiles',column:'id',id:input.rider_id!};
 // table and column names are constants selected above, never request input.
 const found=await getDbPool().query(
  `SELECT ${lookup.column} FROM ${lookup.table} WHERE ${lookup.column}=$1`,[lookup.id]);
 if(!found.rows[0])
  throw new AppError(404,'SUPPORT_PARTICIPANT_NOT_FOUND','The selected participant is not registered in DeeToo');
 if(input.order_id){
  const linked=await getDbPool().query(
   'SELECT o.id,o.customer_id,b.merchant_id,d.rider_id FROM orders o JOIN merchant_branches b ON b.id=o.branch_id LEFT JOIN LATERAL (SELECT assigned_rider_id AS rider_id FROM deliveries WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) d ON true WHERE o.id=$1',
   [input.order_id]
  );
  if(!linked.rows[0])throw new AppError(404,'ORDER_NOT_FOUND','Linked order not found');
  const row=linked.rows[0];
  if((input.customer_id&&row.customer_id!==input.customer_id)||
     (input.merchant_id&&row.merchant_id!==input.merchant_id)||
     (input.rider_id&&row.rider_id!==input.rider_id))
   throw new AppError(409,'SUPPORT_ORDER_PARTY_MISMATCH','This order does not belong to the verified participant');
 }
 return input;
}
