import React from "react";
import { useApp } from "../store/AppContext.jsx";
import { AdCard } from "./AdSlot.jsx";
import { PLANS } from "./UpgradeGateModal.jsx";

const PAID_PLAN_KEYS = new Set(PLANS.map((plan) => plan.key));

// Written by the administrator as the ad whose placement is "premium" in Branding & ads.
// Pausing that entry drops the block; deleting it falls back to this campaign so the
// library never advertises nothing.
const DEFAULT_AD = {
  style: "banner",
  badge: "Advertisement · Wollo Share Premium",
  title: "Unlock every file — one plan, no counting",
  ctaLabel: "See the plans"
};

// Shown where the Evangadi pack used to sit: students never see that pack, they see the
// paid plans advertised instead.
export default function PlanPromo() {
  const { isAdmin, session, activeUser, ads, goPremium } = useApp();
  if (isAdmin) return null;

  const onPaidPlan = Boolean(
    activeUser &&
      (activeUser.paymentStatus === "paid" ||
        activeUser.downloadOnlyAccount ||
        PAID_PLAN_KEYS.has(activeUser.accountPlan))
  );
  if (onPaidPlan) return null;

  const custom = ads.find((ad) => ad.placement === "premium");
  if (custom && custom.active === false) return null;

  return (
    <div className="my-3">
      <AdCard
        ad={{
          ...DEFAULT_AD,
          ...(custom || {}),
          text:
            (custom && custom.text) ||
            (session ? "Unlimited downloads, no sponsor spots." : "Create an account to activate a plan.")
        }}
        onAction={goPremium}
      />
    </div>
  );
}
