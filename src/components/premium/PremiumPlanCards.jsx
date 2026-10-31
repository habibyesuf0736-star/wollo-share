import React from "react";
import { Check, Crown } from "lucide-react";
import { PLANS } from "../../lib/plans.js";

export default function PremiumPlanCards({ selected, onSelect, currentPlan }) {
  return (
    <section id="premium-plans" className="ws-premium-block">
      <h2>Pick a plan</h2>
      <div className="ws-plan-grid">
        {PLANS.map((plan) => (
          <article key={plan.key} className={`ws-plan-card ${selected === plan.key ? "is-selected" : ""}`}>
            <header className="d-flex justify-content-between align-items-baseline gap-2">
              <h3 className="h6 mb-0">{plan.title}</h3>
              {currentPlan === plan.key ? (
                <span className="ws-premium-badge">
                  <Crown size={11} aria-hidden="true" />
                  Active
                </span>
              ) : null}
            </header>
            <p className="ws-plan-price">{plan.price}</p>
            <p className="small text-secondary mb-2">{plan.detail}</p>
            <ul className="ws-plan-perks">
              {plan.perks.map((perk) => (
                <li key={perk}>
                  <Check size={13} aria-hidden="true" />
                  {perk}
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`btn btn-sm w-100 ${selected === plan.key ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => onSelect(plan.key)}
            >
              {selected === plan.key ? "Selected" : "Choose"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
