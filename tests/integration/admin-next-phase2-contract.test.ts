import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from '../../apps/api/src/app';
import {adminNextOperationsRouter} from '../../apps/api/src/modules/admin/admin-next-operations.router';
import {adminNextIntelligenceRouter} from '../../apps/api/src/modules/admin/admin-next-intelligence.router';
import {adminFinanceReviewRouter} from '../../apps/api/src/modules/finance/admin-finance-review.router';
import {adminNextControlRouter} from '../../apps/api/src/modules/admin/admin-next-control.router';
import {adminNextSecurityRouter,adminNextActivationRouter} from '../../apps/api/src/modules/admin/admin-next-security.router';
import {adminNextConsentRouter} from '../../apps/api/src/modules/admin/admin-next-consent.router';
import {closeTestResources} from '../helpers/marketplace';

type Route={method:string;path:string};
function routes(router:any):Route[]{
 return router.stack.flatMap((layer:any)=>layer.route?Object.keys(layer.route.methods).map(method=>({method:method.toUpperCase(),path:layer.route.path})):[]);
}
test('Admin Next Phase 2: registered contract contains review and guard rails, never mark-paid or MFA boolean toggle',()=>{
 const f=routes(adminFinanceReviewRouter),o=routes(adminNextOperationsRouter),i=routes(adminNextIntelligenceRouter),c=routes(adminNextControlRouter),security=routes(adminNextSecurityRouter),consent=routes(adminNextConsentRouter);
 assert.deepEqual(f.map(x=>x.path).sort(),['/refunds/:id/reject','/settlements/:id/reject','/payouts/:id/reject','/reconciliation/exceptions/:id/resolve'].sort());
 assert.equal(o.some(x=>x.path==='/operations/incidents'&&x.method==='POST'),true);
 assert.equal(o.some(x=>x.path==='/security/sessions/:id/revoke'),true);
 assert.equal(o.some(x=>x.path==='/customers/import/validate'),true);
 assert.equal(i.some(x=>x.path==='/communications/campaigns/:id/approve'),true);
 assert.equal(i.some(x=>x.path==='/communications/campaigns/:id/send'),true);
 assert.equal(i.some(x=>/mfa.*enable|mark.*paid/i.test(x.path)),false);
 assert.equal(c.some(x=>x.path==='/configuration/kill-switches/:key'&&x.method==='PATCH'),true);
 assert.equal(c.some(x=>x.path==='/geography/counties/:code/impact'),true);
 assert.equal(security.some(x=>x.path==='/security/mfa-reset-requests/:id/approve'),true);
 assert.equal(security.some(x=>x.path==='/security/invitations'),true);
 assert.equal(consent.some(x=>x.path==='/broadcast-consent'&&x.method==='PUT'),true);
 assert.equal(routes(adminNextActivationRouter).some(x=>x.path==='/invitations/activate'),true);
});
test('Admin Next Phase 2: anonymous access is denied for every new endpoint, including exports and finance',async()=>{
 const server=http.createServer(createApp());
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const host='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/v1';
 const id='00000000-0000-4000-8000-000000000001';
 try{
  const definitions=[
   ...routes(adminNextOperationsRouter).map(r=>({...r,prefix:'/admin'})),
   ...routes(adminNextIntelligenceRouter).map(r=>({...r,prefix:'/admin'})),
   ...routes(adminNextControlRouter).map(r=>({...r,prefix:'/admin'})),
   ...routes(adminNextSecurityRouter).map(r=>({...r,prefix:'/admin'})),
   ...routes(adminNextConsentRouter).map(r=>({...r,prefix:'/auth'})),
   ...routes(adminFinanceReviewRouter).map(r=>({...r,prefix:'/finance/ops'}))
  ];
  for(const r of definitions){
   const path=(r.prefix+r.path).replace(/:(?:type)/g,'INCIDENT').replace(/:(?:key)/g,'auto_dispatch_paused').replace(/:(?:code)/g,'047').replace(/:[A-Za-z]+/g,id);
   const response=await fetch(host+path,{method:r.method,headers:{'Content-Type':'application/json'},...(r.method==='GET'?{}:{body:'{}'})});
   assert.equal(response.status,401,r.method+' '+path+' must require a session');
  }
 }finally{
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await closeTestResources();
 }
});
