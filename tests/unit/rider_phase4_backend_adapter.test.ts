import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRiderBackend, parseWithdrawalKes, parseRiderServerError,
  safeRiderDeliveryAction, toKes,
} from '../../apps/rider-android/src/connected/rider-backend';

test('KES minor units are never treated as major currency', () => {
  assert.equal(toKes(10000), 'KSh 100.00');
  assert.equal(toKes(null), 'KSh —');
  assert.equal(toKes(125075), 'KSh 1,250.75');
  assert.equal(parseWithdrawalKes('100'), 10000);
  assert.equal(parseWithdrawalKes('100.05'), 10005);
  assert.equal(parseWithdrawalKes('0.99'), null);
  assert.equal(parseWithdrawalKes('999999999'), null);
  assert.equal(parseWithdrawalKes('abc'), null);
});

test('Invalid client delivery stage skips remain blocked even before server validation', () => {
  assert.equal(safeRiderDeliveryAction('ASSIGNED','pickup'), false);
  assert.equal(safeRiderDeliveryAction('ASSIGNED','arrivePickup'), true);
  assert.equal(safeRiderDeliveryAction('ARRIVED_PICKUP','pickup'), true);
  assert.equal(safeRiderDeliveryAction('PICKED_UP','complete'), false);
  assert.equal(safeRiderDeliveryAction('EN_ROUTE','arriveDropoff'), true);
  assert.equal(safeRiderDeliveryAction('ARRIVED_DROPOFF','complete'), true);
  assert.equal(safeRiderDeliveryAction('DELIVERED','complete'), false);
  assert.equal(safeRiderDeliveryAction('FAILED','fail'), false);
});

test('Adapter only invokes participant-scoped routes, keeps minor units and idempotency', async () => {
  const calls: Array<{path:string;method:string;body:any}>=[];
  const mockClient={
    async request<T>(path:string,options?:any):Promise<{data:T}> {
      const body=options?.body?JSON.parse(options.body):undefined;
      calls.push({path,method:options?.method||'GET',body});
      return {data: (path.includes('history')?{history:[]}:path.includes('payout-requests')?{requests:[]}: {}) as T};
    },
  };
  const api=createRiderBackend(mockClient as any);
  await api.requestWithdrawal(25000,'rider-unique-12345');
  await api.createSupportCase({category:'PAYMENT',subject:'Cash review',description:'Cash discrepancy from an order'});
  await api.createIncident({type:'ACCIDENT',summary:'Minor traffic incident',details:'I had a minor traffic incident near the road',location_text:'Westlands'});
  await api.confirmPickup('123e4567-e89b-12d3-a456-426614174000','merchant-code');
  await api.respondSupport('case-id','DISPUTED','Please investigate');
  await api.changeRequest('PAYOUT_DESTINATION','Please review my new mobile wallet number.');
  assert.equal(calls[0].body.amount_minor,25000);
  assert.equal(calls[0].body.idempotency_key,'rider-unique-12345');
  assert.ok(calls.every(c=>!c.path.startsWith('/finance/')&&!c.path.startsWith('/admin/')&&!c.path.includes('finalize')));
  assert.equal(calls[3].body.pickup_verification_code,'merchant-code');
  assert.equal(calls[4].body.decision,'DISPUTED');
  assert.equal(calls[5].body.category,'PAYOUT_DESTINATION');
});
test('Backend error text is exposed without leaking fixture success',()=>{
  assert.equal(parseRiderServerError({error:{message:'Account pending review'}}),'Account pending review');
  assert.match(parseRiderServerError(null),/Check your connection/);
});
