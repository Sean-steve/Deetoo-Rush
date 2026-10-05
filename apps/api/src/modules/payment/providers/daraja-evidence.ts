import { randomUUID } from 'node:crypto';
import { one, rows } from '../../../db/adapter';
import { withTransaction } from '../../../db/transaction';
import { canonicalHash, lockCommand } from '../../cart/quote-binding';
import { AppError } from '../../../middleware/error-handler';

export function darajaMinorUnits(value:unknown):number|undefined {
 const text=String(value??'');if(!/^\d+(\.\d{1,2})?$/.test(text))return undefined;
 const [whole,fraction='']=text.split('.');const amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 return amount<=BigInt(Number.MAX_SAFE_INTEGER)?Number(amount):undefined;
}
export function verifyDarajaResult(payload:any,expected:{kind:string;receipt:string;amount_minor:number;currency:string;receiver:string;originator_conversation_id:string;conversation_id:string}){
 const result=payload?.Result;
 if(!result||result.OriginatorConversationID!==expected.originator_conversation_id||result.ConversationID!==expected.conversation_id)throw new AppError(409,'PAYMENT_EVIDENCE_MISMATCH','Daraja conversation correlation failed');
 if(Number(result.ResultCode)!==0)return {success:false,verified:true,reference:result.TransactionID};
 const entries=result.ResultParameters?.ResultParameter;
 const values:Record<string,unknown>={};
 if(Array.isArray(entries))for(const entry of entries){if(values[entry.Key]!==undefined)throw new AppError(409,'PAYMENT_EVIDENCE_MISMATCH','Duplicate Daraja evidence field');values[entry.Key]=entry.Value;}
 const amount=darajaMinorUnits(values.TransactionAmount??values.Amount);
 const receiver=String(values.ReceiverPartyPublicName??values.CreditPartyName??values.ReceiverParty??'').split(/\s*-\s*/)[0].trim();
 const receipt=String(values.TransactionReceipt??result.TransactionID??'');
 const currency=String(values.Currency??'KES').toUpperCase(); // Kenyan Daraja transaction contract is KES-only.
 if(amount===undefined||!receiver||!receipt)throw new AppError(409,'PAYMENT_NOT_VERIFIED','Daraja result lacks authoritative amount, receiver or receipt');
 if(amount!==expected.amount_minor||currency!==expected.currency||receiver!==expected.receiver||(expected.kind==='QUERY'&&receipt!==expected.receipt))throw new AppError(409,'PAYMENT_EVIDENCE_MISMATCH','Daraja amount, currency, receipt or receiver mismatch');
 if(expected.kind==='QUERY'&&String(values.TransactionStatus??'').toLowerCase()!=='completed')throw new AppError(409,'PAYMENT_NOT_VERIFIED','Daraja transaction is not confirmed completed');
 return {success:true,verified:true,reference:receipt,amountMinor:amount,currency,receiver};
}
export async function recordDarajaResult(payload:any):Promise<void>{
 const r=payload?.Result;
 if(typeof r?.OriginatorConversationID!=='string'||typeof r?.ConversationID!=='string'||r.ResultCode===undefined)throw new AppError(400,'INVALID_PROVIDER_EVENT','Daraja result identity is missing');
 const hash=canonicalHash(payload);
 await withTransaction(async()=>{
  await lockCommand(`daraja-result:${r.OriginatorConversationID}`);
  const old=await one('SELECT payload_hash FROM daraja_results WHERE originator_conversation_id=$1',[r.OriginatorConversationID]);
  if(old){if(old.payload_hash!==hash)throw new AppError(409,'PROVIDER_EVENT_CONFLICT','Daraja result identity was reused with different content');return;}
  await rows('INSERT INTO daraja_results(originator_conversation_id,conversation_id,payload_hash,payload) VALUES($1,$2,$3,$4)',[r.OriginatorConversationID,r.ConversationID,hash,payload]);
 });
}
export async function beginDarajaRequest(input:{request_key:string;payment_id:string;refund_id?:string;kind:'QUERY'|'REVERSAL';receipt:string;amount_minor:number;currency:string;receiver:string}):Promise<{request:any;created:boolean}>{
 return withTransaction(async()=>{
  await lockCommand(`daraja-request:${input.request_key}`);
  const old=await one('SELECT * FROM daraja_requests WHERE request_key=$1',[input.request_key]);
  if(old){
   for(const key of ['payment_id','kind','receipt','amount_minor','currency','receiver'] as const)if(old[key]!==input[key])throw new AppError(409,'IDEMPOTENCY_CONFLICT','Daraja request changed');
   return {request:old,created:false};
  }
  const request=await one('INSERT INTO daraja_requests(id,request_key,payment_id,refund_id,kind,receipt,amount_minor,currency,receiver) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[randomUUID(),input.request_key,input.payment_id,input.refund_id||null,input.kind,input.receipt,input.amount_minor,input.currency,input.receiver]);
  return {request,created:true};
 });
}
export async function correlateDarajaRequest(id:string,response:any):Promise<any>{
 if(String(response.ResponseCode)!=='0'||!response.OriginatorConversationID||!response.ConversationID)throw new AppError(409,'PROVIDER_OUTCOME_UNKNOWN','Daraja accepted request identity was not confirmed');
 return withTransaction(()=>one('UPDATE daraja_requests SET originator_conversation_id=$2,conversation_id=$3 WHERE id=$1 RETURNING *',[id,response.OriginatorConversationID,response.ConversationID]));
}
export async function readDarajaResult(request:any):Promise<any|null>{
 if(!request.originator_conversation_id)return null;
 const result=await one('SELECT payload FROM daraja_results WHERE originator_conversation_id=$1',[request.originator_conversation_id]);
 return result?verifyDarajaResult(result.payload,request):null;
}
/** Scheduled reconciliation re-checks an already-begun request without re-seeding expected evidence. */
export async function findDarajaRequestByKey(requestKey:string):Promise<any|null>{
 return one('SELECT * FROM daraja_requests WHERE request_key=$1',[requestKey]);
}
/** Correlates an inbound Result/Timeout webhook back to the payment or refund it evidences. */
export async function findDarajaRequestByOriginator(originatorConversationId:string):Promise<any|null>{
 return one('SELECT * FROM daraja_requests WHERE originator_conversation_id=$1',[originatorConversationId]);
}
