import React, { useState } from "react";
import { BadgeCheck, KeyRound, X } from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import { resendVerificationCode } from "../lib/api.js";

const DISMISSED_KEY = "wollo_email_confirm_bar_v1";

// The account opens the moment it is created, so the emailed code is confirmed from here —
// inside the library — instead of holding the student on the sign-in screen.
export default function EmailVerifyBanner() {
  const { activeUser, session, studentPreview, verifySignup, adoptSession, toast } = useApp();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (!activeUser || studentPreview || activeUser.emailVerified !== false || dismissed) return null;

  const email = activeUser.email || session.email || "";
  const hide = () => {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const confirm = async (event) => {
    event.preventDefault();
    setNotice("");
    if (code.replace(/\D/g, "").length !== 6) {
      setNotice("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    const res = await verifySignup(email, code);
    setBusy(false);
    if (!res.ok) {
      setNotice(res.error || "That code did not work.");
      return;
    }
    toast("Email confirmed — your account is fully verified.");
    hide();
  };

  const resend = async () => {
    setNotice("");
    setBusy(true);
    const res = await resendVerificationCode(email);
    setBusy(false);
    if (!res || res.ok !== true) {
      setNotice((res && res.error) || "Could not resend the code.");
      return;
    }
    if (res.session) {
      // The provider refused the mailbox, so the server finished the account instead.
      adoptSession(res.session);
      toast("Your email could not be confirmed, but the account is fully open.");
      hide();
      return;
    }
    setNotice(res.mailSent ? "A fresh code is on its way." : res.message || "A new code was requested.");
  };

  return (
    <div className="banner info mb-3">
      <form onSubmit={confirm} className="d-flex flex-wrap align-items-center gap-2" style={{ width: "100%" }}>
        <span className="flex-grow-1" style={{ minWidth: 180 }}>
          <BadgeCheck size={16} aria-hidden="true" /> Confirm your email — we sent a 6-digit code to <strong>{email}</strong>.
        </span>
        <div className="ws-field-icon" style={{ width: 132 }}>
          <KeyRound size={15} aria-hidden="true" />
          <input
            className="form-control form-control-sm"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Email confirmation code"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </div>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          Confirm
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={resend} disabled={busy}>
          Resend
        </button>
        {notice ? <span className="small text-secondary">{notice}</span> : null}
        <button type="button" className="ws-modal-close" onClick={hide} aria-label="Dismiss the email confirmation bar">
          <X size={14} />
        </button>
      </form>
    </div>
  );
}
