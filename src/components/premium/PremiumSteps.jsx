import React from "react";
import { Banknote, Send, ShieldCheck } from "lucide-react";

const STEPS = [
  { icon: Send, title: "Send your plan", text: "One click below tells the team which plan you want." },
  { icon: Banknote, title: "Pay", text: "Pay the amount at the Telebirr or bank details on the order box." },
  { icon: ShieldCheck, title: "Switched over", text: "Your account unlocks as soon as the payment is confirmed." }
];

export default function PremiumSteps({ paymentNote }) {
  return (
    <section className="ws-premium-block">
      <h2>How paying works</h2>
      <ol className="ws-step-list">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <step.icon size={15} aria-hidden="true" />
            <span className="ws-step-index">{index + 1}</span>
            <span>
              <strong>{step.title}</strong>
              <span className="d-block small text-secondary">{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="banner info mt-2 mb-0">
        {paymentNote ? paymentNote : "Payment details come from the team — no card is charged here."}
      </p>
    </section>
  );
}
