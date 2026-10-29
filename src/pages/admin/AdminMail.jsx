import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../../store/AppContext.jsx";
import {
  clearFinishedRecoveryRequests,
  closeRecoveryRequest,
  deleteRecoveryRequest,
  getMailSettings,
  issueRecoveryCode,
  listRecoveryRequests,
  saveMailSettings,
  sendTestEmail
} from "../../lib/api.js";

const EMPTY_MAIL_FORM = {
  preference: "auto",
  relayUrl: "",
  relayApiKey: "",
  relayFrom: "",
  smtpHost: "",
  smtpPort: "",
  smtpSecure: false,
  smtpUser: "",
  smtpPass: "",
  smtpFrom: "",
  brevoApiKey: "",
  brevoFrom: "",
  mailtrapToken: "",
  mailtrapFrom: "",
  mailtrapTemplateUuid: ""
};

const PROVIDER_LABEL = {
  relay: "Hyvor Relay",
  smtp: "SMTP · Nodemailer",
  brevo: "Brevo API · HTTPS",
  mailtrap: "Mailtrap API · HTTPS",
  none: "Not configured"
};

// Brevo pins API traffic to authorised IPs, which keeps breaking on dynamic
// connections; turn the raw 401 into the action that fixes it.
function mailFailureMessage(error, fallback) {
  const text = String(error || "");
  if (/unrecognised IP address|unauthori[sz]ed IP|525 5\.7\.1/i.test(text)) {
    return "Brevo blocked this machine's IP. Switch that off in Brevo → Security → Authorised IPs (serverless hosts rotate their addresses), or move to Mailtrap.";
  }
  return text || fallback;
}

const isOpenRequest = (req) => req.status === "pending" || req.status === "code-issued";

const STATUS_LABEL = {
  pending: "asked",
  "code-issued": "code sent",
  completed: "reset done",
  closed: "closed"
};

const STATUS_TONE = {
  pending: "text-bg-info",
  "code-issued": "text-bg-warning",
  completed: "text-bg-success",
  closed: "text-bg-secondary"
};

function when(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function codeNote(req) {
  const expires = Date.parse(req.codeExpiresAt || "");
  if (req.status === "completed") return "password changed";
  if (req.status === "closed") return "closed";
  if (!Number.isFinite(expires)) return "no code issued yet";
  if (expires <= Date.now()) return "code expired — send a new one";
  return `${req.mailDelivered === false ? "email failed" : "code emailed"} · live until ${new Date(expires).toLocaleTimeString()}`;
}

export default function AdminMail() {
  const { session, toast, isAdmin } = useApp();
  const [requests, setRequests] = useState([]);
  const [revealed, setRevealed] = useState({});
  const [filter, setFilter] = useState("open");
  const [busyRequest, setBusyRequest] = useState("");
  const [mail, setMail] = useState(null);
  const [form, setForm] = useState(EMPTY_MAIL_FORM);
  const [stored, setStored] = useState({ relayKey: false, smtpPass: false, brevoKey: false, mailtrapToken: false });
  const [savingMail, setSavingMail] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const applyMailResponse = useCallback((res) => {
    if (!res || !res.ok) return false;
    setMail(res);
    if (res.settings) {
      setStored({
        relayKey: Boolean(res.settings.hasRelayKey),
        smtpPass: Boolean(res.settings.hasSmtpPass),
        brevoKey: Boolean(res.settings.hasBrevoKey),
        mailtrapToken: Boolean(res.settings.hasMailtrapToken)
      });
      setForm((prev) => ({
        ...prev,
        preference: res.settings.preference || "auto",
        relayUrl: res.settings.relayUrl || "",
        relayFrom: res.settings.relayFrom || "",
        smtpHost: res.settings.smtpHost || "",
        smtpPort: res.settings.smtpPort || "",
        smtpSecure: Boolean(res.settings.smtpSecure),
        smtpUser: res.settings.smtpUser || "",
        smtpFrom: res.settings.smtpFrom || "",
        brevoFrom: res.settings.brevoFrom || "",
        mailtrapFrom: res.settings.mailtrapFrom || "",
        mailtrapTemplateUuid: res.settings.mailtrapTemplateUuid || "",
        relayApiKey: "",
        smtpPass: "",
        brevoApiKey: "",
        mailtrapToken: ""
      }));
    }
    return true;
  }, []);

  const saveMail = useCallback(
    async (extra) => {
      setSavingMail(true);
      const payload = {
        preference: form.preference,
        relayUrl: form.relayUrl.trim(),
        relayFrom: form.relayFrom.trim(),
        smtpHost: form.smtpHost.trim(),
        smtpPort: Number(form.smtpPort) || 0,
        smtpSecure: form.smtpSecure,
        smtpUser: form.smtpUser.trim(),
        smtpFrom: form.smtpFrom.trim(),
        brevoFrom: form.brevoFrom.trim(),
        mailtrapFrom: form.mailtrapFrom.trim(),
        mailtrapTemplateUuid: form.mailtrapTemplateUuid.trim()
      };
      if (form.relayApiKey.trim()) payload.relayApiKey = form.relayApiKey.trim();
      if (form.smtpPass.trim()) payload.smtpPass = form.smtpPass.trim();
      if (form.brevoApiKey.trim()) payload.brevoApiKey = form.brevoApiKey.trim();
      if (form.mailtrapToken.trim()) payload.mailtrapToken = form.mailtrapToken.trim();
      const res = await saveMailSettings({ ...payload, ...(extra || {}) }, session.authToken);
      setSavingMail(false);
      if (applyMailResponse(res)) {
        toast(
          res.provider === "none"
            ? "Email settings saved — no usable provider yet, so codes stay manual."
            : `Email settings saved — codes now send via ${PROVIDER_LABEL[res.provider] || res.provider}.`
        );
      } else toast((res && res.error) || "Could not save email settings.");
    },
    [applyMailResponse, form, session, toast]
  );

  const loadRequests = useCallback(async () => {
    if (!isAdmin || !session) return;
    const res = await listRecoveryRequests(session.authToken);
    if (res && Array.isArray(res.requests)) setRequests(res.requests);
    applyMailResponse(await getMailSettings(session.authToken));
  }, [applyMailResponse, isAdmin, session]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const openCount = requests.filter(isOpenRequest).length;
  const finishedCount = requests.length - openCount;
  const visibleRequests = useMemo(
    () =>
      requests.filter((req) =>
        filter === "all" ? true : filter === "open" ? isOpenRequest(req) : !isOpenRequest(req)
      ),
    [filter, requests]
  );

  const sendCode = useCallback(
    async (req) => {
      setBusyRequest(req.id);
      const res = await issueRecoveryCode(req.id, session.authToken);
      setBusyRequest("");
      if (res && res.ok && res.code) setRevealed((prev) => ({ ...prev, [req.id]: res.code }));
      if (res && res.ok && res.sent) toast(`Recovery code emailed to ${req.email} via ${res.provider}.`);
      else if (res && res.ok)
        toast(mailFailureMessage(res.error, "Email delivery failed — read the code in the row and hand it over."));
      else toast((res && res.error) || "Could not issue a code.");
      loadRequests();
    },
    [loadRequests, session, toast]
  );

  const copyCode = useCallback(
    async (req) => {
      try {
        await navigator.clipboard.writeText(revealed[req.id]);
        toast("Code copied.");
      } catch {
        toast("Copy failed — select the digits and copy them.");
      }
    },
    [revealed, toast]
  );

  const closeRequest = useCallback(
    async (req) => {
      setBusyRequest(req.id);
      const res = await closeRecoveryRequest(req.id, session.authToken);
      setBusyRequest("");
      if (!res || res.ok === false) toast((res && res.error) || "Could not close this request.");
      loadRequests();
    },
    [loadRequests, session, toast]
  );

  const deleteRequest = useCallback(
    async (req) => {
      setBusyRequest(req.id);
      const res = await deleteRecoveryRequest(req.id, session.authToken);
      setBusyRequest("");
      if (!res || res.ok === false) {
        toast((res && res.error) || "Could not delete this request.");
        return;
      }
      setRequests((prev) => prev.filter((item) => item.id !== req.id));
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[req.id];
        return next;
      });
      toast(isOpenRequest(req) ? `Deleted — the code for ${req.email} no longer works.` : "Recovery request deleted.");
    },
    [session, toast]
  );

  const clearFinished = useCallback(async () => {
    setBusyRequest("clear");
    const res = await clearFinishedRecoveryRequests(session.authToken);
    setBusyRequest("");
    if (!res || res.ok === false) {
      toast((res && res.error) || "Could not clear the finished requests.");
      return;
    }
    toast(res.removed ? `Removed ${res.removed} finished ${res.removed === 1 ? "request" : "requests"}.` : "Nothing to clear.");
    loadRequests();
  }, [loadRequests, session, toast]);

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card p-3">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <h3 className="h6 mb-0">Password recovery requests</h3>
          {openCount ? <span className="badge text-bg-warning rounded-pill">{openCount} waiting</span> : null}
          <div className="btn-group btn-group-sm">
            {["open", "finished", "all"].map((key) => (
              <button
                key={key}
                type="button"
                className={`btn btn-sm py-0 text-capitalize ${filter === key ? "btn-soft" : "btn-outline-secondary"}`}
                onClick={() => setFilter(key)}
              >
                {key} ({key === "open" ? openCount : key === "finished" ? finishedCount : requests.length})
              </button>
            ))}
          </div>
          <span className="flex-grow-1" />
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary py-0"
            disabled={!finishedCount || busyRequest === "clear"}
            onClick={clearFinished}
          >
            {busyRequest === "clear" ? "Clearing…" : "Clear finished"}
          </button>
        </div>

        {visibleRequests.length ? (
          <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
            {visibleRequests.map((req) => (
              <li key={req.id} className="d-flex flex-wrap align-items-center gap-2 small">
                <div style={{ minWidth: 200 }}>
                  <div className="fw-semibold">{req.name || req.email}</div>
                  <div className="text-secondary">
                    {req.email} · asked {when(req.createdAt)}
                  </div>
                </div>
                <span className={`badge rounded-pill ${STATUS_TONE[req.status] || "text-bg-secondary"}`}>
                  {STATUS_LABEL[req.status] || req.status}
                </span>
                <span className="text-secondary" title={req.mailError || undefined}>
                  {codeNote(req)}
                </span>
                {revealed[req.id] ? (
                  <>
                    <span className="badge text-bg-warning font-monospace">{revealed[req.id]}</span>
                    <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => copyCode(req)}>
                      Copy
                    </button>
                  </>
                ) : null}
                <span className="flex-grow-1" />
                {isOpenRequest(req) ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-sm btn-soft py-0"
                      disabled={busyRequest === req.id}
                      onClick={() => sendCode(req)}
                    >
                      {busyRequest === req.id ? "Sending…" : req.codeSentAt ? "Resend code" : "Send code"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary py-0"
                      disabled={busyRequest === req.id}
                      onClick={() => closeRequest(req)}
                    >
                      Close
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger py-0"
                  disabled={busyRequest === req.id}
                  onClick={() => deleteRequest(req)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small text-secondary mb-0">
            {filter === "open"
              ? "No request is waiting. New reset requests land here the moment a student asks."
              : "Nothing in this list."}
          </p>
        )}
      </div>

      <div className="card p-3">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
          <h3 className="h6 mb-0">Email delivery</h3>
          <span className={`badge ${mail && mail.provider === "none" ? "text-bg-danger" : "text-bg-success"}`}>
            {mail ? PROVIDER_LABEL[mail.provider] : "Checking…"}
          </span>
          <span className="flex-grow-1" />
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 180 }}
            value={form.preference}
            onChange={(e) => setForm({ ...form, preference: e.target.value })}
          >
            <option value="auto">Provider: automatic</option>
            <option value="relay">Provider: Relay</option>
            <option value="brevo">Provider: Brevo API</option>
            <option value="mailtrap">Provider: Mailtrap API</option>
            <option value="smtp">Provider: SMTP</option>
            <option value="none">Provider: off</option>
          </select>
        </div>
        <p className="small text-secondary mb-3">
          {mail && mail.provider === "relay"
            ? `Codes leave through your Relay project at ${mail.relay.endpoint} as ${mail.relay.from}.`
            : mail && mail.provider === "brevo"
            ? `Codes leave through the Brevo HTTPS API as ${mail.brevo.from} — no SMTP ports and no IP allowlist involved.`
            : mail && mail.provider === "mailtrap"
            ? `Codes leave through the Mailtrap HTTPS API as ${mail.mailtrap.from} — no SMTP ports and no IP allowlist involved.`
            : mail && mail.provider === "smtp"
            ? `Codes leave through SMTP at ${mail.smtp.host}:${mail.smtp.port} as ${mail.smtp.from}.`
            : mail && !mail.brevo.configured && mail.brevo.from
            ? `Brevo sender is saved — paste the Brevo API key (xkeysib-…) and press Save.`
            : mail && !mail.mailtrap?.configured && mail.mailtrap?.from
            ? `Mailtrap sender is saved — paste the Mailtrap API token and press Save.`
            : mail && !mail.smtp.configured && mail.smtp.host
            ? `Host and sender are saved — paste the SMTP password for ${mail.smtp.user} (Gmail requires an app password) and press Save.`
            : mail && mail.relay.endpoint && !mail.relay.configured
            ? "Relay URL is saved — add the project API key (sends:send) and the verified sender, then press Save."
            : "Fill in Relay, Brevo, Mailtrap or SMTP details and press Save — codes start sending immediately, no restart. Until then, issue codes on the Students page and share them manually."}
        </p>

        <div className="row g-2">
          <div className="col-12 col-lg-6">
            <div className="small fw-semibold mb-2">Hyvor Relay</div>
            <div className="d-flex flex-column gap-2">
              <input
                className="form-control form-control-sm"
                placeholder="Relay URL, e.g. https://relay.example.com"
                value={form.relayUrl}
                onChange={(e) => setForm({ ...form, relayUrl: e.target.value })}
              />
              <div className="d-flex gap-2">
                <input
                  className="form-control form-control-sm"
                  type="password"
                  autoComplete="new-password"
                  placeholder={stored.relayKey ? "Project API key · saved (leave blank to keep)" : "Project API key (sends:send)"}
                  value={form.relayApiKey}
                  onChange={(e) => setForm({ ...form, relayApiKey: e.target.value })}
                />
                {stored.relayKey ? (
                  <button type="button" className="btn btn-sm btn-outline-secondary flex-shrink-0" onClick={() => saveMail({ clearRelayKey: true })}>
                    Remove key
                  </button>
                ) : null}
              </div>
              <input
                className="form-control form-control-sm"
                placeholder="Verified sender, e.g. Wollo Share <no-reply@yourdomain.com>"
                value={form.relayFrom}
                onChange={(e) => setForm({ ...form, relayFrom: e.target.value })}
              />
            </div>
          </div>

          <div className="col-12 col-lg-6">
            <div className="small fw-semibold mb-2">SMTP (Brevo, Gmail, …)</div>
            <div className="d-flex flex-column gap-2">
              <div className="d-flex gap-2">
                <input
                  className="form-control form-control-sm"
                  placeholder="Host, e.g. smtp-relay.brevo.com"
                  value={form.smtpHost}
                  onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                />
                <input
                  className="form-control form-control-sm"
                  style={{ maxWidth: 96 }}
                  placeholder="Port"
                  inputMode="numeric"
                  value={form.smtpPort}
                  onChange={(e) => setForm({ ...form, smtpPort: e.target.value, smtpSecure: e.target.value.trim() === "465" })}
                />
              </div>
              <div className="d-flex gap-2">
                <input
                  className="form-control form-control-sm"
                  placeholder="SMTP login / user"
                  value={form.smtpUser}
                  onChange={(e) => setForm({ ...form, smtpUser: e.target.value })}
                />
                <div className="form-check align-self-center ms-2">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="mailSmtpSecure"
                    checked={form.smtpSecure}
                    onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })}
                  />
                  <label className="form-check-label small" htmlFor="mailSmtpSecure">
                    SSL (465)
                  </label>
                </div>
              </div>
              <div className="d-flex gap-2">
                <input
                  className="form-control form-control-sm"
                  type="password"
                  autoComplete="new-password"
                  placeholder={stored.smtpPass ? "Password / SMTP key · saved (leave blank to keep)" : "Password or SMTP key"}
                  value={form.smtpPass}
                  onChange={(e) => setForm({ ...form, smtpPass: e.target.value })}
                />
                {stored.smtpPass ? (
                  <button type="button" className="btn btn-sm btn-outline-secondary flex-shrink-0" onClick={() => saveMail({ clearSmtpPass: true })}>
                    Remove
                  </button>
                ) : null}
              </div>
              <input
                className="form-control form-control-sm"
                placeholder="From address (must be verified with the provider)"
                value={form.smtpFrom}
                onChange={(e) => setForm({ ...form, smtpFrom: e.target.value })}
              />
            </div>
          </div>

          <div className="col-12 col-lg-6">
            <div className="small fw-semibold mb-2">Mailtrap HTTPS API (production sending)</div>
            <div className="d-flex flex-column gap-2">
              <div className="d-flex gap-2">
                <input
                  className="form-control form-control-sm"
                  type="password"
                  autoComplete="new-password"
                  placeholder={stored.mailtrapToken ? "Mailtrap API token · saved (leave blank to keep)" : "Mailtrap API token"}
                  value={form.mailtrapToken}
                  onChange={(e) => setForm({ ...form, mailtrapToken: e.target.value })}
                />
                {stored.mailtrapToken ? (
                  <button type="button" className="btn btn-sm btn-outline-secondary flex-shrink-0" onClick={() => saveMail({ clearMailtrapToken: true })}>
                    Remove
                  </button>
                ) : null}
              </div>
              <input
                className="form-control form-control-sm"
                placeholder="Mailtrap sender (leave blank to use the SMTP from address)"
                value={form.mailtrapFrom}
                onChange={(e) => setForm({ ...form, mailtrapFrom: e.target.value })}
              />
              <input
                className="form-control form-control-sm"
                placeholder="Hosted template UUID (optional — password reset email)"
                value={form.mailtrapTemplateUuid}
                onChange={(e) => setForm({ ...form, mailtrapTemplateUuid: e.target.value })}
              />
            </div>
          </div>

          <div className="col-12">
            <div className="small fw-semibold mb-2">Brevo HTTPS API (no SMTP ports, no IP allowlist)</div>
            <div className="d-flex gap-2">
              <input
                className="form-control form-control-sm"
                type="password"
                autoComplete="new-password"
                placeholder={stored.brevoKey ? "Brevo API key (xkeysib-…) · saved (leave blank to keep)" : "Brevo API key (xkeysib-…)"}
                value={form.brevoApiKey}
                onChange={(e) => setForm({ ...form, brevoApiKey: e.target.value })}
              />
              {stored.brevoKey ? (
                <button type="button" className="btn btn-sm btn-outline-secondary flex-shrink-0" onClick={() => saveMail({ clearBrevoKey: true })}>
                  Remove key
                </button>
              ) : null}
            </div>
            <input
              className="form-control form-control-sm mt-2"
              placeholder="Brevo sender (leave blank to use the SMTP from address)"
              value={form.brevoFrom}
              onChange={(e) => setForm({ ...form, brevoFrom: e.target.value })}
            />
            <p className="small text-secondary mb-0 mt-2">
              Keys and passwords are encrypted before they touch the database and are never shown again.
            </p>
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2 mt-3">
          <button type="button" className="btn btn-sm btn-primary py-0" disabled={savingMail} onClick={() => saveMail()}>
            {savingMail ? "Saving…" : "Save settings"}
          </button>
          <input
            className="form-control form-control-sm"
            style={{ maxWidth: 260 }}
            placeholder={session ? session.email : "test@yourdomain.com"}
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-sm btn-soft py-0"
            disabled={sendingTest}
            onClick={async () => {
              setSendingTest(true);
              const res = await sendTestEmail(testEmail.trim(), session.authToken);
              setSendingTest(false);
              if (res && res.ok) toast(`Test email sent to ${res.to} via ${res.provider}.`);
              else toast(mailFailureMessage(res && res.error, "Test email failed."));
            }}
          >
            {sendingTest ? "Sending…" : "Send test email"}
          </button>
        </div>
      </div>
    </div>
  );
}
