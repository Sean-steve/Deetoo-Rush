import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createApp} from '../../apps/api/src/app';
import {adminNextOperationsRouter} from '../../apps/api/src/modules/admin/admin-next-operations.router';
import {adminNextIntelligenceRouter} from '../../apps/api/src/modules/admin/admin-next-intelligence.router';
import {adminFinanceReviewRouter} from '../../apps/api/src/modules/finance/admin-finance-review.router';
import {closeTestResources} from '../helpers/marketplace';

type Route={method:string;path:string};
function routes(router:any):Route[]{
 return router.stack.flatMap((layer:any)=>layer.route?Object.keys(layer.route.methods).map(method=>({method:method.toUpperCase(),path:layer.route.path})):[]);
}
test('Admin Next Phase 2: registered contract contains review and guard rails, never mark-paid or MFA boolean toggle',()=>{
 const f=routes(adminFinanceReviewRouter),o=routes(adminNextOperationsRouter),i=routes(adminNextIntelligenceRouter);
 assert.deepEqual(f.map(x=>x.path).sort(),['/refunds/:id/reject','/settlements/:id/reject','/payouts/:id/reject','/reconciliation/exceptions/:id/resolve'].sort());
 assert.equal(o.some(x=>x.path==='/operations/incidents'&&x.method==='POST'),true);
 assert.equal(o.some(x=>x.path==='/security/sessions/:id/revoke'),true);
 assert.equal(o.some(x=>x.path==='/customers/import/validate'),true);
 assert.equal(i.some(x=>x.path==='/communications/campaigns/:id/approve'),true);
 assert.equal(i.some(x=>x.path==='/communications/campaigns/:id/send'),true);
 assert.equal(i.some(x=>/mfa.*enable|mark.*paid/i.test(x.path)),false);
});
test('Admin Next Phase 2: anonymous access is denied for every new endpoint, including exports and finance',async()=>{
 const server=http.createServer(createApp());
 await new Promise<void>(resolve=>server.listen(0,resolve));
 const host='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/v1';
 const id='00000000-0000-4000-8000-000000000001';
 try{
  const definitions:[
   ...routes(adminNextOperationsRouter).map(r=>({...r,prefix:'/admin'})),
   ...routes(adminNextIntelligenceRouter).map(r=>({...r,prefix:'/admin'})),
   ...routes(adminFinanceReviewRouter).map(r=>({...r,prefix:'/finance/ops'}))
  ];
  for(const r of definitions){
   const path=(r.prefix+r.path).replace(/:(?:type)/g,'INCIDENT').replace(/:[A-Za-z]+/g,id);
   const response=await fetch(host+path,{method:r.method,headers:{'Content-Type':'application/json'},...(r.method==='GET'?{}:{body:'{}'})});
   assert.equal(response.status,401,r.method+' '+path+' must require a session');
  }
 }finally{
  server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await closeTestResources();
 }
});
