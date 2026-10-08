/** Phase B1: approved preview by default. Connected mode is a developer gate only. */
export type CustomerBackendMode = "preview" | "connected";
export function resolveCustomerBackendMode(value: string | undefined): CustomerBackendMode {
  return value === "connected" ? "connected" : "preview";
}
export const CONNECTED_MODE_WARNING =
  "Backend access is for development only. Customer screens are not yet mapped to live data.";
