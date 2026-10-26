import React from "react";
import { Check, Clock, Gift, Sparkles, Upload } from "lucide-react";
import Modal from "./Modal.jsx";
import { useApp } from "../store/AppContext.jsx";

export const PLANS = [
  {
    key: "premium_monthly",
    title: "Premium monthly",
    price: "100 Birr / month",
    detail: "Unlimited downloads while the subscription is active.",
    perks: ["No sponsor spots", "Newest uploads first", "Pause any time"]
  },
  {
    key: "premium_annual",
    title: "Premium annual",
    price: "250 Birr / year",
    detail: "A full year of unlimited downloads at the lowest monthly cost.",
    perks: ["No sponsor spots", "Every college covered", "Priority review"]
  },
  {
    key: "paid_lifetime",
    title: "Lifetime access",
    price: "500 Birr one-time",
    detail: "One payment — every current and future material stays unlocked.",
    perks: ["Never expires", "All future semesters", "No ads, ever"]
  }
];

export default function UpgradeGateModal() {
  const { gate, closeGate, setGate, downloadStatus, mySubmissions, session } = useApp();
  const open = Boolean(gate && gate.type === "upgrade");
  if (!open) return null;

  const materialName = gate.title || "this material";
  const plansOnly = Boolean(gate.plansOnly);
  const required = downloadStatus.requiredCount || 2;
  const progress = Number(downloadStatus.progress) || 0;
  const credits = Number(downloadStatus.credits) || 0;
  const pending = mySubmissions.filter((s) => s.status === "pending").length;
  const rejected = mySubmissions.filter((s) => s.status === "rejected" && s.decidedBy !== "automatic-duplicate-guard");
  const percent = Math.min(100, Math.round((progress / required) * 100));

  return (
    <Modal
      open={open}
      onClose={closeGate}
      title={plansOnly ? "Wollo Share Premium" : `Download “${materialName}”`}
      subtitle={
        plansOnly
          ? "Choose a plan and the library team switches your account over."
          : "Free materials stay open to everyone. Everything else is a premium file — or one you can earn."
      }
      size="wide"
    >
      <div className="d-flex flex-column gap-3">
        <div className="premium-ad card border-0 shadow-sm overflow-hidden">
          <div className="card-body p-3 p-md-4">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span className="badge text-bg-dark rounded-pill">Advertisement · Wollo Share Premium</span>
              <span className="small text-secondary">
                <Sparkles size={13} className="me-1 align-text-bottom" aria-hidden="true" />
                {session ? "Your account is on the free plan" : "Sign in to activate a plan"}
              </span>
            </div>
            <h4 className="h5 mt-3 mb-1">Unlock the whole library — no sponsor spots, no counting.</h4>
            <p className="text-secondary small mb-3">
              Premium and lifetime accounts download every file instantly. Free accounts watch a 10 second spot and spend
              one earned credit per file.
            </p>
            <div className="row g-2 g-md-3">
              {PLANS.map((plan) => (
                <div key={plan.key} className="col-12 col-md-4">
                  <div className="h-100 border rounded-3 p-3 d-flex flex-column gap-2">
                    <div className="d-flex justify-content-between align-items-start gap-2">
                      <strong className="small">{plan.title}</strong>
                      <span className="badge rounded-pill text-bg-light border">{plan.price}</span>
                    </div>
                    <span className="small text-secondary">{plan.detail}</span>
                    <ul className="list-unstyled small d-flex flex-column gap-1 mb-0 mt-auto">
                      {plan.perks.map((perk) => (
                        <li key={perk} className="d-flex align-items-center gap-1">
                          <Check size={13} className="text-success" aria-hidden="true" />
                          {perk}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
            <div className="alert alert-light border small mt-3 mb-0">
              <strong>How to activate:</strong> send your account email to the library team and they switch this account to
              the plan you choose. The download you just requested starts automatically the moment the plan is active.
            </div>
          </div>
        </div>

        <div className="card earn-card">
          <div className="card-body p-3 p-md-4">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <div>
                <span className="ws-section-kicker">Earn it instead</span>
                <h5 className="h6 mt-1 mb-1">
                  <Gift size={15} className="me-1 align-text-bottom" aria-hidden="true" />
                  Share {required} materials, download {required === 1 ? "" : "one"} free
                </h5>
                <p className="small text-secondary mb-0">
                  Every document you send goes to the administrator's review queue. Two approved uploads earn you one
                  download — duplicates never count.
                </p>
              </div>
              <div className="text-md-end">
                <div className="h4 mb-0">
                  {progress}
                  <span className="text-secondary fs-6">/{required}</span>
                </div>
                <span className="small text-secondary">approved uploads</span>
              </div>
            </div>

            <div
              className="progress my-3"
              role="progressbar"
              aria-label="Uploads approved toward your next download"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={required}
              style={{ height: 10 }}
            >
              <div className="progress-bar" style={{ width: `${percent}%` }} />
            </div>

            <div className="d-flex flex-wrap gap-2 align-items-center">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setGate({ type: "share", title: materialName })}
              >
                <Upload size={14} className="me-1 align-text-bottom" aria-hidden="true" />
                {session ? "Send a material now" : "Sign in and send a material"}
              </button>
              {credits > 0 ? (
                <span className="small text-success">
                  <Check size={13} className="me-1 align-text-bottom" aria-hidden="true" />
                  You have {credits} earned download{credits === 1 ? "" : "s"} ready — your file will start after the
                  sponsor spot.
                </span>
              ) : null}
              {pending > 0 ? (
                <span className="small text-secondary">
                  <Clock size={13} className="me-1 align-text-bottom" aria-hidden="true" />
                  {pending} of your submission{pending === 1 ? "" : "s"} still waiting for review
                </span>
              ) : null}
            </div>

            {rejected.length ? (
              <div className="small text-secondary mt-3">
                <strong>Recently declined:</strong> {rejected[0].name} — {rejected[0].reason}
              </div>
            ) : null}
          </div>
        </div>

        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={closeGate}>
            Keep browsing free materials
          </button>
        </div>
      </div>
    </Modal>
  );
}
