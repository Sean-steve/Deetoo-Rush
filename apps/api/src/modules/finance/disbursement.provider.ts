import { AppError } from '../../middleware/error-handler';
import type { PayoutDestination } from './disbursement.repository';

export interface ProviderInitiation {
  providerRequestId: string;
}

export interface ProviderInitiationInput {
  beneficiaryReference: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
  narration: string;
}

class MpesaB2CProvider {
  private async accessToken(): Promise<string> {
    const key=process.env.MPESA_CONSUMER_KEY;
    const secret=process.env.MPESA_CONSUMER_SECRET;
    const base=process.env.MPESA_OAUTH_URL;
    if(!key||!secret||!base) throw new AppError(503,'DISBURSEMENT_PROVIDER_UNCONFIGURED','M-PESA B2C OAuth is not configured');
    const response=await fetch(base,{headers:{authorization:`Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`}});
    if(!response.ok) throw new AppError(502,'DISBURSEMENT_PROVIDER_ERROR',`M-PESA OAuth failed with HTTP ${response.status}`);
    const body=await response.json() as {access_token?:string};
    if(!body.access_token) throw new AppError(502,'DISBURSEMENT_PROVIDER_ERROR','M-PESA OAuth response lacked access token');
    return body.access_token;
  }

  async initiate(input: ProviderInitiationInput): Promise<ProviderInitiation> {
    const endpoint=process.env.MPESA_B2C_API_URL;
    const initiator=process.env.MPESA_INITIATOR_NAME;
    const credential=process.env.MPESA_SECURITY_CREDENTIAL;
    const shortcode=process.env.MPESA_SHORTCODE;
    const resultUrl=process.env.MPESA_B2C_RESULT_URL;
    const timeoutUrl=process.env.MPESA_B2C_TIMEOUT_URL;
    if(!endpoint||!initiator||!credential||!shortcode||!resultUrl||!timeoutUrl){
      throw new AppError(503,'DISBURSEMENT_PROVIDER_UNCONFIGURED','M-PESA B2C is not fully configured');
    }
    if(input.currency!=='KES') throw new AppError(400,'DISBURSEMENT_CURRENCY_UNSUPPORTED','M-PESA B2C currently supports KES only');
    const token=await this.accessToken();
    const amount=Math.round(input.amountMinor/100);
    if(amount<=0) throw new AppError(400,'DISBURSEMENT_AMOUNT_INVALID','Disbursement amount must be positive');
    const response=await fetch(endpoint,{
      method:'POST',
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify({
        OriginatorConversationID:input.idempotencyKey,
        InitiatorName:initiator,
        SecurityCredential:credential,
        CommandID:process.env.MPESA_B2C_COMMAND_ID||'BusinessPayment',
        Amount:amount,
        PartyA:shortcode,
        PartyB:input.beneficiaryReference,
        Remarks:input.narration.slice(0,100),
        QueueTimeOutURL:timeoutUrl,
        ResultURL:resultUrl,
        Occasion:input.idempotencyKey.slice(0,100),
      }),
    });
    const body=await response.json().catch(()=>({})) as any;
    if(!response.ok || body?.ResponseCode && String(body.ResponseCode)!=='0'){
      throw new AppError(502,'DISBURSEMENT_PROVIDER_ERROR',body?.ResponseDescription||`M-PESA B2C failed with HTTP ${response.status}`);
    }
    const providerRequestId=String(body?.ConversationID||body?.OriginatorConversationID||input.idempotencyKey);
    return {providerRequestId};
  }
}

class BankGatewayProvider {
  async initiate(input: ProviderInitiationInput): Promise<ProviderInitiation> {
    const endpoint=process.env.BANK_PAYOUT_API_URL;
    const token=process.env.BANK_PAYOUT_API_TOKEN;
    const callbackUrl=process.env.BANK_PAYOUT_CALLBACK_URL;
    if(!endpoint||!token||!callbackUrl) throw new AppError(503,'DISBURSEMENT_PROVIDER_UNCONFIGURED','Bank payout gateway is not configured');
    const response=await fetch(endpoint,{
      method:'POST',
      headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':input.idempotencyKey},
      body:JSON.stringify({
        beneficiary_ref:input.beneficiaryReference,
        amount_minor:input.amountMinor,
        currency:input.currency,
        reference:input.idempotencyKey,
        narration:input.narration,
        callback_url:callbackUrl,
      }),
    });
    const body=await response.json().catch(()=>({})) as any;
    if(!response.ok || !body?.request_id){
      throw new AppError(502,'DISBURSEMENT_PROVIDER_ERROR',body?.message||`Bank payout gateway failed with HTTP ${response.status}`);
    }
    return {providerRequestId:String(body.request_id)};
  }
}

const mpesa=new MpesaB2CProvider();
const bank=new BankGatewayProvider();

export function providerFor(destination:PayoutDestination){
  if(destination.method==='MPESA_B2C') return mpesa;
  if(destination.method==='BANK_GATEWAY') return bank;
  throw new AppError(400,'DISBURSEMENT_METHOD_UNSUPPORTED','Unsupported disbursement method');
}
