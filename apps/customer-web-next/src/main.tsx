import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ConnectedCustomerShopping } from "./integration/ConnectedCustomerShopping";
import { resolveCustomerBackendMode } from "./integration/mode";
import "./integration/foundation.css";
import "./styles.css";
import "./shopping.css";
import "./orders.css";
import "./account.css";
import "./support.css";

// Fail closed: production deploys cannot activate partially integrated screens.
const connected = import.meta.env.DEV &&
  resolveCustomerBackendMode(import.meta.env.VITE_CUSTOMER_NEXT_BACKEND_MODE) === "connected";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{connected ? <ConnectedCustomerShopping /> : <App />}</StrictMode>
);
