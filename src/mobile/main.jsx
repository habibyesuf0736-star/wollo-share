import React from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "./mobile.css";
import { AppProvider } from "../store/AppContext.jsx";
import MobileApp from "./MobileApp.jsx";

// Tells the shared store this is the phone surface, so it skips the website's SEO title
// and the administrator's chosen web font.
window.__WS_MOBILE__ = true;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppProvider>
      <MobileApp />
    </AppProvider>
  </React.StrictMode>
);
