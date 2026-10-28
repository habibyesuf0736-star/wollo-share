import React, { useState } from "react";
import { ArrowRight, Send } from "lucide-react";
import { PLANS } from "../UpgradeGateModal.jsx";
import { useApp } from "../../store/AppContext.jsx";
import * as api from "../../lib/api.js";

export default function PremiumRequestCard({ plan, onChangePlan }) {
  const { session, activeUser, goLogin, goSupport } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);

  const chosen = PLANS.find((item) => item.key === plan) || PLANS[0];

  const send = async () => {
    setBusy(true);
    setError("");
    const res = await api.createTicket(
      {
        category: "Account or payment",
        message: `Plan request: ${chosen.title} (${chosen.price}). Account: ${activeUser?.email || session?.email || ""}.`
      },
      session?.authToken
    );
    setBusy(false);
    if (res && res.ok) setSent(res.ticket);
    else setError((res && res.error) || "Could not send that. Try again.");
  };

  return (
    <section id="premium-request" className="ws-premium-block">
      <div className="card p-3 ws-request-card">
        <h2 className="h5 mb-2">Order {chosen.title}</h2>
        <label className="form-label small fw-semibold" htmlFor="premium-plan-picker">
          Plan
        </label>
        <select
          id="premium-plan-picker"
          className="form-select mb-2"
          value={plan}
          onChange={(event) => onChangePlan(event.target.value)}
        >
          {PLANS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.title} — {item.price}
            </option>
          ))}
        </select>

        {sent ? (
          <>
            <p className="small mb-2">
              Sent. The team replies in your support thread with the payment details.
            </p>
            <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={goSupport}>
              Open my thread
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </>
        ) : session ? (
          <>
            <p className="small text-secondary mb-2">
              {chosen.detail} You pay after the team confirms — nothing is charged now.
            </p>
            {error ? <p className="small text-danger mb-2">{error}</p> : null}
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={send} disabled={busy}>
              <Send size={15} aria-hidden="true" />
              {busy ? "Sending…" : "Send my plan choice"}
            </button>
            <p className="small text-secondary mt-2 mb-0">
              Signed in as {activeUser?.email || session.email}.
            </p>
          </>
        ) : (
          <>
            <p className="small text-secondary mb-2">Sign in so the team knows which account to switch.</p>
            <button type="button" className="btn btn-primary" onClick={goLogin}>
              Sign in or create an account
            </button>
          </>
        )}
      </div>
    </section>
  );
}
