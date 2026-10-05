import { randomUUID } from 'node:crypto';
import { rows,one,insert } from '../../db/adapter';
import { updateRow } from '../../db/relational';
import { withTransaction } from '../../db/transaction';
import { AppError } from '../../middleware/error-handler';
const paymentFields=['checkout_url','provider_receiver','id','order_id','customer_id','status','currency','requested_minor','captured_minor','refunded_minor','provider_preference','idempotency_key','provider','method','provider_payment_id','provider_reference','merchant_request_id','checkout_request_id','mpesa_receipt_number','phone','failure_code','failure_message','reconciliation_status','initiated_at','authorized_at','captured_at','failed_at','cancelled_at','refunded_at','created_at'];
const refundFields=['idempotency_key','request_hash','approved_by','approved_at','policy','reversal_snapshot','id','payment_id','order_id','amount_minor','currency','status','reason_code','note','requested_by','provider_refund_id','requested_at','processed_at','failed_at','created_at'];
const selection="SELECT p.*,p.requested_minor AS amount_minor,p.requested_minor/100.0 AS amount,COALESCE((SELECT jsonb_agg(t ORDER BY created_at,id) FROM payment_timeline t WHERE payment_id=p.id),'[]'::jsonb) AS timeline FROM payments p";
async function savePayment(p:any){return withTransaction(async()=>{
  const old=await one('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[p.id]);
  const data={...p,requested_minor:p.amount_minor,provider_preference:p.provider,idempotency_key:p.idempotency_key||p.id};
  if(old){
    if(old.customer_id!==p.customer_id||old.order_id!==p.order_id||old.currency!==p.currency||old.requested_minor!==p.amount_minor)throw new AppError(409,'IMMUTABLE_PAYMENT','Payment identity and requested amount cannot change');
    await updateRow('payments',p.id,data,paymentFields.filter(k=>!['id','order_id','customer_id','currency','requested_minor','created_at','idempotency_key'].includes(k)));
  }else await insert('payments',data,paymentFields);
  return postgresPayment.findPaymentById(p.id);
});}
async function saveRefund(r:any){return withTransaction(async()=>{
  const old=await one('SELECT * FROM refunds WHERE id=$1 FOR UPDATE',[r.id]);
  if(old){
    if(old.payment_id!==r.payment_id||old.order_id!==r.order_id||old.amount_minor!==r.amount_minor||old.currency!==r.currency)throw new AppError(409,'IMMUTABLE_REFUND','Refund identity and amount cannot change');
    await updateRow('refunds',r.id,r,['status','provider_refund_id','processed_at','failed_at','approved_by','approved_at','reversal_snapshot']);
  }else await insert('refunds',r,refundFields);
  return postgresPayment.findRefundById(r.id);
});}
export const postgresPayment = {
  savePayment,updatePayment:savePayment,save:savePayment,
  findAll:()=>rows(selection+' ORDER BY p.created_at DESC'),
  findRefunds:()=>rows('SELECT * FROM refunds ORDER BY created_at DESC'),
  findById:(id:string)=>postgresPayment.findPaymentById(id),
  findPaymentById:(id:string)=>one(selection+' WHERE p.id=$1',[id]),
  findPaymentsByOrderId:(id:string)=>rows(selection+' WHERE p.order_id=$1 ORDER BY p.created_at DESC',[id]),
  findPaymentByCheckoutRequestId:(id:string)=>one(selection+' WHERE p.checkout_request_id=$1',[id]),
  findPaymentByMerchantRequestId:(id:string)=>one(selection+' WHERE p.merchant_request_id=$1',[id]),
  findPaymentByProviderReference:(provider:string,ref:string)=>one(selection+' WHERE p.provider=$1 AND (p.provider_reference=$2 OR p.provider_payment_id=$2 OR p.mpesa_receipt_number=$2)',[provider,ref]),
  appendPaymentTimeline:(t:any)=>insert('payment_timeline',{id:randomUUID(),...t},['id','payment_id','event_type','from_status','to_status','provider_reference','reason_code','metadata']),
  getPaymentTimeline:(id:string)=>rows('SELECT * FROM payment_timeline WHERE payment_id=$1 ORDER BY created_at,id',[id]),
  recordProviderEvent:(e:any)=>withTransaction(async()=>{
    // Keep the received payload immutable when updating processing state.
    const saved=await one(`INSERT INTO payment_provider_events(provider,provider_event_id,payment_id,event_type,payload_hash,raw_payload,processing_status,processed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(provider,provider_event_id) DO UPDATE SET processing_status=EXCLUDED.processing_status,processed_at=EXCLUDED.processed_at
      WHERE payment_provider_events.payload_hash=EXCLUDED.payload_hash RETURNING *`,[e.provider,e.provider_event_id,e.payment_id||null,e.event_type,e.payload_hash,e.raw_payload||{},e.processing_status,e.processed_at||null]);
    if(!saved)throw new AppError(409,'PROVIDER_EVENT_CONFLICT','Provider event ID was reused with different content');return saved;
  }),
  findProviderEvent:(provider:string,id:string)=>one('SELECT * FROM payment_provider_events WHERE provider=$1 AND provider_event_id=$2',[provider,id]),
  saveRefund,updateRefund:saveRefund,
  findRefundById:(id:string)=>one('SELECT * FROM refunds WHERE id=$1',[id]),
  findRefundsByPaymentId:(id:string)=>rows('SELECT * FROM refunds WHERE payment_id=$1 ORDER BY created_at DESC',[id]),
  findRefundsByOrderId:(id:string)=>rows('SELECT * FROM refunds WHERE order_id=$1 ORDER BY created_at DESC',[id]),
  appendRefundTimeline:(t:any)=>insert('refund_timeline',{id:randomUUID(),...t},['id','refund_id','from_status','to_status','reason_code','metadata']),
  getRefundTimeline:(id:string)=>rows('SELECT * FROM refund_timeline WHERE refund_id=$1 ORDER BY created_at,id',[id]),
  getIdempotencyRecord:(key:string)=>one('SELECT idempotency_key AS "idempotencyKey",customer_id AS "customerId",order_id AS "orderId",request_hash AS "requestHash",payment_id AS "paymentId",created_at AS "createdAt" FROM payment_idempotency_keys WHERE idempotency_key=$1',[key]),
  saveIdempotencyRecord:async(r:any)=>{await rows('INSERT INTO payment_idempotency_keys(idempotency_key,customer_id,order_id,request_hash,payment_id) VALUES($1,$2,$3,$4,$5)',[r.idempotencyKey,r.customerId,r.orderId,r.requestHash,r.paymentId]);},
  listPayments:async(o:any={})=>{
    const args=[o.status||null,o.order_id||null,o.customer_id||null,o.provider||null,o.method||null,o.reconciliation_status||null,o.search||null];
    const where=" WHERE ($1::text IS NULL OR p.status=$1) AND ($2::uuid IS NULL OR p.order_id=$2) AND ($3::uuid IS NULL OR p.customer_id=$3) AND ($4::text IS NULL OR upper(p.provider)=upper($4)) AND ($5::text IS NULL OR upper(p.method)=upper($5)) AND ($6::text IS NULL OR p.reconciliation_status=$6) AND ($7::text IS NULL OR concat_ws(' ',p.id,p.order_id,p.mpesa_receipt_number,p.provider_reference,p.phone) ILIKE '%'||$7||'%')";
    const limit=Math.min(o.limit||20,500);
    return {payments:await rows(selection+where+' ORDER BY p.created_at DESC LIMIT $8 OFFSET $9',[...args,limit,(Math.max(o.page||1,1)-1)*limit]),total:Number((await one('SELECT count(*) AS n FROM payments p'+where,args)).n)};
  },
};
