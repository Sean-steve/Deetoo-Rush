/**
 * DEETOO - Payment Provider Adapter Interface
 * Implements decoupled provider integration contracts (Section 10)
 */

export interface ProviderInitiateInput {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  phone?: string;
  paymentMethodToken?: string;
  idempotencyKey?: string;
  callbackUrl?: string;
}

export interface ProviderInitiateResult {
  checkoutUrl?: string;
  receiver?: string;
  success: boolean;
  providerPaymentId?: string;
  providerReference?: string;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  clientSecret?: string;
  responseCode?: string;
  responseDescription?: string;
  customerMessage?: string;
  rawResponse: Record<string, unknown>;
}

export interface ProviderCallbackResult {
  isValid: boolean;
  providerEventId: string;
  eventType: string;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  providerReference?: string;
  status: 'SUCCESS' | 'FAILED' | 'CANCELLED';
  amountMinor?: number;
  receiptNumber?: string;
  failureCode?: string;
  failureMessage?: string;
  rawPayload: Record<string, unknown>;
}

export interface ProviderStatusResult {
  currency?: string;
  receiver?: string;
  paymentId?: string;
  orderId?: string;
  verified?: boolean;
  status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'CANCELLED';
  amountMinor?: number;
  receiptNumber?: string;
  providerReference?: string;
  failureCode?: string;
  failureMessage?: string;
  rawResponse: Record<string, unknown>;
}

export interface ProviderRefundInput {
  refundId: string;
  paymentId: string;
  providerPaymentId?: string;
  providerReference?: string;
  amountMinor: number;
  currency: string;
  reason: string;
  phone?: string;
}

export interface ProviderRefundResult {
  verified?: boolean;
  amountMinor?: number;
  currency?: string;
  success: boolean;
  providerRefundId?: string;
  failureCode?: string;
  failureMessage?: string;
  rawResponse: Record<string, unknown>;
}

export interface IPaymentProvider {
  readonly providerId: string;
  readonly simulated?: boolean;
  verifyPayment?(payment: import('@deetoo/types').Payment, callback?: ProviderCallbackResult): Promise<ProviderStatusResult>;
  voidPayment?(payment: import('@deetoo/types').Payment): Promise<void>;
  initiatePayment(input: ProviderInitiateInput): Promise<ProviderInitiateResult>;
  verifyCallback(headers: Record<string, string | string[] | undefined>, rawBody: string | unknown): boolean;
  parseCallback(rawPayload: unknown): ProviderCallbackResult;
  queryStatus(providerReferenceOrId: string, metadata?: Record<string, unknown>): Promise<ProviderStatusResult>;
  refund(input: ProviderRefundInput): Promise<ProviderRefundResult>;
}
