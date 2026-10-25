import React from "react";

export default function StatCard({ value, label, hint, icon }) {
  return (
    <div className="stat-card">
      {icon ? <span className="stat-icon" aria-hidden="true">{icon}</span> : null}
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint ? <div className="stat-hint mt-1">{hint}</div> : null}
    </div>
  );
}
