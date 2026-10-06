export type UXErrorKind =
  | "validation"
  | "permission"
  | "business_rule"
  | "temporary"
  | "network"
  | "internal";

export interface UXError {
  kind: UXErrorKind;
  title: string;
  message: string;
  retryable: boolean;
  referenceId?: string;
  code?: string;
}

const INTERNAL_CODES = new Set([
  "DURABLE_STORAGE_REQUIRED",
  "INTERNAL_ERROR",
  "DATABASE_ERROR",
  "UNKNOWN_ERROR",
]);

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/**
 * Convert API/client failures into a safe user-facing error contract.
 * Technical codes remain available for logs/reference, but are not used as the
 * primary message for internal failures.
 */
export function normalizeUXError(error: any): UXError {
  const status = Number(error?.status || error?.error?.status || 0);
  const code =
    stringValue(error?.error?.code) ||
    stringValue(error?.code) ||
    stringValue(error?.body?.error?.code);
  const requestId =
    stringValue(error?.requestId) ||
    stringValue(error?.request_id) ||
    stringValue(error?.error?.request_id) ||
    stringValue(error?.body?.meta?.request_id);
  const rawMessage =
    stringValue(error?.error?.message) ||
    stringValue(error?.message) ||
    stringValue(error?.body?.error?.message);

  if (INTERNAL_CODES.has(code || "")) {
    return {
      kind: "internal",
      title: "We could not complete that action",
      message:
        "Something went wrong inside DeeToo. Try again, and use the reference below if you contact support.",
      retryable: true,
      referenceId: requestId,
      code,
    };
  }

  if (
    status === 400 ||
    status === 422 ||
    /VALIDATION|INVALID|REQUIRED|MALFORMED/.test(code || "")
  ) {
    return {
      kind: "validation",
      title: "Check the information you entered",
      message: rawMessage || "Some information is missing or invalid. Review the highlighted fields and try again.",
      retryable: false,
      referenceId: requestId,
      code,
    };
  }

  if (status === 401 || status === 403 || /FORBIDDEN|UNAUTHORIZED|PERMISSION/.test(code || "")) {
    return {
      kind: "permission",
      title: status === 401 ? "Sign in required" : "You do not have access to this action",
      message:
        status === 401
          ? "Sign in again, then retry this action."
          : "Your current DeeToo role does not allow this action.",
      retryable: status === 401,
      referenceId: requestId,
      code,
    };
  }

  if (
    status === 409 ||
    /CONFLICT|NOT_ALLOWED|NOT_CANCELLABLE|STATE|BUSINESS_RULE/.test(code || "")
  ) {
    return {
      kind: "business_rule",
      title: "This action is not available right now",
      message: rawMessage || "The current order or account state does not allow this action.",
      retryable: false,
      referenceId: requestId,
      code,
    };
  }

  if (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return {
      kind: "temporary",
      title: "DeeToo is temporarily unavailable",
      message: "We could not complete the request. Your previous data is safe; try again.",
      retryable: true,
      referenceId: requestId,
      code,
    };
  }

  if (
    error?.name === "TypeError" &&
    /fetch|network|connection/i.test(rawMessage || "")
  ) {
    return {
      kind: "network",
      title: "Connection interrupted",
      message: "Check your connection and try again.",
      retryable: true,
      referenceId: requestId,
      code,
    };
  }

  if (status >= 500) {
    return {
      kind: "internal",
      title: "We could not complete that action",
      message: "Something went wrong inside DeeToo. Try again, and use the reference below if you contact support.",
      retryable: true,
      referenceId: requestId,
      code,
    };
  }

  return {
    kind: "temporary",
    title: "Unable to complete this request",
    message: rawMessage || "Please try again.",
    retryable: true,
    referenceId: requestId,
    code,
  };
}

export function uxErrorMessage(error: any): string {
  return normalizeUXError(error).message;
}
