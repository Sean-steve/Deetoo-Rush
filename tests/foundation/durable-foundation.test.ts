import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,writeFile,readdir,readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDbPool,closeDbPool } from '../../apps/api/src/db/client';
import { withTransaction } from '../../apps/api/src/db/transaction';
import { runMigrations } from '../../scripts/db-migrate';
import { authRepository } from '../../apps/api/src/modules/auth/auth.repository';
import { authService } from '../../apps/api/src/modules/auth/auth.service';
import { merchantRepository } from '../../apps/api/src/modules/merchant/merchant.repository';
import { merchantScope } from '../../apps/api/src/modules/auth/scope';
import { orderEventBroker } from '../../apps/api/src/modules/realtime/event-broker';
import { dispatchOutbox,readChannelEvents } from '../../apps/api/src/modules/realtime/outbox';
import { UserRole,UserStatus } from '@deetoo/types';
import { config } from '@deetoo/config';

assert.equal(config.storage.mode,'postgres');
assert.equal(config.storage.fixtures,false);
if (!process.env.DATABASE_URL?.includes('foundation')) throw new Error('Use an isolated foundation test database');
after(async () => { await closeDbPool(); (await import('../../apps/api/src/db/redis')).closeRedisClient(); });
const event=(id:string)=>({type:'order.status_changed',order_id:id,channel:`order:${id}`,status:'PLACED',timestamp:new Date().toISOString(),data:{deliveryOtp:'must-not-persist'}} as any);

test('migration chain replays without changing checksums',async()=>{
  const fresh=!(await getDbPool().query("SELECT to_regclass('users') AS t")).rows[0].t;
  await runMigrations();
  if(fresh) {
    for(const table of ['users','merchants','service_zones','restaurant_categories','ledger_accounts']) {
      assert.equal((await getDbPool().query('SELECT count(*) AS n FROM '+table)).rows[0].n,0);
    }
  }
  const before=await getDbPool().query('SELECT version,checksum FROM schema_migrations ORDER BY version');
  assert.deepEqual(before.rows.map(row=>row.version).sort(), (await readdir('apps/api/src/db/migrations')).filter(name=>name.endsWith('.sql')).sort());
  await runMigrations();
  assert.deepEqual((await getDbPool().query('SELECT version,checksum FROM schema_migrations ORDER BY version')).rows,before.rows);
});

test('failed migration rolls back DDL and never records success',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'deetoo-migration-'));
  await writeFile(join(dir,'999_invalid.sql'),'CREATE TABLE foundation_rollback_probe(id int); SELECT foundation_missing_function();');
  await assert.rejects(runMigrations(dir),/Migration failed/);
  assert.equal((await getDbPool().query("SELECT to_regclass('foundation_rollback_probe') AS relation")).rows[0].relation,null);
  assert.equal((await getDbPool().query("SELECT 1 FROM schema_migrations WHERE version='999_invalid.sql'")).rowCount,0);
});

test('applied migration checksum mismatch is rejected',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'deetoo-checksum-'));
  await writeFile(join(dir,'001_initial_schema.sql'),'SELECT 1;');
  await assert.rejects(runMigrations(dir),/checksum changed/);
});

test('customer registration, session and role survive reconnect; revocation uses SQL',async()=>{
  const result=await authService.registerCustomer({name:'Durable customer',email:`foundation-${randomUUID()}@example.test`,password:'Foundation-test-ONLY-893!'});
  const user=result.user;
  assert.deepEqual(user.roles,[UserRole.CUSTOMER]);
  await closeDbPool();
  assert.equal((await authRepository.findUserById(user.id))?.email,user.email);
  assert.deepEqual(await authRepository.getUserRoles(user.id),[UserRole.CUSTOMER]);
  const sessions=await authRepository.listUserSessions(user.id);
  assert.equal(sessions.length,1);
  await authRepository.revokeSession(sessions[0].id);
  await closeDbPool();
  assert.ok((await authRepository.findSessionById(sessions[0].id))?.revoked_at);
  assert.equal((await authRepository.getCustomerProfile(user.id))?.name,'Durable customer');
});

test('membership revocation is durable and cross-merchant branch assignment is rejected',async()=>{
  const uid=randomUUID(),mid=randomUUID(),other=randomUUID(),bid=randomUUID(),membership=randomUUID();
  await authRepository.createUser({id:uid,email:`${uid}@example.test`,phone_e164:null,password_hash:'unused',status:UserStatus.ACTIVE});
  await authRepository.setUserRoles(uid,[UserRole.MERCHANT_OWNER]);
  await getDbPool().query("INSERT INTO merchants(id,legal_name,display_name) VALUES($1,'A','A'),($2,'B','B')",[mid,other]);
  await getDbPool().query("INSERT INTO merchant_branches(id,merchant_id,name,address_text,latitude,longitude) VALUES($1,$2,'B','Test',0,0)",[bid,other]);
  await merchantRepository.createMembership({id:membership,user_id:uid,merchant_id:mid,role_code:'merchant_owner',status:'ACTIVE',branch_ids:[],created_at:new Date().toISOString()} as any);
  await assert.rejects(merchantRepository.updateMembership(membership,{branch_ids:[bid]}),/another merchant/);
  const actor={id:uid,roles:[UserRole.MERCHANT_OWNER]} as any;
  await merchantScope(actor,mid);
  await assert.rejects(merchantScope(actor,other),{statusCode:403});
  await merchantRepository.updateMembership(membership,{status:'SUSPENDED'} as any);
  await closeDbPool();
  await assert.rejects(merchantScope(actor,mid),{statusCode:403});
});

test('outbox rollback: neither state nor event survives failed transaction',async()=>{
  const id=randomUUID();
  await assert.rejects(withTransaction(async()=>{
    await getDbPool().query("INSERT INTO users(id,email) VALUES($1,$2)",[id,`${id}@example.test`]);
    await orderEventBroker.publish(`order:${id}`,event(id));
    throw new Error('rollback probe');
  }),/rollback probe/);
  assert.equal((await getDbPool().query('SELECT 1 FROM users WHERE id=$1',[id])).rowCount,0);
  assert.deepEqual(await readChannelEvents(`order:${id}`),[]);
  await assert.rejects(orderEventBroker.publish(`order:${id}`,event(id)),/enclosing transaction/);
});

test('committed events survive reconnect, strip secrets, retry and dispatch once per lease',async()=>{
  const id=randomUUID(),channel=`order:${id}`;
  await withTransaction(()=>orderEventBroker.publish(channel,event(id)));
  await closeDbPool();
  let history=await readChannelEvents(channel);
  assert.equal(history.length,1);assert.equal(history[0].data,undefined);assert.ok(history[0].id);
  await dispatchOutbox(100,async()=>{throw new Error('transient transport');});
  let record=(await getDbPool().query('SELECT * FROM outbox_events WHERE id=$1',[history[0].id])).rows[0];
  assert.equal(record.published_at,null);assert.equal(record.last_error,'transient transport');
  await getDbPool().query('UPDATE outbox_events SET available_at=now() WHERE id=$1',[history[0].id]);
  const delivered:string[]=[];
  await Promise.all([dispatchOutbox(100,async e=>{delivered.push(e.id);}),dispatchOutbox(100,async e=>{delivered.push(e.id);})]);
  assert.equal(delivered.filter(e=>e===history[0].id).length,1);
  record=(await getDbPool().query('SELECT * FROM outbox_events WHERE id=$1',[history[0].id])).rows[0];
  assert.ok(record.published_at);assert.equal(record.attempts,2);
});

test('expired worker lease is recovered after a crash',async()=>{
  const id=randomUUID();await withTransaction(()=>orderEventBroker.publish(`order:${id}`,event(id)));
  const [saved]=await readChannelEvents(`order:${id}`);
  await getDbPool().query("UPDATE outbox_events SET lease_token=$2,leased_until=now()-interval '1 second' WHERE id=$1",[saved.id,randomUUID()]);
  const delivered:string[]=[];await dispatchOutbox(100,async e=>{delivered.push(e.id);});
  assert.ok(delivered.includes(saved.id));
});

test('customer addresses, cart and order persist; rollback exposes no cached order',async()=>{
  const { customerRepository }=await import('../../apps/api/src/modules/customer/customer.repository');
  const { cartRepository }=await import('../../apps/api/src/modules/cart/cart.repository');
  const { orderRepository }=await import('../../apps/api/src/modules/order/order.repository');
  const { MerchantStatus,MerchantApprovalStatus,BranchAdminStatus,BranchOperationalStatus,OrderStatus }=await import('@deetoo/types');
  const user=await authService.registerCustomer({name:'Foundation journey',email:`${randomUUID()}@example.test`,password:'Foundation-test-ONLY-893!'});
  const uid=user.user.id, mid=randomUUID(),bid=randomUUID(),menu=randomUUID(),category=randomUUID(),item=randomUUID();
  await merchantRepository.createMerchant({id:mid,legal_name:'Foundation',display_name:'Foundation',status:MerchantStatus.ACTIVE,approval_status:MerchantApprovalStatus.APPROVED,commission_bps:2000,settlement_schedule:'WEEKLY',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
  await merchantRepository.createBranch({id:bid,merchant_id:mid,name:'Foundation branch',address_line1:'Test',address_text:'Test',latitude:-1.28,longitude:36.82,status:BranchAdminStatus.ACTIVE,operational_status:BranchOperationalStatus.OPEN,city:'Nairobi',region:'Nairobi',country_code:'KE',timezone:'Africa/Nairobi',currency:'KES',min_order_minor:0,prep_default_min:20,created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
  const address=await customerRepository.createAddress({customer_id:uid,label:'Home',address_line1:'Test address',latitude:-1.29,longitude:36.83});
  assert.equal(address.is_default,true);
  const second=await customerRepository.createAddress({customer_id:uid,label:'Work',address_line1:'Work address',latitude:-1.27,longitude:36.81,is_default:true});
  assert.equal((await customerRepository.listAddressesByCustomerId(uid)).filter(a=>a.is_default).length,1);
  assert.equal(await customerRepository.updateAddress(address.id,randomUUID(),{label:'Intrusion'}),null);
  await getDbPool().query("INSERT INTO menus(id,branch_id,merchant_id,name,status) VALUES($1,$2,$3,'Test','ACTIVE')",[menu,bid,mid]);
  await getDbPool().query("INSERT INTO menu_categories(id,menu_id,name) VALUES($1,$2,'Test category')",[category,menu]);
  await getDbPool().query("INSERT INTO menu_items(id,menu_id,category_id,name,price_minor) VALUES($1,$2,$3,'Test item',10000)",[item,menu,category]);
  const cart=await cartRepository.createCart({id:randomUUID(),customer_id:uid,branch_id:bid,currency:'KES',status:'ACTIVE',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),expires_at:new Date(Date.now()+3600000).toISOString()} as any);
  const cartItem=await cartRepository.createCartItem({id:randomUUID(),cart_id:cart.id,menu_item_id:item,quantity:1,modifier_option_ids:[],created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
  await closeDbPool();
  assert.equal((await customerRepository.getProfileByUserId(uid))?.default_address_id,second.id);
  assert.equal((await merchantRepository.findBranchById(bid))?.merchant_id,mid);
  assert.equal((await cartRepository.findActiveCartByCustomer(uid))?.id,cart.id);
  assert.equal((await cartRepository.updateCartItemQuantity(cartItem.id,2))?.quantity,2);
  await assert.rejects(cartRepository.getServiceFeeRule(),/No active service fee rule/);
  const oid=randomUUID(),now=new Date().toISOString();
  const order={id:oid,public_code:oid.slice(0,20),order_number:oid.slice(0,20),customer_id:uid,merchant_id:mid,branch_id:bid,status:OrderStatus.PENDING_PAYMENT,currency:'KES',subtotal_minor:20000,delivery_fee_minor:0,service_fee_minor:0,discount_minor:0,total_minor:20000,delivery_address_snapshot:second,pricing_snapshot:{},items:[],timeline:[],created_at:now,updated_at:now};
  await withTransaction(async()=>{await orderRepository.createOrderAtomic(order,'foundation-'+oid,'hash');await orderEventBroker.publish(`order:${oid}`,event(oid));});
  await closeDbPool();
  assert.equal((await orderRepository.findById(oid))?.customer_id,uid);
  assert.equal((await orderRepository.findCustomerOrders(uid)).length,1);
  assert.equal((await orderRepository.findIdempotency('foundation-'+oid,uid))?.order_id,oid);
  const rolled=randomUUID();
  await assert.rejects(withTransaction(async()=>{await orderRepository.createOrderAtomic({...order,id:rolled,public_code:rolled.slice(0,20),order_number:rolled.slice(0,20)});throw new Error('roll back order');}),/roll back order/);
  assert.equal(await orderRepository.findById(rolled),null);
});

test('unsupported payment adapters and simulated callbacks fail closed in durable mode',async()=>{
  const { CardPaymentProvider }=await import('../../apps/api/src/modules/payment/providers/card.provider');
  const { MpesaPaymentProvider }=await import('../../apps/api/src/modules/payment/providers/mpesa.provider');
  for(const provider of [new CardPaymentProvider(),new MpesaPaymentProvider()]){
    await assert.rejects(provider.initiatePayment({} as any),{statusCode:503,code:'INTEGRATION_NOT_CONFIGURED'});
    assert.throws(()=>provider.verifyCallback({},{}),{statusCode:503,code:'INTEGRATION_NOT_CONFIGURED'});
  }
});

test('a fresh Node process reads durable identity without fixture initialization',async()=>{
  const { execFileSync }=await import('node:child_process');
  const uid=randomUUID();
  await authRepository.createUser({id:uid,email:`${uid}@example.test`,phone_e164:null,password_hash:'unused',status:UserStatus.ACTIVE});
  await authRepository.setUserRoles(uid,[UserRole.CUSTOMER]);
  const code="import {authRepository} from './apps/api/src/modules/auth/auth.repository.ts';import {closeDbPool} from './apps/api/src/db/client.ts';const user=await authRepository.findUserById(process.env.FOUNDATION_USER_ID);const roles=await authRepository.getUserRoles(process.env.FOUNDATION_USER_ID);console.log(JSON.stringify({exists:!!user,roles}));await closeDbPool();";
  const output=execFileSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{env:{...process.env,FOUNDATION_USER_ID:uid},encoding:'utf8',timeout:20000});
  assert.deepEqual(JSON.parse(output.trim()),{exists:true,roles:['customer']});
});

test('durable HTTP authentication rejects Customer on Rider API and revoked session',async()=>{
  const { createApp }=await import('../../apps/api/src/app');
  const http=await import('node:http');
  const { closeRedisClient }=await import('../../apps/api/src/db/redis');
  const result=await authService.registerCustomer({name:'HTTP customer',email:`${randomUUID()}@example.test`,password:'Foundation-test-ONLY-893!'});
  const server=http.createServer(createApp());
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const headers={Authorization:`Bearer ${result.accessToken}`,Connection:'close'};
  try {
    assert.equal((await fetch(base+'/api/v1/rider/offers/active',{headers})).status,403);
    assert.equal((await fetch(base+'/api/v1/customer/profile',{headers})).status,200);
    assert.equal((await fetch(base+'/health/ready')).status,200);
    for (const channel of ['customer:'+randomUUID(),'order:'+randomUUID(),'admin:dispatch','rider:'+randomUUID()]) {
      const status=(await fetch(base+'/api/v1/realtime/events?channel='+channel,{headers})).status;
      assert.ok(status===403 || status===404);
    }
    await authRepository.revokeAllUserSessions(result.user.id);
    assert.equal((await fetch(base+'/api/v1/customer/profile',{headers})).status,401);
    assert.equal((await fetch(base+'/api/v1/realtime/events?channel=customer:'+result.user.id,{headers})).status,401);
  } finally {server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));closeRedisClient();}
});

test('a swallowed SQL error cannot acknowledge a rolled-back service transaction',async()=>{
  await assert.rejects(withTransaction(async()=>{
    try {await getDbPool().query('SELECT foundation_nonexistent_function()');} catch {}
    return 'must not be acknowledged';
  }),/Transaction was aborted/);
});

test('durable branch-owned catalogue rejects ambiguous ownership and preserves item scope',async()=>{
  const { catalogueRepository }=await import('../../apps/api/src/modules/merchant/catalogue.repository');
  const [branchA,branchB]=(await getDbPool().query('SELECT id,merchant_id FROM merchant_branches ORDER BY id LIMIT 2')).rows;
  const now=new Date().toISOString();
  const menu={id:randomUUID(),merchant_id:branchA.merchant_id,name:'Canonical menu',currency:'KES',is_active:true,assigned_branch_ids:[branchA.id],created_at:now,updated_at:now};
  await assert.rejects(catalogueRepository.createMenu({...menu,assigned_branch_ids:[branchA.id,branchB.id]}),{code:'BRANCH_OWNED_MENU_REQUIRED'});
  await catalogueRepository.createMenu(menu);
  const category=await catalogueRepository.createCategory({id:randomUUID(),menu_id:menu.id,name:'Category',sort_order:0,is_active:true,created_at:now,updated_at:now});
  const item=await catalogueRepository.createItem({id:randomUUID(),menu_id:menu.id,category_id:category.id,name:'Meal',currency:'KES',price_minor:12500,is_available:true,sort_order:0,created_at:now,updated_at:now});
  const group=await catalogueRepository.createModifierGroup({id:randomUUID(),merchant_id:branchA.merchant_id,name:'Size',min_selections:0,max_selections:1,is_required:false,created_at:now,updated_at:now});
  const option=await catalogueRepository.createModifierOption({id:randomUUID(),modifier_group_id:group.id,name:'Large',price_delta_minor:500,is_available:true,sort_order:0,created_at:now,updated_at:now});
  await catalogueRepository.attachModifierGroupsToItem(item.id,[group.id]);
  await catalogueRepository.setBranchItemOverride(branchA.id,item.id,{price_override_minor:13000});
  await closeDbPool();
  assert.deepEqual((await catalogueRepository.findMenuById(menu.id))?.assigned_branch_ids,[branchA.id]);
  assert.equal((await catalogueRepository.findItemById(item.id))?.price_minor,12500);
  assert.equal((await catalogueRepository.getItemModifierGroups(item.id))[0].options?.[0].id,option.id);
  assert.equal((await catalogueRepository.getBranchItemOverride(branchA.id,item.id))?.price_override_minor,13000);
  await assert.rejects(catalogueRepository.setBranchItemOverride(branchB.id,item.id,{price_override_minor:1}),{statusCode:403});
  const wrongCategory=await catalogueRepository.createCategory({id:randomUUID(),menu_id:(await getDbPool().query('SELECT id FROM menus WHERE id<>$1 LIMIT 1',[menu.id])).rows[0].id,name:'Other',sort_order:0,is_active:true,created_at:now,updated_at:now});
  await assert.rejects(catalogueRepository.updateItem(item.id,{category_id:wrongCategory.id}),/foundation_item_category/);
  assert.equal((await catalogueRepository.findItemById(item.id))?.category_id,category.id);
  const { catalogueService } = await import('../../apps/api/src/modules/merchant/catalogue.service');
  const actor = (await getDbPool().query('SELECT id FROM users LIMIT 1')).rows[0].id;
  await catalogueService.assignMenuBranches(menu.id,branchA.merchant_id,[branchA.id],actor);
  assert.deepEqual((await catalogueRepository.findMenuById(menu.id))?.assigned_branch_ids,[branchA.id]);
  const foreign = (await getDbPool().query('SELECT id FROM merchant_branches WHERE merchant_id<>$1 LIMIT 1',[branchA.merchant_id])).rows[0];
  await assert.rejects(catalogueService.assignMenuBranches(menu.id,branchA.merchant_id,[foreign.id],actor),{statusCode:403});
  assert.deepEqual((await catalogueRepository.findMenuById(menu.id))?.assigned_branch_ids,[branchA.id]);
});

test('Rider profile, vehicle and single active session survive reconnect without default zones',async()=>{
  const { riderRepository }=await import('../../apps/api/src/modules/rider/rider.repository');
  const uid=randomUUID();await authRepository.createUser({id:uid,email:`${uid}@example.test`,phone_e164:null,password_hash:'unused',status:UserStatus.ACTIVE});await authRepository.setUserRoles(uid,[UserRole.RIDER]);
  const rider=await riderRepository.createProfile({userId:uid,firstName:'Durable',lastName:'Rider',phone:'+254700123456'});
  assert.deepEqual(rider.serviceZoneIds,[]);
  const [a,b]=await Promise.all([riderRepository.startSession(rider.id),riderRepository.startSession(rider.id)]);
  assert.equal(a.id,b.id);
  await riderRepository.upsertVehicle(rider.id,{type:'MOTORBIKE'} as any);
  await riderRepository.upsertVehicle(rider.id,{type:'BICYCLE'} as any);
  await closeDbPool();
  assert.equal((await riderRepository.findProfileByUserId(uid))?.id,rider.id);
  assert.equal((await riderRepository.findVehicleByRiderId(rider.id))?.type,'BICYCLE');
  assert.equal((await riderRepository.listRiders({search:'Durable Rider'})).riders.some(r=>r.id===rider.id),true);
  assert.equal((await riderRepository.endActiveSession(rider.id))?.id,a.id);
  assert.equal(await riderRepository.getActiveSession(rider.id),null);
});

test('payment records, provider event deduplication and ledger entries persist without simulated providers',async()=>{
  const { paymentRepository }=await import('../../apps/api/src/modules/payment/payment.repository');
  const { ledgerRepository }=await import('../../apps/api/src/modules/finance/ledger.repository');
  const { LedgerAccountType,LedgerAccountOwnerType,LedgerEntryDirection }=await import('@deetoo/types');
  const order=(await getDbPool().query('SELECT id,customer_id FROM orders LIMIT 1')).rows[0];
  const id=randomUUID(),now=new Date().toISOString();
  await paymentRepository.savePayment({id,order_id:order.id,customer_id:order.customer_id,status:'INITIATED',currency:'KES',amount_minor:10000,captured_minor:0,refunded_minor:0,provider:'CARD',method:'CARD',created_at:now,updated_at:now} as any);
  const event={provider:'CARD',provider_event_id:randomUUID(),payment_id:id,event_type:'test.record',payload_hash:'hash',raw_payload:{id},processing_status:'RECEIVED'} as any;
  const first=await paymentRepository.recordProviderEvent(event);
  assert.equal((await paymentRepository.recordProviderEvent({...event,processing_status:'PROCESSED'})).id,first.id);
  await assert.rejects(paymentRepository.recordProviderEvent({...event,payload_hash:'changed'}),{code:'PROVIDER_EVENT_CONFLICT'});
  await closeDbPool();
  assert.equal((await paymentRepository.findPaymentById(id))?.amount_minor,10000);
  const accountA=await ledgerRepository.getOrCreateAccount(LedgerAccountType.CUSTOMER_FUNDS_CLEARING,LedgerAccountOwnerType.PLATFORM);
  const accountB=await ledgerRepository.getOrCreateAccount(LedgerAccountType.MERCHANT_PAYABLE,LedgerAccountOwnerType.MERCHANT,(await getDbPool().query('SELECT id FROM merchants LIMIT 1')).rows[0].id);
  const key=randomUUID();
  const tx=await withTransaction(()=>ledgerRepository.postTransaction({transaction_type:'PAYMENT_CAPTURE',reference_type:'PAYMENT',reference_id:id,idempotency_key:key,currency:'KES',description:'Foundation storage test'} as any,[{accountId:accountA.id,direction:LedgerEntryDirection.DEBIT,amountMinor:10000},{accountId:accountB.id,direction:LedgerEntryDirection.CREDIT,amountMinor:10000}]));
  await closeDbPool();
  assert.equal((await ledgerRepository.findTransactionByIdempotencyKey(key))?.id,tx.transaction.id);
  const entries=await ledgerRepository.findEntriesByTransactionId(tx.transaction.id);assert.equal(entries.length,2);
  assert.equal((await ledgerRepository.recalculateAccountBalance(accountB.id))>=10000,true);
});

test('independent outbox dispatch uses a committed PostgreSQL notification',async()=>{
  const listener=await getDbPool().connect();
  await listener.query('LISTEN deetoo_events');
  const id=randomUUID();await withTransaction(()=>orderEventBroker.publish(`order:${id}`,event(id)));
  const [saved]=await readChannelEvents(`order:${id}`);
  let timeout:NodeJS.Timeout;
  const notified=new Promise<string>((resolve,reject)=>{
    timeout=setTimeout(()=>reject(new Error('Outbox notification timeout')),5000);
    listener.on('notification',message=>{if(message.payload===saved.id)resolve(message.payload);});
  });
  try {await dispatchOutbox(500);assert.equal(await notified,saved.id);}
  finally {clearTimeout(timeout!);listener.release(true);}
});

test('durable delivery assignment and offers enforce Rider ownership after reconnect',async()=>{
  const { riderRepository }=await import('../../apps/api/src/modules/rider/rider.repository');
  const { deliveryRepository }=await import('../../apps/api/src/modules/order/delivery.repository');
  const { createApp }=await import('../../apps/api/src/app');const http=await import('node:http');
  const users=[] as any[];
  for(let i=0;i<2;i++){
    const user=await authService.registerCustomer({name:'Assigned Rider',email:`${randomUUID()}@example.test`,password:'Foundation-test-ONLY-893!'});
    await authRepository.setUserRoles(user.user.id,[UserRole.RIDER]);
    const profile=await riderRepository.createProfile({userId:user.user.id,firstName:'Assigned',lastName:'Rider',phone:'+254700123456'});
    users.push({...user,profile});
  }
  const order=(await getDbPool().query('SELECT o.* FROM orders o WHERE NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.order_id=o.id) LIMIT 1')).rows[0];
  const delivery=await withTransaction(()=>deliveryRepository.createDelivery({order_id:order.id,branch_id:order.branch_id,customer_id:order.customer_id,status:'ASSIGNED',assigned_rider_id:users[0].profile.id,pickup_location:{latitude:-1.28,longitude:36.82},dropoff_location:{latitude:-1.29,longitude:36.83},pickup_address_text:'Kitchen',dropoff_address_text:'Home'} as any));
  const offer=await deliveryRepository.createOffer({id:randomUUID(),delivery_id:delivery.id,order_id:order.id,rank:1,score:1,distance_to_pickup_meters:100,estimated_pickup_eta_seconds:60,rider_id:users[0].profile.id,status:'OFFERED',offered_at:new Date().toISOString(),expires_at:new Date(Date.now()+60000).toISOString(),created_at:new Date().toISOString(),updated_at:new Date().toISOString()} as any);
  await closeDbPool();assert.equal((await deliveryRepository.findById(delivery.id))?.assigned_rider_id,users[0].profile.id);assert.equal((await deliveryRepository.findActiveOfferByRiderId(users[0].profile.id))?.id,offer.id);
  const server=http.createServer(createApp());await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  const headers=(i:number)=>({Authorization:`Bearer ${users[i].accessToken}`,Connection:'close'});
  try {
    const own=await fetch(base+'/rider/offers/active',{headers:headers(0)});assert.equal(own.status,200);assert.equal((await own.text()).includes('"delivery_otp":'),false);
    assert.equal((await fetch(base+'/rider/deliveries/'+delivery.id,{headers:headers(1)})).status,403);
    assert.equal((await fetch(base+'/rider/offers/'+offer.id+'/accept',{method:'POST',headers:{...headers(1),'Content-Type':'application/json'},body:'{}'})).status,403);
    assert.equal((await fetch(base+'/realtime/events?channel=rider:'+users[0].profile.id,{headers:headers(1)})).status,403);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});


test('rejected login retains its security audit after service rollback', async () => {
  const identifier = `absent-${randomUUID()}@foundation.test`;
  await assert.rejects(authService.login({ identifier, password: 'WrongPassword123!' }), { statusCode: 401 });
  const result = await getDbPool().query("SELECT id FROM audit_logs WHERE action='LOGIN_FAILED' AND metadata->>'identifier'=$1", [identifier]);
  assert.equal(result.rowCount, 1);
});


test('verification attempt limit survives rejected command rollback', async () => {
  const user=(await getDbPool().query('SELECT id FROM users LIMIT 1')).rows[0];
  const id=randomUUID();
  await authRepository.createVerificationToken({id,user_id:user.id,type:'EMAIL',token_hash:randomUUID(),expires_at:new Date(Date.now()+60000)} as any);
  await assert.rejects(withTransaction(async()=>{ await authRepository.incrementVerificationAttempt(id); throw new Error('Invalid code'); }));
  const row=(await getDbPool().query('SELECT attempts FROM verification_tokens WHERE id=$1',[id])).rows[0];
  assert.equal(row.attempts,1);
});

test('support case and private notes persist without stale cache reads', async () => {
  const {operationsRepository: repo}=await import('../../apps/api/src/modules/operations/operations.repository');
  const user=(await getDbPool().query('SELECT id FROM users LIMIT 1')).rows[0];
  const id=randomUUID();
  await repo.createSupportCase({id,customer_id:user.id,category:'OTHER',subject:'Foundation persistence',description:'Storage verification'});
  await repo.addSupportCaseNote({id:randomUUID(),case_id:id,author_user_id:user.id,author_role:'support',visibility:'INTERNAL',body:'Private staff note',created_at:new Date().toISOString()} as any);
  await closeDbPool();
  assert.equal((await repo.getSupportCaseById(id))?.subject,'Foundation persistence');
  assert.equal((await repo.getSupportCaseNotes(id,false)).length,0);
  assert.equal((await repo.getSupportCaseNotes(id,true)).length,1);
  await getDbPool().query('DELETE FROM support_case_notes WHERE case_id=$1',[id]);
  assert.deepEqual(await repo.getSupportCaseNotes(id,true),[]);
});


test('settlement and payout storage survives reconnect without executing transfers', async () => {
  const {ledgerRepository: repo}=await import('../../apps/api/src/modules/finance/ledger.repository');
  const mid=(await getDbPool().query('SELECT id FROM merchants LIMIT 1')).rows[0].id;
  const rid=(await getDbPool().query('SELECT id FROM rider_profiles LIMIT 1')).rows[0].id;
  const now=new Date().toISOString(),sid=randomUUID(),pid=randomUUID();
  await repo.saveSettlement({id:sid,settlement_number:sid,merchant_id:mid,currency:'KES',period_start:now,period_end:now,gross_order_value_minor:10000,commission_amount_minor:2000,promotion_amount_minor:0,refund_amount_minor:0,adjustment_amount_minor:0,net_settlement_amount_minor:8000,status:'CALCULATED',created_at:now} as any,[]);
  await repo.saveRiderPayout({id:pid,payout_number:pid,rider_id:rid,currency:'KES',amount_minor:1000,period_start:now,period_end:now,status:'DRAFT',provider:'MPESA_B2C',created_at:now} as any,[]);
  await closeDbPool();
  assert.equal((await repo.findSettlementById(sid))?.net_settlement_amount_minor,8000);
  assert.equal((await repo.findRiderPayoutById(pid))?.amount_minor,1000);
  assert.equal((await repo.findSettlements({merchantId:randomUUID()})).length,0);
  assert.equal((await repo.findRiderPayouts({riderId:randomUUID()})).length,0);
});

test('dependency loss fails closed and Redis reconnects without a health-check side effect', async () => {
  const redis=await import('../../apps/api/src/db/redis');
  const {riderLocationStore}=redis;
  const redisUrl=config.redis.url, dbUrl=config.database.url;
  redis.closeRedisClient();
  try {
    config.redis.url='redis://127.0.0.1:1';
    assert.equal((await redis.checkRedisHealth()).status,'degraded');
    await assert.rejects(riderLocationStore.getLiveLocation(randomUUID()), {statusCode:503});
    await closeDbPool(); config.database.url='postgres://postgres:invalid@127.0.0.1:1/foundation';
    await assert.rejects(authRepository.findUserById(randomUUID()));
  } finally { redis.closeRedisClient();config.redis.url=redisUrl;await closeDbPool();config.database.url=dbUrl; }
  assert.equal(await riderLocationStore.getLiveLocation(randomUUID()),null);
});


test('deployed configuration rejects fixtures and default secrets even with conflicting environment flags', async () => {
  const {spawnSync}=await import('node:child_process');
  const env={...process.env, NODE_ENV:'production', APP_ENV:'development', JWT_SECRET:randomUUID()+randomUUID(), DEETOO_STORAGE_MODE:'postgres',DEETOO_FIXTURES:'false'};
  const code="import {config} from './packages/config/src/index.ts'; if(!config.isProduction || config.isDevelopment)process.exit(2)";
  const run=(overrides:Record<string,string>)=>spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{env:{...env,...overrides},encoding:'utf8',timeout:20000});
  assert.equal(run({}).status,0);
  assert.notEqual(run({DEETOO_STORAGE_MODE:'memory'}).status,0);
  assert.notEqual(run({DEETOO_FIXTURES:'true'}).status,0);
  assert.notEqual(run({JWT_SECRET:'deetoo_dev_jwt_secret_change_in_production_min_32_chars'}).status,0);
  assert.notEqual(run({JWT_SECRET:''}).status,0);
});


test('unconfigured identity delivery refuses simulated OTP and reset success', async () => {
  await assert.rejects(authService.requestOtp('+254700123456'), {statusCode:503});
  await assert.rejects(authService.requestPasswordReset('absent@foundation.test'), {statusCode:503});
});

test('scheduler command locks exclude another transaction and release after rollback', async () => {
  const {asyncJobService}=await import('../../apps/api/src/modules/operations/async-job.service');
  const key=randomUUID();
  await assert.rejects(asyncJobService.acquireLock(key),/command transaction/);
  const competing=await getDbPool().connect();
  try {
    await withTransaction(async()=>{
      assert.equal(await asyncJobService.acquireLock(key),true);
      await competing.query('BEGIN');
      assert.equal((await competing.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired',[key])).rows[0].acquired,false);
      await competing.query('ROLLBACK');
    });
    await competing.query('BEGIN');
    assert.equal((await competing.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired',[key])).rows[0].acquired,true);
  } finally { await competing.query('ROLLBACK');competing.release(); }
});


test('MFA uses RFC vectors and encrypts credentials; replay, expiry and privileged HTTP bypass fail', async () => {
  const {totp}=await import('../../apps/api/src/modules/auth/mfa');
  assert.equal(totp(Buffer.from('12345678901234567890'),1,8),'94287082');
  assert.equal(totp(Buffer.from('12345678901234567890'),Math.floor(1111111109/30),8),'07081804');
  const oldKey=process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY=Buffer.alloc(32,19).toString('base64');
  const {createApp}=await import('../../apps/api/src/app');
  const http=await import('node:http');
  const password='Foundation-Mfa-Only-294!';
  const admin=await authService.registerCustomer({name:'MFA administrator',email:randomUUID()+'@foundation.test',password});
  await authRepository.setUserRoles(admin.user.id,[UserRole.ADMIN]);
  const other=await authService.registerCustomer({name:'Target',email:randomUUID()+'@foundation.test',password});
  const server=http.createServer(createApp());await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  const post=(path:string,body:any)=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+admin.accessToken,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const roleBody={roles:['support'],reason:'Foundation role audit test'};
  try {
    assert.equal((await post('/admin/users/'+other.user.id+'/roles',roleBody)).status,403);
    assert.equal((await post('/auth/mfa/enroll',{password:'wrong'})).status,403);
    const enrollment=await post('/auth/mfa/enroll',{password});assert.equal(enrollment.status,200);
    const uri=(await enrollment.json()).uri;
    assert.equal((await (await post("/auth/mfa/enroll",{password})).json()).uri,uri,"Retrying pending setup preserves the phone key");
    const base32=new URL(uri).searchParams.get('secret')!;
    let bits=0,value=0;const bytes:number[]=[];
    for(const char of base32){value=(value<<5)|'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}
    const secret=Buffer.from(bytes),code=totp(secret,Math.floor(Date.now()/30000));
    const stored=(await getDbPool().query('SELECT encrypted_secret FROM user_mfa_credentials WHERE user_id=$1',[admin.user.id])).rows[0];
    assert.ok(!stored.encrypted_secret.includes(base32));
    assert.equal((await post('/auth/mfa/verify',{code})).status,200);
    assert.equal((await post('/auth/mfa/verify',{code})).status,403);
    assert.equal((await post('/admin/users/'+other.user.id+'/roles',roleBody)).status,200);
    assert.deepEqual(await authRepository.getUserRoles(other.user.id),['support']);
    assert.equal((await post('/auth/mfa/enroll',{password})).status,409);
    await getDbPool().query("UPDATE sessions SET mfa_verified_at=now()-interval '6 minutes' WHERE user_id=$1",[admin.user.id]);
    assert.equal((await post('/admin/users/'+other.user.id+'/roles',roleBody)).status,403);
    await getDbPool().query('UPDATE user_mfa_credentials SET failures=0 WHERE user_id=$1',[admin.user.id]);
    const bad=code==='000000'?'111111':'000000';
    for(let i=0;i<5;i++)assert.equal((await post('/auth/mfa/verify',{code:bad})).status,403);
    assert.equal((await post('/auth/mfa/verify',{code:bad})).status,429);
  } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));if(oldKey===undefined)delete process.env.MFA_ENCRYPTION_KEY;else process.env.MFA_ENCRYPTION_KEY=oldKey;}
});

test('authentication rate limits are shared across instances and cannot use the fixture exemption', async () => {
  const {createAuthRateLimiter}=await import('../../apps/api/src/modules/auth/rate-limit.middleware');
  const options={keyPrefix:'foundation:'+randomUUID(),windowMs:60000,max:2};
  const a=createAuthRateLimiter(options),b=createAuthRateLimiter(options);
  const req={ip:'127.0.0.1',headers:{},socket:{},body:{}} as any;
  const res={setHeader(){}} as any;
  const invoke=(limiter:any)=>new Promise<any>(resolve=>limiter(req,res,(error:any)=>resolve(error)));
  assert.equal(await invoke(a),undefined);
  assert.equal(await invoke(b),undefined);
  assert.equal((await invoke(a)).statusCode,429);
});


test('PostGIS discovery reflects configured merchant coverage without memory fixtures', async () => {
  const { discoveryService } = await import('../../apps/api/src/modules/discovery/discovery.service');
  const mid = randomUUID(), bid = randomUUID(), zid = randomUUID();
  const rollback = new Error('rollback isolated discovery probe');
  await assert.rejects(withTransaction(async client => {
    // The probe owns a rolled-back transaction; earlier tests may leave other zones.
    await client.query("UPDATE service_zones SET status='INACTIVE' WHERE status='ACTIVE'");
    await client.query("INSERT INTO merchants(id,legal_name,display_name,status,approval_status) VALUES($1,'Runtime probe','Runtime probe','ACTIVE','APPROVED')", [mid]);
    await client.query("INSERT INTO merchant_branches(id,merchant_id,name,address_text,latitude,longitude,status,operational_status) VALUES($1,$2,'Runtime probe','Test only',-1.27,36.8,'ACTIVE','OPEN')", [bid,mid]);
    const before = await discoveryService.discoverRestaurants({latitude:-1.27,longitude:36.8});
    assert.equal(before.serviceability.serviceable, false);
    assert.equal(before.restaurants.length, 0);
    await client.query("INSERT INTO service_zones(id,name,status,boundary) VALUES($1,'Isolated runtime probe','ACTIVE',ST_GeomFromText('POLYGON((36.7 -1.4,36.9 -1.4,36.9 -1.2,36.7 -1.2,36.7 -1.4))',4326))", [zid]);
    await client.query("INSERT INTO branch_service_zones(branch_id,service_zone_id,status) VALUES($1,$2,'ACTIVE')", [bid,zid]);
    await client.query("INSERT INTO delivery_pricing_rules(id,zone_id,base_fee_minor,included_distance_meters,per_km_fee_minor,minimum_fee_minor,maximum_fee_minor,max_delivery_distance_meters,status,effective_from) VALUES($1,$2,10000,3000,3000,10000,100000,5000,'ACTIVE',now())", [randomUUID(),zid]);
    const after = await discoveryService.discoverRestaurants({latitude:-1.27,longitude:36.8});
    assert.equal(after.serviceability.serviceable, true);
    assert.ok(after.restaurants.some(branch => branch.branch_id === bid));
    const near = await discoveryService.discoverRestaurants({latitude:-1.31,longitude:36.8});
    assert.ok(near.restaurants.some(branch => branch.branch_id === bid));
    const far = await discoveryService.discoverRestaurants({latitude:-1.32,longitude:36.8});
    assert.ok(!far.restaurants.some(branch => branch.branch_id === bid));
    await assert.rejects(discoveryService.getRestaurantDetail(bid,-1.32,36.8), {code:'OUTSIDE_DELIVERY_RANGE'});
    const {pricingService} = await import('../../apps/api/src/modules/cart/pricing.service');
    const {cartRepository} = await import('../../apps/api/src/modules/cart/cart.repository');
    const rule = await cartRepository.getDeliveryPricingRuleForZone(zid);
    assert.equal(pricingService.calculateDeliveryFee(5000,rule).is_within_range,true);
    assert.equal(pricingService.calculateDeliveryFee(5001,rule).is_within_range,false);
    assert.deepEqual(pricingService.calculateDeliveryFee(6000,rule,4500), {fee_minor:19000,is_within_range:true});
    await client.query("INSERT INTO service_fee_rules(id,fee_type,percentage_basis_points,fixed_fee_minor,minimum_fee_minor,maximum_fee_minor,status,effective_from) VALUES($1,'PERCENTAGE',250,0,2000,10000,'ACTIVE',now())",[randomUUID()]);
    const nearbyPricing=await pricingService.calculateFullPricing({branchId:bid,items:[],zoneId:zid,destination:{lat:-1.31,lng:36.8}});
    assert.ok(nearbyPricing.delivery_fee_minor < 100000);
    await assert.rejects(pricingService.calculateFullPricing({branchId:bid,items:[],zoneId:zid,destination:{lat:-1.32,lng:36.8}}),{code:'OUTSIDE_DELIVERY_RANGE'});
    const outside = await discoveryService.discoverRestaurants({latitude:0,longitude:0});
    assert.equal(outside.serviceability.serviceable, false);
    assert.equal(outside.restaurants.length, 0);
    throw rollback;
  }), error => error === rollback);
  assert.equal((await getDbPool().query('SELECT 1 FROM merchants WHERE id=$1', [mid])).rowCount, 0);
});

test('nationwide Kenya geometry includes coastal and inland locations and excludes other countries', async () => {
  const boundary = await readFile('docs/configuration/kenya-boundary.geojson', 'utf8');
  for (const [name, latitude, longitude, expected] of [
    ['Nairobi', -1.2864, 36.8172, true], ['Limuru', -1.1123, 36.6432, true],
    ['Mombasa', -4.0435, 39.6682, true], ['Kisumu', -0.1022, 34.7617, true],
    ['Lodwar', 3.119, 35.597, true], ['Mandera', 3.937, 41.856, true],
    ['Dar es Salaam', -6.7924, 39.2083, false], ['Kampala', 0.3476, 32.5825, false],
  ] as const) {
    const result = await getDbPool().query('SELECT ST_Contains(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),ST_SetSRID(ST_MakePoint($2,$3),4326)) AS covered', [boundary,longitude,latitude]);
    assert.equal(result.rows[0].covered, expected, name);
  }
});

test('durable approved Rider requires assigned coverage, then goes online and offline with GPS', async () => {
  const { riderRepository } = await import('../../apps/api/src/modules/rider/rider.repository');
  const { riderService } = await import('../../apps/api/src/modules/rider/rider.service');
  const uid = randomUUID(), zone = randomUUID();
  await authRepository.createUser({id:uid,email:`${uid}@example.test`,phone_e164:null,password_hash:'unused',status:UserStatus.ACTIVE});
  await authRepository.setUserRoles(uid,[UserRole.RIDER]);
  const profile = await riderRepository.createProfile({userId:uid,firstName:'Runtime',lastName:'Rider',phone:'+254700123456',onboardingStatus:'APPROVED' as any});
  await riderRepository.upsertVehicle(profile.id,{type:'MOTORBIKE',status:'ACTIVE'} as any);
  const gps = {latitude:-1.2864,longitude:36.8172,accuracy_meters:10};
  await assert.rejects(riderService.goOnline(uid,gps),{code:'RIDER_ZONE_REQUIRED'});
  await getDbPool().query("INSERT INTO service_zones(id,name,status,boundary) VALUES($1,'Test Kenya coverage','ACTIVE',ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($2),4326))::geography)", [zone,await readFile('docs/configuration/kenya-boundary.geojson','utf8')]);
  await riderRepository.assignZones(profile.id,[zone]);
  try {
    const online = await riderService.goOnline(uid,gps);
    assert.equal(online.workStatus,'ONLINE_AVAILABLE');
    assert.equal((await riderRepository.getActiveSession(profile.id))?.startZoneId,zone);
    const repeat = await riderService.goOnline(uid,gps);
    assert.equal(repeat.session.id,online.session.id);
  } finally {
    await riderService.goOffline(uid);
  }
  assert.equal((await riderRepository.findProfileById(profile.id))?.workStatus,'OFFLINE');
  assert.equal(await riderRepository.getActiveSession(profile.id),null);
});

test('durable recovery delivers only after token commit, hides secrets, and consumes reset once',async()=>{
  const previousFetch=globalThis.fetch;
  const names=['RESEND_API_KEY','AUTH_EMAIL_FROM'];const old=names.map(k=>process.env[k]);
  process.env.RESEND_API_KEY='contract-only-key';process.env.AUTH_EMAIL_FROM='Deetoo <no-reply@example.test>';
  const customer=await authService.registerCustomer({name:'Recovery',email:`${randomUUID()}@example.test`,password:'Recovery-old-password-928!'});
  let token='';let deliveries=0;
  try {
    globalThis.fetch=async(url,options)=>{
      assert.equal(String(url),'https://api.resend.com/emails');
      const body=JSON.parse(String(options?.body));assert.deepEqual(body.to,[customer.user.email]);
      token=body.text.match(/token is ([a-f0-9]+)\./i)?.[1]||body.text.match(/token is (\S+)\./)?.[1];assert(token);
      const {hashToken}=await import('@deetoo/auth');
      // A separate connection must see the token before the provider accepts delivery.
      const {outsideTransaction}=await import('../../apps/api/src/db/transaction');
      assert.equal((await outsideTransaction(()=>getDbPool().query('SELECT id FROM password_reset_tokens WHERE token_hash=$1',[hashToken(token)]))).rowCount,1);
      deliveries++;return new Response(JSON.stringify({id:'email-contract-id'}),{status:200});
    };
    const response=await authService.requestPasswordReset(customer.user.email!);
    assert(!JSON.stringify(response).includes(token));assert(!('dev_token' in response));assert.equal(deliveries,1);
    const unknown=await authService.requestPasswordReset(`${randomUUID()}@example.test`);assert.deepEqual(unknown,response);assert.equal(deliveries,1);
    const results=await Promise.allSettled([authService.resetPassword(token,'Recovery-new-password-932!'),authService.resetPassword(token,'Recovery-new-password-932!')]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code,'INVALID_RESET_TOKEN');
    assert((await authRepository.listUserSessions(customer.user.id)).every(s=>s.revoked_at));
    globalThis.fetch=async()=>new Response('provider refusal',{status:500});
    await assert.rejects(authService.requestPasswordReset(customer.user.email!),{code:'IDENTITY_DELIVERY_UNCONFIRMED'});
    delete process.env.RESEND_API_KEY;
    await assert.rejects(authService.requestPasswordReset(customer.user.email!),{code:'BLOCKED_BY_CONFIGURATION'});
  } finally {globalThis.fetch=previousFetch;names.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});

test('durable phone OTP is random, failure-limited under concurrency, persisted and non-replayable',async()=>{
 const previousFetch=globalThis.fetch;
 const names=['AFRICASTALKING_API_KEY','AFRICASTALKING_USERNAME','AUTH_SMS_FROM'];const old=names.map(k=>process.env[k]);
 process.env.AFRICASTALKING_API_KEY='contract-only-key';process.env.AFRICASTALKING_USERNAME='contract';process.env.AUTH_SMS_FROM='DEETOO';
 const phone='+2547'+String(Math.floor(Math.random()*1e8)).padStart(8,'0');
 const customer=await authService.registerCustomer({name:'Phone recovery',phone_e164:phone,password:'Phone-test-password-391!'});
 let code='';
 try {
  globalThis.fetch=async(url,options)=>{
   assert.equal(String(url),'https://api.africastalking.com/version1/messaging');
   const body=new URLSearchParams(String(options?.body));assert.equal(body.get('to'),phone);code=body.get('message')!.match(/code is (\d{6})/)![1];
   return new Response(JSON.stringify({SMSMessageData:{Recipients:[{statusCode:101,messageId:'sms-contract-id'}]}}),{status:201});
  };
  const result=await authService.requestOtp(phone);assert(!('dev_otp' in result));assert.match(code,/^\d{6}$/);
  const wrong=code==='000000'?'111111':'000000';
  const outcomes=await Promise.allSettled(Array.from({length:8},()=>authService.confirmOtp(phone,wrong)));
  assert(outcomes.every(r=>r.status==='rejected'));
  const record=await authRepository.getLatestVerificationToken(customer.user.id,'PHONE_VERIFICATION');assert.equal(record?.attempts,5);
  await assert.rejects(authService.confirmOtp(phone,code),{code:'TOO_MANY_ATTEMPTS'});
  await authService.requestOtp(phone);
  assert.equal((await authService.confirmOtp(phone,code)).verified,true);
  await closeDbPool();assert.ok((await authRepository.findUserById(customer.user.id))?.phone_verified_at);
  await assert.rejects(authService.confirmOtp(phone,code),{code:'INVALID_OTP'});
  await assert.rejects(authService.requestOtp(phone,'LOGIN'),{code:'UNSUPPORTED_OTP_PURPOSE'});
  globalThis.fetch=async()=>new Response(JSON.stringify({SMSMessageData:{Recipients:[{statusCode:401,messageId:''}]}}),{status:201});
  await assert.rejects(authService.requestOtp(phone),{code:'IDENTITY_DELIVERY_UNCONFIRMED'});
 } finally {globalThis.fetch=previousFetch;names.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});


test('Phase 2 native fulfilment records survive PostgreSQL reconnect and notification leases recover', async () => {
  const { deviceRegistrationRepository } = await import('../../apps/api/src/modules/operations/device-registration.repository');
  const { operationsRepository } = await import('../../apps/api/src/modules/operations/operations.repository');

  const userId = randomUUID();
  const now = new Date().toISOString();
  await authRepository.createUser({
    id: userId,
    email: `phase2-${userId}@example.test`,
    phone_e164: null,
    password_hash: 'unused',
    status: UserStatus.ACTIVE,
  });
  await authRepository.setUserRoles(userId, [UserRole.RIDER]);

  const pushToken = `phase2-fcm-${randomUUID()}-012345678901234567890123456789`;
  const registration = await deviceRegistrationRepository.upsert({
    userId,
    recipientType: 'RIDER',
    platform: 'ANDROID',
    pushToken,
    deviceId: `android-${randomUUID()}`,
    appVersion: '0.2.0',
  });
  assert.equal(registration.active, true);

  const notificationId = randomUUID();
  await operationsRepository.createNotification({
    id: notificationId,
    recipient_type: 'RIDER',
    recipient_id: userId,
    channel: 'PUSH',
    template_code: 'RIDER_NEW_OFFER',
    status: 'PENDING',
    subject: 'Delivery offer',
    payload: { offerId: randomUUID() },
    provider: 'FCM',
    retry_count: 0,
    max_retries: 3,
    idempotency_key: `phase2-foundation-${notificationId}`,
    created_at: now,
  } as any);

  await closeDbPool();

  const tokens = await deviceRegistrationRepository.listActiveTokens(userId);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].push_token, pushToken);

  const firstClaim = await operationsRepository.claimPendingNotifications(10);
  assert.ok(firstClaim.some((record) => record.id === notificationId));

  const immediateSecondClaim = await operationsRepository.claimPendingNotifications(10);
  assert.equal(immediateSecondClaim.some((record) => record.id === notificationId), false);

  await getDbPool().query(
    "UPDATE notifications SET status='QUEUED', scheduled_at=NOW()-INTERVAL '1 second' WHERE id=$1",
    [notificationId],
  );
  await closeDbPool();

  const recovered = await operationsRepository.claimPendingNotifications(10);
  assert.ok(recovered.some((record) => record.id === notificationId));

  await deviceRegistrationRepository.deactivate(userId, pushToken);
  await closeDbPool();
  assert.equal((await deviceRegistrationRepository.listActiveTokens(userId)).length, 0);
});
