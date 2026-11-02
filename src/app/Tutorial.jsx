import React, { useState } from "react";

/* The first-run walkthrough. Each step names one thing the phone can already do, so the
   text stays honest and the student can leave at any point — Skip ends the tutorial, it
   never ends sign-in. */

const STEPS = [
  { key: 1, d: "M12 4.5a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6ZM4.8 20.4c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6" },
  { key: 2, d: "M4.5 20.5V8.2L12 4l7.5 4.2v12.3M9 20.5v-5h6v5M4.5 12.2h15" },
  { key: 3, d: "M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm4.7 11.8L20 20.6" },
  { key: 4, d: "M6 4.5h9l3 3v12H6zM15 4.5v3h3M9 12h6M9 15.5h4" },
  { key: 5, d: "M12 4v10.5m0 0-3.8-3.8m3.8 3.8 3.8-3.8M5 19.5h14" },
  { key: 6, d: "M6.5 3h11v18l-5.5-3.7L6.5 21z" },
  { key: 7, d: "M4 17.5h16M4.5 7l3.5 3 4-5.5 4 5.5 3.5-3-1.4 8H5.9z" }
];

export default function Tutorial({ t, onClose }) {
  const [step, setStep] = useState(0);
  const last = STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div className="tu-scrim" onClick={onClose} role="presentation">
      <section className="tu" role="dialog" aria-modal="true" aria-label={t.tutTitle} onClick={(event) => event.stopPropagation()}>
        <div className="tu-top">
          <p className="tu-eyebrow">
            {t.tutTitle} · {t.tutStep} {step + 1}/{STEPS.length}
          </p>
          <button type="button" className="ob-skip" onClick={onClose}>
            {t.skip}
          </button>
        </div>

        <div className="tu-track" style={{ transform: `translateX(-${step * 100}%)` }}>
          {STEPS.map((item) => (
            <div className="tu-page" key={item.key}>
              <span className="tu-ico">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={item.d} />
                </svg>
              </span>
              <div>
                <h2 className="tu-title">{t[`tut${item.key}Title`]}</h2>
                <p className="tu-body">{t[`tut${item.key}Body`]}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="tu-meter" aria-hidden="true">
          {STEPS.map((item, index) => (
            <i key={item.key} className={index <= step ? "on" : ""} />
          ))}
        </div>

        <div className="ob-nav">
          <button type="button" className={`a-btn quiet${step === 0 ? " ob-hide" : ""}`} onClick={() => setStep((value) => Math.max(0, value - 1))}>
            {t.back}
          </button>
          <button
            type="button"
            className="a-btn primary"
            onClick={() => {
              if (step < last) setStep(step + 1);
              else onClose();
            }}
          >
            {step === last ? t.tutDone : t.next}
          </button>
        </div>
      </section>
    </div>
  );
}
