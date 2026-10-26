import React from "react";
import { useApp } from "../store/AppContext.jsx";
import { AdCard } from "./AdSlot.jsx";
import { PLANS } from "./UpgradeGateModal.jsx";

const PAID_PLAN_KEYS = new Set(PLANS.map((plan) => plan.key));

// Shown where the Evangadi pack used to sit: students never see that pack, they see the
// paid plans advertised instead.
export default function PlanPromo() {
  const { isAdmin, session, activeUser, setGate } = useApp();
  if (isAdmin) return null;

  const onPaidPlan = Boolean(
    activeUser &&
      (activeUser.paymentStatus === "paid" ||
        activeUser.downloadOnlyAccount ||
        PAID_PLAN_KEYS.has(activeUser.accountPlan))
  );
  if (onPaidPlan) return null;

  return (
    <div className="my-3">
      <AdCard
        ad={{
          style: "banner",
          badge: "Advertisement · Wollo Share Premium",
          title: "Unlock every file — one plan, no counting",
          text: session
            ? "Premium 100 Birr a month, 250 Birr a year, or 500 Birr once for lifetime access. Instant downloads, no sponsor spots."
            : "Premium 100 Birr a month, 250 Birr a year, or 500 Birr once for lifetime access. Create an account to activate a plan.",
          ctaLabel: "See the plans"
        }}
        onAction={() => setGate({ type: "upgrade", plansOnly: true })}
      />
    </div>
  );
}
