import { config } from '@deetoo/config';
import { randomUUID } from 'node:crypto';
import { OrderStatus } from '@deetoo/types';
import { orderEventBroker } from '../realtime/event-broker';
import { PaymentStatus, RefundStatus } from '@deetoo/types';
import { AppError } from '../../middleware/error-handler';
import { paymentProviderRegistry } from './providers/provider-registry';
import { paymentRepository } from './payment.repository';
import { orderRepository } from '../order/order.repository';
import { financialPostingService } from '../finance/financial-posting.service';
import { paymentService } from './payment.service';
import { paymentTransaction, leasePaymentCommand, finishPaymentCommand, enqueuePaymentCommand } from './payment-commands';
import { lockCommand } from '../cart/quote-binding';
import { notificationService } from '../operations/notification.service';

/** Network calls occur after the durable lease commits and before result application. */
export async function processPaymentCommand(paymentId?:string):Promise<boolean> {
  const command=await leasePaymentCommand(paymentId); if(!command)return false;
  try{
    const payment=await paymentRepository.findPaymentById(command.payment_id);
    if(!payment)throw new Error('Payment command references a missing payment');
    const provider=paymentProviderRegistry.getProvider(payment.provider);
    if(command.kind==='INITIATE'){
      // Providers without idempotent initiation cannot safely repeat an unknown call.
      if(payment.provider_payment_id){await paymentTransaction(()=>finishPaymentCommand(command,'SUCCEEDED'));return true;}
      if(command.attempts>1&&command.created_at&&Date.now()-Date.parse(command.created_at)>23*3600000)throw new AppError(409,'PROVIDER_IDEMPOTENCY_WINDOW_EXPIRED','Reconcile the original provider intent before retrying beyond its idempotency window');
      if(command.attempts>1&&payment.provider==='MPESA'&&!provider.simulated&&command.last_error!=='BLOCKED_BY_CONFIGURATION')throw new AppError(409,'PROVIDER_OUTCOME_UNKNOWN','M-PESA initiation must be reconciled before another STK request');
      const order=await orderRepository.findById(payment.order_id);
      if(order?.status!=='PENDING_PAYMENT'){await paymentTransaction(()=>finishPaymentCommand(command,'SUCCEEDED'));return true;}
      const result=await provider.initiatePayment(command.payload as any);
      await paymentTransaction(async()=>{
        await lockCommand(`order:${payment.order_id}`);
        const current=(await paymentRepository.findPaymentById(payment.id))!;
        if(current.captured_minor===0){
          current.status=result.success?PaymentStatus.PENDING:PaymentStatus.FAILED;
          (current as any).provider_receiver=result.receiver||null;
          current.checkout_url=result.checkoutUrl||null;current.provider_payment_id=result.providerPaymentId||null;current.provider_reference=result.providerReference||null;
          current.checkout_request_id=result.checkoutRequestId||null;current.merchant_request_id=result.merchantRequestId||null;
          await paymentRepository.updatePayment(current);
          if(config.localWorkflow && result.success && current.provider_payment_id?.startsWith('local-test:'))await enqueuePaymentCommand('VERIFY',current.id,`local-test-verify:${current.id}`,{});
          await paymentRepository.appendPaymentTimeline({payment_id:current.id,event_type:result.success?'PAYMENT_PENDING':'PAYMENT_INITIATION_FAILED',from_status:PaymentStatus.INITIATED,to_status:current.status,metadata:{command_id:command.id}});
        }
        await finishPaymentCommand(command,'SUCCEEDED');
      });
    }else if(command.kind==='VERIFY'){
      if(!provider.verifyPayment)throw new AppError(503,'BLOCKED_BY_CONFIGURATION','Provider verification is not configured');
      const result=await provider.verifyPayment(payment,command.payload.callback);
      await paymentTransaction(async()=>{
        await paymentService.applyVerifiedOutcome(payment.id,result,command.payload.eventId);
        await finishPaymentCommand(command,result.status==='PENDING'?'PENDING':'SUCCEEDED');
      });
    }else if(command.kind==='VOID'){
      if(payment.captured_minor>0){await paymentTransaction(async()=>{await paymentService.coordinateCancellation(payment.order_id);await finishPaymentCommand(command,'SUCCEEDED');});}
      else {
        if(!provider.voidPayment)throw new AppError(409,'VOID_REQUIRES_RECONCILIATION','Provider cancellation is not supported; retain late-capture monitoring');
        await provider.voidPayment(payment);
        await paymentTransaction(()=>finishPaymentCommand(command,'SUCCEEDED'));
      }
    }else{
      const refund=await paymentRepository.findRefundById(command.refund_id!);
      if(!refund)throw new Error('Refund missing');
      if(refund.status===RefundStatus.SUCCEEDED){await paymentTransaction(()=>finishPaymentCommand(command,'SUCCEEDED'));return true;}
      if(!(refund as any).approved_at)throw new AppError(403,'REFUND_APPROVAL_REQUIRED','Refund has no recorded approval');
      const result=await provider.refund({refundId:refund.id,paymentId:payment.id,providerPaymentId:payment.provider_payment_id||undefined,providerReference:payment.provider_reference||undefined,amountMinor:refund.amount_minor,currency:refund.currency,reason:String(refund.reason_code),phone:payment.phone||undefined});
      if(!result.success||!result.verified||result.amountMinor!==refund.amount_minor||result.currency!==refund.currency||!result.providerRefundId)throw new AppError(409,'REFUND_NOT_VERIFIED','Refund outcome requires reconciliation');
      await paymentTransaction(async()=>{
        await lockCommand(`order:${payment.order_id}`);
        const currentRefund=(await paymentRepository.findRefundById(refund.id))!;
        if(currentRefund.status!==RefundStatus.SUCCEEDED){
          const currentPayment=(await paymentRepository.findPaymentById(payment.id))!;
          await financialPostingService.postRefundReversal(currentRefund);
          currentRefund.status=RefundStatus.SUCCEEDED;currentRefund.provider_refund_id=result.providerRefundId;currentRefund.processed_at=new Date().toISOString();
          await paymentRepository.updateRefund(currentRefund);
          const prior=currentPayment.status;
          currentPayment.refunded_minor+=currentRefund.amount_minor;
          currentPayment.status=currentPayment.refunded_minor===currentPayment.captured_minor?PaymentStatus.REFUNDED:PaymentStatus.PARTIALLY_REFUNDED;
          if(currentPayment.status===PaymentStatus.REFUNDED)currentPayment.refunded_at=new Date().toISOString();
          await paymentRepository.updatePayment(currentPayment);
          const order=await orderRepository.findById(currentPayment.order_id);
          if(currentPayment.status===PaymentStatus.REFUNDED && order && [OrderStatus.PLACED,OrderStatus.PENDING_PAYMENT].includes(order.status)){
            const now=new Date().toISOString();
            await orderRepository.updateOrderStatus(order.id,OrderStatus.CANCELLED,{cancelled_at:now,cancellation_reason:'FULL_PAYMENT_REFUND'},{id:randomUUID(),order_id:order.id,from_status:order.status,to_status:OrderStatus.CANCELLED,actor_type:'SYSTEM',reason_code:'FULL_PAYMENT_REFUND',created_at:now});
            for(const channel of [`order:${order.id}`,`customer:${order.customer_id}`,`merchant-branch:${order.branch_id}`])await orderEventBroker.publish(channel,{type:'order.cancelled',channel,order_id:order.id,order_number:order.order_number,status:OrderStatus.CANCELLED,timestamp:now});
          }
          if(order){
            const now=new Date().toISOString();
            await orderRepository.updateOrderStatus(order.id,(await orderRepository.findById(order.id))!.status,{}, {id:randomUUID(),order_id:order.id,from_status:order.status,to_status:(await orderRepository.findById(order.id))!.status,actor_type:'SYSTEM',reason_code:'PAYMENT_REFUNDED',created_at:now,metadata:{refund_id:refund.id}});
            for(const channel of [`order:${order.id}`,`customer:${order.customer_id}`])await orderEventBroker.publish(channel,{type:'refund.succeeded' as any,channel,order_id:order.id,order_number:order.order_number,status:order.status,timestamp:now});
          }

          await paymentRepository.appendRefundTimeline({refund_id:refund.id,from_status:refund.status,to_status:RefundStatus.SUCCEEDED,metadata:{provider_refund_id:result.providerRefundId,command_id:command.id}});
          await paymentRepository.appendPaymentTimeline({payment_id:payment.id,event_type:'PAYMENT_REFUNDED',from_status:prior,to_status:currentPayment.status,metadata:{refund_id:refund.id}});
          if(order)notificationService.sendNotification({recipientType:'CUSTOMER' as any,recipientId:order.customer_id,channel:'IN_APP' as any,templateCode:'REFUND_COMPLETED',subject:'Refund completed',referenceId:currentRefund.id,payload:{orderId:order.id,refundId:currentRefund.id,amountMinor:currentRefund.amount_minor}}).catch(()=>{});
        }
        await finishPaymentCommand(command,'SUCCEEDED');
      });
    }
  }catch(error){
    // Uncertain operations retain their reservation and stable provider identity.
    const code=error instanceof AppError?error.code:'PROVIDER_OR_STORAGE_UNAVAILABLE';
    const review=['BLOCKED_BY_CONFIGURATION','PROVIDER_OUTCOME_UNKNOWN','PROVIDER_IDEMPOTENCY_WINDOW_EXPIRED','VOID_REQUIRES_RECONCILIATION','PAYMENT_EVIDENCE_MISMATCH','REFUND_APPROVAL_REQUIRED','REAL_PAYMENT_REQUIRES_PROVIDER'].includes(code);
    await paymentTransaction(()=>finishPaymentCommand(command,review?'REVIEW':'PENDING',code));
  }
  return true;
}
