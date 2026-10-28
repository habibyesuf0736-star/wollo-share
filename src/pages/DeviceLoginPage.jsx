import React, { useEffect, useState } from "react";
import { BadgeCheck, KeyRound, Lock, Mail, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import { approveQrLogin, previewQrLogin } from "../lib/api.js";

// The screen a scanned code opens. It never receives a session — it hands one out,
// and only after this device proves it is already signed in.
export default function DeviceLoginPage({ qrId }) {
  const { session, login, goLogin, goLibrary, toast } = useApp();
  const [preview, setPreview] = useState({ status: "checking", label: "", expired: false });
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(null);

  useEffect(() => {
    if (!session) return undefined;
    let cancelled = false;
    previewQrLogin(qrId, session.authToken)
      .then((res) => {
        if (cancelled || !res || res.ok !== true) return;
        setPreview({ status: res.status, label: String(res.label || ""), expired: Boolean(res.expired) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [qrId, session]);

  const dead = preview.expired || (preview.status !== "checking" && preview.status !== "pending");

  const confirmSignIn = async (event, token) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    const res = await approveQrLogin(qrId, token);
    setBusy(false);
    if (!res || res.ok !== true) {
      setError((res && res.error) || "That computer could not be signed in.");
      if (res && (res.error || "").match(/expired|gone|used/i)) setPreview({ ...preview, expired: true });
      return;
    }
    setApproved({ name: res.accountName || session?.name || "", label: res.label || "" });
    toast("Signed in on the other screen.");
  };

  const signInAndConfirm = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.identifier.trim() || !form.password) {
      setError("Enter your email or username and your password.");
      return;
    }
    setBusy(true);
    const signedIn = await login({ identifier: form.identifier.trim(), password: form.password });
    if (!signedIn.ok || !signedIn.session) {
      setBusy(false);
      setError(signedIn.error || "Sign in failed on this device.");
      return;
    }
    setBusy(false);
    await confirmSignIn(event, signedIn.session.authToken);
  };

  return (
    <div className="ws-page">
      <div className="card p-4 mx-auto" style={{ maxWidth: 560 }}>
        {approved ? (
          <>
            <h1 className="h5 d-flex align-items-center gap-2">
              <BadgeCheck size={18} aria-hidden="true" /> Signed in
            </h1>
            <p className="small text-secondary mb-3">
              {approved.label ? <strong>{approved.label}</strong> : "That computer"} is now signed in as{" "}
              <strong>{approved.name}</strong>. Close this tab if you did not expect it.
            </p>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={goLibrary}>
              Keep browsing here
            </button>
          </>
        ) : dead ? (
          <>
            <h1 className="h5 d-flex align-items-center gap-2">
              <ShieldCheck size={18} aria-hidden="true" /> This sign-in code is no longer valid
            </h1>
            <p className="small text-secondary mb-3">
              Choose <strong>Show a new code</strong> on the other screen and scan again.
            </p>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={goLibrary}>
              Back to the library
            </button>
          </>
        ) : session ? (
          <form onSubmit={(e) => confirmSignIn(e, session.authToken)} className="d-flex flex-column gap-3">
            <h1 className="h5 d-flex align-items-center gap-2 mb-0">
              <MonitorSmartphone size={18} aria-hidden="true" /> Sign this computer in?
            </h1>
            <p className="small text-secondary mb-0">
              {preview.label ? <>Matching <strong>{preview.label}</strong></> : "Another screen"} — sign in for 24 hours as{" "}
              <strong>{session.name || session.email}</strong>?
            </p>
            {error ? (
              <div className="banner warn" role="alert">
                <span>{error}</span>
              </div>
            ) : null}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Signing it in…" : "Yes, sign me in there"}
            </button>
            <button type="button" className="btn btn-link btn-sm p-0" onClick={goLibrary}>
              Not my computer — cancel
            </button>
          </form>
        ) : (
          <form onSubmit={signInAndConfirm} className="d-flex flex-column gap-3">
            <h1 className="h5 d-flex align-items-center gap-2 mb-0">
              <KeyRound size={18} aria-hidden="true" /> Sign in here first
            </h1>
            <p className="small text-secondary mb-0">
              Sign in here to approve {preview.label ? <strong>{preview.label}</strong> : "that screen"}.
            </p>
            <div>
              <label className="form-label small fw-semibold" htmlFor="deviceId">
                Email or username
              </label>
              <div className="ws-field-icon">
                <Mail size={16} aria-hidden="true" />
                <input
                  id="deviceId"
                  className="form-control"
                  autoComplete="username"
                  value={form.identifier}
                  onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="form-label small fw-semibold" htmlFor="devicePw">
                Password
              </label>
              <div className="ws-field-icon">
                <Lock size={16} aria-hidden="true" />
                <input
                  id="devicePw"
                  className="form-control"
                  type="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            </div>
            {error ? (
              <div className="banner warn" role="alert">
                <span>{error}</span>
              </div>
            ) : null}
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Working…" : "Sign in and approve"}
            </button>
            <button type="button" className="btn btn-link btn-sm p-0" onClick={goLogin}>
              Use the full sign-in page
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
