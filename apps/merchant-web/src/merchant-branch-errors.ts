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
  const ux = normalizeUXError(error);
  const raw = typeof (error as any)?.error?.message === "string"
    ? (error as any).error.message
    : typeof (error as any)?.message === "string" ? (error as any).message : "";
  const code = ux.code || "";
  let message = ux.message;
  // Local databases created before the Merchant migrations need to be upgraded.
  // Never render SQL or JavaScript objects in the interface.
  if (code === "MERCHANT_SCHEMA_MIGRATION_REQUIRED" ||
      /relation ["']merchant_(?:notification_views|notification_preferences|branch_policies)["'] does not exist/i.test(raw)) {
    message = "Merchant database upgrade required. Run pnpm db:migrate against the database used by DeeToo API, then retry.";
  } else if (code === "PRIVATE_STORAGE_UNCONFIGURED") {
    message = "Image uploads require private object storage. Ask an operator to configure OBJECT_STORAGE_BUCKET, OBJECT_STORAGE_REGION and storage credentials, then retry. Your current image has not changed.";
  } else if (code === "MEDIA_PURPOSE_FORBIDDEN" || code === "MEDIA_ACCESS_DENIED") {
    message = "Your Merchant role does not permit this image change. Contact the merchant owner or manager.";
  } else if (code === "ACCESS_DENIED" || code === "FORBIDDEN_SCOPE") {
    message = "Your Merchant account is not authorized to change this resource. Contact the merchant owner or manager.";
  }
  return message + (ux.referenceId ? " · Support reference: " + ux.referenceId : "");
}

/** Do not confuse an unassigned account with a temporary server outage. */
export function normalizeMerchantBranchError(error: unknown): MerchantBranchError {
  const normalized = normalizeUXError(error);
  if (normalized.code === "MERCHANT_SCHEMA_MIGRATION_REQUIRED") {
    return {
      kind: "temporary",
      title: "Merchant database upgrade required",
      message: "Your Merchant account is connected, but the DeeToo database needs migration 035. An operator must run pnpm db:migrate against the database used by the API. Once the update succeeds, retry your branch connection.",
      referenceId: normalized.referenceId,
      code: normalized.code
    };
  }
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
