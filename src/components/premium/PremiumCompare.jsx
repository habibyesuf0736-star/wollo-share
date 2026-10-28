import React from "react";
import { Check, Minus } from "lucide-react";
import { AD_SECONDS } from "../../store/AppContext.jsx";

const ROWS = [
  { label: "Downloads", free: "Earned credits", premium: "Unlimited" },
  { label: "Waiting", free: `${AD_SECONDS}s sponsor spot`, premium: "None" },
  { label: "Sponsor ads", free: "Before each file", premium: "Never", premiumOnly: true },
  { label: "Newest uploads", free: "With everyone", premium: "First", premiumOnly: true },
  { label: "Every college", free: "Your department", premium: "All of them", premiumOnly: true }
];

export default function PremiumCompare() {
  return (
    <section className="ws-premium-block">
      <h2>Free vs Premium</h2>
      <div className="table-responsive">
        <table className="table ws-compare align-middle mb-0">
          <thead>
            <tr>
              <th scope="col"> </th>
              <th scope="col">Free</th>
              <th scope="col">Premium</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className="text-secondary">
                  {row.free}
                  {row.premiumOnly ? (
                    <Minus size={13} className="ms-1 align-text-bottom text-secondary" aria-hidden="true" />
                  ) : null}
                </td>
                <td className="fw-semibold">
                  <Check size={13} className="me-1 align-text-bottom" aria-hidden="true" />
                  {row.premium}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
