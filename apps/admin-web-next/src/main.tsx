import React from "react";
import {createRoot} from "react-dom/client";
import {AdminNext} from "./App";
import {CookieConsentManager} from "../../../packages/privacy/src/CookieConsentManager";
createRoot(document.getElementById("root")!).render(<React.StrictMode><AdminNext/><CookieConsentManager/></React.StrictMode>);
