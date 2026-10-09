import assert from "node:assert/strict";
import test from "node:test";
import { isMissingMerchantPolicyTable } from "../../apps/api/src/db/merchant-schema-readiness";

test("only missing merchant policy relation triggers migration-required classification",()=>{
  assert.equal(isMissingMerchantPolicyTable({code:"42P01",message:'relation "merchant_branch_policies" does not exist'}),true);
  assert.equal(isMissingMerchantPolicyTable({code:"42P01",table:"merchant_branch_policies"}),true);
  assert.equal(isMissingMerchantPolicyTable({code:"42P01",message:'relation "orders" does not exist'}),false);
  assert.equal(isMissingMerchantPolicyTable({code:"42501",message:"permission denied for merchant_branch_policies"}),false);
  assert.equal(isMissingMerchantPolicyTable(new Error("Not found")),false);
});
