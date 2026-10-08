/**
 * Read-only release certification against an OPERATOR-PROVISIONED staging DB.
 * Never simulates a callback, initiates an STK push or changes payment/ledger.
 * Failure is the default if real Daraja evidence is unavailable.
 */
import {Pool} from "pg";
import {createHash} from "node:crypto";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function need(key:string){const value=process.env[key]?.trim();if(!value)throw new Error("Missing staging release evidence: "+key);return value;}
function check(ok:unknown,why:string):asserts ok{if(!ok)throw new Error("STAGING HOLD: "+why);}
async function certify(){
 check(process.env.APP_ENV==="staging","APP_ENV must be staging");
 check(process.env.DEETOO_STORAGE_MODE==="postgres","only PostgreSQL accepted");
 check(process.env.DEETOO_FIXTURES!=="true"&&process.env.DEETOO_LOCAL_WORKFLOW!=="true","mock/fixture payment forbidden");
 check(process.env.MPESA_ENVIRONMENT==="sandbox","sandbox payment certification only");
 const url=need("STAGING_DATABASE_URL");
 const parsed=new URL(url);
 check(["postgres:","postgresql:"].includes(parsed.protocol),"staging database URL must be Postgres");
 check(!/foundation|shopping|delivery|test_only|localhost|127\.0\.0\.1/i.test(parsed.pathname),"cannot certify local ephemeral CI database");
 check(!["localhost","127.0.0.1","::1","[::1]"].includes(parsed.hostname),"staging certificate cannot target a local database host");
 const orderId=need("STAGING_CERT_ORDER_ID"),caseId=need("STAGING_CERT_SUPPORT_CASE_ID"),receipt=need("STAGING_CERT_MPESA_RECEIPT");
 check(uuid.test(orderId)&&uuid.test(caseId),"real staging order and case UUIDs required");
 check(/^[0-9A-Z]{8,24}$/.test(receipt),"real Daraja receipt required");
 const pool=new Pool({connectionString:url,ssl:{rejectUnauthorized:true},max:1,connectionTimeoutMillis:10000,statement_timeout:15000});
 const client=await pool.connect();
 try{
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const order=await client.query("SELECT id,customer_id,merchant_id,branch_id,status,currency,total_minor FROM orders WHERE id=$1",[orderId]);
  check(order.rowCount===1,"order missing");const o=order.rows[0];
  check(o.status==="COMPLETED","certified order must be delivered, not merely paid or dispatched");
  check(o.currency==="KES"&&Number(o.total_minor)>0,"invalid order economics");
  const payments=await client.query("SELECT id,status,provider,method,captured_minor,mpesa_receipt_number,checkout_request_id,merchant_request_id,provider_receiver FROM payments WHERE order_id=$1 ORDER BY created_at DESC",[orderId]);
  check(payments.rows.filter(p=>p.status==="CAPTURED").length===1,"duplicate captured payment(s) for one order");
  const matching=payments.rows.filter(p=>p.mpesa_receipt_number===receipt&&p.provider==="MPESA"&&p.method==="MPESA"&&p.status==="CAPTURED");
  check(matching.length===1,"missing unique real CAPTURED M-PESA receipt");const payment=matching[0];
  check(Number(payment.captured_minor)===Number(o.total_minor),"captured payment must match immutable order total");
  check(payment.checkout_request_id&&payment.merchant_request_id&&payment.provider_receiver,"Daraja request identity/receiver missing");
  const evidence=await client.query("SELECT provider,provider_reference,amount_minor,currency,receiver,verified_at FROM payment_capture_evidence WHERE payment_id=$1",[payment.id]);
  check(evidence.rowCount===1,"immutable payment capture evidence missing");const e=evidence.rows[0];
  check(e.provider==="MPESA"&&e.provider_reference===receipt&&Number(e.amount_minor)===Number(o.total_minor)
    &&e.currency==="KES"&&e.receiver===payment.provider_receiver&&e.verified_at,"receipt/receiver/amount verification failed");
  const daraja=await client.query(
    "SELECT d.id FROM daraja_requests d JOIN daraja_results r ON r.originator_conversation_id=d.originator_conversation_id WHERE d.payment_id=$1 AND d.kind='QUERY' AND d.receipt=$2 LIMIT 1",
    [payment.id,receipt]);
  check(daraja.rowCount===1,"authenticated asynchronous Daraja verification result missing");
  const delivery=await client.query("SELECT id,status,rider_id FROM deliveries WHERE order_id=$1 AND status='DELIVERED' LIMIT 1",[orderId]);
  check(delivery.rowCount===1&&delivery.rows[0].rider_id,"Rider delivery completion missing");
  const accepted=await client.query("SELECT id FROM order_timeline WHERE order_id=$1 AND to_status='ACCEPTED' LIMIT 1",[orderId]);
  check(accepted.rowCount===1,"Merchant acceptance missing");
  const earning=await client.query("SELECT id FROM rider_earnings WHERE order_id=$1 AND delivery_id=$2 LIMIT 1",[orderId,delivery.rows[0].id]);
  check(earning.rowCount===1,"Rider earning posting missing");
  const ledgers=await client.query(
    "SELECT t.id,t.currency,t.status,COALESCE(SUM(CASE WHEN e.direction='DEBIT' THEN e.amount_minor ELSE 0 END),0)::text debit,COALESCE(SUM(CASE WHEN e.direction='CREDIT' THEN e.amount_minor ELSE 0 END),0)::text credit FROM ledger_transactions t JOIN ledger_entries e ON e.transaction_id=t.id WHERE t.reference_id IN ($1,$2) GROUP BY t.id,t.currency,t.status",
    [orderId,payment.id]);
  check(ledgers.rows.length>0,"posted ledger entries missing");
  check(ledgers.rows.every(r=>r.status==="POSTED"&&r.currency==="KES"&&BigInt(r.debit)===BigInt(r.credit)&&BigInt(r.debit)>0n),"unbalanced, empty or nonposted ledger");
  const support=await client.query("SELECT id,status,customer_id,closed_at FROM support_cases WHERE id=$1",[caseId]);
  check(support.rowCount===1&&support.rows[0].status==="CLOSED"&&support.rows[0].closed_at,"support case must be explicitly administrator-closed");
  check(support.rows[0].customer_id===o.customer_id,"support certification must belong to certified customer");
  const confirmations=await client.query("SELECT party_type,decision FROM support_case_confirmations WHERE case_id=$1",[caseId]);
  check(confirmations.rows.length>0&&confirmations.rows.every(x=>x.decision==="ACCEPTED"),"support participant consent missing");
  const adminNote=await client.query("SELECT id FROM support_case_notes WHERE case_id=$1 AND author_role IN ('admin','super_admin') AND body LIKE 'An administrator confirmed closure after all required parties%' LIMIT 1",[caseId]);
  check(adminNote.rowCount===1,"audited administrator closure note missing");
  await client.query("COMMIT");
  const fingerprint=createHash("sha256").update([orderId,payment.id,receipt,caseId,delivery.rows[0].id].join(":")).digest("hex");
  console.log(JSON.stringify({result:"PASS",scope:"REAL_SAFARICOM_SANDBOX_DB_EVIDENCE",orderId,caseId,ledgerCount:ledgers.rows.length,verifiedAt:new Date().toISOString(),fingerprint},null,2));
 }catch(e){await client.query("ROLLBACK").catch(()=>{});throw e;}finally{client.release();await pool.end();}
}
certify().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
