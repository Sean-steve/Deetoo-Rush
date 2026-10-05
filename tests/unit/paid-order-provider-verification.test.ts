import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { StripePaymentProvider } from '../../apps/api/src/modules/payment/providers/stripe.provider';
import { DarajaPaymentProvider } from '../../apps/api/src/modules/payment/providers/daraja.provider';
import { canonicalHash } from '../../apps/api/src/modules/cart/quote-binding';

test('canonical request hashing ignores object key order but binds values and array order',()=>{
 assert.equal(canonicalHash({a:1,b:2}),canonicalHash({b:2,a:1}));
 assert.notEqual(canonicalHash({a:[1,2]}),canonicalHash({a:[2,1]}));
});
test('Stripe signature checks exact raw bytes, timestamp tolerance and full signatures',()=>{
 const prior=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='test-webhook-secret';
 try{
  const provider=new StripePaymentProvider(),raw='{ "id": "evt_test" }',timestamp=String(Math.floor(Date.now()/1000));
  const sign=(t:string)=>createHmac('sha256','test-webhook-secret').update(`${t}.${raw}`).digest('hex');
  const headers={'stripe-signature':`t=${timestamp},v1=${sign(timestamp)}`};
  assert.equal(provider.verifyCallback(headers,raw),true);
  assert.equal(provider.verifyCallback(headers,JSON.stringify(JSON.parse(raw))),false);
  assert.equal(provider.verifyCallback({'stripe-signature':`t=${timestamp},v1=prefix${sign(timestamp)}`},raw),false);
  const old=String(Number(timestamp)-301);assert.equal(provider.verifyCallback({'stripe-signature':`t=${old},v1=${sign(old)}`},raw),false);
 }finally{if(prior===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=prior;}
});
test('Stripe authenticated retrieval validates receiver and exposes exact provider facts',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.STRIPE_SECRET_KEY,oldAccount=process.env.STRIPE_ACCOUNT_ID;
 process.env.STRIPE_SECRET_KEY='test-secret';process.env.STRIPE_ACCOUNT_ID='acct_test';
 try{
  let wrong=false;
  globalThis.fetch=async(input,init)=>{
   assert.equal((init!.headers as any).Authorization,'Bearer test-secret');
   const data=String(input).endsWith('/account')?{id:wrong?'acct_wrong':'acct_test'}:{id:'pi_test',status:'succeeded',amount_received:12345,currency:'kes',metadata:{payment_id:'payment',order_id:'order'}};
   return new Response(JSON.stringify(data),{status:200});
  };
  const provider=new StripePaymentProvider();const result=await provider.queryStatus('pi_test');
  assert.equal(result.verified,true);assert.equal(result.amountMinor,12345);assert.equal(result.currency,'KES');assert.equal(result.receiver,'acct_test');assert.equal(result.orderId,'order');
  wrong=true;await assert.rejects(provider.queryStatus('pi_test'),{code:'PAYMENT_EVIDENCE_MISMATCH'});
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=oldKey;if(oldAccount===undefined)delete process.env.STRIPE_ACCOUNT_ID;else process.env.STRIPE_ACCOUNT_ID=oldAccount;}
});
test('Daraja never rounds fractional KES and requires verified evidence before reversal',async()=>{
 const p=new DarajaPaymentProvider();
 await assert.rejects(p.initiatePayment({amountMinor:10001,currency:'KES'} as any),{code:'MPESA_AMOUNT_UNSUPPORTED'});
 // No captured/verified receipt to reverse: rejected before any provider call, not a generic config error.
 await assert.rejects(p.refund({} as any),{code:'PROVIDER_REFERENCE_PENDING'});
 await assert.rejects(p.refund({providerReference:'QGH12345'} as any),{code:'INVALID_MPESA_PHONE'});
});
test('Daraja verification requires the receiver evidence captured at initiation, never guesses it',async()=>{
 const p=new DarajaPaymentProvider();
 await assert.rejects(p.verifyPayment({checkout_request_id:null} as any),{code:'PROVIDER_REFERENCE_PENDING'});
 await assert.rejects(p.verifyPayment({checkout_request_id:'ws_CO_1'} as any),{code:'PROVIDER_REFERENCE_PENDING'});
 await assert.rejects(
  p.verifyPayment({checkout_request_id:'ws_CO_1',merchant_request_id:'MR_1'} as any,{checkoutRequestId:'ws_CO_2'} as any),
  {code:'PAYMENT_EVIDENCE_MISMATCH'},
 );
});


test('hosted Stripe checkout binds total and identities; redirect/callback never proves payment', async () => {
 const names=['STRIPE_SECRET_KEY','STRIPE_ACCOUNT_ID','STRIPE_WEBHOOK_SECRET','PAYMENT_RETURN_URL'];
 const prior=Object.fromEntries(names.map(n=>[n,process.env[n]])), oldFetch=globalThis.fetch;
 Object.assign(process.env,{STRIPE_SECRET_KEY:'contract-key',STRIPE_ACCOUNT_ID:'acct_contract',STRIPE_WEBHOOK_SECRET:'contract-signing',PAYMENT_RETURN_URL:'https://deetoo.example/customer'});
 const metadata={payment_id:'payment',order_id:'order'};
 let session:any={id:'cs_contract',url:'https://checkout.stripe.com/c/pay/test',status:'open',payment_intent:null,metadata,currency:'kes',amount_total:12345};
 let intent:any={id:'pi_contract',status:'succeeded',amount_received:12345,currency:'kes',metadata};
 try {
  globalThis.fetch=async (url,init)=>{
   assert.equal((init!.headers as any).Authorization,'Bearer contract-key');
   const path=String(url).replace('https://api.stripe.com/v1/','');
   if(path==='checkout/sessions'){
    const b=init!.body as URLSearchParams;
    assert.equal(b.get('line_items[0][price_data][unit_amount]'),'12345');
    assert.equal(b.get('payment_intent_data[metadata][payment_id]'),'payment');
    assert.equal(b.get('metadata[order_id]'),'order');
    assert.equal((init!.headers as any)['Idempotency-Key'],'key');
   }
   return new Response(JSON.stringify(path==='account'?{id:'acct_contract'}:path.startsWith('payment_intents/')?intent:session));
  };
  const p=new StripePaymentProvider();
  const input={paymentId:'payment',orderId:'order',orderNumber:'ORD',amountMinor:12345,currency:'KES',idempotencyKey:'key'};
  const initiated=await p.initiatePayment(input);assert.equal(initiated.checkoutUrl,session.url);
  assert.equal((await p.queryStatus('cs_contract')).status,'PENDING');
  const callback=p.parseCallback({id:'evt_contract',type:'checkout.session.completed',data:{object:session}});
  assert.equal(callback.isValid,true);
  assert.equal((await p.verifyPayment({provider_payment_id:'cs_contract'} as any,callback)).status,'PENDING');
  session.payment_intent='pi_contract';session.status='complete';
  assert.equal((await p.queryStatus('cs_contract')).amountMinor,12345);
  await p.verifyPayment({provider_payment_id:'cs_contract'} as any,{checkoutRequestId:'pi_contract'} as any);
  await assert.rejects(p.verifyPayment({provider_payment_id:'cs_contract'} as any,{checkoutRequestId:'pi_other'} as any),{code:'PAYMENT_EVIDENCE_MISMATCH'});
  for(const change of [{amount_total:1},{currency:'usd'},{metadata:{...metadata,order_id:'other'}},{payment_intent:'cs_nested'}]){
   const original=session;session={...session,...change};await assert.rejects(p.queryStatus('cs_contract'),{code:'PAYMENT_EVIDENCE_MISMATCH'});session=original;
  }
  intent={...intent,status:'requires_payment_method'};session.status='expired';
  assert.equal((await p.queryStatus('cs_contract')).status,'CANCELLED');
  session.url='https://checkout.stripe.com.evil.example/pay';
  await assert.rejects(p.initiatePayment(input),{code:'PROVIDER_INITIATION_UNCONFIRMED'});
  delete process.env.PAYMENT_RETURN_URL;
  await assert.rejects(p.initiatePayment(input),{code:'BLOCKED_BY_CONFIGURATION'});
 } finally {globalThis.fetch=oldFetch;for(const n of names)if(prior[n]===undefined)delete process.env[n];else process.env[n]=prior[n];}
});
