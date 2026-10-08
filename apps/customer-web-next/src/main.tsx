import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./shopping.css";
import "./orders.css";
import "./account.css";
import "./support.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><App /></StrictMode>
);
