import { createHash, timingSafeEqual } from 'node:crypto';
import { Payment } from '@deetoo/types';
import { formatMpesaPhone } from '@deetoo/validation';
import { AppError } from '../../../middleware/error-handler';
import { MpesaPaymentProvider } from './mpesa.provider';
import {
  beginDarajaRequest,
  correlateDarajaRequest,
  findDarajaRequestByKey,
  readDarajaResult,
} from './daraja-evidence';
import { IPaymentProvider, ProviderCallbackResult, ProviderInitiateInput, ProviderRefundInput, ProviderRefundResult, ProviderStatusResult } from './payment-provider.interface';

function required(name:string):string{
  const value=process.env[name];if(!value||/placeholder|change.?me|sample|sandbox_consumer/i.test(value))throw new AppError(503,'BLOCKED_BY_CONFIGURATION',`${name} is required`);return value;
}

export class DarajaPaymentProvider implements IPaymentProvider {
  readonly providerId='MPESA';readonly simulated=false;
  private get base(){return required('MPESA_ENVIRONMENT')==='production'?'https://api.safaricom.co.ke':'https://sandbox.safaricom.co.ke';}
  private credentials(){
    const shortcode=required('MPESA_SHORTCODE');const timestamp=new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14);
    return {BusinessShortCode:shortcode,Password:Buffer.from(`${shortcode}${required('MPESA_PASSKEY')}${timestamp}`).toString('base64'),Timestamp:timestamp};
  }
  private async request(path:string,body:any):Promise<any>{
    const tokenResponse=await fetch(`${this.base}/oauth/v1/generate?grant_type=client_credentials`,{headers:{Authorization:`Basic ${Buffer.from(`${required('MPESA_CONSUMER_KEY')}:${required('MPESA_CONSUMER_SECRET')}`).toString('base64')}`},signal:AbortSignal.timeout(15000)});
    if(!tokenResponse.ok)throw new AppError(502,'PROVIDER_AUTH_FAILED','Daraja authentication failed');
    const token=await tokenResponse.json() as any;
    if(!token.access_token)throw new AppError(502,'PROVIDER_AUTH_FAILED','Daraja returned no access token');
    const response=await fetch(`${this.base}${path}`,{method:'POST',headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new AppError(502,'PROVIDER_REQUEST_FAILED',`Daraja returned HTTP ${response.status}`);
    return response.json();
  }
  /** Shared ingress gateway authentication for the STK callback and the async Result/Timeout URLs alike. */
  verifyCallback(headers:Record<string,string|string[]|undefined>,rawBody:unknown):boolean{
    // This is gateway authentication, not an invented Safaricom HMAC signature.
    // Configure the approved ingress gateway to inject a secret after source validation.
    const secret=required('MPESA_WEBHOOK_SECRET');const supplied=headers['x-webhook-secret'];
    return typeof supplied==='string'&&typeof rawBody==='string'&&timingSafeEqual(createHash('sha256').update(secret).digest(),createHash('sha256').update(supplied).digest());
  }
  parseCallback(payload:unknown):ProviderCallbackResult{return new MpesaPaymentProvider().parseCallback(payload);}

  async initiatePayment(input:ProviderInitiateInput){
    if(input.currency!=='KES'||!Number.isSafeInteger(input.amountMinor)||input.amountMinor<=0||input.amountMinor%100!==0)throw new AppError(400,'MPESA_AMOUNT_UNSUPPORTED','Daraja STK requires exact whole KES; amounts are never rounded');
    const phone=formatMpesaPhone(input.phone||'');if(!/^254[71]\d{8}$/.test(phone))throw new AppError(400,'INVALID_MPESA_PHONE','Valid M-PESA phone required');
    const credentials=this.credentials();const callback=required('MPESA_CALLBACK_URL');
    if(!callback.startsWith('https://'))throw new AppError(503,'BLOCKED_BY_CONFIGURATION','HTTPS callback URL required');
    required('MPESA_WEBHOOK_SECRET'); // Gateway must authenticate the callback ingress.
    const result=await this.request('/mpesa/stkpush/v1/processrequest',{...credentials,TransactionType:'CustomerPayBillOnline',Amount:input.amountMinor/100,PartyA:phone,PartyB:credentials.BusinessShortCode,PhoneNumber:phone,CallBackURL:callback,AccountReference:input.orderNumber,TransactionDesc:`Deetoo ${input.orderNumber}`});
    if(String(result.ResponseCode)!=='0'||!result.CheckoutRequestID||!result.MerchantRequestID)throw new AppError(502,'PROVIDER_INITIATION_UNCONFIRMED','Daraja initiation did not return a stable request identity');
    return {success:true,providerPaymentId:result.CheckoutRequestID,providerReference:result.CheckoutRequestID,checkoutRequestId:result.CheckoutRequestID,merchantRequestId:result.MerchantRequestID,receiver:credentials.BusinessShortCode,rawResponse:{CheckoutRequestID:result.CheckoutRequestID,MerchantRequestID:result.MerchantRequestID,ResponseCode:result.ResponseCode}};
  }

  /** Unauthenticated STK Query: confirms Safaricom accepted/settled the push, never authoritative evidence. */
  async queryStatus(reference:string):Promise<ProviderStatusResult>{
    const result=await this.request('/mpesa/stkpushquery/v1/query',{...this.credentials(),CheckoutRequestID:reference});
    if(result.CheckoutRequestID&&result.CheckoutRequestID!==reference)throw new AppError(409,'PAYMENT_EVIDENCE_MISMATCH','Daraja query reference mismatch');
    return {status:String(result.ResultCode)==='0'?'CAPTURED':String(result.ResultCode)==='1032'?'CANCELLED':'PENDING',verified:false,providerReference:reference,rawResponse:{CheckoutRequestID:reference,ResultCode:result.ResultCode,MerchantRequestID:result.MerchantRequestID}};
  }

  /**
   * Fires an async Daraja command (TransactionStatusQuery or Reversal) exactly once per request
   * row and durably records Safaricom's ack. Daraja gives neither command a client idempotency
   * key, so once the HTTP call is sent we cannot safely resend it: any failure between the fetch
   * resolving and the ack being written leaves a genuinely unknown outcome. That window is
   * escalated to PROVIDER_OUTCOME_UNKNOWN (a REVIEW command an Admin/Finance user must explicitly
   * retry via retryReviewedPaymentCommand), never retried automatically by the 1-second worker loop.
   */
  private async fireAndCorrelate(path:string,body:any,requestId:string):Promise<any>{
    let ack:any;
    try{
      ack=await this.request(path,body);
    }catch(error){
      if(error instanceof AppError&&error.code==='PROVIDER_AUTH_FAILED')throw error; // nothing was sent; safe to retry
      throw new AppError(503,'PROVIDER_OUTCOME_UNKNOWN',`Daraja command outcome is unknown after a transport failure; reconcile before retrying (${path})`);
    }
    try{
      return await correlateDarajaRequest(requestId,ack);
    }catch(error){
      if(error instanceof AppError)throw error; // Safaricom's own explicit rejection is already correctly classified.
      throw new AppError(503,'PROVIDER_OUTCOME_UNKNOWN','Daraja accepted the command but the acknowledgement was not durably recorded; reconcile before retrying');
    }
  }

  /**
   * Raises (or resumes) an authenticated Daraja Transaction Status Query for this payment and
   * interprets whatever authoritative evidence is currently on file. Safaricom answers this
   * command asynchronously via a Result POST to MPESA_RESULT_URL, not in this HTTP response, so a
   * first call almost always returns PENDING; the ingress route re-triggers verification once the
   * Result lands, and the scheduled reconciliation scan re-triggers it again if that never happens.
   */
  async verifyPayment(payment:Payment,callback?:ProviderCallbackResult):Promise<ProviderStatusResult> {
    if(!payment.checkout_request_id)throw new AppError(409,'PROVIDER_REFERENCE_PENDING','Daraja initiation must be reconciled');
    if(callback&&(callback.checkoutRequestId!==payment.checkout_request_id||callback.merchantRequestId!==payment.merchant_request_id))throw new AppError(409,'PAYMENT_EVIDENCE_MISMATCH','Daraja callback identity mismatch');
    const receiver=(payment as any).provider_receiver;
    if(!receiver)throw new AppError(409,'PROVIDER_REFERENCE_PENDING','Daraja initiation receiver evidence is missing');
    const requestKey=`mpesa-query:${payment.id}`;
    let request=await findDarajaRequestByKey(requestKey);
    if(!request){
      // The STK short callback is the only source of the unverified receipt that seeds the
      // authenticated Transaction Status Query. Without it there is nothing to query yet;
      // this becomes a REVIEW command for Ops to correlate manually, never a guessed receipt.
      const receipt=callback?.status==='SUCCESS'?callback.receiptNumber:undefined;
      if(!receipt)throw new AppError(409,'PROVIDER_OUTCOME_UNKNOWN','No M-PESA receipt evidence is available yet to query');
      const begun=await beginDarajaRequest({request_key:requestKey,payment_id:payment.id,kind:'QUERY',receipt,amount_minor:payment.amount_minor,currency:payment.currency,receiver});
      request=begun.request;
    }
    if(!request.originator_conversation_id){
      const resultUrl=required('MPESA_RESULT_URL'),timeoutUrl=required('MPESA_TIMEOUT_URL');
      if(!resultUrl.startsWith('https://')||!timeoutUrl.startsWith('https://'))throw new AppError(503,'BLOCKED_BY_CONFIGURATION','HTTPS Result/Timeout URLs are required');
      request=await this.fireAndCorrelate('/mpesa/transactionstatus/v1/query',{Initiator:required('MPESA_INITIATOR_NAME'),SecurityCredential:required('MPESA_SECURITY_CREDENTIAL'),CommandID:'TransactionStatusQuery',TransactionID:request.receipt,PartyA:this.credentials().BusinessShortCode,IdentifierType:'4',ResultURL:resultUrl,QueueTimeOutURL:timeoutUrl,Remarks:`Deetoo verify ${payment.id}`,Occasion:'DeetooPaymentVerification'},request.id);
    }
    const evidence=await readDarajaResult(request);
    if(!evidence)return {status:'PENDING',verified:true,paymentId:payment.id,orderId:payment.order_id,rawResponse:{awaiting:'daraja_result',originator_conversation_id:request.originator_conversation_id}};
    if(!evidence.success)return {status:'FAILED',verified:true,paymentId:payment.id,orderId:payment.order_id,failureCode:'PROVIDER_DECLINED',providerReference:evidence.reference,rawResponse:{reference:evidence.reference}};
    return {status:'CAPTURED',verified:true,paymentId:payment.id,orderId:payment.order_id,amountMinor:evidence.amountMinor,currency:evidence.currency,receiver:evidence.receiver,receiptNumber:evidence.reference,providerReference:evidence.reference,rawResponse:{reference:evidence.reference,amountMinor:evidence.amountMinor,currency:evidence.currency,receiver:evidence.receiver}};
  }

  /**
   * Reversal follows the identical asynchronous evidence pattern as verifyPayment. The refund
   * stays PENDING/reserved (payment-worker throws REFUND_NOT_VERIFIED on a non-success result)
   * until an authenticated Result is on file; fireAndCorrelate is what stops a crash or transient
   * failure from silently resending the reversal command once it may already have been sent.
   */
  async refund(input:ProviderRefundInput):Promise<ProviderRefundResult> {
    if(!input.providerReference)throw new AppError(409,'PROVIDER_REFERENCE_PENDING','Verified M-PESA receipt required before reversal');
    const phone=formatMpesaPhone(input.phone||'');if(!/^254[71]\d{8}$/.test(phone))throw new AppError(400,'INVALID_MPESA_PHONE','Valid M-PESA phone required for reversal receiver evidence');
    const requestKey=`mpesa-reversal:${input.refundId}`;
    let request=await findDarajaRequestByKey(requestKey);
    if(!request){
      const begun=await beginDarajaRequest({request_key:requestKey,payment_id:input.paymentId,refund_id:input.refundId,kind:'REVERSAL',receipt:input.providerReference,amount_minor:input.amountMinor,currency:input.currency,receiver:phone});
      request=begun.request;
    }
    if(!request.originator_conversation_id){
      const resultUrl=required('MPESA_RESULT_URL'),timeoutUrl=required('MPESA_TIMEOUT_URL');
      if(!resultUrl.startsWith('https://')||!timeoutUrl.startsWith('https://'))throw new AppError(503,'BLOCKED_BY_CONFIGURATION','HTTPS Result/Timeout URLs are required');
      request=await this.fireAndCorrelate('/mpesa/reversal/v1/request',{Initiator:required('MPESA_INITIATOR_NAME'),SecurityCredential:required('MPESA_SECURITY_CREDENTIAL'),CommandID:'TransactionReversal',TransactionID:request.receipt,Amount:input.amountMinor/100,ReceiverParty:this.credentials().BusinessShortCode,RecieverIdentifierType:'11',ResultURL:resultUrl,QueueTimeOutURL:timeoutUrl,Remarks:`Deetoo refund ${input.refundId}`,Occasion:'DeetooRefund'},request.id);
    }
    const evidence=await readDarajaResult(request);
    if(!evidence)throw new AppError(409,'REFUND_NOT_VERIFIED','Reversal accepted; awaiting Safaricom Result confirmation');
    if(!evidence.success)return {success:false,verified:true,failureCode:'PROVIDER_DECLINED',rawResponse:{reference:evidence.reference}};
    return {success:true,verified:true,amountMinor:evidence.amountMinor,currency:evidence.currency,providerRefundId:evidence.reference,rawResponse:{reference:evidence.reference,amountMinor:evidence.amountMinor,currency:evidence.currency}};
  }
}
