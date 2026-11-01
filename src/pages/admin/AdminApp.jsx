import React, { useState } from "react";
import { Smartphone } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import { APP_VERSION } from "../../app/version.js";

const THEMES = [
  ["", "Follow the phone"],
  ["light", "Always light"],
  ["dark", "Always dark"]
];

export default function AdminApp() {
  const { appSettings, appearanceSettings, commitAppSettings, toast } = useApp();
  const [saveNote, setSaveNote] = useState("");

  const saved = (patch, note = "Saved") => {
    commitAppSettings(patch);
    setSaveNote(note);
  };

  const siteAccent = appearanceSettings.primaryColor || "#1d624f";
  const accent = appSettings.accent || siteAccent;
  const ownColour = Boolean(appSettings.accent);

  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <span className="ws-section-kicker">Android app</span>
        <h2 className="h4 mb-1">App control</h2>
        <p className="small text-secondary mb-0">
          The app shares this database, these accounts and this dashboard. These switches move the app only — the website never changes.
        </p>
      </div>

      <div className="card p-3">
        <div className="form-check form-switch d-flex align-items-center gap-2 mb-2">
          <input
            className="form-check-input m-0"
            type="checkbox"
            role="switch"
            id="appEnabled"
            checked={appSettings.enabled !== false}
            onChange={(e) => saved({ enabled: e.target.checked }, e.target.checked ? "App open" : "App closed")}
          />
          <label className="small fw-semibold mb-0" htmlFor="appEnabled">
            {appSettings.enabled === false ? "The app is closed on every phone" : "The app is open"}
          </label>
        </div>
        <div className="small text-secondary mb-3">
          Closed shows one screen on the phone. Materials stay readable on the website and the admin dashboard keeps working.
        </div>

        <div className="row g-3">
          <div className="col-12 col-md-4">
            <label className="form-label small fw-semibold" htmlFor="appMinimum">
              Minimum version
            </label>
            <input
              id="appMinimum"
              className="form-control"
              placeholder={APP_VERSION}
              maxLength={12}
              value={appSettings.minimumVersion}
              onChange={(e) => saved({ minimumVersion: e.target.value.trim() }, "Saved")}
            />
            <div className="small text-secondary mt-1">This build reports {APP_VERSION}. A higher number forces the update screen.</div>
          </div>
          <div className="col-12 col-md-8">
            <label className="form-label small fw-semibold" htmlFor="appUpdateUrl">
              Update link
            </label>
            <input
              id="appUpdateUrl"
              className="form-control"
              placeholder="https://wollo-share.vercel.app/app.html"
              maxLength={200}
              value={appSettings.updateUrl}
              onChange={(e) => saved({ updateUrl: e.target.value.trim() }, "Saved")}
            />
          </div>
        </div>
      </div>

      <div className="card p-3">
        <h3 className="h6 mb-1">What the student sees</h3>
        <p className="small text-secondary mb-3">The app has its own look, so a colour picked here does not touch the website.</p>
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold" htmlFor="appWelcome">
              Greeting under the name
            </label>
            <input
              id="appWelcome"
              className="form-control"
              maxLength={90}
              value={appSettings.welcome}
              onChange={(e) => saved({ welcome: e.target.value }, "Saved")}
            />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold" htmlFor="appMessage">
              Notice card on the home screen
            </label>
            <input
              id="appMessage"
              className="form-control"
              maxLength={160}
              placeholder="Empty shows no card"
              value={appSettings.message}
              onChange={(e) => saved({ message: e.target.value }, "Saved")}
            />
          </div>
          <div className="col-12 col-md-6">
            <div className="form-check form-switch d-flex align-items-center gap-2">
              <input
                className="form-check-input m-0"
                type="checkbox"
                role="switch"
                id="appOwnColour"
                checked={ownColour}
                onChange={(e) => saved({ accent: e.target.checked ? siteAccent : "" }, e.target.checked ? "App colour is yours" : "Following the site")}
              />
              <label className="small fw-semibold mb-0" htmlFor="appOwnColour">
                Give the app its own colour
              </label>
            </div>
            {ownColour ? (
              <div className="d-flex align-items-center gap-2 mt-2">
                <input
                  type="color"
                  className="form-control form-control-color"
                  aria-label="App accent colour"
                  value={accent}
                  onChange={(e) => saved({ accent: e.target.value }, "Saved")}
                />
                <span className="small text-secondary mono">{accent}</span>
              </div>
            ) : (
              <div className="small text-secondary mt-1">Right now it follows the website accent ({siteAccent}).</div>
            )}
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold" htmlFor="appTheme">
              Default appearance
            </label>
            <select id="appTheme" className="form-select" value={appSettings.theme} onChange={(e) => saved({ theme: e.target.value }, "Saved")}>
              {THEMES.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <div className="small text-secondary mt-1">A student can still change it on their own phone.</div>
          </div>
        </div>

        {ownColour ? (
          <div
            className="mt-3 p-3 rounded-3 border d-flex flex-column gap-2"
            style={{ background: "var(--surface-subtle, #f1f4ee)" }}
            aria-label="App look preview"
          >
            <div className="d-flex align-items-center gap-2">
              <span className="rounded-2 d-grid align-items-center justify-content-center" style={{ width: 28, height: 28, background: accent, color: "#fff", fontSize: 12, fontWeight: 800 }}>
                W
              </span>
              <span className="fw-bold" style={{ fontSize: 15, letterSpacing: "-0.02em" }}>
                Selam
              </span>
            </div>
            <div style={{ borderLeft: `3px solid ${accent}`, borderRadius: 8, padding: "8px 10px", fontSize: 12.5 }}>
              {appSettings.message || "Your notice appears here."}
            </div>
            <div
              className="d-flex gap-1 p-1 rounded-pill"
              style={{ background: "#14171a", maxWidth: 260 }}
              role="presentation"
            >
              {["Home", "Browse", "Saved", "Account"].map((label, i) => (
                <span
                  key={label}
                  className="flex-fill text-center rounded-pill"
                  style={{ padding: "5px 4px", fontSize: 11, fontWeight: 650, background: i === 0 ? accent : "transparent", color: i === 0 ? "#fff" : "rgba(255,255,255,.6)" }}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="card p-3">
        <h3 className="h6 mb-3">What the student can do</h3>
        {[
          {
            id: "plans",
            label: "Show the plan offer",
            hint: "Off hides Premium in the app only — the website keeps selling it and paid accounts keep their access.",
            on: appSettings.hidePremium !== true,
            write: (on) => ({ hidePremium: !on })
          },
          {
            id: "signup",
            label: "Let students create an account here",
            hint: "Off sends them to the website to register; they still sign in and download from the app.",
            on: appSettings.allowSignup !== false,
            write: (on) => ({ allowSignup: on })
          },
          {
            id: "ratings",
            label: "Let students rate a file",
            hint: "Off removes the stars from the file sheet. Downloading and saving stay as they are.",
            on: appSettings.showRatings !== false,
            write: (on) => ({ showRatings: on })
          }
        ].map((row) => (
          <div className="form-check form-switch d-flex align-items-start gap-2 mb-3" key={row.id}>
            <input
              className="form-check-input m-0 mt-1"
              type="checkbox"
              role="switch"
              id={`app-${row.id}`}
              checked={row.on}
              onChange={(e) => saved(row.write(e.target.checked), e.target.checked ? "Turned on" : "Turned off")}
            />
            <label className="small fw-semibold mb-0" htmlFor={`app-${row.id}`}>
              {row.label}
              <div className="small text-secondary fw-normal">{row.hint}</div>
            </label>
          </div>
        ))}

        <div className="d-flex flex-wrap align-items-center gap-2 mt-1">
          {saveNote ? <span className="badge rounded-pill text-bg-success">{saveNote}</span> : null}
          <a className="btn btn-sm btn-soft" href="/app.html" target="_blank" rel="noreferrer">
            <Smartphone size={14} className="me-1 align-text-bottom" aria-hidden="true" />
            Open the app surface
          </a>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => {
              saved({
                enabled: true,
                welcome: "Your materials, all in one place.",
                message: "",
                hidePremium: false,
                minimumVersion: "",
                updateUrl: "",
                accent: "",
                theme: "",
                allowSignup: true,
                showRatings: true
              });
              toast("App settings reset.");
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
