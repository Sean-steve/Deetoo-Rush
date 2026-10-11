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
after(async()=>{await closeDbPool();(await import('../../apps/api/src/db/redis')).closeRedisClient();});
async function fixture(method: 'CARD'|'MPESA' = 'CARD'){
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
 const quote=await checkoutService.generateQuote(uid,{address_id:address.id,payment_method:method});
 return {uid,mid,bid,zone,cartItem,quote,token:user.accessToken};
}

if(!config.localWorkflow)throw new Error('Explicit local workflow flag required');
import { processPaymentCommand } from '../../apps/api/src/modules/payment/payment-worker';
import { LocalPaymentProvider } from '../../apps/api/src/modules/payment/providers/local.provider';
import { authRepository } from '../../apps/api/src/modules/auth/auth.repository';
import { UserRole } from '@deetoo/types';
import { createApp } from '../../apps/api/src/app';
import { createServer } from 'node:http';
for(const method of ['MPESA','CARD'] as const)test(`${method}: durable local capture, ownership, cancellation and exactly-once refund`,async()=>{
 const f=await fixture(method),order=await orderService.createOrderFromQuote(f.uid,{quote_id:f.quote.id},randomUUID());
 const input={orderId:order.id,customerId:f.uid,method,phone:'254700000000',idempotencyKey:randomUUID()};
 const payments=await Promise.all(Array.from({length:4},()=>paymentService.initiatePayment(input)));
 assert.equal(new Set(payments.map(p=>p.id)).size,1);const payment=payments[0];
 assert.equal((await orderService.getBranchOrders(f.bid)).length,0);
 await processPaymentCommand(payment.id);
 assert.equal((await orderService.getOrderById(order.id)).status,'PENDING_PAYMENT');
 await Promise.all(Array.from({length:4},()=>processPaymentCommand(payment.id)));
 const paid=await orderService.getOrderById(order.id);assert.equal(paid.status,'PLACED');
 assert.equal(paid.timeline.filter(t=>t.reason_code==='VERIFIED_PAYMENT_CAPTURE').length,1);
 assert.equal((await orderService.getBranchOrders(f.bid)).length,1);
 assert.equal((await paymentRepository.findPaymentById(payment.id))!.captured_minor,order.total_minor);
 assert.equal((await ledgerRepository.findOrderSummary(order.id))!.merchant_payable_minor,8000);
 const server=createServer(createApp());await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${(server.address() as any).port}/api/v1`;
 const post=(path:string,token?:string)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({reason_code:'CUSTOMER_CANCELLED'})});
 try{
   assert.equal((await post(`/orders/${order.id}/cancel`)).status,401);
   const stranger=await authService.registerCustomer({name:'Other',email:randomUUID()+'@example.test',password:'Foundation-test-ONLY-893!'});
   assert.equal((await post(`/orders/${order.id}/cancel`,stranger.accessToken)).status,403);
   assert.equal((await post(`/admin/orders/${order.id}/cancel`,f.token)).status,403);
   if(method==='CARD'){
     await authRepository.setUserRoles(stranger.user.id,[UserRole.ADMIN]);
     assert.equal((await post(`/admin/orders/${order.id}/cancel`,stranger.accessToken)).status,200);
   }else assert.equal((await post(`/customer/orders/${order.id}/cancel`,f.token)).status,200);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
 await Promise.all(Array.from({length:4},()=>processPaymentCommand(payment.id)));
 assert.equal((await paymentRepository.findPaymentById(payment.id))!.refunded_minor,order.total_minor);
 assert.equal((await orderService.getOrderById(order.id)).status,'CANCELLED');
 const summary=(await ledgerRepository.findOrderSummary(order.id))!;
 for(const key of ['merchant_payable_minor','commission_revenue_minor','delivery_revenue_minor','service_fee_revenue_minor'] as const)assert.equal(summary[key],0,key);
 const refunds=await paymentRepository.findRefundsByPaymentId(payment.id);assert.equal(refunds.length,1);assert.equal(refunds[0].status,'SUCCEEDED');
 assert.equal((await getDbPool().query('SELECT id FROM ledger_transactions WHERE idempotency_key=$1',[`payment.captured:${payment.id}`])).rowCount,1);
 assert.equal((await getDbPool().query('SELECT id FROM ledger_transactions WHERE idempotency_key=$1',[`refund.succeeded:${refunds[0].id}`])).rowCount,1);
});
test('local adapter rejects real attempts, real references and external callbacks',async()=>{
 const provider=new LocalPaymentProvider('CARD');
 await assert.rejects(provider.initiatePayment({paymentId:randomUUID()} as any),{code:'REAL_PAYMENT_REQUIRES_PROVIDER'});
 await assert.rejects(provider.verifyPayment({id:randomUUID(),provider_payment_id:'pi_real'} as any),{code:'REAL_PAYMENT_REQUIRES_PROVIDER'});
 await assert.rejects(provider.refund({paymentId:randomUUID(),providerPaymentId:'pi_real'} as any),{code:'REAL_PAYMENT_REQUIRES_PROVIDER'});
 assert.equal(provider.verifyCallback(),false);assert.throws(()=>provider.parseCallback(),{code:'LOCAL_CALLBACK_FORBIDDEN'});
});

test('local paid order completes merchant, dispatch, pickup, tracking, delivery and Rider earnings',async()=>{
 const {dispatchService}=await import('../../apps/api/src/modules/order/dispatch.service');
 const {deliveryRepository}=await import('../../apps/api/src/modules/order/delivery.repository');
 const {riderRepository}=await import('../../apps/api/src/modules/rider/rider.repository');
 const {riderService}=await import('../../apps/api/src/modules/rider/rider.service');
 const {riderLocationStore}=await import('../../apps/api/src/db/redis');
 const f=await fixture('MPESA');
 const rider=await authService.registerCustomer({name:'Workflow Rider',email:randomUUID()+'@example.test',password:'Foundation-test-ONLY-893!'});
 await authRepository.setUserRoles(rider.user.id,[UserRole.RIDER]);
 const profile=await riderRepository.createProfile({userId:rider.user.id,firstName:'Workflow',lastName:'Rider',phone:'+254700000000',onboardingStatus:'APPROVED' as any});
 // Legacy-approved integration fixture. All NEW applications need approved documents,
 // reviewed equipment and phone verification before operational eligibility.
 await getDbPool().query('UPDATE rider_profiles SET verification_required=FALSE WHERE id=$1',[profile.id]);
 await riderRepository.upsertVehicle(profile.id,{type:'MOTORBIKE',status:'ACTIVE'} as any);
 await riderRepository.assignZones(profile.id,[f.zone]);
 await riderService.goOnline(rider.user.id,{latitude:-1.28,longitude:36.82,accuracy_meters:5});
 const order=await orderService.createOrderFromQuote(f.uid,{quote_id:f.quote.id},randomUUID());
 const payment=await paymentService.initiatePayment({orderId:order.id,customerId:f.uid,method:'MPESA',phone:'254700000000',idempotencyKey:randomUUID()});
 await processPaymentCommand(payment.id);await processPaymentCommand(payment.id);
 const staff={id:f.uid,email:'workflow@example.test'};
 await orderService.merchantAcceptOrder(f.bid,staff,order.id,1);
 await orderService.merchantMarkPreparing(f.bid,staff,order.id);
 const delivery=await deliveryRepository.findByOrderId(order.id);assert.ok(delivery,'Acceptance must create a durable delivery');
 assert.equal(delivery.pickup_location.latitude,-1.28);assert.equal(delivery.dropoff_location.latitude,-1.29);
 const offer=await deliveryRepository.findActiveOfferByDeliveryId(delivery.id);assert.ok(offer,'Dispatch must offer an eligible nearby Rider');
 assert.equal(offer.rider_id,profile.id);
 await dispatchService.acceptOffer(offer.id,rider.user.id);
 await orderService.merchantMarkReady(f.bid,staff,order.id);
 await dispatchService.riderArrivePickup(delivery.id,rider.user.id,{latitude:-1.28,longitude:36.82});
 await assert.rejects(dispatchService.riderConfirmPickup(delivery.id,rider.user.id),{code:'INVALID_PICKUP_CODE'});
 await dispatchService.riderConfirmPickup(delivery.id,rider.user.id,{verification_code:delivery.pickup_verification_code!});
 await dispatchService.riderStartTrip(delivery.id,rider.user.id);
 await riderLocationStore.updateLocation(profile.id,{latitude:-1.285,longitude:36.825,accuracyMeters:5,recordedAt:new Date().toISOString()});
 const tracking=await dispatchService.getCustomerTracking(order.id,f.uid);assert.ok(tracking.riderLiveLocation);
 await assert.rejects(dispatchService.getCustomerTracking(order.id,rider.user.id),{code:'FORBIDDEN_TRACKING'});
 await dispatchService.riderArriveDropoff(delivery.id,rider.user.id,{latitude:-1.29,longitude:36.83});
 await assert.rejects(dispatchService.riderCompleteDelivery(delivery.id,rider.user.id,{proof_type:'OTP',otp:'wrong'}),{code:'INVALID_DELIVERY_OTP'});
 await getDbPool().query('UPDATE deliveries SET delivery_otp=NULL WHERE id=$1',[delivery.id]);
 await assert.rejects(dispatchService.riderCompleteDelivery(delivery.id,rider.user.id,{proof_type:'OTP',otp:delivery.delivery_otp!}),{code:'INVALID_DELIVERY_OTP'});
 await getDbPool().query('UPDATE deliveries SET delivery_otp=$2 WHERE id=$1',[delivery.id,delivery.delivery_otp]);
 await dispatchService.riderCompleteDelivery(delivery.id,rider.user.id,{proof_type:'OTP',otp:delivery.delivery_otp!});
 assert.equal((await orderService.getOrderById(order.id)).status,'COMPLETED');
 assert.equal((await deliveryRepository.findById(delivery.id))!.status,'DELIVERED');
 assert.ok(await ledgerRepository.findRiderEarningByDeliveryId(delivery.id));
 assert.equal((await ledgerRepository.findOrderSummary(order.id))!.merchant_payable_minor,8000);
 assert.equal((await deliveryRepository.getProofsByDeliveryId(delivery.id)).length,1);
 await riderService.goOffline(rider.user.id);
});


/**
 * Phase 5 four-party boundary acceptance, against a real, isolated PostgreSQL
 * and Express app (no HTTP interception, no seeded display fixtures).
 * Existing tests above exercise capture, dispatch, OTP, earnings and refunds.
 */
test('Phase 5: Admin and legacy Operations reject forged support participants and preserve paginated totals',async()=>{
 const f=await fixture('CARD');
 const order=await orderService.createOrderFromQuote(f.uid,{quote_id:f.quote.id},randomUUID());
 const staff=await authService.registerCustomer({name:'Phase 5 Support',email:randomUUID()+'@example.test',password:'Acceptance-only-893!'});
 await authRepository.setUserRoles(staff.user.id,[UserRole.SUPER_ADMIN]);
 const outsider=await authService.registerCustomer({name:'Unrelated Party',email:randomUUID()+'@example.test',password:'Acceptance-only-893!'});
 const server=createServer(createApp());
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+(server.address() as any).port+'/api/v1';
 const call=async(method:string,path:string,access?:string,body?:unknown)=>{
  const response=await fetch(base+path,{method,headers:{
   ...(access?{Authorization:'Bearer '+access}:{}),
   ...(body?{'Content-Type':'application/json'}:{})
  },...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,json:await response.json() as any};
 };
 const details={customer_id:f.uid,order_id:order.id,category:'ORDER_ISSUE',priority:'HIGH',
  subject:'Review pending delivery',description:'Customer raised a delivery review request.'};
 try{
  assert.equal((await call('POST','/admin/support/cases',undefined,details)).status,401);
  assert.equal((await call('POST','/admin/support/cases',f.token,details)).status,403);
  assert.equal((await call('POST','/operations/support/cases',f.token,details)).status,403);
  for(const path of ['/admin/support/cases','/operations/support/cases']){
   assert.equal((await call('POST',path,staff.accessToken,{...details,customer_id:undefined})).status,400,'Unverified participant on '+path);
   assert.equal((await call('POST',path,staff.accessToken,{...details,customer_id:randomUUID()})).status,404,'Unknown participant on '+path);
   const wrong=await call('POST',path,staff.accessToken,{...details,customer_id:outsider.user.id});
   assert.equal(wrong.status,409,'Foreign order/participant pair on '+path);
   assert.equal(wrong.json.error?.code,'SUPPORT_ORDER_PARTY_MISMATCH');
  }
  const created=await call('POST','/admin/support/cases',staff.accessToken,details);
  assert.equal(created.status,201,JSON.stringify(created.json));
  const legacy=await call('POST','/operations/support/cases',staff.accessToken,{...details,subject:'Independent review case'});
  assert.equal(legacy.status,201,JSON.stringify(legacy.json));
  const caseId=created.json.data.id;
  const saved=await getDbPool().query('SELECT customer_id,order_id FROM support_cases WHERE id=$1',[caseId]);
  assert.equal(saved.rows[0].customer_id,f.uid);
  assert.equal(saved.rows[0].order_id,order.id);
  const notes=await getDbPool().query('SELECT body FROM support_case_notes WHERE case_id=$1',[caseId]);
  assert.ok(notes.rowCount && notes.rowCount>=1,'Initial case message is durable');
  const first=await call('GET','/operations/support/cases?limit=1&offset=0',staff.accessToken);
  assert.equal(first.status,200);
  assert.equal(first.json.data.cases.length,1);
  assert.ok(first.json.data.total>=2,'Total includes pages beyond first');
  const later=await call('GET','/operations/support/cases?limit=1&offset=100000',staff.accessToken);
  assert.equal(later.status,200);
  assert.equal(later.json.data.cases.length,0);
  assert.equal(later.json.data.total,first.json.data.total,'Empty pages retain total');
  assert.equal((await call('GET','/operations/support/cases?limit=-2',staff.accessToken)).status,400);
  assert.equal((await call('GET','/operations/support/cases?limit=not-a-number',staff.accessToken)).status,400);
  assert.equal((await call('GET','/operations/support/cases?limit=101',staff.accessToken)).status,400);
  assert.equal((await call('GET','/operations/support/cases/'+caseId,f.token)).status,403);
 }finally{
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});

test('Phase 5: real Admin provisioning cannot skip merchant or rider onboarding',async()=>{
 const staff=await authService.registerCustomer({name:'Phase 5 Administrator',email:randomUUID()+'@example.test',password:'Acceptance-only-893!'});
 await authRepository.setUserRoles(staff.user.id,[UserRole.SUPER_ADMIN]);
 const regular=await authService.registerCustomer({name:'Phase 5 Customer',email:randomUUID()+'@example.test',password:'Acceptance-only-893!'});
 const server=createServer(createApp());
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+(server.address() as any).port+'/api/v1/admin/governance/provision';
 const provision=async(access:string,body:Record<string,unknown>)=>{
  const result=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:result.status,json:await result.json() as any};
 };
 try{
  const merchantInput={subject_type:'MERCHANT',name:'Phase 5 Merchant Owner',email:randomUUID()+'@example.test',
   merchant_legal_name:'Phase Five Foods Limited',merchant_display_name:'Phase Five Foods',reason:'Controlled acceptance provisioning'};
  assert.equal((await provision(regular.accessToken,merchantInput)).status,403);
  const merchant=await provision(staff.accessToken,merchantInput);
  assert.equal(merchant.status,201,JSON.stringify(merchant.json));
  assert.equal(merchant.json.data.requires_activation,true);
  assert.equal(merchant.json.data.user.status,'PENDING');
  const merchantId=merchant.json.data.resource.id;
  const owner=await getDbPool().query('SELECT status,approval_status FROM merchants WHERE id=$1',[merchantId]);
  assert.equal(owner.rows[0].approval_status,'DRAFT');
  assert.notEqual(owner.rows[0].status,'ACTIVE');
  const rider=await provision(staff.accessToken,{subject_type:'RIDER',name:'Phase 5 Rider',
   email:randomUUID()+'@example.test',phone_e164:'+254700555123',
   vehicle_type:'MOTORBIKE',reason:'Controlled acceptance provisioning'});
  assert.equal(rider.status,201,JSON.stringify(rider.json));
  assert.equal(rider.json.data.user.status,'PENDING');
  const row=await getDbPool().query('SELECT onboarding_status,work_status FROM rider_profiles WHERE user_id=$1',[rider.json.data.user.id]);
  assert.equal(row.rows[0].onboarding_status,'DRAFT');
  assert.equal(row.rows[0].work_status,'OFFLINE');
  const recorded=await getDbPool().query("SELECT COUNT(*)::int AS n FROM account_governance_events WHERE actor_user_id=$1 AND action='PROVISIONED'",[staff.user.id]);
  assert.equal(recorded.rows[0].n,2,'Both privileged creations have audit events');
 }finally{
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});


test('Phase 5: customer support intake applies Redis-backed rate limiting before authentication',async()=>{
 const server=createServer(createApp());
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+(server.address() as any).port+'/api/v1/customer/support/cases';
 try{
  for(let n=0;n<13;n++){
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
   assert.equal(response.status,n<12?401:429,'support case attempt '+(n+1));
   if(n===12){
    const body=await response.json() as any;
    assert.equal(body.error?.code,'RATE_LIMIT_EXCEEDED');
    assert.ok(response.headers.has('retry-after'));
   }else await response.arrayBuffer();
  }
 }finally{
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
});
