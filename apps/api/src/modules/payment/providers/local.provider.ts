import { config } from '@deetoo/config';
import { Payment } from '@deetoo/types';
import { AppError } from '../../../middleware/error-handler';
import { IPaymentProvider, ProviderInitiateInput, ProviderRefundInput, ProviderStatusResult } from './payment-provider.interface';

/** Explicit local workflow only: synthetic evidence, never external provider certification. */
export class LocalPaymentProvider implements IPaymentProvider {
  readonly simulated = true;
  constructor(readonly providerId: string) {}
  private guard() { if (!config.localWorkflow) throw new AppError(503,'LOCAL_WORKFLOW_DISABLED','Local test payments are disabled'); }
  async initiatePayment(input: ProviderInitiateInput & {localTest?: boolean}) {
    this.guard();
    if (!input.localTest) throw new AppError(409,'REAL_PAYMENT_REQUIRES_PROVIDER','An existing external payment cannot be converted into a local test');
    const id = `local-test:${this.providerId}:${input.paymentId}`;
    return {success:true,receiver:'LOCAL_TEST',providerPaymentId:id,providerReference:id,checkoutRequestId:id,merchantRequestId:id,rawResponse:{local_test:true}};
  }
  async verifyPayment(payment: Payment): Promise<ProviderStatusResult> {
    this.guard();
    if (payment.provider_payment_id !== `local-test:${this.providerId}:${payment.id}`) throw new AppError(409,'REAL_PAYMENT_REQUIRES_PROVIDER','Only locally initiated test payments can receive synthetic evidence');
    return {verified:true,status:'CAPTURED',amountMinor:payment.amount_minor,currency:payment.currency,paymentId:payment.id,orderId:payment.order_id,receiver:'LOCAL_TEST',providerReference:payment.provider_payment_id,rawResponse:{local_test:true}};
  }
  async refund(input: ProviderRefundInput) {
    this.guard();
    if (input.providerPaymentId !== `local-test:${this.providerId}:${input.paymentId}`) throw new AppError(409,'REAL_PAYMENT_REQUIRES_PROVIDER','External payments require the original provider');
    return {success:true,verified:true,amountMinor:input.amountMinor,currency:input.currency,providerRefundId:`local-test:refund:${input.refundId}`,rawResponse:{local_test:true}};
  }
  async voidPayment(payment: Payment) { this.guard(); if(payment.provider_payment_id && !payment.provider_payment_id.startsWith('local-test:'))throw new AppError(409,'REAL_PAYMENT_REQUIRES_PROVIDER','External payments require the original provider'); }
  verifyCallback() { return false; }
  parseCallback(): never { throw new AppError(400,'LOCAL_CALLBACK_FORBIDDEN','Local payments do not accept external callbacks'); }
  async queryStatus(): Promise<ProviderStatusResult> { this.guard(); return {verified:false,status:'PENDING',rawResponse:{local_test:true}}; }
}
