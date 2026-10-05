import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AppError } from '../../middleware/error-handler';
import { withTransaction } from '../../db/transaction';
import {
  disbursementRepository,
  PayoutMethod,
  PayoutOwnerType,
  DisbursementAttempt,
} from './disbursement.repository';
import { providerFor } from './disbursement.provider';
import { settlementService } from './settlement.service';
import { riderPayoutService } from './rider-payout.service';
import { ledgerRepository } from './ledger.repository';

function destinationKey(): Buffer {
  const key=Buffer.from(process.env.PAYOUT_DESTINATION_ENCRYPTION_KEY||'','base64');
  if(key.length!==32) throw new AppError(503,'PAYOUT_ENCRYPTION_NOT_CONFIGURED','Payout destination encryption is not configured');
  return key;
}
function encrypt(value:string):string{
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',destinationKey(),iv);
  const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');
}
function decrypt(value:string):string{
  const data=Buffer.from(value,'base64');
  const decipher=createDecipheriv('aes-256-gcm',destinationKey(),data.subarray(0,12));
  decipher.setAuthTag(data.subarray(12,28));
  return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8');
}
function payloadHash(payload:unknown):string{
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

class DisbursementService {
  async createDestination(input:{
    ownerType:PayoutOwnerType; ownerId:string; method:PayoutMethod; provider:string;
    beneficiaryReference:string; maskedDestination:string; currency?:string; createdBy:string;
  }){
    if(!input.beneficiaryReference.trim()) throw new AppError(400,'PAYOUT_DESTINATION_INVALID','Beneficiary reference is required');
    if(!input.maskedDestination.trim()) throw new AppError(400,'PAYOUT_DESTINATION_INVALID','Masked destination is required');
    return disbursementRepository.createDestination({
      owner_type:input.ownerType,owner_id:input.ownerId,method:input.method,provider:input.provider,
      provider_beneficiary_ciphertext:encrypt(input.beneficiaryReference.trim()),
      masked_destination:input.maskedDestination.trim(),currency:input.currency||'KES',
      active:true,verified_at:new Date().toISOString(),created_by:input.createdBy,
    });
  }

  private async attemptFor(resourceType:'SETTLEMENT'|'PAYOUT',resourceId:string,ownerType:PayoutOwnerType,ownerId:string,
    amountMinor:number,currency:string,initiatedBy:string,destinationId?:string):Promise<DisbursementAttempt>{
    const destination=await disbursementRepository.findActiveDestination(ownerType,ownerId,destinationId);
    if(!destination) throw new AppError(409,'PAYOUT_DESTINATION_REQUIRED','A verified payout destination is required');
    if(destination.currency!==currency) throw new AppError(409,'PAYOUT_DESTINATION_CURRENCY_MISMATCH','Payout destination currency does not match batch currency');

    const previous=await disbursementRepository.listAttempts({resourceType,resourceId,limit:100});
    const live=previous.find(a=>['CREATED','SUBMITTED','UNKNOWN','SUCCEEDED'].includes(a.status));
    if(live) return live;
    const attemptNo=previous.length+1;
    return disbursementRepository.createAttempt({
      resource_type:resourceType,resource_id:resourceId,destination_id:destination.id,
      provider:destination.provider,amount_minor:amountMinor,currency,status:'CREATED',
      idempotency_key:`${resourceType}:${resourceId}:attempt:${attemptNo}`,initiated_by:initiatedBy,
    });
  }

  async initiateSettlement(settlementId:string,initiatedBy:string,destinationId?:string){
    const settlement=await ledgerRepository.findSettlementById(settlementId);
    if(!settlement) throw new AppError(404,'SETTLEMENT_NOT_FOUND','Settlement not found');
    if(settlement.status==='PAID') return {settlement,attempt:null};
    if(!['APPROVED','PROCESSING'].includes(String(settlement.status))) throw new AppError(409,'SETTLEMENT_NOT_APPROVED','Settlement must be approved before disbursement');
    const attempt=await this.attemptFor('SETTLEMENT',settlement.id,'MERCHANT',settlement.merchant_id,
      settlement.net_settlement_amount_minor,settlement.currency,initiatedBy,destinationId);
    if(attempt.status==='SUCCEEDED') return {settlement,attempt};
    await settlementService.markProcessing(settlement.id,initiatedBy);
    return this.submit(attempt,`Merchant settlement ${settlement.settlement_number}`);
  }

  async initiatePayout(payoutId:string,initiatedBy:string,destinationId?:string){
    const payout=await ledgerRepository.findRiderPayoutById(payoutId);
    if(!payout) throw new AppError(404,'PAYOUT_NOT_FOUND','Rider payout not found');
    if(payout.status==='PAID') return {payout,attempt:null};
    if(!['APPROVED','PROCESSING'].includes(String(payout.status))) throw new AppError(409,'PAYOUT_NOT_APPROVED','Payout must be approved before disbursement');
    const attempt=await this.attemptFor('PAYOUT',payout.id,'RIDER',payout.rider_id,payout.amount_minor,payout.currency,
      initiatedBy,destinationId);
    if(attempt.status==='SUCCEEDED') return {payout,attempt};
    await riderPayoutService.markProcessing(payout.id,initiatedBy);
    return this.submit(attempt,`Rider payout ${payout.payout_number}`);
  }

  private async submit(attempt:DisbursementAttempt,narration:string){
    if(['SUBMITTED','UNKNOWN','SUCCEEDED'].includes(attempt.status)) return {attempt};
    const destination=await disbursementRepository.getDestination(attempt.destination_id);
    if(!destination) throw new AppError(409,'PAYOUT_DESTINATION_REQUIRED','Payout destination no longer exists');
    try{
      const result=await providerFor(destination).initiate({
        beneficiaryReference:decrypt(destination.provider_beneficiary_ciphertext),
        amountMinor:attempt.amount_minor,currency:attempt.currency,idempotencyKey:attempt.idempotency_key,narration,
      });
      const updated=await disbursementRepository.updateAttempt(attempt.id,{
        status:'SUBMITTED',provider_request_id:result.providerRequestId,submitted_at:new Date().toISOString(),
        failure_code:null,failure_reason:null,
      });
      return {attempt:updated};
    }catch(error:any){
      const definitive=error?.statusCode===400||error?.statusCode===409||error?.statusCode===503;
      const updated=await disbursementRepository.updateAttempt(attempt.id,{
        status:definitive?'FAILED':'UNKNOWN',failure_code:error?.code||'PROVIDER_INITIATION_FAILED',
        failure_reason:error?.message||String(error),submitted_at:new Date().toISOString(),
      });
      if(definitive){
        if(attempt.resource_type==='SETTLEMENT') await settlementService.failSettlement(attempt.resource_id,updated.failure_reason||'Disbursement initiation failed');
        else await riderPayoutService.failPayout(attempt.resource_id,updated.failure_reason||'Disbursement initiation failed');
      }
      throw error;
    }
  }

  async applyProviderResult(input:{
    provider:string; providerRequestId:string; succeeded:boolean; providerReference?:string;
    failureCode?:string; failureReason?:string; rawPayload?:unknown;
  }){
    const attempt=await disbursementRepository.findAttemptByProviderRequest(input.provider,input.providerRequestId);
    if(!attempt) throw new AppError(404,'DISBURSEMENT_ATTEMPT_NOT_FOUND','Unknown provider disbursement request');
    if(attempt.status==='SUCCEEDED'){
      if(!input.succeeded) throw new AppError(409,'DISBURSEMENT_TERMINAL_CONFLICT','Successful disbursement cannot later fail');
      return attempt;
    }
    const now=new Date().toISOString();
    if(input.succeeded){
      if(!input.providerReference) throw new AppError(400,'PROVIDER_REFERENCE_REQUIRED','Successful provider result requires a reference');
      return withTransaction(async()=>{
        const updated=await disbursementRepository.updateAttempt(attempt.id,{
          status:'SUCCEEDED',provider_reference:input.providerReference,completed_at:now,callback_received_at:now,
          callback_payload_hash:payloadHash(input.rawPayload||input),failure_code:null,failure_reason:null,
        });
        if(attempt.resource_type==='SETTLEMENT') await settlementService.confirmPaid(attempt.resource_id,input.providerReference!);
        else await riderPayoutService.confirmPaid(attempt.resource_id,input.providerReference!);
        return updated;
      });
    }
    return withTransaction(async()=>{
      const reason=input.failureReason||input.failureCode||'Provider reported disbursement failure';
      const updated=await disbursementRepository.updateAttempt(attempt.id,{
        status:'FAILED',failure_code:input.failureCode||'PROVIDER_FAILED',failure_reason:reason,
        completed_at:now,callback_received_at:now,callback_payload_hash:payloadHash(input.rawPayload||input),
      });
      if(attempt.resource_type==='SETTLEMENT') await settlementService.failSettlement(attempt.resource_id,reason);
      else await riderPayoutService.failPayout(attempt.resource_id,reason);
      return updated;
    });
  }

  listAttempts(filter:any={}){ return disbursementRepository.listAttempts(filter); }
}

export const disbursementService=new DisbursementService();
