import { AppError } from '../../middleware/error-handler';
import { ledgerRepository } from './ledger.repository';
import { financialPostingService } from './financial-posting.service';
import type { FinancialAdjustment } from '@deetoo/types';

export class FinancialAdjustmentService {
  async request(input:{
    targetAccountId:string; offsetAccountId:string; direction:'DEBIT'|'CREDIT'; amountMinor:number;
    currency?:string; reasonCode:any; note:string; requestedBy:string;
  }):Promise<FinancialAdjustment>{
    if(input.amountMinor<=0) throw new AppError(400,'ADJUSTMENT_AMOUNT_INVALID','Adjustment amount must be positive');
    if(input.targetAccountId===input.offsetAccountId) throw new AppError(400,'ADJUSTMENT_ACCOUNTS_INVALID','Target and offset accounts must differ');
    const adj:FinancialAdjustment={
      id:`adj_${Date.now()}_${Math.random().toString(36).substring(2,8)}`,
      reason_code:input.reasonCode,target_account_id:input.targetAccountId,offset_account_id:input.offsetAccountId,
      direction:input.direction as any,amount_minor:input.amountMinor,currency:input.currency||'KES',note:input.note,
      requested_by:input.requestedBy,approved_by:null,approved_at:null,status:'REQUESTED',
      ledger_transaction_id:null,created_at:new Date().toISOString(),
    };
    return ledgerRepository.saveAdjustment(adj);
  }

  list(){ return ledgerRepository.listAdjustments(); }

  async approve(id:string,approvedBy:string):Promise<FinancialAdjustment>{
    const adj=await ledgerRepository.findAdjustmentById(id);
    if(!adj) throw new AppError(404,'ADJUSTMENT_NOT_FOUND','Financial adjustment not found');
    if(adj.status!=='REQUESTED') throw new AppError(409,'ADJUSTMENT_NOT_REQUESTED','Adjustment is not awaiting approval');
    if(adj.requested_by===approvedBy) throw new AppError(403,'SELF_APPROVAL_NOT_ALLOWED','The requester cannot approve their own financial adjustment');
    adj.approved_by=approvedBy;
    adj.approved_at=new Date().toISOString();
    adj.status='POSTED';
    await financialPostingService.postFinancialAdjustment(adj);
    return (await ledgerRepository.findAdjustmentById(id)) || adj;
  }

  async reject(id:string,rejectedBy:string,reason:string):Promise<FinancialAdjustment>{
    const adj=await ledgerRepository.findAdjustmentById(id);
    if(!adj) throw new AppError(404,'ADJUSTMENT_NOT_FOUND','Financial adjustment not found');
    if(adj.status!=='REQUESTED') throw new AppError(409,'ADJUSTMENT_NOT_REQUESTED','Adjustment is not awaiting review');
    if(adj.requested_by===rejectedBy) throw new AppError(403,'SELF_REVIEW_NOT_ALLOWED','The requester cannot review their own financial adjustment');
    adj.status='REJECTED';
    adj.rejected_at=new Date().toISOString();
    adj.rejection_reason=reason.slice(0,500);
    return ledgerRepository.saveAdjustment(adj);
  }
}

export const financialAdjustmentService=new FinancialAdjustmentService();
