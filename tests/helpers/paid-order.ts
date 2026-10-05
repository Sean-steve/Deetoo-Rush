import { randomUUID } from 'node:crypto';
import { config } from '@deetoo/config';
import { Order, PaymentStatus } from '@deetoo/types';
import { paymentService, InitiatePaymentParams } from '../../apps/api/src/modules/payment/payment.service';
import { paymentRepository } from '../../apps/api/src/modules/payment/payment.repository';
import { processPaymentCommand } from '../../apps/api/src/modules/payment/payment-worker';
import { orderRepository } from '../../apps/api/src/modules/order/order.repository';
import { commissionService } from '../../apps/api/src/modules/finance/commission.service';

export async function freezeFixtureEconomics(order:Order):Promise<Order>{
  if(config.storage.mode!=='memory'||!config.storage.fixtures)throw new Error('Fixture helper requires explicit memory fixtures');
  order.delivery_fee_minor ||= 0; order.service_fee_minor ||= 0;
  const discount=order.discount_minor||0;
  const food=order.total_minor-order.delivery_fee_minor-order.service_fee_minor+discount;
  order.pricing_snapshot={items_subtotal_minor:food,modifiers_subtotal_minor:0,gross_subtotal_minor:food,discount_minor:discount,net_subtotal_minor:food-discount,delivery_fee_minor:order.delivery_fee_minor,service_fee_minor:order.service_fee_minor,tax_minor:0,total_minor:order.total_minor,currency:order.currency,
    financial_snapshot:{gross_delivery_fee_minor:order.delivery_fee_minor,merchant_funded_minor:0,platform_funded_minor:discount,commission:await commissionService.calculateOrderCommission(order.merchant_id,food,0)}};
  return order;
}
export async function initiateFixturePayment(params:InitiatePaymentParams){
  const payment=await paymentService.initiatePayment({...params,idempotencyKey:params.idempotencyKey||randomUUID()});
  await processPaymentCommand(payment.id);
  return (await paymentRepository.findPaymentById(payment.id))!;
}
export async function fixtureCallback(...args:Parameters<typeof paymentService.handleCallback>){
  const result=await paymentService.handleCallback(...args);
  await processPaymentCommand(result.paymentId);return result;
}
export async function payFixtureOrder(order:Order){
  if(!order.pricing_snapshot?.financial_snapshot)await freezeFixtureEconomics(order);
  (orderRepository as any).orders.set(order.id,order);
  const p=await initiateFixturePayment({orderId:order.id,customerId:order.customer_id,method:'MPESA',phone:'0712345678',idempotencyKey:`fixture:${order.id}`});
  const payload={Body:{stkCallback:{MerchantRequestID:p.merchant_request_id,CheckoutRequestID:p.checkout_request_id,ResultCode:0,CallbackMetadata:{Item:[{Name:'Amount',Value:p.amount_minor/100},{Name:'MpesaReceiptNumber',Value:`fixture-${p.id}`}]}}}};
  await fixtureCallback('MPESA',{},JSON.stringify(payload),payload);
  const paid=await paymentRepository.findPaymentById(p.id);
  if(paid?.status!==PaymentStatus.CAPTURED)throw new Error('Fixture capture did not complete');
  return (await orderRepository.findById(order.id))!;
}

export async function approvedFixtureRefund(params:Parameters<typeof paymentService.requestRefund>[0]){
  const {authRepository}=await import('../../apps/api/src/modules/auth/auth.repository');
  const {UserRole,UserStatus}=await import('@deetoo/types');
  const approver='10000000-0000-0000-0000-000000000091';
  for(const id of [params.requestedBy,approver]){
    if(!await authRepository.findUserById(id))await authRepository.createUser({id,email:`${id}@example.test`,phone_e164:null,password_hash:'fixture-only',status:UserStatus.ACTIVE});
    await authRepository.setUserRoles(id,[UserRole.FINANCE]);
  }
  const refund=await paymentService.requestRefund({...params,idempotencyKey:params.idempotencyKey||randomUUID()});
  await paymentService.approveRefund(refund.id,approver);
  await processPaymentCommand(refund.payment_id);
  return (await paymentRepository.findRefundById(refund.id))!;
}

export async function createPaidDispatchFixture(orderId:string){
  const order={id:orderId,order_number:orderId,customer_id:`customer:${orderId}`,merchant_id:'dispatch-fixture-merchant',branch_id:'branch_westlands_01',currency:'KES',total_minor:10000,delivery_fee_minor:0,service_fee_minor:0,status:'PENDING_PAYMENT',pricing_snapshot:{},timeline:[],items:[],created_at:new Date().toISOString(),updated_at:new Date().toISOString()} as any;
  await freezeFixtureEconomics(order);
  (orderRepository as any).orders.set(orderId,order);
  return payFixtureOrder(order);
}
