import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ConnectedCustomerShopping } from "./integration/ConnectedCustomerShopping";
import { resolveCustomerRuntime } from "./integration/mode";
import "./integration/foundation.css";
import "./integration/live-shopping.css";
import "./integration/live-orders.css";
import "./integration/live-account-support.css";
import "./styles.css";
import "./shopping.css";
import "./orders.css";
import "./account.css";
import "./support.css";

// Fail closed: production deploys cannot activate partially integrated screens.
const connected = import.meta.env.DEV
  ? resolveCustomerRuntime({dev:true,intent:import.meta.env.VITE_CUSTOMER_NEXT_BACKEND_MODE})==="connected"
  : __DEETOO_CUSTOMER_RELEASE_CONNECTED__;

// Design-only preview remains byte-for-byte styled by its five approved CSS files.
// Load the additional connected visual treatments only when rendering real adapters.
async function mountCustomerNext() {
  if (connected) await import("./integration/live-fidelity.css");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>{connected ? <ConnectedCustomerShopping /> : <App />}</StrictMode>
  );
}
void mountCustomerNext();
