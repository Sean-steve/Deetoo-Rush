import React, { useEffect, useState } from "react";
import { CustomerApp } from "../apps/customer/src/CustomerApp";
import { MerchantApp } from "../apps/merchant/src/MerchantApp";
import { RiderApp } from "../apps/rider/src/RiderApp";
import { AdminApp } from "../apps/admin/src/AdminApp";
import { OnlineNotice } from "../packages/ui/src/workflows";
const apps = {
  customer: CustomerApp,
  merchant: MerchantApp,
  rider: RiderApp,
  admin: AdminApp,
};
type AppName = keyof typeof apps;
const selectedApp = (): AppName => {
  const name = window.location.hash.slice(1).split("/")[0];
  return Object.hasOwn(apps, name) ? (name as AppName) : "customer";
};
export default function App() {
  const [localWorkflow, setLocalWorkflow] = useState(false);
  useEffect(() => { fetch("/health").then(r => r.json()).then(r => setLocalWorkflow(r.localWorkflow === true)).catch(() => {}); }, []);
  const [currentApp, setCurrentApp] = useState<AppName>(selectedApp);
  useEffect(() => {
    const update = () => setCurrentApp(selectedApp());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const Application = apps[currentApp];
  return (
    <div className={`deetoo-app deetoo-${currentApp}`}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="app-switcher" aria-label="Choose application">
        {Object.keys(apps).map((name) => (
          <a
            key={name}
            href={`#${name}`}
            aria-current={name === currentApp ? "page" : undefined}
          >
            {name === "admin" ? "Operations" : name}
          </a>
        ))}
      </div>
     
      <OnlineNotice />
      <div id="main-content" tabIndex={-1}>
        <Application />
      </div>
    </div>
  );
}
