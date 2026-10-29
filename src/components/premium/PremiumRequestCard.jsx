import React, { useEffect, useState } from "react";
import { ArrowRight, Banknote, CheckCircle2, Copy, Send } from "lucide-react";
import { PLANS } from "../UpgradeGateModal.jsx";
import { useApp } from "../../store/AppContext.jsx";
import * as api from "../../lib/api.js";

export default function PremiumRequestCard({ plan, onChangePlan }) {
  const { session, activeUser, pageTexts, goLogin, goSupport, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const [sent, setSent] = useState(null);

  const chosen = PLANS.find((item) => item.key === plan) || PLANS[0];
  const payTo = String(pageTexts.premiumPayment || "").trim();

  // A student who already ordered sees that order instead of a second one.
  useEffect(() => {
    if (!session) {
      setChecking(false);
      return undefined;
    }
    let cancelled = false;
    api
      .listMyTickets(session.authToken)
      .then((res) => {
        if (cancelled) return;
        const mine = (res && Array.isArray(res.tickets) ? res.tickets : []).find(
          (ticket) => ticket.premiumPlan && !ticket.premiumConfirmedAt && ticket.status !== "closed"
        );
        if (mine) {
          setSent(mine);
          setReference(mine.premiumReference || "");
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [session]);

  const copyPayTo = async () => {
    try {
      await navigator.clipboard.writeText(payTo);
      toast("Payment details copied.");
    } catch {
      toast("Select the payment details and copy them.");
    }
  };

  const send = async () => {
    setBusy(true);
    setError("");
    const res = await api.requestPremiumPlan(chosen.key, reference.trim(), session.authToken);
    setBusy(false);
    if (res && res.ok !== false) setSent(res.ticket);
    else setError((res && res.error) || "Could not send that. Try again.");
  };

  const sentPlan = sent && PLANS.find((item) => item.key === sent.premiumPlan);

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
          disabled={Boolean(sent)}
        >
          {PLANS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.title} — {item.price}
            </option>
          ))}
        </select>

        <div className="ws-pay-box">
          <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
            <span className="small fw-semibold d-inline-flex align-items-center gap-1">
              <Banknote size={15} aria-hidden="true" />
              Pay {sentPlan ? sentPlan.price : chosen.price}
            </span>
            {payTo ? (
              <button type="button" className="btn btn-sm btn-outline-secondary py-0 d-inline-flex align-items-center gap-1" onClick={copyPayTo}>
                <Copy size={13} aria-hidden="true" />
                Copy details
              </button>
            ) : null}
          </div>
          <p className="small mb-0 mt-1 ws-pay-text">{payTo || "The team replies with the Telebirr or bank details after you send this order."}</p>
        </div>

        {sent ? (
          <>
            <p className="small mb-2 d-inline-flex align-items-center gap-1">
              <CheckCircle2 size={15} className="text-success" aria-hidden="true" />
              Order sent — the team confirms the payment, then the plan is active.
            </p>
            <p className="small text-secondary mb-2">
              {sentPlan ? sentPlan.title : chosen.title}
              {sent.premiumReference ? ` · reference ${sent.premiumReference}` : ""}
            </p>
            <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={goSupport}>
              Open my thread
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </>
        ) : session ? (
          <>
            <label className="form-label small fw-semibold mb-1" htmlFor="premium-reference">
              Payment reference (optional)
            </label>
            <input
              id="premium-reference"
              className="form-control form-control-sm mb-2"
              maxLength={80}
              placeholder="Telebirr transaction number"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
            {error ? <p className="small text-danger mb-2">{error}</p> : null}
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={send} disabled={busy || checking}>
              <Send size={15} aria-hidden="true" />
              {busy ? "Sending…" : "Send my order"}
            </button>
            <p className="small text-secondary mt-2 mb-0">Signed in as {activeUser?.email || session.email}.</p>
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
