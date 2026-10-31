import React, { useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { PLANS } from "../lib/plans.js";
import PremiumHero from "../components/premium/PremiumHero.jsx";
import PremiumPlanCards from "../components/premium/PremiumPlanCards.jsx";
import PremiumActive from "../components/premium/PremiumActive.jsx";
import PremiumSteps from "../components/premium/PremiumSteps.jsx";
import PremiumCompare from "../components/premium/PremiumCompare.jsx";
import PremiumRequestCard from "../components/premium/PremiumRequestCard.jsx";
import PremiumFaq from "../components/premium/PremiumFaq.jsx";
import PremiumClosing from "../components/premium/PremiumClosing.jsx";

export default function PremiumPage() {
  const { session, activeUser, downloadStatus, pageTexts, goLogin, goLibrary, goSupport } = useApp();
  const [plan, setPlan] = useState(activeUser?.accountPlan || "premium_annual");

  const currentPlan = downloadStatus.premium ? activeUser?.accountPlan : "";
  const planLabel = (PLANS.find((item) => item.key === currentPlan) || {}).title || "Premium";

  return (
    <div className="ws-page ws-premium">
      <PremiumHero signedIn={Boolean(session)} onSignUp={goLogin} onSignIn={goLogin} />
      <PremiumPlanCards selected={plan} onSelect={setPlan} currentPlan={currentPlan} />
      {currentPlan ? (
        <PremiumActive planLabel={planLabel} email={activeUser?.email || session?.email || "your account"} onLibrary={goLibrary} />
      ) : (
        <>
          <PremiumSteps paymentNote={pageTexts.premiumPayment} />
          <PremiumRequestCard plan={plan} onChangePlan={setPlan} />
        </>
      )}
      <PremiumCompare />
      <PremiumFaq />
      <PremiumClosing onLibrary={goLibrary} onSupport={goSupport} />
    </div>
  );
}
