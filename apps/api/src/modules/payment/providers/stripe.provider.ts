import { createHmac, timingSafeEqual } from 'node:crypto';
import { Payment } from '@deetoo/types';
import { AppError } from '../../../middleware/error-handler';
import { IPaymentProvider, ProviderCallbackResult, ProviderInitiateInput, ProviderRefundInput, ProviderStatusResult } from './payment-provider.interface';

function setting(name:string):string {
  const value=process.env[name];
  if(!value||/placeholder|change.?me|sample/i.test(value))throw new AppError(503,'BLOCKED_BY_CONFIGURATION',`${name} is required`);
  return value;
}
export class StripePaymentProvider implements IPaymentProvider {
  readonly providerId='CARD';
  readonly simulated=false;
  private async request(path:string,body?:URLSearchParams,key?:string):Promise<any>{
    const response=await fetch(`https://api.stripe.com/v1/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${setting('STRIPE_SECRET_KEY')}`, ...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},body,signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new AppError(502,'PROVIDER_REQUEST_FAILED',`Stripe returned HTTP ${response.status}`);
    return response.json();
  }
  async initiatePayment(input:ProviderInitiateInput){
    setting('STRIPE_ACCOUNT_ID'); setting('STRIPE_WEBHOOK_SECRET');
    if(!input.paymentMethodToken) {
      const origin=new URL(setting('PAYMENT_RETURN_URL'));
      if(origin.protocol!=='https:' && !(origin.protocol==='http:' && process.env.NODE_ENV!=='production' && ['localhost','127.0.0.1'].includes(origin.hostname))) throw new AppError(503,'BLOCKED_BY_CONFIGURATION','A secure payment return URL is required');
      const body=new URLSearchParams({mode:'payment','payment_method_types[0]':'card',success_url:origin.toString(),cancel_url:origin.toString(),client_reference_id:input.orderId,
        'metadata[payment_id]':input.paymentId,'metadata[order_id]':input.orderId,
        'payment_intent_data[metadata][payment_id]':input.paymentId,'payment_intent_data[metadata][order_id]':input.orderId,
        'line_items[0][quantity]':'1','line_items[0][price_data][currency]':input.currency.toLowerCase(),
        'line_items[0][price_data][unit_amount]':String(input.amountMinor),'line_items[0][price_data][product_data][name]':`Deetoo order ${input.orderNumber}`});
      const session=await this.request('checkout/sessions',body,input.idempotencyKey);
      const redirect=new URL(session.url);
      if(!/^cs_[a-zA-Z0-9_]+$/.test(session.id)||redirect.protocol!=='https:'||redirect.hostname!=='checkout.stripe.com')throw new AppError(409,'PROVIDER_INITIATION_UNCONFIRMED','Invalid hosted checkout identity');
      return {success:true,receiver:setting('STRIPE_ACCOUNT_ID'),providerPaymentId:session.id,providerReference:session.id,checkoutRequestId:session.id,merchantRequestId:session.id,checkoutUrl:redirect.toString(),rawResponse:{id:session.id,status:session.status}};
    }
    if(!/^pm_[a-zA-Z0-9]+$/.test(input.paymentMethodToken))throw new AppError(400,'TOKENIZED_PAYMENT_REQUIRED','A provider-collected payment method token is required');
    const body=new URLSearchParams({amount:String(input.amountMinor),currency:input.currency.toLowerCase(),payment_method:input.paymentMethodToken,confirm:'true','automatic_payment_methods[enabled]':'true','automatic_payment_methods[allow_redirects]':'never','metadata[payment_id]':input.paymentId,'metadata[order_id]':input.orderId});
    const intent=await this.request('payment_intents',body,input.idempotencyKey);
    return {success:true,receiver:setting('STRIPE_ACCOUNT_ID'),providerPaymentId:intent.id,providerReference:intent.id,checkoutRequestId:intent.id,merchantRequestId:intent.id,clientSecret:intent.client_secret,rawResponse:{id:intent.id,status:intent.status}};
  }
  verifyCallback(headers:Record<string,string|string[]|undefined>,rawBody:unknown):boolean{
    const secret=setting('STRIPE_WEBHOOK_SECRET');
    if(typeof rawBody!=='string'||typeof headers['stripe-signature']!=='string')return false;
    const parts=headers['stripe-signature'].split(',').map(p=>p.split('='));
    const timestamp=parts.find(([k])=>k==='t')?.[1];
    if(!timestamp||!/^\d+$/.test(timestamp)||Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
    const expected=createHmac('sha256',secret).update(`${timestamp}.${rawBody}`).digest();
    return parts.filter(([k])=>k==='v1').some(([,v])=>/^[a-f0-9]{64}$/i.test(v)&&timingSafeEqual(expected,Buffer.from(v,'hex')));
  }
  parseCallback(payload:unknown):ProviderCallbackResult{
    const event=payload as any;const intent=event?.data?.object;
    const supported=['payment_intent.succeeded','payment_intent.payment_failed','payment_intent.canceled','checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired'];
    return {isValid:typeof event?.id==='string'&&supported.includes(event.type)&&typeof intent?.id==='string',providerEventId:event?.id,eventType:event?.type,checkoutRequestId:intent?.id,providerReference:intent?.id,status:['payment_intent.succeeded','checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event?.type)?'SUCCESS':['payment_intent.canceled','checkout.session.expired'].includes(event?.type)?'CANCELLED':'FAILED',amountMinor:intent?.amount_received,rawPayload:{id:event?.id,type:event?.type,data:{object:{id:intent?.id,amount_received:intent?.amount_received,currency:intent?.currency}}}};
  }
  async queryStatus(id:string):Promise<ProviderStatusResult>{
    if(/^cs_[a-zA-Z0-9_]+$/.test(id)) {
      const session=await this.request(`checkout/sessions/${encodeURIComponent(id)}`);
      if(session.id!==id)throw new AppError(409,'PAYMENT_EVIDENCE_MISMATCH','Checkout session identity mismatch');
      if(session.payment_intent) {
        const intentId=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent.id;
        if(!/^pi_[a-zA-Z0-9]+$/.test(intentId))throw new AppError(409,'PAYMENT_EVIDENCE_MISMATCH','Invalid session payment intent');
        const outcome=await this.queryStatus(intentId);
        if(outcome.paymentId!==session.metadata?.payment_id||outcome.orderId!==session.metadata?.order_id||outcome.currency!==String(session.currency).toUpperCase()||(outcome.status==='CAPTURED'&&outcome.amountMinor!==session.amount_total))throw new AppError(409,'PAYMENT_EVIDENCE_MISMATCH','Checkout session and intent mismatch');
        return session.status==='expired' && outcome.status!=='CAPTURED' ? {...outcome,status:'CANCELLED'} : outcome;
      }
      return {verified:true,status:session.status==='expired'?'CANCELLED':'PENDING',providerReference:id,rawResponse:{id,status:session.status}};
    }
    if(!/^pi_[a-zA-Z0-9]+$/.test(id))throw new AppError(409,'INVALID_PROVIDER_REFERENCE','Invalid payment intent reference');
    const [intent,account]=await Promise.all([this.request(`payment_intents/${encodeURIComponent(id)}`),this.request('account')]);
    if(account.id!==setting('STRIPE_ACCOUNT_ID')||intent.id!==id)throw new AppError(409,'PAYMENT_EVIDENCE_MISMATCH','Stripe receiver or intent mismatch');
    return {verified:true,status:intent.status==='succeeded'?'CAPTURED':intent.status==='canceled'?'CANCELLED':'PENDING',amountMinor:intent.amount_received,currency:String(intent.currency).toUpperCase(),paymentId:intent.metadata?.payment_id,orderId:intent.metadata?.order_id,receiver:account.id,providerReference:intent.id,rawResponse:{id:intent.id,status:intent.status,amount_received:intent.amount_received,currency:intent.currency,receiver:account.id,metadata:intent.metadata}};
  }
  async verifyPayment(payment:Payment,callback?:ProviderCallbackResult):Promise<ProviderStatusResult>{
    if(!payment.provider_payment_id)throw new AppError(409,'PROVIDER_REFERENCE_PENDING','Provider initiation has not been reconciled');
    const result=await this.queryStatus(payment.provider_payment_id);
    if(callback&&callback.checkoutRequestId!==payment.provider_payment_id&&callback.checkoutRequestId!==result.providerReference)throw new AppError(409,'PAYMENT_EVIDENCE_MISMATCH','Callback intent mismatch');
    return result;
  }
  async refund(input:ProviderRefundInput){
    if(!input.providerPaymentId)throw new AppError(409,'PROVIDER_REFERENCE_PENDING','Captured payment reference required');
    if(input.providerPaymentId.startsWith('cs_')) {
      const captured=await this.queryStatus(input.providerPaymentId);
      if(captured.status!=='CAPTURED'||!captured.providerReference?.startsWith('pi_'))throw new AppError(409,'PROVIDER_REFERENCE_PENDING','Verified captured card intent required');
      input={...input,providerPaymentId:captured.providerReference};
    }
    // Recover the original refund even after Stripe's idempotency-key retention window.
    let known:any, cursor='';
    for(let page=0;page<1000;page++){
      const list=await this.request(`refunds?payment_intent=${encodeURIComponent(input.providerPaymentId)}&limit=100${cursor?'&starting_after='+encodeURIComponent(cursor):''}`);
      known=list.data?.find((r:any)=>r.metadata?.refund_id===input.refundId);
      if(known||!list.has_more)break;
      cursor=list.data?.at(-1)?.id;
      if(!cursor||page===999)throw new AppError(409,'REFUND_NOT_VERIFIED','Refund history must be reconciled before another request');
    }
    const created=known||await this.request('refunds',new URLSearchParams({payment_intent:input.providerPaymentId,amount:String(input.amountMinor),'metadata[refund_id]':input.refundId}),`refund:${input.refundId}`);
    const refund=await this.request(`refunds/${encodeURIComponent(created.id)}`);
    if(refund.payment_intent!==input.providerPaymentId||refund.metadata?.refund_id!==input.refundId)throw new AppError(409,'PAYMENT_EVIDENCE_MISMATCH','Refund identity mismatch');
    return {success:refund.status==='succeeded',verified:true,amountMinor:refund.amount,currency:String(refund.currency).toUpperCase(),providerRefundId:refund.id,rawResponse:{id:refund.id,status:refund.status,amount:refund.amount,currency:refund.currency}};
  }
  async voidPayment(payment:Payment):Promise<void>{
    if(!payment.provider_payment_id)throw new AppError(409,'PROVIDER_REFERENCE_PENDING','Initiation result must be recovered before cancellation');
    const current=await this.queryStatus(payment.provider_payment_id);
    if(current.status==='CAPTURED')throw new AppError(409,'LATE_CAPTURE_REQUIRES_REFUND','Reconcile capture before refund');
    if(current.status!=='CANCELLED')await this.request(payment.provider_payment_id.startsWith('cs_')?`checkout/sessions/${encodeURIComponent(payment.provider_payment_id)}/expire`:`payment_intents/${encodeURIComponent(payment.provider_payment_id)}/cancel`,new URLSearchParams(),`void:${payment.id}`);
  }
}