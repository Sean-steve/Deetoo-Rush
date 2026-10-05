import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getDbPool, closeDbPool } from '../../apps/api/src/db/client';
import { withTransaction } from '../../apps/api/src/db/transaction';
import { runMigrations } from '../../scripts/db-migrate';
import { authService } from '../../apps/api/src/modules/auth/auth.service';
import { merchantRepository } from '../../apps/api/src/modules/merchant/merchant.repository';
import { customerRepository } from '../../apps/api/src/modules/customer/customer.repository';
import { cartRepository } from '../../apps/api/src/modules/cart/cart.repository';
import { checkoutService } from '../../apps/api/src/modules/cart/checkout.service';
import { orderService } from '../../apps/api/src/modules/order/order.service';
import { paymentService } from '../../apps/api/src/modules/payment/payment.service';
import { paymentRepository } from '../../apps/api/src/modules/payment/payment.repository';
import { financialPostingService } from '../../apps/api/src/modules/finance/financial-posting.service';
import { ledgerRepository } from '../../apps/api/src/modules/finance/ledger.repository';
import { OrderStatus, MerchantStatus, MerchantApprovalStatus, BranchAdminStatus, BranchOperationalStatus } from '@deetoo/types';
import { config } from '@deetoo/config';
if(config.storage.mode!=='postgres'||!process.env.DATABASE_URL?.includes('foundation'))throw new Error('Isolated PostgreSQL foundation database required');
before(async()=>{await runMigrations();});
after(async()=>{await closeDbPool();});
async function fixture(){
 const user=await authService.registerCustomer({name:'Paid transaction',email:`${randomUUID()}@example.test`,password:'Foundation-test-ONLY-893!'});
 const uid=user.user.id,mid=randomUUID(),bid=randomUUID(),menu=randomUUID(),category=randomUUID(),item=randomUUID(),zone=randomUUID(),now=new Date().toISOString();
 await merchantRepository.createMerchant({id:mid,legal_name:'Paid test',display_name:'Paid test',status:MerchantStatus.ACTIVE,approval_status:MerchantApprovalStatus.APPROVED,commission_bps:2000,settlement_schedule:'WEEKLY',created_at:now,updated_at:now});
 await merchantRepository.createBranch({id:bid,merchant_id:mid,name:'Paid branch',address_line1:'Test',address_text:'Test',latitude:-1.28,longitude:36.82,status:BranchAdminStatus.ACTIVE,operational_status:BranchOperationalStatus.OPEN,city:'Nairobi',region:'Nairobi',country_code:'KE',timezone:'Africa/Nairobi',currency:'KES',min_order_minor:0,prep_default_min:20,created_at:now,updated_at:now});
 const db=getDbPool();
 await db.query("INSERT INTO branch_opening_hours(id,branch_id,day_of_week,open_time,close_time,is_closed) SELECT gen_random_uuid(),$1,n,'00:00','23:59',false FROM generate_series(0,6) n",[bid]);
 await db.query("INSERT INTO service_zones(id,name,status,boundary) VALUES($1,$2,'ACTIVE',ST_Multi(ST_GeomFromText('POLYGON((36 -2,38 -2,38 0,36 0,36 -2))',4326))::geography)",[zone,zone]);
 // Link every matching active zone: the serviceability selection is deterministic but not fixture-specific.
 await db.query('INSERT INTO branch_service_zones(branch_id,service_zone_id) SELECT $1,id FROM service_zones',[bid]);
 const address=await customerRepository.createAddress({customer_id:uid,label:'Home',address_line1:'Test',latitude:-1.29,longitude:36.83});
 await db.query("INSERT INTO menus(id,branch_id,merchant_id,name,status) VALUES($1,$2,$3,'Test','ACTIVE')",[menu,bid,mid]);
 await db.query("INSERT INTO menu_categories(id,menu_id,name) VALUES($1,$2,'Test')",[category,menu]);
 await db.query("INSERT INTO menu_items(id,menu_id,category_id,name,price_minor) VALUES($1,$2,$3,'Meal',10000)",[item,menu,category]);
 await db.query("INSERT INTO delivery_pricing_rules(id,base_fee_minor,included_distance_meters,per_km_fee_minor,minimum_fee_minor,maximum_fee_minor,max_delivery_distance_meters,status,effective_from) VALUES($1,1000,5000,0,1000,1000,100000,'ACTIVE',now())",[randomUUID()]);
 await db.query("INSERT INTO service_fee_rules(id,fee_type,percentage_basis_points,fixed_fee_minor,minimum_fee_minor,maximum_fee_minor,status,effective_from) VALUES($1,'FIXED',0,500,500,500,'ACTIVE',now())",[randomUUID()]);
 await db.query("INSERT INTO merchant_commission_rules(id,merchant_id,percentage_rate,fixed_fee_minor,effective_from,status) VALUES($1,$2,0.2,0,now(),'ACTIVE')",[randomUUID(),mid]);
 const cart=await cartRepository.createCart({id:randomUUID(),customer_id:uid,branch_id:bid,currency:'KES',status:'ACTIVE',created_at:now,updated_at:now,expires_at:new Date(Date.now()+3600000).toISOString()} as any);
 const cartItem=await cartRepository.createCartItem({id:randomUUID(),cart_id:cart.id,menu_item_id:item,quantity:1,modifier_option_ids:[],created_at:now,updated_at:now});
 const quote=await checkoutService.generateQuote(uid,{address_id:address.id});
 return {uid,mid,bid,cartItem,quote};
}
async function pending(){const f=await fixture();const order=await orderService.createOrderFromQuote(f.uid,{quote_id:f.quote.id},randomUUID());return {...f,order};}
async function evidence(order:any){
 const payment=await paymentService.initiatePayment({orderId:order.id,customerId:order.customer_id,method:'CARD',paymentMethodToken:'pm_test',idempotencyKey:randomUUID()});
 // Provider-independent evidence fixture: tests transaction application, NOT sandbox certification.
 await paymentRepository.updatePayment({...payment,provider_receiver:'test-account'} as any);
 return {payment,result:{status:'CAPTURED' as const,verified:true,paymentId:payment.id,orderId:order.id,receiver:'test-account',providerReference:`provider-test-${payment.id}`,amountMinor:order.total_minor,currency:order.currency,rawResponse:{test_evidence:true}}};
}
test('quote mutation, missing keys and stale cart are rejected without consuming the quote',async()=>{
 const f=await fixture();
 await assert.rejects(orderService.createOrderFromQuote(f.uid,{quote_id:f.quote.id}),{code:'IDEMPOTENCY_KEY_REQUIRED'});
 await assert.rejects(getDbPool().query('UPDATE checkout_quotes SET total_minor=1 WHERE id=$1',[f.quote.id]),/immutable/);
 await cartRepository.updateCartItemQuantity(f.cartItem.id,2);
 await assert.rejects(orderService.createOrderFromQuote(f.uid,{quote_id:f.quote.id},randomUUID()),{code:'STALE_QUOTE'});
 assert.equal((await getDbPool().query('SELECT id FROM orders WHERE checkout_quote_id=$1',[f.quote.id])).rowCount,0);
});
test('concurrent order retries consume one frozen quote; changed body conflicts',async()=>{
 const f=await fixture(),key=randomUUID();
 const results=await Promise.all(Array.from({length:8},()=>orderService.createOrderFromQuote(f.uid,{quote_id:f.quote.id},key)));
 assert.equal(new Set(results.map(o=>o.id)).size,1);assert.equal(results[0].status,OrderStatus.PENDING_PAYMENT);assert.equal(results[0].placed_at,null);
 await assert.rejects(orderService.createOrderFromQuote(f.uid,{quote_id:f.quote.id,special_instructions:'changed'},key),{code:'IDEMPOTENCY_CONFLICT'});
 await assert.rejects(orderService.createOrderFromQuote(f.uid,{quote_id:f.quote.id},randomUUID()),{code:'QUOTE_ALREADY_CONSUMED'});
 assert.equal((await orderService.getBranchOrders(f.bid)).length,0);
 await assert.rejects(orderService.merchantAcceptOrder(f.bid,{id:randomUUID(),email:'staff@test'},results[0].id),{code:'ORDER_NOT_PAID'});
});
test('capture rollback and concurrent replay produce one release and one frozen economic posting',async()=>{
 const f=await pending(),{payment,result}=await evidence(f.order);
 await assert.rejects(paymentService.applyVerifiedOutcome(payment.id,{...result,amountMinor:1}),{code:'PAYMENT_EVIDENCE_MISMATCH'});
 const original=financialPostingService.postPaymentCapture;
 financialPostingService.postPaymentCapture=async()=>{throw new Error('injected crash before ledger');};
 try{await assert.rejects(paymentService.applyVerifiedOutcome(payment.id,result),/injected crash/);}finally{financialPostingService.postPaymentCapture=original;}
 assert.equal((await paymentRepository.findPaymentById(payment.id))!.captured_minor,0);
 assert.equal((await orderService.getOrderById(f.order.id)).status,OrderStatus.PENDING_PAYMENT);
 assert.equal((await getDbPool().query('SELECT * FROM payment_capture_evidence WHERE payment_id=$1',[payment.id])).rowCount,0);
 await Promise.all(Array.from({length:8},()=>paymentService.applyVerifiedOutcome(payment.id,result)));
 const paid=await orderService.getOrderById(f.order.id);assert.equal(paid.status,OrderStatus.PLACED);
 assert.equal(paid.timeline.filter(t=>t.reason_code==='VERIFIED_PAYMENT_CAPTURE').length,1);
 const summary=await ledgerRepository.findOrderSummary(paid.id);assert.equal(summary!.merchant_payable_minor,8000);assert.equal(summary!.commission_revenue_minor,2000);assert.equal(summary!.delivery_revenue_minor,1000);assert.equal(summary!.service_fee_revenue_minor,500);assert.equal(summary!.payment_processing_cost_minor,0);
 assert.equal((await getDbPool().query("SELECT * FROM ledger_transactions WHERE idempotency_key=$1",[`payment.captured:${payment.id}`])).rowCount,1);
 await closeDbPool();assert.equal((await orderService.getOrderById(paid.id)).status,OrderStatus.PLACED);
});

test('payment idempotency is required, scoped and conflict-safe under concurrent requests',async()=>{
 const f=await pending(),key=randomUUID();
 const input={orderId:f.order.id,customerId:f.uid,method:'CARD' as const,paymentMethodToken:'pm_test',idempotencyKey:key};
 await assert.rejects(paymentService.initiatePayment({...input,idempotencyKey:undefined}),{code:'IDEMPOTENCY_KEY_REQUIRED'});
 const results=await Promise.all(Array.from({length:8},()=>paymentService.initiatePayment(input)));
 assert.equal(new Set(results.map(p=>p.id)).size,1);
 await assert.rejects(paymentService.initiatePayment({...input,paymentMethodToken:'pm_changed'}),{code:'IDEMPOTENCY_CONFLICT'});
 await assert.rejects(paymentService.initiatePayment({...input,idempotencyKey:randomUUID()}),{code:'PAYMENT_ALREADY_PENDING'});
 await assert.rejects(paymentService.initiatePayment({...input,customerId:randomUUID()}),{code:'FORBIDDEN_ORDER_ACCESS'});
});
test('manual refunds reserve funds, enforce maker-checker and recover once after ledger crash',async()=>{
 const {authRepository}=await import('../../apps/api/src/modules/auth/auth.repository');
 const {UserRole}=await import('@deetoo/types');
 const {paymentProviderRegistry}=await import('../../apps/api/src/modules/payment/providers/provider-registry');
 const {processPaymentCommand}=await import('../../apps/api/src/modules/payment/payment-worker');
 const f=await pending(),{payment,result}=await evidence(f.order);
 await paymentService.applyVerifiedOutcome(payment.id,result);
 const maker=(await authService.registerCustomer({name:'Maker',email:`${randomUUID()}@example.test`,password:'Foundation-test-ONLY-893!'})).user.id;
 const checker=(await authService.registerCustomer({name:'Checker',email:`${randomUUID()}@example.test`,password:'Foundation-test-ONLY-893!'})).user.id;
 await authRepository.setUserRoles(maker,[UserRole.FINANCE]);await authRepository.setUserRoles(checker,[UserRole.ADMIN]);
 const request={paymentId:payment.id,amountMinor:6000,reasonCode:'ITEM_MISSING',requestedBy:maker,idempotencyKey:randomUUID()};
 await assert.rejects(paymentService.requestRefund({...request,requestedBy:f.uid}),{code:'REFUND_APPROVAL_REQUIRED'});
 const refunds=await Promise.all(Array.from({length:6},()=>paymentService.requestRefund(request)));
 assert.equal(new Set(refunds.map(r=>r.id)).size,1);
 await assert.rejects(paymentService.requestRefund({...request,amountMinor:1}),{code:'IDEMPOTENCY_CONFLICT'});
 await assert.rejects(paymentService.requestRefund({...request,idempotencyKey:randomUUID()}),{code:'REFUND_EXCEEDS_AVAILABLE_BALANCE'});
 await assert.rejects(paymentService.approveRefund(refunds[0].id,maker),{code:'REFUND_MAKER_CHECKER'});
 await paymentService.approveRefund(refunds[0].id,checker);
 // Isolated provider contract double tests durable orchestration, not provider certification.
 const originalProvider=paymentProviderRegistry.getProvider('CARD');
 let calls=0;const external=new Map<string,string>();
 paymentProviderRegistry.register({ ...originalProvider,providerId:'CARD',simulated:false,
   initiatePayment:async()=>{throw new Error('Unexpected initiation');},verifyCallback:()=>false,parseCallback:()=>{throw new Error('unused');},queryStatus:async()=>{throw new Error('unused');},
   refund:async input=>{calls++;const id=external.get(input.refundId)||`verified-contract-test-${input.refundId}`;external.set(input.refundId,id);return {success:true,verified:true,providerRefundId:id,amountMinor:input.amountMinor,currency:input.currency,rawResponse:{contract_test:true}};}
 });
 const originalPosting=financialPostingService.postRefundReversal;
 try{
   // Retire the creation command: this fixture injected verified capture directly.
   await getDbPool().query("UPDATE payment_commands SET status='SUCCEEDED' WHERE payment_id=$1 AND kind='INITIATE'",[payment.id]);
   financialPostingService.postRefundReversal=async()=>{throw new Error('crash after external refund');};
   await processPaymentCommand(payment.id);
   assert.equal((await paymentRepository.findRefundById(refunds[0].id))!.status,'PENDING');
   assert.equal((await paymentRepository.findPaymentById(payment.id))!.refunded_minor,0);
   financialPostingService.postRefundReversal=originalPosting;
   await getDbPool().query("UPDATE payment_commands SET available_at=now() WHERE payment_id=$1 AND kind='REFUND'",[payment.id]);
   await Promise.all(Array.from({length:6},()=>processPaymentCommand(payment.id)));
   assert.equal(external.size,1);assert.equal(calls,2);
   assert.equal((await paymentRepository.findPaymentById(payment.id))!.refunded_minor,6000);
   assert.equal((await getDbPool().query('SELECT * FROM ledger_transactions WHERE idempotency_key=$1',[`refund.succeeded:${refunds[0].id}`])).rowCount,1);
   const remainder=await paymentService.requestRefund({...request,idempotencyKey:randomUUID(),amountMinor:5500});
   await paymentService.approveRefund(remainder.id,checker);await processPaymentCommand(payment.id);
   assert.equal((await paymentRepository.findPaymentById(payment.id))!.refunded_minor,11500);
   const finalSummary=(await ledgerRepository.findOrderSummary(f.order.id))!;
   assert.equal(finalSummary.merchant_payable_minor,0);assert.equal(finalSummary.commission_revenue_minor,0);assert.equal(finalSummary.refund_cost_minor,0);
   assert.equal((await orderService.getOrderById(f.order.id)).status,'CANCELLED');
   await closeDbPool();assert.equal((await paymentRepository.findRefundById(refunds[0].id))!.status,'SUCCEEDED');
 }finally{financialPostingService.postRefundReversal=originalPosting;paymentProviderRegistry.register(originalProvider);}
});
test('late capture after cancellation posts funds and reserves refund without merchant release',async()=>{
 const f=await pending(),{payment,result}=await evidence(f.order);
 await orderService.customerCancelOrder(f.uid,f.order.id);
 await paymentService.applyVerifiedOutcome(payment.id,result);
 assert.equal((await orderService.getOrderById(f.order.id)).status,OrderStatus.CANCELLED);
 const refunds=await paymentRepository.findRefundsByPaymentId(payment.id);assert.equal(refunds.length,1);assert.equal(refunds[0].amount_minor,payment.amount_minor);
 await paymentService.applyVerifiedOutcome(payment.id,result);
 assert.equal((await paymentRepository.findRefundsByPaymentId(payment.id)).length,1);
 assert.equal((await getDbPool().query("SELECT * FROM outbox_events WHERE aggregate_id=$1 AND event_type='order.placed'",[f.order.id])).rowCount,0);
});

test('all capture evidence dimensions reject mismatches and late failures cannot regress captured funds',async()=>{
 const f=await pending(),{payment,result}=await evidence(f.order);
 for(const changed of [{amountMinor:result.amountMinor-1},{currency:'USD'},{receiver:'another-account'},{orderId:randomUUID()},{paymentId:randomUUID()},{providerReference:''},{verified:false}])await assert.rejects(paymentService.applyVerifiedOutcome(payment.id,{...result,...changed}));
 await paymentService.applyVerifiedOutcome(payment.id,result);
 await paymentService.applyVerifiedOutcome(payment.id,{...result,status:'FAILED'});
 assert.equal((await paymentRepository.findPaymentById(payment.id))!.status,'CAPTURED');
});
test('a second late provider capture creates a refund liability, never a second merchant allocation',async()=>{
 const f=await pending(),first=await evidence(f.order);
 // A failed attempt was previously superseded; later both providers report captured.
 await paymentService.applyVerifiedOutcome(first.payment.id,{...first.result,status:'FAILED'});
 const second=await evidence(f.order);
 await paymentService.applyVerifiedOutcome(second.payment.id,second.result);
 await paymentService.applyVerifiedOutcome(first.payment.id,first.result);
 assert.equal((await ledgerRepository.findOrderSummary(f.order.id))!.merchant_payable_minor,8000);
 const refunds=await paymentRepository.findRefundsByPaymentId(first.payment.id);assert.equal(refunds.length,1);assert.equal(refunds[0].amount_minor,first.payment.amount_minor);
 const tx=await ledgerRepository.findTransactionByIdempotencyKey(`payment.captured:${first.payment.id}`);
 const entries=await ledgerRepository.findEntriesByTransactionId(tx!.id);
 assert.ok(entries.some(e=>e.account_type==='CUSTOMER_REFUND_PAYABLE'));
 assert.ok(!entries.some(e=>e.account_type==='MERCHANT_PAYABLE'));
});
test('ledger entries reject mutation and cross-currency or unbalanced SQL postings at commit',async()=>{
 const f=await pending(),{payment,result}=await evidence(f.order);await paymentService.applyVerifiedOutcome(payment.id,result);
 const tx=await ledgerRepository.findTransactionByIdempotencyKey(`payment.captured:${payment.id}`);
 await assert.rejects(getDbPool().query('UPDATE ledger_entries SET amount_minor=1 WHERE transaction_id=$1',[tx!.id]),/immutable/);
 await assert.rejects(getDbPool().query('DELETE FROM ledger_transactions WHERE id=$1',[tx!.id]),/immutable/);
 await assert.rejects(getDbPool().query("INSERT INTO ledger_entries(id,transaction_id,account_id,direction,amount_minor,currency) SELECT gen_random_uuid(),transaction_id,account_id,direction,amount_minor,currency FROM ledger_entries WHERE transaction_id=$1 LIMIT 1",[tx!.id]),/cannot receive additional entries/);
 await assert.rejects(withTransaction(async client=>{await client.query("INSERT INTO ledger_transactions(id,reference_type,reference_id,transaction_type,currency,idempotency_key,total_amount_minor) VALUES($1,'PAYMENT',$2,'PAYMENT_CAPTURED','KES',$3,1)",[randomUUID(),payment.id,randomUUID()]);}),/Unbalanced, empty or cross-currency/);
});

test('promotion funding and free-delivery subsidies balance against frozen pricing',async()=>{
 for(const funding of ['DEETOO','MERCHANT','SHARED','FREE_DELIVERY']){
  const f=await fixture(),id=randomUUID();
  await getDbPool().query(`INSERT INTO promotions(id,code,type,value_minor_or_bps,status,start_at,end_at,minimum_basket_minor,usage_limit,times_used,per_customer_limit,branch_id,funding_source,merchant_funding_bps,description)
    VALUES($1,$1,$2,1000,'ACTIVE',now()-interval '1 day',now()+interval '1 day',0,100,0,10,$3,$4,$5,'Wave 2 funding test')`,[id,funding==='FREE_DELIVERY'?'FREE_DELIVERY':'FIXED_AMOUNT',f.bid,funding==='FREE_DELIVERY'?'DEETOO':funding,funding==='SHARED'?5000:funding==='MERCHANT'?10000:0]);
  const cart=await cartRepository.findActiveCartByCustomer(f.uid);await cartRepository.updateCartPromo(cart!.id,id);
  const quote=await checkoutService.generateQuote(f.uid,{address_id:f.quote.delivery_address_id});
  const order=await orderService.createOrderFromQuote(f.uid,{quote_id:quote.id},randomUUID());
  // Live commission changes after order creation must not change the captured allocation.
  await getDbPool().query('UPDATE merchant_commission_rules SET percentage_rate=0.5 WHERE merchant_id=$1',[f.mid]);
  const {payment,result}=await evidence(order);await paymentService.applyVerifiedOutcome(payment.id,result);
  const summary=(await ledgerRepository.findOrderSummary(order.id))!;
  const merchant=funding==='MERCHANT'?1000:funding==='SHARED'?500:0;
  assert.equal(summary.merchant_funded_discount_minor,merchant);assert.equal(summary.platform_funded_discount_minor,1000-merchant);
  assert.equal(summary.merchant_payable_minor,8000-merchant);assert.equal(summary.commission_revenue_minor,2000);
  assert.equal(summary.delivery_revenue_minor,1000);
  const tx=await ledgerRepository.findTransactionByIdempotencyKey(`payment.captured:${payment.id}`),entries=await ledgerRepository.findEntriesByTransactionId(tx!.id);
  assert.equal(entries.filter(e=>e.direction==='DEBIT').reduce((s,e)=>s+e.amount_minor,0),entries.filter(e=>e.direction==='CREDIT').reduce((s,e)=>s+e.amount_minor,0));
 }
});

test('signed callback duplicates traverse the real card adapter and worker into one durable release',async()=>{
 const {createHmac}=await import('node:crypto');
 const {processPaymentCommand}=await import('../../apps/api/src/modules/payment/payment-worker');
 const f=await pending();
 const p=await paymentService.initiatePayment({orderId:f.order.id,customerId:f.uid,method:'CARD',paymentMethodToken:'pm_test',idempotencyKey:randomUUID()});
 const intent=`pi_${p.id.replaceAll('-','')}`;
 await paymentRepository.updatePayment({...p,provider_payment_id:intent,provider_reference:intent,checkout_request_id:intent,merchant_request_id:intent,provider_receiver:'acct_contract_test'} as any);
 await getDbPool().query("UPDATE payment_commands SET status='SUCCEEDED' WHERE payment_id=$1 AND kind='INITIATE'",[p.id]);
 const oldFetch=globalThis.fetch,prior={key:process.env.STRIPE_SECRET_KEY,secret:process.env.STRIPE_WEBHOOK_SECRET,account:process.env.STRIPE_ACCOUNT_ID};
 process.env.STRIPE_SECRET_KEY='contract-test-key';process.env.STRIPE_WEBHOOK_SECRET='contract-test-signing';process.env.STRIPE_ACCOUNT_ID='acct_contract_test';
 try{
  globalThis.fetch=async input=>new Response(JSON.stringify(String(input).endsWith('/account')?{id:'acct_contract_test'}:{id:intent,status:'succeeded',amount_received:p.amount_minor,currency:'kes',metadata:{payment_id:p.id,order_id:p.order_id}}),{status:200});
  const payload={id:`evt_${p.id}`,type:'payment_intent.succeeded',data:{object:{id:intent,amount_received:p.amount_minor,currency:'kes'}}};
  const raw=JSON.stringify(payload),t=Math.floor(Date.now()/1000),signature=createHmac('sha256','contract-test-signing').update(`${t}.${raw}`).digest('hex');
  const headers={'stripe-signature':`t=${t},v1=${signature}`};
  await Promise.all(Array.from({length:6},()=>paymentService.handleCallback('CARD',headers,raw,payload)));
  assert.equal((await getDbPool().query("SELECT id FROM payment_commands WHERE payment_id=$1 AND kind='VERIFY'",[p.id])).rowCount,1);
  await processPaymentCommand(p.id);
  assert.equal((await orderService.getOrderById(p.order_id)).status,'PLACED');
  assert.equal((await paymentRepository.findProviderEvent('CARD',payload.id))!.processing_status,'PROCESSED');
  const changed={...payload,data:{object:{...payload.data.object,amount_received:1}}},changedRaw=JSON.stringify(changed),changedSig=createHmac('sha256','contract-test-signing').update(`${t}.${changedRaw}`).digest('hex');
  await assert.rejects(paymentService.handleCallback('CARD',{'stripe-signature':`t=${t},v1=${changedSig}`},changedRaw,changed),{code:'PROVIDER_EVENT_CONFLICT'});
 }finally{
  globalThis.fetch=oldFetch;
  for(const [name,value] of Object.entries({STRIPE_SECRET_KEY:prior.key,STRIPE_WEBHOOK_SECRET:prior.secret,STRIPE_ACCOUNT_ID:prior.account}))if(value===undefined)delete process.env[name];else process.env[name]=value;
 }
});
test('process death before commit rolls back capture, ledger, release and outbox; retry recovers once',async()=>{
 const {spawn}=await import('node:child_process');
 const f=await pending(),{payment,result}=await evidence(f.order);
 const script=`import {withTransaction} from './apps/api/src/db/transaction.ts';import {paymentService} from './apps/api/src/modules/payment/payment.service.ts';await withTransaction(async()=>{await paymentService.applyVerifiedOutcome(${JSON.stringify(payment.id)},${JSON.stringify(result)});console.log('CAPTURE_BEFORE_COMMIT');await new Promise(()=>{});});`;
 const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',script],{cwd:process.cwd(),env:process.env,stdio:['ignore','pipe','pipe']});
 await new Promise<void>((resolve,reject)=>{
  const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Crash probe did not reach commit boundary'));},15000);
  child.stdout.on('data',chunk=>{if(String(chunk).includes('CAPTURE_BEFORE_COMMIT')){clearTimeout(timeout);child.kill('SIGKILL');}});
  child.on('exit',(_code,signal)=>{clearTimeout(timeout);signal==='SIGKILL'?resolve():reject(new Error(`Crash probe exited unexpectedly: ${_code}`));});
 });
 assert.equal((await orderService.getOrderById(f.order.id)).status,'PENDING_PAYMENT');
 assert.equal((await paymentRepository.findPaymentById(payment.id))!.captured_minor,0);
 assert.equal(await ledgerRepository.findTransactionByIdempotencyKey(`payment.captured:${payment.id}`),null);
 await paymentService.applyVerifiedOutcome(payment.id,result);
 assert.equal((await orderService.getOrderById(f.order.id)).status,'PLACED');
});


test('method-bound quotes round only M-PESA and reverse the exact frozen service allocation',async()=>{
 const f=await fixture();
 await getDbPool().query('UPDATE menu_items SET price_minor=10001 WHERE id=$1',[f.cartItem.menu_item_id]);
 const exact=await checkoutService.generateQuote(f.uid,{address_id:f.quote.delivery_address_id,payment_method:'CARD'});
 const rounded=await checkoutService.generateQuote(f.uid,{address_id:f.quote.delivery_address_id,payment_method:'MPESA'});
 assert.equal(exact.total_minor,11501);assert.equal(rounded.total_minor,11600);
 assert.equal(rounded.pricing_rule_snapshot.rounding_adjustment_minor,99);
 assert.equal(rounded.service_fee_minor,599);assert.equal(exact.service_fee_minor,500);
 const order=await orderService.createOrderFromQuote(f.uid,{quote_id:rounded.id},randomUUID());
 await assert.rejects(paymentService.initiatePayment({orderId:order.id,customerId:f.uid,method:'CARD',idempotencyKey:randomUUID()}),{code:'PAYMENT_METHOD_MISMATCH'});
 const payment=await paymentService.initiatePayment({orderId:order.id,customerId:f.uid,method:'MPESA',phone:'+254700000001',idempotencyKey:randomUUID()});
 await paymentRepository.updatePayment({...payment,provider_receiver:'contract-receiver'} as any);
 const outcome={verified:true,status:'CAPTURED' as const,amountMinor:11600,currency:'KES',paymentId:payment.id,orderId:order.id,receiver:'contract-receiver',providerReference:'contract-'+payment.id,rawResponse:{contract_test:true}};
 await Promise.all(Array.from({length:6},()=>paymentService.applyVerifiedOutcome(payment.id,outcome)));
 const summary=(await ledgerRepository.findOrderSummary(order.id))!;
 assert.equal(summary.service_fee_revenue_minor,599);assert.equal(summary.merchant_payable_minor,8001);
 await orderService.customerCancelOrder(f.uid,order.id);
 const refund=(await paymentRepository.findRefundsByPaymentId(payment.id))[0];assert.equal(refund.amount_minor,11600);
 await Promise.all(Array.from({length:6},()=>financialPostingService.postRefundReversal(refund)));
 const final=(await ledgerRepository.findOrderSummary(order.id))!;
 assert.equal(final.service_fee_revenue_minor,0);assert.equal(final.merchant_payable_minor,0);
 assert.equal((await getDbPool().query('SELECT id FROM ledger_transactions WHERE idempotency_key=$1',[`refund.succeeded:${refund.id}`])).rowCount,1);
});

test('hosted card initiation, signed session callbacks and refund recover through durable worker',async()=>{
 const {createHmac}=await import('node:crypto');
 const {processPaymentCommand}=await import('../../apps/api/src/modules/payment/payment-worker');
 const f=await fixture();
 const quote=await checkoutService.generateQuote(f.uid,{address_id:f.quote.delivery_address_id,payment_method:'CARD'});
 const order=await orderService.createOrderFromQuote(f.uid,{quote_id:quote.id},randomUUID());
 await assert.rejects(paymentService.initiatePayment({orderId:order.id,customerId:f.uid,method:'MPESA',phone:'+254700000001',idempotencyKey:randomUUID()}),{code:'PAYMENT_METHOD_MISMATCH'});
 const key=randomUUID(),input={orderId:order.id,customerId:f.uid,method:'CARD' as const,idempotencyKey:key};
 const payments=await Promise.all(Array.from({length:6},()=>paymentService.initiatePayment(input)));
 assert.equal(new Set(payments.map(p=>p.id)).size,1);const payment=payments[0];
 const names=['STRIPE_SECRET_KEY','STRIPE_ACCOUNT_ID','STRIPE_WEBHOOK_SECRET','PAYMENT_RETURN_URL'];
 const prior=Object.fromEntries(names.map(n=>[n,process.env[n]])),oldFetch=globalThis.fetch;
 Object.assign(process.env,{STRIPE_SECRET_KEY:'contract-key',STRIPE_ACCOUNT_ID:'acct_contract',STRIPE_WEBHOOK_SECRET:'contract-signing',PAYMENT_RETURN_URL:'https://deetoo.example/customer'});
 const metadata={payment_id:payment.id,order_id:order.id};
 let captured=false,refundData:any=null;
 try{
  globalThis.fetch=async(url,init)=>{
   const path=String(url).replace('https://api.stripe.com/v1/','');let data:any;
   if(path==='account')data={id:'acct_contract'};
   else if(path.startsWith('checkout/sessions'))data={id:'cs_contract',url:'https://checkout.stripe.com/c/pay/test',status:captured?'complete':'open',metadata,currency:'kes',amount_total:order.total_minor,payment_intent:captured?'pi_contract':null};
   else if(path==='payment_intents/pi_contract')data={id:'pi_contract',status:'succeeded',amount_received:order.total_minor,currency:'kes',metadata};
   else if(path.startsWith('refunds?'))data={data:refundData?[refundData]:[],has_more:false};
   else if(path==='refunds'){
    const b=init!.body as URLSearchParams;assert.equal(b.get('payment_intent'),'pi_contract');
    refundData={id:'re_contract',payment_intent:'pi_contract',status:'succeeded',amount:Number(b.get('amount')),currency:'kes',metadata:{refund_id:b.get('metadata[refund_id]')}};data=refundData;
   }else if(path==='refunds/re_contract')data=refundData;
   else throw new Error('Unexpected provider request '+path);
   return new Response(JSON.stringify(data));
  };
  await processPaymentCommand(payment.id);
  await closeDbPool();const persisted=(await paymentRepository.findPaymentById(payment.id))!;
  assert.equal(persisted.checkout_url,'https://checkout.stripe.com/c/pay/test');
  assert.equal((await orderService.getBranchOrders(f.bid)).length,0);
  captured=true;
  const event={id:'evt_'+payment.id,type:'checkout.session.completed',data:{object:{id:'cs_contract'}}};
  const raw=JSON.stringify(event),t=Math.floor(Date.now()/1000),sig=createHmac('sha256','contract-signing').update(`${t}.${raw}`).digest('hex');
  await Promise.all(Array.from({length:6},()=>paymentService.handleCallback('CARD',{'stripe-signature':`t=${t},v1=${sig}`},raw,event)));
  await processPaymentCommand(payment.id);
  assert.equal((await orderService.getOrderById(order.id)).status,'PLACED');
  assert.equal((await getDbPool().query('SELECT id FROM ledger_transactions WHERE idempotency_key=$1',[`payment.captured:${payment.id}`])).rowCount,1);
  await orderService.customerCancelOrder(f.uid,order.id);
  await processPaymentCommand(payment.id);
  assert.equal((await paymentRepository.findPaymentById(payment.id))!.refunded_minor,order.total_minor);
  const summary=(await ledgerRepository.findOrderSummary(order.id))!;assert.equal(summary.service_fee_revenue_minor,0);assert.equal(summary.merchant_payable_minor,0);
 }finally{globalThis.fetch=oldFetch;for(const n of names)if(prior[n]===undefined)delete process.env[n];else process.env[n]=prior[n];}
});


test('clearing a quoted basket retains immutable history and does not cancel an existing order',async()=>{
 const {cartService}=await import('../../apps/api/src/modules/cart/cart.service');
 const f=await fixture();
 await cartService.clearCart(f.uid);
 assert.equal(await cartRepository.findActiveCartByCustomer(f.uid),null);
 assert.equal((await cartRepository.findCartById(f.quote.cart_id))!.status,'ABANDONED');
 assert.equal((await getDbPool().query('SELECT id FROM checkout_quotes WHERE id=$1',[f.quote.id])).rowCount,1);
 await assert.rejects(orderService.createOrderFromQuote(f.uid,{quote_id:f.quote.id},randomUUID()),{code:'CART_EMPTY'});
 const placed=await pending();
 await cartService.clearCart(placed.uid);
 assert.equal((await orderService.getOrderById(placed.order.id)).status,'PENDING_PAYMENT');
});
