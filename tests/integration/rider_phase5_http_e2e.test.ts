/**
 * Phase 5: exercised HTTP contracts against the real Express application and
 * deterministic memory fixture identities. These tests do not certify FCM,
 * external maps, camera hardware, actual M-PESA or a deployed database.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../apps/api/src/app';
import { login, closeTestResources } from '../helpers/marketplace';
import { createRiderBackend } from '../../apps/rider-android/src/connected/rider-backend';

let server: Server;
let base = '';
const tokens: Record<string,string> = {};
async function request(role: string, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(base+'/api/v1'+path, {
    method,
    headers: { authorization: 'Bearer '+tokens[role], 'content-type':'application/json' },
    ...(method !== 'GET' ? {body:JSON.stringify(body??{})} : {}),
  });
  return { status: response.status, body: await response.json() as any };
}
async function must(role:string,path:string,status:number,method='GET',body?:unknown) {
  const response = await request(role,path,method,body);
  assert.equal(response.status,status,method+' '+path+' '+JSON.stringify(response.body));
  return response.body.data as any;
}
before(async()=>{
  server=createServer(createApp());
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  base='http://127.0.0.1:'+(server.address() as {port:number}).port;
  for (const role of ['rider','customer','merchant','admin']) tokens[role]=await login(base,role);
});
after(async()=>{
  if(server){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  await closeTestResources();
});

test('Phase 5: connected Rider adapter reads the real server, never privileged Admin/Finance routes', async()=>{
  const calls:string[]=[];
  const scoped={
    async request<T>(path:string, opts?:{method?:string;body?:string}):Promise<{data:T}>{
      calls.push(path);
      const r=await request('rider',path,opts?.method||'GET',opts?.body?JSON.parse(opts.body):undefined);
      if(r.status>=400)throw new Error(r.body.error?.message||'HTTP '+r.status);
      return {data:r.body.data as T};
    },
  };
  const api=createRiderBackend(scoped as any);
  const status=await api.status();
  assert.ok(status.profile?.id);
  const caps=await api.capabilities();
  assert.deepEqual(caps.multi_order.enabled,false,'No uncertified stacked orders');
  assert.equal(caps.multi_order.max_active_deliveries,1);
  const history=await api.history();
  assert.ok(Array.isArray(history.history));
  const pref=await api.preferences();
  assert.equal(pref.critical?.delivery,true);
  assert.equal(pref.critical?.account,true);
  assert.equal(pref.critical?.safety,true);
  const verification=await api.verification();
  assert.ok(typeof verification.ready==='boolean');
  const trends=await api.earningsTrends(7);
  assert.equal(trends.currency,'KES');
  assert.ok(Array.isArray(trends.series));
  const wallet=await api.wallet();
  assert.equal(wallet.currency,'KES');
  assert.ok(calls.every(p=>!p.startsWith('/admin/')&&!p.startsWith('/finance/')),JSON.stringify(calls));
});

test('Phase 5: all Rider-only Phase 3 routes reject another role before reading private data',async()=>{
  const paths=[
    '/rider/deliveries/capabilities',
    '/rider/deliveries/history',
    '/rider/verification/checklist',
    '/rider/incidents',
    '/rider/earnings/trends?days=7',
    '/rider/performance/feedback',
    '/rider/preferences',
    '/rider/payout-requests',
  ];
  for (const path of paths) {
    for (const role of ['customer','merchant','admin']) {
      const result=await request(role,path);
      assert.equal(result.status,403,role+' must not access '+path+' '+JSON.stringify(result.body));
    }
  }
});

test('Phase 5: Rider cannot forge Admin incident, resolve cases or Finance withdrawals',async()=>{
  for (const path of ['/admin/operations/incidents','/finance/payouts','/finance/rider-withdrawal-requests']) {
    const r=await request('rider',path);
    assert.ok([403,404].includes(r.status),'Rider should have no Admin/Finance access: '+path+' '+r.status);
  }
  const r=await request('rider','/operations/incidents');
  assert.ok([403,404].includes(r.status),'No staff incident investigation reads');
});

test('Phase 5: Rider support case lifecycle retains messages and rejects a foreign order association',async()=>{
  const foreign=await request('rider','/support/cases','POST',{
    category:'DELIVERY',subject:'Foreign order attempt',description:'Attempting to link an unrelated order',
    order_id:'invalid-foreign-order-'+randomUUID(),
  });
  assert.ok([403,404].includes(foreign.status),'Unowned order must not create a support case: '+JSON.stringify(foreign.body));
  const created=await must('rider','/support/cases',201,'POST',{
    category:'DELIVERY',subject:'Rider support end-to-end',description:'I need assistance with a sample delivery workflow.',
  });
  assert.ok(created.id);
  const detail=await must('rider','/support/cases/'+encodeURIComponent(created.id),200);
  assert.equal(detail.case.id,created.id);
  const old=detail.notes.length;
  await must('rider','/support/cases/'+created.id+'/messages',201,'POST',{body:'Following up on my Rider delivery case'});
  const afterMessage=await must('rider','/support/cases/'+created.id,200);
  assert.equal(afterMessage.notes.length,old+1);
  assert.match(afterMessage.notes.at(-1).body,/Following up/);
  const outsider=await request('customer','/support/cases/'+created.id);
  assert.equal(outsider.status,403,'Foreign participant must not read messages');
  // A rider has no /support/cases/:id/finalize path in the participant router.
  const denied=await request('rider','/support/cases/'+created.id+'/finalize','POST',{});
  assert.ok([403,404,405].includes(denied.status));
  assert.notEqual((await must('rider','/support/cases/'+created.id,200)).case.status,'RESOLVED');
});

test('Phase 5: no fake payout is permitted in memory mode, without durable ledger data',async()=>{
  const unavailable=await request('rider','/rider/payout-requests');
  assert.equal(unavailable.status,503,'Money-out request history requires a durable ledger');
  const attempted=await request('rider','/rider/payout-requests','POST',{
    amount_minor:10000,idempotency_key:'phase5-'+randomUUID(),
  });
  assert.equal(attempted.status,503,'Must fail closed; never fabricate a payout request');
});

test('Phase 5: unsafe/missing incident inputs are rejected and Rider cannot force incident resolution',async()=>{
  const invalid=await request('rider','/rider/incidents','POST',{type:'INVALID',summary:'Unsafe',details:'short',location_text:'X',status:'RESOLVED'});
  assert.equal(invalid.status,400,'Unknown incident types / forged admin status must fail schema validation');
  const user=await request('rider','/rider/incidents');
  assert.equal(user.status,200,'Rider may view only Rider-scoped incident history');
  assert.ok(Array.isArray(user.body.data.incidents));
  const outsider=await request('customer','/rider/incidents','POST',{
    type:'ACCIDENT',summary:'Traffic accident',details:'This is not an authorized rider',location_text:'Nairobi',
  });
  assert.equal(outsider.status,403);
});
