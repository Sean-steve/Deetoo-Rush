/** Approved 15-screen preview remains default and always available for rollback. */
export type CustomerBackendMode = "preview" | "connected";
export type CustomerReleaseChannel = "staging" | "production" | "none";
export function resolveCustomerBackendMode(value: string | undefined): CustomerBackendMode {
  return value === "connected" ? "connected" : "preview";
}
/**
 * An explicit build-time operational gate, NOT an authorization mechanism:
 * authorization, payment and customer isolation remain in the API.
 * Production deploy tooling must additionally verify the external staging
 * certificate and approval before setting these variables.
 */
export function resolveCustomerRuntime(args: {
  dev: boolean;
  intent?: string;
  channel?: string;
  approved?: string;
  certificateSha?: string;
  sourceSha?: string;
}): CustomerBackendMode {
  if (args.intent !== "connected") return "preview";
  if (args.dev) return "connected";
  if (args.approved !== "true") return "preview";
  if (args.channel === "staging") return "connected";
  if (args.channel === "production" &&
      /^[a-f0-9]{40}$/.test(args.sourceSha || "") &&
      args.certificateSha === args.sourceSha) return "connected";
  return "preview";
}
export const CONNECTED_MODE_WARNING =
  "All customer API calls require DeeToo authentication and verified staging/payment approval before production cutover.";
