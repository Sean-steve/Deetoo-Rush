import {test} from "node:test";
import assert from "node:assert/strict";
import {resolveCustomerRuntime} from "../../apps/customer-web-next/src/integration/mode";

const sha="9".repeat(40);
test("customer default remains approved preview in all environments",()=>{
 for(const dev of [true,false])assert.equal(resolveCustomerRuntime({dev}),"preview");
});
test("developer connected mode remains explicit and opt-in",()=>{
 assert.equal(resolveCustomerRuntime({dev:true,intent:"connected"}),"connected");
 assert.equal(resolveCustomerRuntime({dev:true,intent:"preview"}),"preview");
});
test("staging cannot enable connected release without explicit deployment approval",()=>{
 assert.equal(resolveCustomerRuntime({dev:false,intent:"connected",channel:"staging"}),"preview");
 assert.equal(resolveCustomerRuntime({dev:false,intent:"connected",channel:"staging",approved:"true"}),"connected");
});
test("production requires SHA-bound certification and explicit approval",()=>{
 const base={dev:false,intent:"connected",channel:"production",approved:"true"};
 assert.equal(resolveCustomerRuntime({...base,sourceSha:sha}),"preview");
 assert.equal(resolveCustomerRuntime({...base,sourceSha:sha,certificateSha:"8".repeat(40)}),"preview");
 assert.equal(resolveCustomerRuntime({...base,sourceSha:"not-a-commit",certificateSha:"not-a-commit"}),"preview");
 assert.equal(resolveCustomerRuntime({...base,sourceSha:sha,certificateSha:sha}),"connected");
});
test("untrusted target channel and accidental flags never enable production",()=>{
 assert.equal(resolveCustomerRuntime({dev:false,intent:"connected",channel:"preview",approved:"true",sourceSha:sha,certificateSha:sha}),"preview");
 assert.equal(resolveCustomerRuntime({dev:false,intent:"connected",channel:"production",approved:"false",sourceSha:sha,certificateSha:sha}),"preview");
});
