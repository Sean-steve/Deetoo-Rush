import assert from "node:assert/strict";
import test from "node:test";
import { merchantErrorMessage, normalizeMerchantBranchError } from "../../apps/merchant-web/src/merchant-branch-errors";

test("Merchant API errors show their message instead of [object Object]", () => {
  const error={error:{code:"BRANCH_UNAVAILABLE",message:"Branch catalogue is unavailable",request_id:"req_mer_100"}};
  assert.equal(merchantErrorMessage(error),"Branch catalogue is unavailable");
  const issue=normalizeMerchantBranchError(error);
  assert.equal(issue.message,"Branch catalogue is unavailable");
  assert.equal(issue.referenceId,"req_mer_100");
  assert.equal(issue.kind,"temporary");
  assert.doesNotMatch(issue.message,/\[object Object\]/);
});

test("Unassigned merchant is shown an actionable, non-escalating access message",()=>{
  const issue=normalizeMerchantBranchError({error:{code:"NO_MERCHANT_MEMBERSHIP",message:"User is not associated with any merchant organization",request_id:"req_mer_101"}});
  assert.equal(issue.kind,"membership");
  assert.match(issue.message,/active Merchant organization membership/);
  assert.equal(issue.referenceId,"req_mer_101");
});

test("Merchant scope violations never auto-provision access",()=>{
  const issue=normalizeMerchantBranchError({error:{code:"FORBIDDEN_SCOPE",message:"Access denied to this resource"}});
  assert.equal(issue.kind,"access");
  assert.match(issue.message,/not authorized/);
});

test("Merchant durable storage failure remains a retryable-looking generic server message",()=>{
  const issue=normalizeMerchantBranchError({error:{code:"DURABLE_STORAGE_REQUIRED",message:"Postgres internals are unavailable",request_id:"req_mer_102"}});
  assert.equal(issue.kind,"temporary");
  assert.doesNotMatch(issue.message,/Postgres internals/);
  assert.equal(issue.referenceId,"req_mer_102");
});

test("Merchant schema migration errors show actionable diagnostics without raw SQL",()=>{
  const issue=normalizeMerchantBranchError({error:{code:"MERCHANT_SCHEMA_MIGRATION_REQUIRED",message:"Merchant database schema needs migration 035.",request_id:"req_schema_035"}});
  assert.equal(issue.title,"Merchant database upgrade required");
  assert.equal(issue.kind,"temporary");
  assert.match(issue.message,/pnpm db:migrate/);
  assert.equal(issue.referenceId,"req_schema_035");
  assert.doesNotMatch(issue.message,/relation .+ does not exist/);
});

test("Unexpected thrown Error and network failures render legibly",()=>{
  const msg=merchantErrorMessage(new Error("Merchant service returned an invalid response"));
  assert.match(msg,/invalid response/);
  assert.doesNotMatch(msg,/\[object Object\]/);
  const network=normalizeMerchantBranchError(new TypeError("Failed to fetch"));
  assert.equal(network.kind,"temporary");
  assert.match(network.message,/connection/i);
});
