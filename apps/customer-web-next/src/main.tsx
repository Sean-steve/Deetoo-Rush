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
// Use the same scoped visual-fidelity layer in connected harness and canonical Customer.
import "./integration/live-fidelity.css";

// Fail closed: production deploys cannot activate partially integrated screens.
const connected = import.meta.env.DEV
  ? resolveCustomerRuntime({dev:true,intent:import.meta.env.VITE_CUSTOMER_NEXT_BACKEND_MODE})==="connected"
  : __DEETOO_CUSTOMER_RELEASE_CONNECTED__;

createRoot(document.getElementById("root")!).render(
  <StrictMode>{connected ? <ConnectedCustomerShopping /> : <App />}</StrictMode>
);
