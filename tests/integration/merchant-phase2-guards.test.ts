import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../../apps/api/src/app';
import { authRepository } from '../../apps/api/src/modules/auth/auth.repository';
import { signAccessToken } from '../../packages/auth/src/crypto';
import { UserRole, UserStatus } from '@deetoo/types';
import { closeTestResources } from '../helpers/marketplace';

let server:http.Server,base:string;
const tokens:Record<string,string>={};
before(async()=>{
 server=http.createServer(createApp());
 await new Promise<void>(resolve=>server.listen(0,resolve));
 base='http://127.0.0.1:'+(server.address() as any).port+'/api/v1';
 for(const role of ['customer','merchant_staff','merchant_owner','admin']){
  const userId=randomUUID(),sessionId=randomUUID();
  await authRepository.createUser({id:userId,email:userId+'@test.invalid',status:UserStatus.ACTIVE,password_hash:'fixture-not-a-password'});
  await authRepository.setUserRoles(userId,[role as UserRole]);
  await authRepository.createSession({id:sessionId,user_id:userId,refresh_token_hash:randomUUID(),
   expires_at:new Date(Date.now()+60*60*1000)});
  tokens[role]=signAccessToken({sub:userId,sessionId});
 }
});
after(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await closeTestResources();});
const request=(role:string|null,path:string,method='GET')=>fetch(base+path,{
 method,headers:role?{Authorization:'Bearer '+tokens[role]}:{}
});
test('new merchant capability routes never allow anonymous access',async()=>{
 for(const route of ['/merchant/experience/help/articles','/merchant/experience/orders/metrics',
 '/merchant/experience/branches/'+randomUUID()+'/inventory',
 '/merchant/inbox','/finance/merchant/experience/overview','/auth/security/trusted-devices']){
  assert.equal((await request(null,route)).status,401,route);
 }
});
test('new routes fail closed for customer and other unauthorized roles',async()=>{
 for(const route of ['/merchant/experience/help/articles','/merchant/experience/orders/history',
 '/merchant/experience/branches/'+randomUUID()+'/inventory','/merchant/inbox',
 '/finance/merchant/experience/overview']){
  assert.equal((await request('customer',route)).status,403,route);
 }
 for(const route of ['/finance/merchant/experience/transactions','/finance/merchant/experience/overview']){
  assert.equal((await request('merchant_staff',route)).status,403,route);
 }
 assert.equal((await request('merchant_staff','/admin/merchant-experience/documents')).status,403);
});
test('new PostgreSQL-only capabilities return explicit 503 in demo-memory mode instead of simulated writes',async()=>{
 for(const route of ['/merchant/experience/orders/history',
 '/merchant/experience/branches/'+randomUUID()+'/inventory',
 '/merchant/inbox']){
  assert.equal((await request('merchant_staff',route)).status,503,route);
 }
 assert.equal((await request('merchant_owner','/finance/merchant/experience/overview')).status,503);
 assert.equal((await request('customer','/auth/security/trusted-devices')).status,503);
});
