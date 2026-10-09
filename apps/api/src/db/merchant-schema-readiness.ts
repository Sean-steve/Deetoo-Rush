/**
 * PostgreSQL's undefined_table code is 42P01. Catch only the exact merchant
 * policy table, leaving unrelated SQL and permissions errors untouched.
 */
export function isMissingMerchantPolicyTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown; table?: unknown };
  return candidate.code === "42P01" &&
    (candidate.table === "merchant_branch_policies" ||
      (typeof candidate.message === "string" && /\bmerchant_branch_policies\b/.test(candidate.message)));
}
