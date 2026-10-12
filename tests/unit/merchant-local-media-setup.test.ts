import { test } from "node:test";
import assert from "node:assert/strict";
import {localMediaSettings} from "../../scripts/media-setup-local";

const local={
 APP_ENV:"development",
 OBJECT_STORAGE_BUCKET:"deetoo-local-private",
 OBJECT_STORAGE_REGION:"us-east-1",
 OBJECT_STORAGE_ENDPOINT:"http://127.0.0.1:9000",
 OBJECT_STORAGE_ACCESS_KEY_ID:"deetoo_local",
 OBJECT_STORAGE_SECRET_ACCESS_KEY:"local_password_not_for_prod",
};

test("local media setup reads exactly the credentials and endpoint used by DeeToo API",()=>{
 const cfg=localMediaSettings(local);
 assert.equal(cfg.bucket,local.OBJECT_STORAGE_BUCKET);
 assert.equal(cfg.endpoint,local.OBJECT_STORAGE_ENDPOINT);
 assert.equal(cfg.region,"us-east-1");
 assert.equal(cfg.credentials.accessKeyId,local.OBJECT_STORAGE_ACCESS_KEY_ID);
});

test("local media setup refuses remote endpoints and production credentials",()=>{
 for(const endpoint of ["https://127.0.0.1:9000","http://1.2.3.4:9000","http://127.0.0.1.evil.test:9000","http://user:pass@localhost:9000","http://localhost:9000/path","http://localhost:9000?key=value"]){
  assert.throws(()=>localMediaSettings({...local,OBJECT_STORAGE_ENDPOINT:endpoint}),/loopback endpoint/);
 }
 assert.throws(()=>localMediaSettings({...local,APP_ENV:"production"}),/development/);
 assert.throws(()=>localMediaSettings({...local,NODE_ENV:"production"}),/development/);
 assert.throws(()=>localMediaSettings({...local,OBJECT_STORAGE_SECRET_ACCESS_KEY:"short"}),/at least 8/);
 assert.throws(()=>localMediaSettings({...local,OBJECT_STORAGE_BUCKET:"UNSAFE"}),/lowercase/);
});
