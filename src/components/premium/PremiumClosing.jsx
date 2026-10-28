import React from "react";
import { ArrowLeft, LifeBuoy } from "lucide-react";

export default function PremiumClosing({ onLibrary, onSupport }) {
  return (
    <section className="ws-premium-closing">
      <p className="mb-2 fw-semibold">Still deciding?</p>
      <div className="d-flex flex-wrap gap-2 justify-content-center">
        <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={onLibrary}>
          <ArrowLeft size={14} aria-hidden="true" />
          Browse free files
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={onSupport}>
          <LifeBuoy size={14} aria-hidden="true" />
          Ask the team
        </button>
      </div>
    </section>
  );
}
