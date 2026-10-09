import { normalizeUXError } from "../../../packages/ui/src/errors";

export type MerchantBranchError = {
  kind: "membership" | "access" | "temporary";
  title: string;
  message: string;
  referenceId?: string;
  code?: string;
};

/** DeeToo's API client rejects {error:{code,message,request_id}}, not Error instances. */
export function merchantErrorMessage(error: unknown): string {
  return normalizeUXError(error).message;
}

/** Do not confuse an unassigned account with a temporary server outage. */
export function normalizeMerchantBranchError(error: unknown): MerchantBranchError {
  const normalized = normalizeUXError(error);
  if (normalized.code === "NO_MERCHANT_MEMBERSHIP") {
    return {
      kind: "membership",
      title: "Merchant organization access required",
      message: "Your sign-in succeeded, but this account has no active Merchant organization membership. Ask your merchant owner or a DeeToo administrator to link or activate your membership. Branch access cannot be granted from this screen.",
      referenceId: normalized.referenceId,
      code: normalized.code
    };
  }
  if (["ACCESS_DENIED", "FORBIDDEN_SCOPE", "FORBIDDEN"].includes(normalized.code || "") ||
      normalized.kind === "permission") {
    return {
      kind: "access",
      title: "Branch access denied",
      message: "You are signed in, but this account is not authorized to access these branches. Ask your merchant owner or a DeeToo administrator to check the assigned merchant and branch permissions.",
      referenceId: normalized.referenceId,
      code: normalized.code
    };
  }
  return {
    kind: "temporary",
    title: "Unable to load branches",
    message: normalized.message,
    referenceId: normalized.referenceId,
    code: normalized.code
  };
}
