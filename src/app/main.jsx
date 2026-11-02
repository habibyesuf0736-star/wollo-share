import React from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "../store/AppContext.jsx";
import AppShell from "./AppShell.jsx";
import "./app.css";

// The app surface borrows every guard the phone entry already sets on the store: no SEO
// rewrites, no website typography, no website accent written over the app's own.
window.__WS_MOBILE__ = true;
window.__WS_APP__ = true;

// Installed through Capacitor the surface is served from the device's own origin, and that is
// where it has to stay: every chunk a screen lazy-loads lives in the bundle, so the scanner,
// the reader and the saved files open with no network at all. Only the data leaves the phone,
// and lib/api.js spells out the site origin for those calls instead of steering the whole
// document at it with a <base>.

createRoot(document.getElementById("root")).render(
  <AppProvider>
    <AppShell />
  </AppProvider>
);
