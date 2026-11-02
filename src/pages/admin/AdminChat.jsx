import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, MessageSquare, Pin, RefreshCw, ShieldAlert, Trash2, X } from "lucide-react";
import * as api from "../../lib/api.js";
import EmptyState from "../../components/EmptyState.jsx";
import { useApp } from "../../store/AppContext.jsx";

const SECTIONS = ["reports", "room", "restrictions", "rules"];
const ACTION_KINDS = ["mute", "suspend", "ban"];
const DURATIONS = [
  ["15", "15 minutes"],
  ["60", "1 hour"],
  ["360", "6 hours"],
  ["1440", "1 day"],
  ["10080", "1 week"],
  ["43200", "30 days"],
  ["0", "Forever"]
];

function when(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isStillOn(action) {
  if (action.lifted_at) return false;
  if (!action.until) return true;
  return Date.parse(action.until) > Date.now();
}

function actionBadge(action) {
  const live = isStillOn(action);
  const label = `${action.kind}${action.until ? ` until ${when(action.until)}` : ""}`;
  return (
    <span className={`badge rounded-pill text-bg-${live ? (action.kind === "ban" ? "danger" : "warning") : "secondary"}`}>
      {live ? label : `${action.kind} · over`}
    </span>
  );
}

// A message as the moderator sees it: the words, who said them and what can be done now.
function MessageLine({ message, onPin, onDelete, busyId }) {
  const canPin = typeof onPin === "function";
  return (
    <div className={`d-flex flex-wrap gap-2 align-items-start p-2 rounded ${message.deleted ? "bg-light" : ""}`}>
      <div className="flex-grow-1" style={{ minWidth: 220 }}>
        <div className="small">
          <strong>{message.author_name}</strong>
          <span className="text-secondary"> · {when(message.created_at)}</span>
          {message.pinned ? <span className="badge rounded-pill text-bg-info ms-2">pinned</span> : null}
        </div>
        {message.deleted ? (
          <div className="fst-italic small text-secondary">This message was removed.</div>
        ) : (
          <>
            <div className="small" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {message.body || <em className="text-secondary">(picture only)</em>}
            </div>
            {message.image ? (
              <a className="small" href={message.image} target="_blank" rel="noopener noreferrer">
                open attached picture
              </a>
            ) : null}
            {message.reply_to_name ? <div className="small text-secondary">replying to {message.reply_to_name}</div> : null}
          </>
        )}
      </div>
      <div className="d-flex gap-1">
        {!message.deleted && canPin ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => onPin(message)}
            disabled={busyId === message.id}
            title={message.pinned ? "Unpin this announcement" : "Pin it to the top of the room"}
          >
            <Pin size={14} aria-hidden="true" />
            <span className="visually-hidden">{message.pinned ? "Unpin message" : "Pin message"}</span>
          </button>
        ) : null}
        {!message.deleted ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            onClick={() => onDelete(message)}
            disabled={busyId === message.id}
            title="Remove this message from the room"
          >
            <Trash2 size={14} aria-hidden="true" />
            <span className="visually-hidden">Remove message</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminChat() {
  const { session, usersData, chatRules, saveChatRules, toast } = useApp();
  const [section, setSection] = useState("reports");
  const [reports, setReports] = useState([]);
  const [actions, setActions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [stats, setStats] = useState({ messages: 0, today: 0, openReports: 0 });
  const [showReviewed, setShowReviewed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ userId: "", kind: "mute", minutes: "60", reason: "" });
  const [rules, setRules] = useState(chatRules.join("\n"));

  useEffect(() => setRules(chatRules.join("\n")), [chatRules]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    const [queue, room] = await Promise.all([api.readChatReports(session.authToken, showReviewed), api.readChat(session.authToken, { limit: 120 })]);
    if (queue && queue.ok !== false) {
      setReports(Array.isArray(queue.reports) ? queue.reports : []);
      setActions(Array.isArray(queue.actions) ? queue.actions : []);
      setStats(queue.stats || stats);
    } else setError((queue && queue.error) || "The moderation queue could not be read.");
    if (room && room.ok !== false) setMessages(Array.isArray(room.messages) ? room.messages : []);
    setLoading(false);
  }, [session, showReviewed, stats]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, showReviewed]);

  const students = useMemo(() => usersData.filter((u) => (u.role || "user") === "user"), [usersData]);

  const removeMessage = async (message) => {
    setBusyId(message.id);
    const res = await api.deleteChatMessage(message.id, session.authToken);
    setBusyId("");
    if (!res || res.ok === false) {
      toast((res && res.error) || "The message is still in the room.");
      return;
    }
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, deleted: true, body: "", image: null } : m)));
    toast("Removed from the room — the student sees a gap, not their words.");
  };

  const pinMessage = async (message) => {
    setBusyId(message.id);
    const res = await api.pinChatMessage(message.id, !message.pinned, session.authToken);
    setBusyId("");
    if (!res || res.ok === false) {
      toast((res && res.error) || "That did not stick.");
      return;
    }
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, pinned: res.pinned } : m)));
    toast(res.pinned ? "Pinned to the top of the room." : "Unpinned.");
  };

  const closeReport = async (report) => {
    setBusyId(report.id);
    const res = await api.resolveChatReport(report.id, session.authToken);
    setBusyId("");
    if (!res || res.ok === false) {
      toast((res && res.error) || "The report is still open.");
      return;
    }
    if (showReviewed) setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, status: "reviewed" } : r)));
    else setReports((prev) => prev.filter((r) => r.id !== report.id));
    toast("Report closed.");
  };

  const restrict = async (event) => {
    event.preventDefault();
    if (!form.userId) {
      toast("Choose the account first.");
      return;
    }
    const minutes = Number(form.minutes) || 0;
    if (form.kind !== "ban" && !minutes) {
      toast("A mute or a suspension needs an end — use a ban to remove an account for good.");
      return;
    }
    setBusyId("restrict");
    const res = await api.restrictChatUser({ kind: form.kind, userId: form.userId, minutes, reason: form.reason.trim() }, session.authToken);
    setBusyId("");
    if (!res || res.ok === false) {
      toast((res && res.error) || "That restriction was not saved.");
      return;
    }
    setForm({ userId: "", kind: "mute", minutes: "60", reason: "" });
    toast(`${res.action.kind === "ban" ? "Removed" : res.action.kind === "suspend" ? "Suspended" : "Muted"} from the chatroom.`);
    load();
  };

  const lift = async (action) => {
    setBusyId(action.id);
    const res = await api.liftChatAction(action.id, session.authToken);
    setBusyId("");
    if (!res || res.ok === false) {
      toast((res && res.error) || "The restriction is still in place.");
      return;
    }
    setActions((prev) => prev.map((a) => (a.id === action.id ? { ...a, lifted_at: new Date().toISOString() } : a)));
    toast("Restriction lifted.");
  };

  const saveRules = () => {
    const lines = rules.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      toast("Write at least one rule, or leave the defaults in place.");
      return;
    }
    saveChatRules(lines);
    toast("Rules published to the chatroom.");
  };

  const openCount = reports.filter((r) => r.status === "open").length;
  const liveActions = actions.filter(isStillOn);

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <span className="ws-section-kicker">Support team</span>
          <h2 className="h4 mb-1">Chatroom moderation</h2>
          <p className="small text-secondary mb-0">
            {stats.messages} messages in the room · {stats.today} today · {openCount} report{openCount === 1 ? "" : "s"} open ·{" "}
            {liveActions.length} restriction{liveActions.length === 1 ? "" : "s"} live.
          </p>
        </div>
        <div className="d-flex gap-2">
          <div className="ws-segmented" role="tablist" aria-label="Moderation section">
            {SECTIONS.map((key) => (
              <button key={key} type="button" role="tab" aria-selected={section === key} className={section === key ? "active" : ""} onClick={() => setSection(key)}>
                {key}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={`me-1 align-text-bottom ${loading ? "spin" : ""}`} aria-hidden="true" />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="banner warn" role="alert">
          <ShieldAlert size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {section === "reports" ? (
        <div className="d-flex flex-column gap-2">
          <label className="d-flex align-items-center gap-2 small mb-0">
            <input type="checkbox" className="form-check-input mt-0" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} />
            Include reports already reviewed
          </label>
          {reports.map((report) => (
            <div key={report.id} className="card p-3 d-flex flex-column gap-2">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <span className="badge rounded-pill text-bg-danger">{report.status === "open" ? "reported" : "reviewed"}</span>
                <span className="small text-secondary">{when(report.created_at)}</span>
              </div>
              <div className="small">
                <strong>Reason:</strong> {report.reason}
              </div>
              {report.message ? (
                <MessageLine message={report.message} onPin={pinMessage} onDelete={removeMessage} busyId={busyId} />
              ) : (
                <p className="small text-secondary mb-0">That message is no longer in the room.</p>
              )}
              {report.status === "open" ? (
                <div className="d-flex justify-content-end gap-2">
                  {report.message && !report.message.deleted ? (
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeMessage(report.message)} disabled={busyId === report.message.id}>
                      <Trash2 size={14} className="me-1 align-text-bottom" aria-hidden="true" />
                      Remove message
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => closeReport(report)} disabled={busyId === report.id}>
                    <Check size={14} className="me-1 align-text-bottom" aria-hidden="true" />
                    {busyId === report.id ? "Closing…" : "Mark reviewed"}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {!reports.length && !loading ? (
            <EmptyState icon={<MessageSquare size={24} />} title="Nothing reported" description="Students report a line from the room; it lands in this queue for the team." />
          ) : null}
        </div>
      ) : null}

      {section === "room" ? (
        <div className="card p-2 d-flex flex-column gap-1">
          <p className="small text-secondary mb-1 px-2 pt-1">The last messages students sent. Pin one to keep it above the room.</p>
          {[...messages].reverse().map((message) => (
            <MessageLine key={message.id} message={message} onPin={pinMessage} onDelete={removeMessage} busyId={busyId} />
          ))}
          {!messages.length && !loading ? <EmptyState icon={<MessageSquare size={24} />} title="The room is empty" description="Nobody has said anything yet." /> : null}
        </div>
      ) : null}

      {section === "restrictions" ? (
        <div className="d-flex flex-column gap-3">
          <form className="card p-3 d-flex flex-column gap-2" onSubmit={restrict}>
            <h3 className="h6 mb-0">Restrict an account</h3>
            <div className="row g-2">
              <div className="col-12 col-md-5">
                <label className="form-label small fw-semibold" htmlFor="chatAccount">
                  Student account
                </label>
                <select id="chatAccount" className="form-select" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                  <option value="">Choose a student…</option>
                  {students.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-6 col-md-3">
                <label className="form-label small fw-semibold" htmlFor="chatKind">
                  What applies
                </label>
                <select id="chatKind" className="form-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {ACTION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-6 col-md-4">
                <label className="form-label small fw-semibold" htmlFor="chatMinutes">
                  How long
                </label>
                <select id="chatMinutes" className="form-select" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })}>
                  {DURATIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="form-label small fw-semibold mb-0" htmlFor="chatReason">
              Reason (the student is told this)
            </label>
            <input id="chatReason" className="form-control" maxLength={300} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Posting abusive replies in the exam thread" />
            <div className="d-flex justify-content-end">
              <button type="submit" className="btn btn-sm btn-coral" disabled={busyId === "restrict"}>
                <ShieldAlert size={15} className="me-1 align-text-bottom" aria-hidden="true" />
                {busyId === "restrict" ? "Saving…" : "Apply restriction"}
              </button>
            </div>
          </form>

          <div className="card p-2 d-flex flex-column gap-1">
            <p className="small text-secondary mb-1 px-2 pt-1">Every restriction the team has issued, newest first.</p>
            {actions.map((action) => {
              const account = usersData.find((u) => u.id === action.user_id);
              const live = isStillOn(action);
              return (
                <div key={action.id} className="d-flex flex-wrap align-items-center gap-2 p-2 rounded">
                  <div className="flex-grow-1 small" style={{ minWidth: 200 }}>
                    <strong>{account ? account.name || account.email : action.user_id}</strong>
                    <span className="text-secondary"> · {when(action.created_at)}</span>
                    {action.reason ? <div className="text-secondary">{action.reason}</div> : null}
                  </div>
                  {actionBadge(action)}
                  {live ? (
                    <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => lift(action)} disabled={busyId === action.id}>
                      <X size={14} className="me-1 align-text-bottom" aria-hidden="true" />
                      Lift
                    </button>
                  ) : null}
                </div>
              );
            })}
            {!actions.length && !loading ? <EmptyState icon={<ShieldAlert size={24} />} title="No restrictions" description="Nothing has been muted, suspended or banned." /> : null}
          </div>
        </div>
      ) : null}

      {section === "rules" ? (
        <div className="card p-3 d-flex flex-column gap-2">
          <h3 className="h6 mb-0">Community rules</h3>
          <p className="small text-secondary mb-0">One rule per line — students read them at the top of the chatroom.</p>
          <textarea className="form-control" rows={8} maxLength={2000} value={rules} onChange={(e) => setRules(e.target.value)} aria-label="Community rules, one per line" />
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setRules(chatRules.join("\n"))}>
              Reset
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={saveRules}>
              Publish rules
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
