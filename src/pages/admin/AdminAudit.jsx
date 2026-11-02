import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import * as api from "../../lib/api.js";
import EmptyState from "../../components/EmptyState.jsx";

const ACTION_LABEL = {
  "home.create": "Home card created",
  "home.update": "Home card edited",
  "home.delete": "Home card deleted",
  "payment_method.save": "Payment method saved",
  "payment_method.delete": "Payment method removed",
  "payment.screenshot_view": "Payment screenshot opened",
  "payment.approve": "Payment confirmed — plan activated",
  "payment.reject": "Payment rejected",
  "payment.resubmit": "New screenshot requested",
  "payment.cancel": "Order cancelled",
  "user.role": "Role changed",
  "account.delete": "Account deleted"
};

export default function AdminAudit() {
  const { session, isAdmin, toast } = useApp();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    if (!session || !isAdmin) return;
    setLoading(true);
    const res = await api.listAuditLog(session.authToken);
    if (res && res.ok !== false) setEntries(Array.isArray(res.entries) ? res.entries : []);
    else if (res && res.error) toast(res.error);
    setLoading(false);
  }, [isAdmin, session, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = filter ? entries.filter((entry) => String(entry.action || "").startsWith(filter)) : entries;

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <span className="ws-section-kicker">Wollo Share · control room</span>
          <h2 className="h4 mb-1">Audit log</h2>
          <p className="small text-secondary mb-0">Every content, payment and account change the team made, newest first. The list only ever grows.</p>
        </div>
        <div className="d-flex gap-2">
          <select className="form-select form-select-sm" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "auto" }} aria-label="Filter by area">
            <option value="">Everything</option>
            <option value="home">Home screen</option>
            <option value="payment">Payments</option>
            <option value="payment_method">Payment methods</option>
            <option value="user">Students</option>
            <option value="account">Accounts</option>
          </select>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={`me-1 align-text-bottom ${loading ? "spin" : ""}`} aria-hidden="true" />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="card p-3">
        <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
          {rows.map((entry) => (
            <li key={entry.id} className="d-flex flex-wrap justify-content-between align-items-start gap-2 border-bottom pb-2">
              <div style={{ minWidth: 0 }}>
                <div className="small fw-semibold">
                  {(ACTION_LABEL[entry.action] || entry.action) + (entry.target ? ` · ${entry.target}` : "")}
                </div>
                {entry.detail ? <div className="small text-secondary" style={{ whiteSpace: "pre-wrap" }}>{entry.detail}</div> : null}
              </div>
              <div className="small text-secondary mono text-end">
                <div>{entry.actor || "unknown"}</div>
                <div>{entry.actorRole || ""}</div>
                <div>{when(entry.at)}</div>
              </div>
            </li>
          ))}
        </ul>
        {!loading && !rows.length ? (
          <EmptyState icon={<ScrollText size={24} />} title="Nothing recorded yet" description="Publishing a card, deciding a payment or changing a role writes one line here." />
        ) : null}
      </div>
    </div>
  );
}

function when(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
