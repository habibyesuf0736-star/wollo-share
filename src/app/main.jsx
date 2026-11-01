import React from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "../store/AppContext.jsx";
import AppShell from "./AppShell.jsx";
import "./app.css";

// The app surface borrows every guard the phone entry already sets on the store: no SEO
// rewrites, no website typography, no website accent written over the app's own.
window.__WS_MOBILE__ = true;
window.__WS_APP__ = true;

// Installed through Capacitor the bundle lives on the device, so every relative path —
// /api/state, /materials/foo.pdf — has to resolve against the real site instead. The
// <base> tag covers links and media, but the native bridge answers root-relative fetches
// from its own asset server, so those requests get the site origin spelled out.
if (window.Capacitor?.isNativePlatform?.()) {
  const siteOrigin = "https://wollo-share.vercel.app";
  const base = document.createElement("base");
  base.href = `${siteOrigin}/`;
  document.head.prepend(base);

  const deviceFetch = window.fetch.bind(window);
  window.fetch = (input, init) =>
    deviceFetch(typeof input === "string" && input.startsWith("/") ? siteOrigin + input : input, init);
}

createRoot(document.getElementById("root")).render(
  <AppProvider>
    <AppShell />
  </AppProvider>
);
