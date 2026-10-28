import React from "react";
import { Crown } from "lucide-react";

export default function PremiumActive({ planLabel, email, onLibrary }) {
  return (
    <section className="ws-premium-block">
      <div className="banner info">
        <Crown size={15} aria-hidden="true" />
        <span>
          {planLabel} is active on {email} — downloads are instant.
        </span>
        <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={onLibrary}>
          Back to the library
        </button>
      </div>
    </section>
  );
}
