import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../../store/AppContext.jsx";
import Modal from "../../components/Modal.jsx";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import DepartmentSelect from "../../components/DepartmentSelect.jsx";
import { approveVerification, createStudentAccount, listVerifications, shareVerificationCode } from "../../lib/api.js";
import { phoneProblem } from "../../lib/utils.js";

const PLANS = [
  ["unpaid", "Unpaid (2 uploads per download)"],
  ["premium_monthly", "Premium monthly · 100 Birr"],
  ["premium_annual", "Premium annual · 250 Birr"],
  ["paid_lifetime", "Paid 500 Birr · Lifetime"],
  ["paid_download_only", "Paid · Download-only"]
];

const EMPTY_STUDENT_FORM = { name: "", email: "", password: "", department: "", phone: "", accountPlan: "unpaid" };

const roleOf = (user) => user.role || "user";

const planOf = (user) =>
  user.accountPlan || (user.downloadOnlyAccount ? "paid_download_only" : user.paymentStatus === "paid" ? "paid_lifetime" : "unpaid");

// The Students page leads with these instead of a plan dropdown: paid vs free is what the
// library gates on, while the role split keeps admins and support staff out of the student list.
const CATEGORIES = [
  ["all", "All accounts", () => true],
  ["premium", "Premium", (user, plan) => plan !== "unpaid"],
  ["free", "Free", (user, plan) => plan === "unpaid"],
  ["students", "Students", (user) => roleOf(user) === "user"],
  ["support", "Support team", (user) => roleOf(user) === "support"],
  ["admin", "Admins", (user) => roleOf(user) === "admin"]
];

export default function AdminUsers() {
  const { usersData, saveUser, deleteUser, setUserRole, toast, session, isAdmin, coursesData, refreshFromServer } = useApp();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
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
    const [, , matches] = CATEGORIES.find(([key]) => key === category) || CATEGORIES[0];
    return usersData.filter((user) => {
      if (!matches(user, planOf(user))) return false;
      if (!needle) return true;
      return (
        (user.name || "").toLowerCase().includes(needle) ||
        (user.email || "").toLowerCase().includes(needle) ||
        (user.department || "").toLowerCase().includes(needle)
      );
    });
  }, [category, search, usersData]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const [key, , matches] of CATEGORIES) {
      counts[key] = usersData.filter((user) => matches(user, planOf(user))).length;
    }
    return counts;
  }, [usersData]);

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
      <div className="card p-3">
        <div className="row g-2 align-items-end">
          <div className="col-12 col-md-7">
            <label className="form-label small fw-semibold">Search accounts</label>
            <input className="form-control" placeholder="Name, email or department" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="col-12 col-md-5 text-md-end">
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

        <div className="d-flex flex-wrap gap-2 mt-3" role="group" aria-label="Account categories">
          {CATEGORIES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              aria-pressed={category === key}
              className={category === key ? "btn btn-sm btn-primary py-0" : "btn btn-sm btn-outline-secondary py-0"}
            >
              {label}
              <span className="ms-2 mono" style={{ fontSize: 11 }}>
                {categoryCounts[key] || 0}
              </span>
            </button>
          ))}
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
                    {user.role === "admin" ? (
                      <span className="badge rounded-pill text-bg-primary ms-2 align-middle" style={{ fontSize: 10 }}>
                        Administrator
                      </span>
                    ) : null}
                    {user.emailUnconfirmed ? (
                      <span className="badge rounded-pill text-bg-warning ms-2 align-middle" style={{ fontSize: 10 }}>
                        Email unconfirmed
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
                  {search.trim()
                    ? "No accounts match this search."
                    : category === "support"
                    ? "No support staff yet — open a student row and press Make support to add one."
                    : "No accounts in this category."}
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
