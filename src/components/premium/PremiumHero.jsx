import React from "react";
import { ArrowRight, Crown } from "lucide-react";
import { PLANS } from "../../lib/plans.js";
import { scrollToId } from "./premiumUtils.js";

const LOWEST = Math.min(...PLANS.map((plan) => parseInt(plan.price, 10)));

export default function PremiumHero({ signedIn, onSignUp, onSignIn }) {
  const primary = signedIn ? "Choose a plan" : "Create free account";
  const onPrimary = signedIn ? () => scrollToId("premium-request") : onSignUp;

  return (
    <section className="ws-premium-hero">
      <span className="ws-premium-badge">
        <Crown size={12} aria-hidden="true" />
        Premium
      </span>
      <h1>Every file, no waiting</h1>
      <p>Notes, exams and slides from every college — download the moment you open them.</p>
      <div className="d-flex flex-wrap gap-2 mt-3">
        <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={onPrimary}>
          {primary}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
        {signedIn ? null : (
          <button type="button" className="btn btn-link btn-sm" onClick={onSignIn}>
            Sign in
          </button>
        )}
      </div>
      <p className="ws-premium-from">From {LOWEST} Birr · cancel any time</p>
    </section>
  );
}
