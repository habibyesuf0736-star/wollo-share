import React from "react";

const QUESTIONS = [
  { q: "When do I pay?", a: "After the team confirms your request. The site never touches a card." },
  { q: "How fast does it switch?", a: "Same day, and the plan shows on your profile." },
  { q: "Does my free account disappear?", a: "No. Same login, same shared files, more downloads." },
  { q: "What if I stop paying?", a: "Nothing renews by itself — the account drops back to the free plan." },
  { q: "I paid the wrong amount", a: "Open a support thread with the reference and the team fixes it." }
];

export default function PremiumFaq() {
  return (
    <section className="ws-premium-block">
      <h2>Questions</h2>
      <div className="ws-faq">
        {QUESTIONS.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
