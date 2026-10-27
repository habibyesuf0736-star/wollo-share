import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../../store/AppContext.jsx";
import Modal from "../../components/Modal.jsx";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import DepartmentSelect from "../../components/DepartmentSelect.jsx";
import { approveVerification, closeRecoveryRequest, createStudentAccount, getMailSettings, issueRecoveryCode, listRecoveryRequests, listVerifications, saveMailSettings, sendTestEmail, shareVerificationCode } from "../../lib/api.js";
import { phoneProblem } from "../../lib/utils.js";

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
    return "Brevo blocked this machine's IP. Authorize it in Brevo → Security → Authorised IPs, or switch the provider to Mailtrap.";
  }
  return text || fallback;
}

const PLANS = [
  ["unpaid", "Unpaid (2 uploads per download)"],
  ["premium_monthly", "Premium monthly · 100 Birr"],
  ["premium_annual", "Premium annual · 250 Birr"],
  ["paid_lifetime", "Paid 500 Birr · Lifetime"],
  ["paid_download_only", "Paid · Download-only"]
];

const EMPTY_STUDENT_FORM = { name: "", email: "", password: "", department: "", phone: "", accountPlan: "unpaid" };

export default function AdminUsers() {
  const { usersData, saveUser, deleteUser, setUserRole, toast, session, isAdmin, coursesData, refreshFromServer } = useApp();
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [editError, setEditError] = useState("");
  const [confirm, setConfirm] = useState({ open: false, userId: null });
  const [roleBusy, setRoleBusy] = useState("");
  const [profile, setProfile] = useState(null);
  const [verifications, setVerifications] = useState({ pending: [], mailConfigured: true });
  const [approving, setApproving] = useState("");
  const [sharing, setSharing] = useState("");
  const [sharedCode, setSharedCode] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_STUDENT_FORM);
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);
  const [requests, setRequests] = useState([]);
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

  // New signups stay unverified until they confirm the 6-digit code or an
  // administrator approves them here — the only path that works while mail is down.
  const loadVerifications = useCallback(async () => {
    if (!isAdmin || !session) return;
    const res = await listVerifications(session.authToken);
    if (res && res.ok) {
      setVerifications({
        pending: Array.isArray(res.pending) ? res.pending : [],
        mailConfigured: res.mailConfigured !== false
      });
    }
  }, [isAdmin, session]);

  useEffect(() => {
    loadVerifications();
  }, [loadVerifications]);

  // A student who signs up while this tab is open should show up without a manual refresh.
  useEffect(() => {
    if (!isAdmin) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadVerifications();
    }, 20000);
    return () => clearInterval(timer);
  }, [isAdmin, loadVerifications]);

  const showCode = async (entry) => {
    setSharing(entry.id);
    const res = await shareVerificationCode(entry.id, session.authToken);
    setSharing("");
    if (!res || !res.ok || !res.code) {
      toast((res && res.error) || "Could not create a code for that account.");
      return;
    }
    setSharedCode({ name: entry.name || entry.email, email: entry.email, code: res.code, expiresAt: res.expiresAt });
  };

  const approveAccount = async (entry) => {
    setApproving(entry.id);
    const res = await approveVerification(entry.id, session.authToken);
    setApproving("");
    if (!res || !res.ok) {
      toast((res && res.error) || "Could not verify that account.");
      return;
    }
    toast(res.message || `${entry.name || entry.email} can now sign in.`);
    await loadVerifications();
    await refreshFromServer();
  };

  const submitStudent = async (event) => {
    event.preventDefault();
    setAddError("");
    if (addForm.name.trim().length < 2) {
      setAddError("Enter the student's full name.");
      return;
    }
    if (!addForm.email.includes("@")) {
      setAddError("Enter a valid email address.");
      return;
    }
    if (addForm.password.length < 4) {
      setAddError("The starting password needs at least 4 characters.");
      return;
    }
    const addPhoneError = phoneProblem(addForm.phone);
    if (addPhoneError) {
      setAddError(addPhoneError);
      return;
    }
    setAdding(true);
    const res = await createStudentAccount(
      {
        name: addForm.name.trim(),
        email: addForm.email.trim(),
        password: addForm.password,
        department: addForm.department,
        phone: addForm.phone.trim(),
        accountPlan: addForm.accountPlan
      },
      session.authToken
    );
    setAdding(false);
    if (!res || !res.ok) {
      setAddError((res && res.error) || "Could not add the student.");
      return;
    }
    toast(res.message || "Student added.");
    setAddOpen(false);
    setAddForm(EMPTY_STUDENT_FORM);
    await refreshFromServer();
  };

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return usersData.filter((user) => {
      const plan = user.accountPlan || (user.downloadOnlyAccount ? "paid_download_only" : user.paymentStatus === "paid" ? "paid_lifetime" : "unpaid");
      if (planFilter !== "all" && plan !== planFilter) return false;
      if (!needle) return true;
      return (
        (user.name || "").toLowerCase().includes(needle) ||
        (user.email || "").toLowerCase().includes(needle) ||
        (user.department || "").toLowerCase().includes(needle)
      );
    });
  }, [planFilter, search, usersData]);

  const planOf = (user) =>
    user.accountPlan || (user.downloadOnlyAccount ? "paid_download_only" : user.paymentStatus === "paid" ? "paid_lifetime" : "unpaid");

  const planLabelOf = (user) => {
    const key = planOf(user);
    const match = PLANS.find(([value]) => value === key);
    return match ? match[1] : key;
  };

  const updatePlan = (user, plan) => {
    saveUser({
      ...user,
      accountPlan: plan,
      paymentStatus: plan === "unpaid" ? "unpaid" : "paid",
      downloadOnlyAccount: plan === "paid_download_only",
      category:
        plan === "paid_lifetime"
          ? "Paid 500 Birr · Lifetime VIP"
          : plan === "paid_download_only"
          ? "Paid · Download-only account"
          : plan === "premium_annual"
          ? "Premium Annual"
          : plan === "premium_monthly"
          ? "Premium Monthly"
          : "Unpaid · Pending 2 Uploads",
      subscriptionExpiry:
        plan === "premium_annual"
          ? new Date(Date.now() + 365 * 86400000).toISOString()
          : plan === "premium_monthly"
          ? new Date(Date.now() + 30 * 86400000).toISOString()
          : user.subscriptionExpiry
    });
    toast(`${user.name || user.email} moved to ${plan}.`);
  };

  const saveEdit = (event) => {
    event.preventDefault();
    const editPhoneError = phoneProblem(editing.phone);
    if (editPhoneError) {
      setEditError(editPhoneError);
      return;
    }
    setEditError("");
    saveUser({
      ...editing,
      name: editing.name.trim(),
      email: editing.email.trim().toLowerCase(),
      department: editing.department || "",
      phone: editing.phone.trim().slice(0, 32)
    });
    toast("Account updated.");
    setEditing(null);
  };

  const toggleStaff = async (user) => {
    const nextRole = user.role === "support" ? "user" : "support";
    setRoleBusy(user.id);
    const res = await setUserRole(user.id, nextRole);
    setRoleBusy("");
    if (res && res.ok === false && res.error) toast(res.error);
  };

  return (
    <div className="d-flex flex-column gap-3">
      {verifications.pending.length || !verifications.mailConfigured ? (
        <div className="card p-3">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <h3 className="h6 mb-0">Awaiting verification</h3>
            <span className={`badge ${verifications.pending.length ? "text-bg-warning" : "text-bg-secondary"}`}>
              {verifications.pending.length} pending
            </span>
            <span className="flex-grow-1" />
            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={loadVerifications}>
              Refresh
            </button>
          </div>
          {!verifications.mailConfigured ? (
            <p className="small text-secondary mb-2">
              Email delivery is not configured, so new students cannot receive their 6-digit code. Use <strong>Get code</strong> to
              read a fresh code and pass it on, or approve the account so they can sign in.
            </p>
          ) : (
            <p className="small text-secondary mb-2">
              Codes are emailed automatically. If a student says nothing arrived, press <strong>Get code</strong>, send it by
              phone or WhatsApp, or approve the account.
            </p>
          )}
          {verifications.pending.length ? (
            <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
              {verifications.pending.map((entry) => (
                <li key={entry.id} className="d-flex flex-wrap align-items-center gap-2 small">
                  <strong>{entry.name || entry.email}</strong>
                  <span className="text-secondary">{entry.email}</span>
                  {entry.department ? <span className="text-secondary">· {entry.department}</span> : null}
                  <span className="text-secondary">
                    · {entry.mailSent ? `code emailed${entry.expiresAt ? `, expires ${new Date(entry.expiresAt).toLocaleTimeString()}` : ""}` : "code not emailed"}
                    {entry.attempts ? ` · ${entry.attempts} wrong attempt${entry.attempts === 1 ? "" : "s"}` : ""}
                  </span>
                  <span className="flex-grow-1" />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary py-0"
                    disabled={sharing === entry.id}
                    onClick={() => showCode(entry)}
                  >
                    {sharing === entry.id ? "Preparing…" : "Get code"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-soft py-0"
                    disabled={approving === entry.id}
                    onClick={() => approveAccount(entry)}
                  >
                    {approving === entry.id ? "Approving…" : "Approve"}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small text-secondary mb-0">Everyone who signed up has been verified.</p>
          )}
        </div>
      ) : null}
      {requests.length ? (
        <div className="card p-3">
          <h3 className="h6 mb-2">Password recovery requests</h3>
          <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
            {requests.map((req) => (
              <li key={req.id} className="d-flex flex-wrap align-items-center gap-2 small">
                <strong>{req.name || req.email}</strong>
                <span className="text-secondary">{req.status}</span>
                <span className="text-secondary">
                  {req.codeSentAt ? `code emailed ${new Date(req.codeSentAt).toLocaleTimeString()}` : "code not emailed"}
                </span>
                <span className="flex-grow-1" />
                <button
                  type="button"
                  className="btn btn-sm btn-soft py-0"
                  onClick={async () => {
                    const res = await issueRecoveryCode(req.id, session.authToken);
                    if (res && res.ok && res.sent) toast(`Recovery code emailed to ${req.email} via ${res.provider}.`);
                    else if (res && res.ok) toast(mailFailureMessage(res.error, "Email delivery failed — no code was sent."));
                    else toast((res && res.error) || "Could not issue a code.");
                    loadRequests();
                  }}
                >
                  Re-send code by email
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary py-0"
                  onClick={async () => {
                    await closeRecoveryRequest(req.id, session.authToken);
                    loadRequests();
                  }}
                >
                  Close
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
            : "Fill in Relay, Brevo, Mailtrap or SMTP details and press Save — codes start sending immediately, no restart. Until then, issue codes here and share them manually."}
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

      <div className="card p-3">
        <div className="row g-2 align-items-end">
          <div className="col-12 col-md-5">
            <label className="form-label small fw-semibold">Search accounts</label>
            <input className="form-control" placeholder="Name, email or department" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Plan</label>
            <select className="form-select" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
              <option value="all">All plans</option>
              {PLANS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-4 text-md-end">
            <button
              type="button"
              className="btn btn-primary btn-sm mb-1"
              onClick={() => {
                setAddError("");
                setAddForm(EMPTY_STUDENT_FORM);
                setAddOpen(true);
              }}
            >
              Add student
            </button>
            <div className="small text-secondary">
              <strong>{rows.length}</strong> of {usersData.length} accounts
            </div>
          </div>
        </div>
      </div>

      <div className="card p-0 table-responsive table-stack">
        <table className="table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Student</th>
              <th>Department</th>
              <th>Plan</th>
              <th>Shared</th>
              <th>Downloads</th>
              <th>Access</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <tr key={user.id}>
                <td data-label="Student">
                  <div className="fw-semibold">
                    {user.name}
                    {user.role === "support" ? (
                      <span className="badge rounded-pill text-bg-info ms-2 align-middle" style={{ fontSize: 10 }}>
                        Support team
                      </span>
                    ) : null}
                  </div>
                  <div className="small text-secondary">{user.email}</div>
                </td>
                <td className="small" data-label="Department">{user.department || "—"}</td>
                <td className="col-plan" data-label="Plan">
                  <select className="form-select form-select-sm" value={planOf(user)} onChange={(e) => updatePlan(user, e.target.value)}>
                    {PLANS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="small" data-label="Shared">
                  {Number(user.sharedMaterialsCount) || 0}
                  <div className="text-secondary" style={{ fontSize: 11 }}>
                    {(Number(user.unpaidCurrentUploadProgress) || 0)}/2 toward next download
                  </div>
                </td>
                <td className="small" data-label="Downloads">{Number(user.downloadsCount) || 0}</td>
                <td className="small" data-label="Access">
                  {(user.allowedCourseIds || []).length} courses
                  <div className="text-secondary" style={{ fontSize: 11 }}>
                    {user.lastActiveAt || "—"}
                  </div>
                </td>
                <td className="text-end table-actions">
                  <div className="d-flex gap-1 flex-wrap justify-content-end">
                    <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => setProfile(user)}>
                      Profile
                    </button>
                    <button type="button" className="btn btn-sm btn-soft py-0" onClick={() => { setEditError(""); setEditing({ ...user }); }}>
                      Edit
                    </button>
                    {user.role !== "admin" ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary py-0"
                        disabled={roleBusy === user.id}
                        onClick={() => toggleStaff(user)}
                        title={user.role === "support" ? "Move back to a normal student account" : "Give this account the support panel"}
                      >
                        {roleBusy === user.id ? "Saving…" : user.role === "support" ? "Remove from team" : "Make support"}
                      </button>
                    ) : null}
                    <button type="button" className="btn btn-sm btn-coral py-0" onClick={() => setConfirm({ open: true, userId: user.id })}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-secondary small py-4">
                  No accounts match this search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit student account" subtitle="Passwords stay hashed — they are never shown or edited here." size="narrow">
        {editing ? (
          <form onSubmit={saveEdit} className="d-flex flex-column gap-3">
            <label className="form-label small fw-semibold mb-0">Full name</label>
            <input className="form-control" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <label className="form-label small fw-semibold mb-0">Email</label>
            <input className="form-control" value={editing.email || ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            <label className="form-label small fw-semibold mb-0">Department</label>
            <DepartmentSelect
              coursesData={coursesData}
              value={editing.department || ""}
              onChange={(department) => setEditing({ ...editing, department })}
            />
            <label className="form-label small fw-semibold mb-0">Phone number</label>
            <input className="form-control" inputMode="tel" value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            {editError ? (
              <div className="banner warn" role="alert">
                <span>{editError}</span>
              </div>
            ) : null}
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save account
              </button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(sharedCode)}
        onClose={() => setSharedCode(null)}
        title="Send this code to the student"
        subtitle={sharedCode ? `${sharedCode.name} · ${sharedCode.email}` : ""}
        size="narrow"
      >
        {sharedCode ? (
          <div className="d-flex flex-column gap-3">
            <div className="text-center py-3" style={{ border: "1px dashed var(--line)", borderRadius: 12 }}>
              <div className="mono" style={{ fontSize: 34, letterSpacing: "0.28em" }}>
                {sharedCode.code}
              </div>
              <div className="small text-secondary mt-1">
                Works once, expires{" "}
                {sharedCode.expiresAt ? new Date(sharedCode.expiresAt).toLocaleTimeString() : "in 30 minutes"}
              </div>
            </div>
            <p className="small text-secondary mb-0">
              {verifications.mailConfigured
                ? "Send this code by phone or WhatsApp if the student did not get the email."
                : "Email delivery is not reaching the student, so pass this code on by phone or WhatsApp."}{" "}
              The student types it on the verification screen that appeared after signing up. If you would rather skip
              the code, press Approve instead.
            </p>
            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(sharedCode.code);
                    toast("Code copied.");
                  } catch {
                    toast("Copy failed — select the digits and copy them manually.");
                  }
                }}
              >
                Copy code
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setSharedCode(null)}>
                Done
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a student" subtitle="The account works immediately with the password you set." size="narrow">
        <form onSubmit={submitStudent} className="d-flex flex-column gap-3">
          <div>
            <label className="form-label small fw-semibold">Full name</label>
            <input className="form-control" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
          </div>
          <div>
            <label className="form-label small fw-semibold">Email</label>
            <input className="form-control" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
          </div>
          <div>
            <label className="form-label small fw-semibold">Starting password</label>
            <input
              className="form-control"
              type="text"
              autoComplete="new-password"
              value={addForm.password}
              onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
            />
            <p className="small text-secondary mb-0 mt-1">Share it with the student; they can keep using it to sign in.</p>
          </div>
          <div>
            <label className="form-label small fw-semibold">Department</label>
            <DepartmentSelect
              coursesData={coursesData}
              value={addForm.department}
              onChange={(department) => setAddForm({ ...addForm, department })}
            />
          </div>
          <div className="row g-2">
            <div className="col-12 col-sm-6">
              <label className="form-label small fw-semibold">Phone number</label>
              <input className="form-control" inputMode="tel" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} />
            </div>
            <div className="col-12 col-sm-6">
              <label className="form-label small fw-semibold">Plan</label>
              <select
                className="form-select"
                value={addForm.accountPlan}
                onChange={(e) => setAddForm({ ...addForm, accountPlan: e.target.value })}
              >
                {PLANS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {addError ? (
            <div className="banner warn" role="alert">
              <span>{addError}</span>
            </div>
          ) : null}
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={adding}>
              {adding ? "Adding…" : "Add student"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(profile)}
        onClose={() => setProfile(null)}
        title={profile ? `${profile.name || profile.email}` : "Student profile"}
        subtitle={profile ? profile.email : ""}
      >
        {profile ? (
          <div className="d-flex flex-column gap-3">
            <ul className="list-unstyled small mb-0 d-flex flex-column gap-2">
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Department</span>
                <strong>{profile.department || "—"}</strong>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Phone</span>
                <strong>{profile.phone || "—"}</strong>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Plan</span>
                <strong>{planLabelOf(profile)}</strong>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Status</span>
                <strong>{profile.emailVerified === false ? "Awaiting verification" : "Verified"}</strong>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Downloads / credits</span>
                <strong>
                  {Number(profile.downloadsCount) || 0} · {Number(profile.downloadCredits) || 0} credit
                  {Number(profile.downloadCredits) === 1 ? "" : "s"}
                </strong>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Approved shares</span>
                <strong>{Number(profile.sharedMaterialsCount) || 0}</strong>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Assigned courses</span>
                <strong>{(profile.allowedCourseIds || []).length}</strong>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Last activity</span>
                <strong>{profile.lastActiveAt || "—"}</strong>
              </li>
              {profile.addedByAdmin ? (
                <li className="d-flex justify-content-between gap-2">
                  <span className="text-secondary">Created by</span>
                  <strong>Administrator</strong>
                </li>
              ) : null}
            </ul>

            <div>
              <h4 className="h6 mb-2">Activity</h4>
              {(profile.activityLog || []).length ? (
                <ul className="list-unstyled d-flex flex-column gap-2 mb-0" style={{ maxHeight: 240, overflowY: "auto" }}>
                  {profile.activityLog.map((event) => (
                    <li key={event.id} className="small">
                      <strong>{event.type}</strong> — {event.detail}
                      <span className="text-secondary d-block mono" style={{ fontSize: 11 }}>
                        {event.timestamp}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small text-secondary mb-0">No recorded activity for this account.</p>
              )}
            </div>

            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => {
                  setEditError("");
                  setEditing({ ...profile });
                  setProfile(null);
                }}
              >
                Edit account
              </button>
              <button
                type="button"
                className="btn btn-coral"
                onClick={() => {
                  setConfirm({ open: true, userId: profile.id });
                  setProfile(null);
                }}
              >
                Remove from site
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={confirm.open}
        title="Delete student account"
        message="The student will lose access to their uploads, ratings and downloads."
        onConfirm={async () => {
          const removed = await deleteUser(confirm.userId);
          if (removed) {
            toast("Account deleted.");
            await loadVerifications();
          }
        }}
        onClose={() => setConfirm({ open: false, userId: null })}
      />
    </div>
  );
}
