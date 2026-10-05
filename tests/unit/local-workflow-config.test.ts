import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('local workflow is opt-in and forbidden for deployed, remote or fixture storage',()=>{
 const run=(env:Record<string,string>)=>spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',"import { config } from './packages/config/src/index.ts'; console.log(config.localWorkflow)"],{env:{...process.env,APP_ENV:'test',NODE_ENV:'test',DEETOO_FIXTURES:'false',DEETOO_STORAGE_MODE:'postgres',DATABASE_URL:'postgres://test:test@127.0.0.1/local_test',DEETOO_LOCAL_WORKFLOW:'false',...env},encoding:'utf8',timeout:15000});
 assert.equal(run({}).stdout.trim(),'false');
 assert.equal(run({DEETOO_LOCAL_WORKFLOW:'true'}).stdout.trim(),'true');
 for(const env of [{APP_ENV:'production'},{APP_ENV:'staging'},{NODE_ENV:'production'},{DATABASE_URL:'postgres://test:test@remote.invalid/db'},{DEETOO_STORAGE_MODE:'memory'}]){
   const r=run({DEETOO_LOCAL_WORKFLOW:'true',...env});assert.notEqual(r.status,0);assert.match(r.stderr,/Local workflow/);
 }
});
