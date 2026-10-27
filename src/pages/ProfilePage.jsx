import React, { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Crown, Download, GraduationCap, Mail, Phone, Save, ShieldCheck, Star, Upload, User } from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import AnnouncementBanner from "../components/AnnouncementBanner.jsx";
import DepartmentSelect from "../components/DepartmentSelect.jsx";
import { phoneProblem } from "../lib/utils.js";

const PLAN_LABELS = {
  admin: "Administrator",
  premium_annual: "Premium annual",
  premium_monthly: "Premium monthly",
  paid_lifetime: "Lifetime access",
  paid_download_only: "Download-only",
  unpaid: "Free plan"
};

function formatStamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ProfilePage() {
  const { session, activeUser, downloadStatus, saveProfile, goLogin, goLibrary, mySubmissions, syncCredits, toast, coursesData } = useApp();
  const [form, setForm] = useState({ name: "", department: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!activeUser) return;
    setForm({
      name: activeUser.name || "",
      department: activeUser.department || "",
      phone: activeUser.phone || ""
    });
  }, [activeUser]);

  useEffect(() => {
    if (session) syncCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const approvedCount = useMemo(
    () => mySubmissions.filter((item) => item.status === "approved").length,
    [mySubmissions]
  );

  if (!session) {
    return (
      <div className="ws-page">
        <AnnouncementBanner />
        <div className="card p-4 mx-auto" style={{ maxWidth: 520 }}>
          <h1 className="h4 mb-2">Sign in to view your profile</h1>
          <p className="text-secondary small mb-3">
            Your profile keeps your program, contact details and contribution history together.
          </p>
          <button type="button" className="btn btn-primary" onClick={goLogin}>
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  const displayName = activeUser?.name || session.name || session.email || "Student";
  const isOwnerAdmin = session.role === "admin";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.name.trim().length < 2) {
      setError("Enter your full name (at least 2 characters).");
      return;
    }
    const phoneError = phoneProblem(form.phone);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    setBusy(true);
    const res = await saveProfile({
      name: form.name.trim(),
      department: form.department,
      phone: form.phone.trim()
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not save your profile.");
      return;
    }
    toast(res.message || "Profile saved.");
  };

  return (
    <div className="ws-page">
      <AnnouncementBanner />

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div className="d-flex align-items-center gap-3">
          <span className="ws-user-avatar" style={{ width: 56, height: 56, fontSize: "1.1rem" }} aria-hidden="true">
            {initials || "WS"}
          </span>
          <div>
            <h1 className="h3 mb-1">{displayName}</h1>
            <div className="d-flex flex-wrap gap-2 align-items-center small text-secondary">
              <span>{session.email}</span>
              {downloadStatus.plan === "admin" ? (
                <span className="ws-premium-pill">
                  <ShieldCheck size={10} aria-hidden="true" /> Administrator
                </span>
              ) : downloadStatus.premium ? (
                <span className="ws-premium-pill">
                  <Crown size={10} aria-hidden="true" /> {PLAN_LABELS[downloadStatus.plan] || "Premium"}
                </span>
              ) : (
                <span className="badge text-bg-light">{PLAN_LABELS[downloadStatus.plan] || "Free plan"}</span>
              )}
            </div>
          </div>
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={goLibrary}>
          Back to the library
        </button>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-7">
          <form className="card p-3 h-100" onSubmit={submit}>
            <h2 className="h6 text-uppercase text-secondary mb-3">Account details</h2>
            {isOwnerAdmin ? (
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label small fw-semibold">Signed in as</label>
                  <div className="ws-field-icon">
                    <ShieldCheck size={16} aria-hidden="true" />
                    <input className="form-control" value={displayName} readOnly disabled />
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label small fw-semibold">Email</label>
                  <div className="ws-field-icon">
                    <Mail size={16} aria-hidden="true" />
                    <input className="form-control" value={session.email || ""} readOnly disabled />
                  </div>
                </div>
                <div className="col-12">
                  <p className="small text-secondary mb-0">
                    The administrator account is managed with the admin password. Open the Students tab in the admin
                    workspace to add, inspect or remove student accounts.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label small fw-semibold">Full name</label>
                    <div className="ws-field-icon">
                      <User size={16} aria-hidden="true" />
                      <input
                        className="form-control"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Your full name"
                      />
                    </div>
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small fw-semibold">Department / program</label>
                    <DepartmentSelect
                      coursesData={coursesData}
                      value={form.department}
                      onChange={(department) => setForm({ ...form, department })}
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label small fw-semibold">Phone number</label>
                    <div className="ws-field-icon">
                      <Phone size={16} aria-hidden="true" />
                      <input
                        className="form-control"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="09xx xxx xxx"
                      />
                    </div>
                    <p className="form-text small mb-0">Required — the library team uses it to reach you.</p>
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-semibold">Email (used to sign in)</label>
                    <div className="ws-field-icon">
                      <Mail size={16} aria-hidden="true" />
                      <input className="form-control" value={session.email || ""} readOnly disabled />
                    </div>
                    <p className="small text-secondary mb-0 mt-1">
                      Ask the administrator to change the email on your account.
                    </p>
                  </div>
                </div>

                {error ? (
                  <div className="banner warn mt-3" role="alert">
                    <span>{error}</span>
                  </div>
                ) : null}

                <div className="d-flex gap-2 mt-3">
                  <button type="submit" className="btn btn-primary d-inline-flex align-items-center gap-2" disabled={busy}>
                    <Save size={15} aria-hidden="true" />
                    {busy ? "Saving…" : "Save profile"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>

        <div className="col-12 col-lg-5">
          <div className="card p-3 mb-3">
            <h2 className="h6 text-uppercase text-secondary mb-3">Your account</h2>
            <ul className="list-unstyled small mb-0 d-flex flex-column gap-2">
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary d-inline-flex align-items-center gap-1">
                  <BadgeCheck size={14} aria-hidden="true" /> Status
                </span>
                <strong>{activeUser?.emailVerified === false ? "Awaiting verification" : "Verified"}</strong>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary d-inline-flex align-items-center gap-1">
                  <Crown size={14} aria-hidden="true" /> Plan
                </span>
                <strong>{PLAN_LABELS[downloadStatus.plan] || downloadStatus.plan}</strong>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary d-inline-flex align-items-center gap-1">
                  <Download size={14} aria-hidden="true" /> Downloads left
                </span>
                <strong>{downloadStatus.premium ? "Unlimited" : downloadStatus.credits}</strong>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary d-inline-flex align-items-center gap-1">
                  <Upload size={14} aria-hidden="true" /> Approved shares
                </span>
                <strong>{approvedCount}</strong>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary d-inline-flex align-items-center gap-1">
                  <Star size={14} aria-hidden="true" /> Materials downloaded
                </span>
                <strong>{Number(activeUser?.downloadsCount) || 0}</strong>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary d-inline-flex align-items-center gap-1">
                  <GraduationCap size={14} aria-hidden="true" /> Last activity
                </span>
                <strong>{activeUser?.lastActiveAt || "—"}</strong>
              </li>
            </ul>
          </div>

          <div className="card p-3">
            <h2 className="h6 text-uppercase text-secondary mb-3">Recent activity</h2>
            {(activeUser?.activityLog || []).length ? (
              <ul className="list-unstyled small mb-0 d-flex flex-column gap-2">
                {(activeUser.activityLog || []).slice(0, 6).map((event) => (
                  <li key={event.id} className="d-flex justify-content-between gap-3">
                    <span>{event.detail || event.type}</span>
                    <span className="text-secondary text-nowrap">{formatStamp(event.timestamp)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small text-secondary mb-0">No activity recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
