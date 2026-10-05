import { randomUUID } from 'node:crypto';
import { Payment, PaymentStatus, PaymentMethod, PaymentProvider, PaymentReconciliationStatus, Refund, RefundStatus, OrderStatus, UserRole } from '@deetoo/types';
import { config } from '@deetoo/config';
import { transactionalService } from '../../db/transaction';
import { one, rows } from '../../db/adapter';
import { AppError } from '../../middleware/error-handler';
import { canonicalHash, requireIdempotencyKey, lockCommand } from '../cart/quote-binding';
import { paymentRepository } from './payment.repository';
import { orderRepository } from '../order/order.repository';
import { authRepository } from '../auth/auth.repository';
import { paymentProviderRegistry } from './providers/provider-registry';
import { ProviderCallbackResult, ProviderStatusResult } from './providers/payment-provider.interface';
import { financialPostingService } from '../finance/financial-posting.service';
import { orderEventBroker } from '../realtime/event-broker';
import { enqueuePaymentCommand } from './payment-commands';
import { notificationService } from '../operations/notification.service';

export interface InitiatePaymentParams { orderId:string; customerId:string; method:'MPESA'|'CARD'; phone?:string; paymentMethodToken?:string; idempotencyKey?:string; }
export interface AdminRefundParams { paymentId:string; amountMinor?:number; amount?:number; reasonCode:string; reasonCategory?:string; note?:string; requestedBy:string; idempotencyKey?:string; }

export class PaymentService {
  public async initiatePayment(params:InitiatePaymentParams):Promise<Payment> {
    const key=requireIdempotencyKey(params.idempotencyKey);
    await lockCommand(`order:${params.orderId}`);
    const order=await orderRepository.findById(params.orderId);
    if(!order)throw new AppError(404,'ORDER_NOT_FOUND','Order not found');
    if(order.customer_id!==params.customerId)throw new AppError(403,'FORBIDDEN_ORDER_ACCESS','Order is not owned by this customer');
    const scopedKey=canonicalHash({operation:'payment.initiate',customer:params.customerId,key});
    const requestHash=canonicalHash({...params,idempotencyKey:undefined,amount:order.total_minor,currency:order.currency});
    const replay=await paymentRepository.getIdempotencyRecord(scopedKey);
    if(replay){
      if(replay.requestHash!==requestHash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','Payment key was reused with a different request');
      const p=await paymentRepository.findPaymentById(replay.paymentId);
      if(!p)throw new Error('Idempotency result is missing'); return p;
    }
    if(order.status!==OrderStatus.PENDING_PAYMENT)throw new AppError(409,'ORDER_NOT_PAYABLE','Only PENDING_PAYMENT orders can initiate payment');
    const attempts=await paymentRepository.findPaymentsByOrderId(order.id);
    if(attempts.some(p=>![PaymentStatus.FAILED,PaymentStatus.CANCELLED,PaymentStatus.EXPIRED].includes(p.status)))throw new AppError(409,'PAYMENT_ALREADY_PENDING','An unresolved payment attempt already exists');
    if(!Number.isSafeInteger(order.total_minor)||order.total_minor<=0)throw new AppError(409,'INVALID_PAYMENT_AMOUNT','Payment requires a positive integer amount');
    const quotedMethod = order.pricing_snapshot?.financial_snapshot?.payment_method;
    if(quotedMethod && params.method!==quotedMethod)throw new AppError(409,'PAYMENT_METHOD_MISMATCH','Use the payment method selected for this quote');
    if(params.method==='MPESA' && order.total_minor%100!==0)throw new AppError(409,'MPESA_REQUOTE_REQUIRED','Request an M-PESA quote with the displayed whole-KES adjustment');
    if(params.method==='CARD' && params.paymentMethodToken && !/^pm_[A-Za-z0-9_]{1,128}$/.test(params.paymentMethodToken))throw new AppError(400,'TOKENIZED_PAYMENT_REQUIRED','A provider-collected payment method token is required');
    const provider=paymentProviderRegistry.getProvider(params.method);
    const now=new Date().toISOString();
    const payment:Payment={id:randomUUID(),order_id:order.id,customer_id:params.customerId,provider:params.method as PaymentProvider,method:params.method as PaymentMethod,status:PaymentStatus.INITIATED,currency:order.currency,amount_minor:order.total_minor,amount:order.total_minor/100,captured_minor:0,refunded_minor:0,phone:params.phone||null,reconciliation_status:PaymentReconciliationStatus.UNRECONCILED,idempotency_key:scopedKey,initiated_at:now,created_at:now,updated_at:now};
    await paymentRepository.savePayment(payment);
    await paymentRepository.saveIdempotencyRecord({idempotencyKey:scopedKey,customerId:params.customerId,orderId:order.id,requestHash,paymentId:payment.id,createdAt:now});
    await paymentRepository.appendPaymentTimeline({payment_id:payment.id,event_type:'PAYMENT_INITIATED',from_status:null,to_status:payment.status,metadata:{request_hash:requestHash}});
    await enqueuePaymentCommand('INITIATE',payment.id,`initiate:${payment.id}`,{localTest:config.localWorkflow,paymentId:payment.id,orderId:order.id,orderNumber:order.order_number,amountMinor:payment.amount_minor,currency:payment.currency,phone:params.phone,paymentMethodToken:params.paymentMethodToken,idempotencyKey:`payment:${payment.id}`});
    return payment;
  }

  public async handleCallback(providerId:string,headers:Record<string,string|string[]|undefined>,rawBody:string|unknown,payload:unknown):Promise<{acknowledged:boolean;duplicate?:boolean;paymentId?:string}> {
    providerId=providerId.toUpperCase();
    const provider=paymentProviderRegistry.getProvider(providerId);
    if(!provider.verifyCallback(headers,rawBody))throw new AppError(401,'INVALID_WEBHOOK_SIGNATURE','Payment callback authentication failed');
    const parsed=provider.parseCallback(payload);
    if(!parsed.isValid||!parsed.providerEventId)throw new AppError(400,'INVALID_PROVIDER_EVENT','Malformed provider event');
    await lockCommand(`provider-event:${providerId}:${parsed.providerEventId}`);
    const hash=canonicalHash(payload);
    const old=await paymentRepository.findProviderEvent(providerId,parsed.providerEventId);
    if(old){
      if(old.payload_hash!==hash)throw new AppError(409,'PROVIDER_EVENT_CONFLICT','Provider event content changed');
      if(old.payment_id)return {acknowledged:true,duplicate:true,paymentId:old.payment_id};
    }
    let payment:Payment|null=null;
    if(parsed.checkoutRequestId)payment=await paymentRepository.findPaymentByCheckoutRequestId(parsed.checkoutRequestId);
    if(!payment&&parsed.merchantRequestId)payment=await paymentRepository.findPaymentByMerchantRequestId(parsed.merchantRequestId);
    if(!payment&&parsed.providerReference)payment=await paymentRepository.findPaymentByProviderReference(providerId,parsed.providerReference);
    if(payment?.provider!==providerId)payment=null;
    await paymentRepository.recordProviderEvent({provider:providerId,provider_event_id:parsed.providerEventId,payment_id:payment?.id||null,event_type:parsed.eventType,payload_hash:hash,raw_payload:parsed.rawPayload,processing_status:'RECEIVED'});
    if(payment)await enqueuePaymentCommand('VERIFY',payment.id,`verify:${providerId}:${parsed.providerEventId}`,{callback:parsed,eventId:parsed.providerEventId});
    // Unknown references remain durable RECEIVED evidence for reconciliation, never discarded.
    return {acknowledged:true,paymentId:payment?.id};
  }

  /** Called only by the worker after adapter verification; no HTTP caller supplies evidence. */
  public async applyVerifiedOutcome(paymentId:string,result:ProviderStatusResult,eventId?:string):Promise<Payment> {
    let payment=await paymentRepository.findPaymentById(paymentId);
    if(!payment)throw new AppError(404,'PAYMENT_NOT_FOUND','Payment not found');
    await lockCommand(`order:${payment.order_id}`);
    payment=(await paymentRepository.findPaymentById(paymentId))!;
    const order=await orderRepository.findById(payment.order_id);
    if(!order)throw new Error('Payment order is missing');
    if(!result.verified)throw new AppError(409,'PAYMENT_NOT_VERIFIED','Provider evidence is insufficient');
    if(result.status==='PENDING')return payment;
    if(result.status==='CAPTURED'){
      if(result.amountMinor!==payment.amount_minor||result.currency!==payment.currency||result.paymentId!==payment.id||result.orderId!==order.id||!result.receiver||result.receiver!==(payment as any).provider_receiver||!result.providerReference)throw new AppError(409,'PAYMENT_EVIDENCE_MISMATCH','Amount, currency, identity, reference or receiver verification failed');
      if(payment.captured_minor>0){
        if(payment.captured_minor!==result.amountMinor)throw new AppError(409,'CAPTURE_CONFLICT','Captured amount differs');
        if(eventId){const event=await paymentRepository.findProviderEvent(payment.provider,eventId);if(event)await paymentRepository.recordProviderEvent({...event,processing_status:'PROCESSED',processed_at:new Date().toISOString()});}
        return payment;
      }
      if(config.storage.mode==='postgres')await rows(`INSERT INTO payment_capture_evidence(payment_id,order_id,provider,provider_reference,amount_minor,currency,receiver,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[payment.id,order.id,payment.provider,result.providerReference,result.amountMinor,result.currency,result.receiver,result.rawResponse]);
      const otherCapture=(await paymentRepository.findPaymentsByOrderId(order.id)).some(p=>p.id!==payment!.id&&p.captured_minor>0);
      const prior=payment.status;
      payment.status=PaymentStatus.CAPTURED;payment.captured_minor=result.amountMinor;payment.captured_at=new Date().toISOString();payment.reconciliation_status=PaymentReconciliationStatus.MATCHED;
      payment.provider_reference=result.providerReference;
      if(result.receiptNumber)payment.mpesa_receipt_number=result.receiptNumber;
      await paymentRepository.updatePayment(payment);
      await financialPostingService.postPaymentCapture(payment,order);
      await paymentRepository.appendPaymentTimeline({payment_id:payment.id,event_type:'PAYMENT_CAPTURED',from_status:prior,to_status:payment.status,provider_reference:result.providerReference,metadata:{event_id:eventId||null}});
      notificationService.sendNotification({recipientType:'CUSTOMER' as any,recipientId:order.customer_id,channel:'IN_APP' as any,templateCode:'PAYMENT_CAPTURED',subject:'Payment received',referenceId:payment.id,payload:{orderId:order.id,paymentId:payment.id,amountMinor:payment.captured_minor}}).catch(()=>{});
      if(otherCapture){
        await this.reserveRefund({paymentId:payment.id,reasonCode:'DUPLICATE_CAPTURE',requestedBy:'SYSTEM',idempotencyKey:`duplicate-capture:${payment.id}`},true);
      }else if(order.status===OrderStatus.PENDING_PAYMENT){
        const now=new Date().toISOString();
        await orderRepository.updateOrderStatus(order.id,OrderStatus.PLACED,{placed_at:now},{id:randomUUID(),order_id:order.id,from_status:OrderStatus.PENDING_PAYMENT,to_status:OrderStatus.PLACED,actor_type:'SYSTEM',reason_code:'VERIFIED_PAYMENT_CAPTURE',created_at:now});
        for(const channel of [`merchant-branch:${order.branch_id}`,`customer:${order.customer_id}`,`order:${order.id}`,'admin:orders'])await orderEventBroker.publish(channel,{type:'order.placed',channel,order_id:order.id,order_number:order.order_number,status:OrderStatus.PLACED,timestamp:now});
      }else if([OrderStatus.CANCELLED,OrderStatus.REJECTED].includes(order.status))await this.coordinateCancellation(order.id);
    }else if(payment.captured_minor===0){
      const prior=payment.status;
      payment.status=result.status==='CANCELLED'?PaymentStatus.CANCELLED:PaymentStatus.FAILED;
      payment.failure_code=result.failureCode||null;
      await paymentRepository.updatePayment(payment);
      await paymentRepository.appendPaymentTimeline({payment_id:payment.id,event_type:`PAYMENT_${payment.status}`,from_status:prior,to_status:payment.status,metadata:{event_id:eventId||null}});
      if(payment.status===PaymentStatus.FAILED)notificationService.sendNotification({recipientType:'CUSTOMER' as any,recipientId:order.customer_id,channel:'IN_APP' as any,templateCode:'PAYMENT_FAILED',subject:'Payment failed',referenceId:payment.id,payload:{orderId:order.id,paymentId:payment.id,failureCode:payment.failure_code}}).catch(()=>{});
    }
    if(eventId){const event=await paymentRepository.findProviderEvent(payment.provider,eventId);if(event)await paymentRepository.recordProviderEvent({...event,processing_status:'PROCESSED',processed_at:new Date().toISOString()});}
    return payment;
  }

  public async reconcilePayment(paymentId:string):Promise<Payment> {
    const payment=await paymentRepository.findPaymentById(paymentId);
    if(!payment)throw new AppError(404,'PAYMENT_NOT_FOUND','Payment not found');
    await enqueuePaymentCommand('VERIFY',payment.id,`reconcile:${payment.id}:${randomUUID()}`,{});
    return payment;
  }

  public async requestRefund(params:AdminRefundParams):Promise<Refund> {
    const actor=await authRepository.findUserById(params.requestedBy);
    if(actor?.status!=='ACTIVE')throw new AppError(403,'REFUND_APPROVAL_REQUIRED','Active financial actor required');
    const roles=await authRepository.getUserRoles(params.requestedBy);
    if(!roles.some(r=>[UserRole.ADMIN,UserRole.FINANCE].includes(r)))throw new AppError(403,'REFUND_APPROVAL_REQUIRED','Admin or Finance role required');
    return this.reserveRefund(params,false);
  }
  private async reserveRefund(params:AdminRefundParams,automatic:boolean):Promise<Refund> {
    const key=requireIdempotencyKey(params.idempotencyKey);
    let payment=await paymentRepository.findPaymentById(params.paymentId);
    if(!payment)throw new AppError(404,'PAYMENT_NOT_FOUND','Payment not found');
    await lockCommand(`order:${payment.order_id}`);
    payment=(await paymentRepository.findPaymentById(payment.id))!;
    const hash=canonicalHash({amountMinor:params.amountMinor,amount:params.amount,reason:params.reasonCode,note:params.note||null,requestedBy:params.requestedBy,automatic});
    const refunds=await paymentRepository.findRefundsByPaymentId(payment.id);
    const old=refunds.find(r=>(r as any).idempotency_key===key);
    if(old){if((old as any).request_hash!==hash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','Refund request changed');return old;}
    const reserved=refunds.filter(r=>![RefundStatus.FAILED,RefundStatus.CANCELLED].includes(r.status)).reduce((sum,r)=>sum+r.amount_minor,0);
    const available=payment.captured_minor-reserved;
    const amount=params.amountMinor??(params.amount!==undefined?params.amount*100:available);
    if(!Number.isSafeInteger(amount)||amount<=0)throw new AppError(400,'INVALID_REFUND_AMOUNT','Refund requires positive integer minor units');
    if(amount>available)throw new AppError(409,'REFUND_EXCEEDS_AVAILABLE_BALANCE','Refund exceeds unreserved captured funds');
    const now=new Date().toISOString();
    const refund:Refund & Record<string,any>={id:randomUUID(),payment_id:payment.id,order_id:payment.order_id,amount_minor:amount,currency:payment.currency,status:RefundStatus.REQUESTED,reason_code:params.reasonCode as any,note:params.note||null,requested_by:automatic?null:params.requestedBy,requested_at:now,created_at:now,updated_at:now,idempotency_key:key,request_hash:hash,policy:automatic?'SYSTEM_FULL_REFUND':'MANUAL_MAKER_CHECKER',approved_at:automatic?now:null};
    await paymentRepository.saveRefund(refund);
    await paymentRepository.appendRefundTimeline({refund_id:refund.id,from_status:null,to_status:refund.status,reason_code:params.reasonCode,metadata:{policy:refund.policy,request_hash:hash}});
    if(automatic)await enqueuePaymentCommand('REFUND',payment.id,`refund:${refund.id}`,{refundId:refund.id},refund.id);
    return refund;
  }
  public async approveRefund(refundId:string,actorId:string):Promise<Refund> {
    const actor=await authRepository.findUserById(actorId);
    if(actor?.status!=='ACTIVE')throw new AppError(403,'FORBIDDEN_REFUND_APPROVAL','Active approver required');
    const roles=await authRepository.getUserRoles(actorId);
    if(!roles.some(r=>[UserRole.ADMIN,UserRole.FINANCE].includes(r)))throw new AppError(403,'FORBIDDEN_REFUND_APPROVAL','Admin or Finance required');
    let refund=await paymentRepository.findRefundById(refundId);
    if(!refund)throw new AppError(404,'REFUND_NOT_FOUND','Refund not found');
    await lockCommand(`order:${refund.order_id}`);
    refund=(await paymentRepository.findRefundById(refundId))!;
    if(refund.requested_by===actorId)throw new AppError(403,'REFUND_MAKER_CHECKER','A different authorized user must approve');
    if((refund as any).approved_by===actorId)return refund;
    if(refund.status!==RefundStatus.REQUESTED)throw new AppError(409,'INVALID_REFUND_STATE','Refund is not awaiting approval');
    Object.assign(refund,{approved_by:actorId,approved_at:new Date().toISOString(),status:RefundStatus.PENDING});
    await paymentRepository.updateRefund(refund);
    await paymentRepository.appendRefundTimeline({refund_id:refund.id,from_status:RefundStatus.REQUESTED,to_status:RefundStatus.PENDING,metadata:{approved_by:actorId}});
    await enqueuePaymentCommand('REFUND',refund.payment_id,`refund:${refund.id}`,{refundId:refund.id},refund.id);
    return refund;
  }
  public async coordinateCancellation(orderId:string):Promise<void> {
    await lockCommand(`order:${orderId}`);
    const order=await orderRepository.findById(orderId);
    if(!order||![OrderStatus.CANCELLED,OrderStatus.REJECTED].includes(order.status))throw new AppError(409,'INVALID_CANCELLATION_POLICY','Order must be cancelled or rejected');
    for(const p of await paymentRepository.findPaymentsByOrderId(orderId)){
      const reserved=(await paymentRepository.findRefundsByPaymentId(p.id)).filter(r=>![RefundStatus.FAILED,RefundStatus.CANCELLED].includes(r.status)).reduce((s,r)=>s+r.amount_minor,0);
      if(p.captured_minor>reserved)await this.reserveRefund({paymentId:p.id,reasonCode:'ORDER_CANCELLED',requestedBy:'SYSTEM',idempotencyKey:`cancellation:${orderId}`},true);
      else if(p.captured_minor===0)await enqueuePaymentCommand('VOID',p.id,`void:${p.id}`,{});
    }
  }
  public async getPayment(id:string){return paymentRepository.findPaymentById(id);}
  public async getPaymentsByOrder(id:string){return paymentRepository.findPaymentsByOrderId(id);}
  public async listPayments(params:any){return paymentRepository.listPayments(params);}
  public async getRefundsByPayment(id:string){return paymentRepository.findRefundsByPaymentId(id);}
  public async getRefundsByOrder(id:string){return paymentRepository.findRefundsByOrderId(id);}
}
export const paymentService=transactionalService(new PaymentService());
