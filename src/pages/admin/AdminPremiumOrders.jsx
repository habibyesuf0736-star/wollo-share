import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Crown, RefreshCw } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { PLANS } from "../../components/UpgradeGateModal.jsx";
import * as api from "../../lib/api.js";

function when(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const planTitle = (key) => (PLANS.find((item) => item.key === key) || {}).title || key || "Premium";

export default function AdminPremiumOrders({ onCountChange }) {
  const { session, usersData, toast, refreshFromServer } = useApp();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const res = await api.listTickets(session.authToken);
    if (res && res.ok !== false) {
      const list = Array.isArray(res.tickets) ? res.tickets : [];
      setTickets(list);
      onCountChange(list.filter((t) => t.premiumPlan && !t.premiumConfirmedAt && t.status !== "closed").length);
    } else if (res && res.error) {
      toast(res.error);
    }
    setLoading(false);
  }, [onCountChange, session, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const byId = useMemo(() => new Map(usersData.map((user) => [user.id, user])), [usersData]);
  const waiting = tickets.filter((t) => t.premiumPlan && !t.premiumConfirmedAt && t.status !== "closed");
  const activated = tickets.filter((t) => t.premiumPlan && t.premiumConfirmedAt).slice(0, 8);

  const activate = async (ticket) => {
    setBusyId(ticket.id);
    const res = await api.approvePremiumRequest(ticket.id, session.authToken);
    setBusyId("");
    if (!res || res.ok === false) {
      toast((res && res.error) || "The plan was not changed.");
      return;
    }
    setTickets((prev) => prev.map((item) => (item.id === res.ticket.id ? res.ticket : item)));
    onCountChange(waiting.filter((item) => item.id !== ticket.id).length);
    toast(`${ticket.userName || ticket.userEmail} is now on ${planTitle(ticket.premiumPlan)}.`);
    await refreshFromServer();
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <span className="ws-section-kicker">Wollo Share Premium</span>
          <h2 className="h4 mb-1">Premium orders</h2>
          <p className="small text-secondary mb-0">
            {waiting.length} waiting for payment confirmation. Activating a plan switches the student's account immediately.
          </p>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={`me-1 align-text-bottom ${loading ? "spin" : ""}`} aria-hidden="true" />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="d-flex flex-column gap-2">
        {waiting.map((ticket) => {
          const student = byId.get(ticket.userId);
          return (
            <div key={ticket.id} className="card p-3">
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                <div>
                  <div className="fw-semibold">
                    {ticket.userName || ticket.userEmail}
                    {student?.phone ? <span className="small text-secondary"> · {student.phone}</span> : null}
                  </div>
                  <div className="small text-secondary">
                    {ticket.userEmail} · asked {when(ticket.createdAt)}
                  </div>
                </div>
                <span className="badge text-bg-warning rounded-pill">waiting</span>
              </div>
              <div className="d-flex flex-wrap align-items-center gap-3 small mt-2">
                <span>
                  <strong>{planTitle(ticket.premiumPlan)}</strong> · {ticket.premiumPrice}
                </span>
                <span className="text-secondary">
                  {ticket.premiumReference ? `Reference: ${ticket.premiumReference}` : "No payment reference given"}
                </span>
              </div>
              <div className="d-flex justify-content-end mt-2">
                <button type="button" className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1" onClick={() => activate(ticket)} disabled={busyId === ticket.id}>
                  <Check size={14} aria-hidden="true" />
                  {busyId === ticket.id ? "Activating…" : "Payment received — activate plan"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && !waiting.length ? (
        <EmptyState
          icon={<Crown size={24} />}
          title="No premium orders waiting"
          description="Orders students send from the premium page land here, with their payment reference."
        />
      ) : null}

      {activated.length ? (
        <div>
          <h3 className="h6 mb-2">Recently activated</h3>
          <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
            {activated.map((ticket) => (
              <li key={ticket.id} className="small d-flex flex-wrap justify-content-between gap-2">
                <span>
                  <strong>{ticket.userName || ticket.userEmail}</strong> · {planTitle(ticket.premiumPlan)} · {ticket.premiumPrice}
                </span>
                <span className="text-secondary">{when(ticket.premiumConfirmedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
