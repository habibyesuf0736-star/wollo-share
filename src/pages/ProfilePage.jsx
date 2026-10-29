import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Camera,
  Crown,
  Download,
  GraduationCap,
  LogOut,
  Mail,
  MonitorSmartphone,
  Save,
  ShieldCheck,
  Star,
  Trash2,
  Upload,
  User
} from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import AnnouncementBanner from "../components/AnnouncementBanner.jsx";
import EmailVerifyBanner from "../components/EmailVerifyBanner.jsx";
import DepartmentSelect from "../components/DepartmentSelect.jsx";
import PhoneField from "../components/PhoneField.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import { listLoginDevices, revokeLoginDevice, signOutOtherDevices } from "../lib/api.js";
import { phoneProblem, readAvatarDataUrl } from "../lib/utils.js";

const PLAN_LABELS = {
  admin: "Administrator",
  premium_annual: "Premium annual",
  premium_monthly: "Premium monthly",
  paid_lifetime: "Lifetime access",
  paid_download_only: "Download-only",
  unpaid: "Free plan"
};

const METHOD_LABELS = {
  password: "Password sign-in",
  qr: "Scanned from a phone",
  google: "Google sign-in",
  verification: "Verified by email code",
  recovery: "Password reset"
};

function formatStamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function hoursLeft(expiresAt) {
  const ms = Number(expiresAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "ended";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(1, Math.ceil(ms / 60_000))} min left`;
}

export default function ProfilePage() {
  const { session, activeUser, downloadStatus, saveProfile, goLogin, goLibrary, goPremium, mySubmissions, syncCredits, toast, logout, coursesData } = useApp();
  const [form, setForm] = useState({ name: "", department: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInput = useRef(null);
  const [devices, setDevices] = useState([]);
  const [devicesState, setDevicesState] = useState("loading");
  const [devicesError, setDevicesError] = useState("");
  const [deviceBusy, setDeviceBusy] = useState("");

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

  const sessionToken = session?.authToken || "";

  const loadDevices = useCallback(async () => {
    if (!sessionToken) return;
    const res = await listLoginDevices(sessionToken);
    if (!res || res.ok !== true) {
      setDevicesState("error");
      setDevicesError((res && res.error) || "Could not read the devices signed in to this account.");
      return;
    }
    setDevices(Array.isArray(res.devices) ? res.devices : []);
    setDevicesState("ready");
    setDevicesError("");
  }, [sessionToken]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const pickPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setPhotoBusy(true);
    try {
      const res = await saveProfile({ avatarUrl: await readAvatarDataUrl(file) });
      if (!res.ok) setError(res.error || "Could not save that photo.");
      else toast("Profile photo saved.");
    } catch (err) {
      setError(err?.message || "That photo could not be used.");
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setError("");
    setPhotoBusy(true);
    const res = await saveProfile({ avatarUrl: "" });
    setPhotoBusy(false);
    if (!res.ok) setError(res.error || "Could not remove the photo.");
    else toast("Profile photo removed.");
  };

  const dropDevice = async (device) => {
    setDevicesError("");
    setDeviceBusy(device.id);
    const res = await revokeLoginDevice(device.id, sessionToken);
    setDeviceBusy("");
    if (!res || res.ok !== true) {
      setDevicesError((res && res.error) || "That device could not be signed out.");
      return;
    }
    // Signing this screen out here, so the profile has nothing left to list.
    if (res.current) {
      logout();
      toast("This device is signed out.");
      return;
    }
    toast(res.message || `${device.label} is signed out.`);
    loadDevices();
  };

  const dropOtherDevices = async () => {
    setDevicesError("");
    setDeviceBusy("all");
    const res = await signOutOtherDevices(sessionToken);
    setDeviceBusy("");
    if (!res || res.ok !== true) {
      setDevicesError((res && res.error) || "The other devices could not be signed out.");
      return;
    }
    toast(res.message);
    loadDevices();
  };

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
          <button type="button" className="btn btn-primary" onClick={goLogin}>
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  const displayName = activeUser?.name || session.name || session.email || "Student";
  const isOwnerAdmin = session.role === "admin";

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
      <EmailVerifyBanner />

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div className="d-flex align-items-center gap-3">
          <UserAvatar photo={activeUser?.avatarUrl} name={displayName} size={56} />
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
                    <label className="form-label small fw-semibold">Profile photo</label>
                    <div className="d-flex flex-wrap align-items-center gap-3">
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-2"
                        onClick={() => photoInput.current?.click()}
                        disabled={photoBusy}
                      >
                        <Camera size={14} aria-hidden="true" />
                        {photoBusy ? "Working…" : activeUser?.avatarUrl ? "Change photo" : "Add photo"}
                      </button>
                      {activeUser?.avatarUrl ? (
                        <button
                          type="button"
                          className="btn btn-link btn-sm p-0 d-inline-flex align-items-center gap-1"
                          onClick={removePhoto}
                          disabled={photoBusy}
                        >
                          <Trash2 size={13} aria-hidden="true" /> Remove photo
                        </button>
                      ) : null}
                      <input ref={photoInput} type="file" accept="image/*" className="d-none" onChange={pickPhoto} />
                    </div>
                    <p className="form-text small mb-0">Square, under 100 KB.</p>
                  </div>
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
                    <PhoneField value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-semibold">Email (used to sign in)</label>
                    <div className="ws-field-icon">
                      <Mail size={16} aria-hidden="true" />
                      <input className="form-control" value={session.email || ""} readOnly disabled />
                    </div>
                    <p className="small text-secondary mb-0 mt-1">Ask the administrator to change this.</p>
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
            {downloadStatus.premium ? null : (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary mt-3 d-inline-flex align-items-center gap-1"
                onClick={goPremium}
              >
                <Crown size={14} aria-hidden="true" />
                Plans &amp; payment
              </button>
            )}
          </div>

          <div className="card p-3 mb-3">
            <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
              <h2 className="h6 text-uppercase text-secondary mb-0">Where you are signed in</h2>
              <button type="button" className="btn btn-link btn-sm p-0" onClick={loadDevices} disabled={devicesState === "loading"}>
                Refresh
              </button>
            </div>
            {devicesState === "loading" ? <p className="small text-secondary mb-0">Checking your screens…</p> : null}
            {devicesError ? (
              <div className="banner warn mb-2" role="alert">
                <span>{devicesError}</span>
              </div>
            ) : null}
            {devicesState === "ready" && !devices.length ? (
              <p className="small text-secondary mb-0">Sign out once to list your devices.</p>
            ) : null}
            {devices.length ? (
              <>
                <ul className="list-unstyled small mb-3 d-flex flex-column gap-3">
                  {devices.map((device) => (
                    <li key={device.id} className="d-flex align-items-start justify-content-between gap-2">
                      <span className="d-flex align-items-start gap-2">
                        <MonitorSmartphone size={15} className="mt-1 text-secondary flex-shrink-0" aria-hidden="true" />
                        <span>
                          <strong>{device.label}</strong>
                          {device.current ? <span className="badge text-bg-light ms-2">This device</span> : null}
                          <em className="d-block text-secondary fst-normal">
                            {METHOD_LABELS[device.method] || "Signed in"} · since {formatStamp(device.createdAt)} ·{" "}
                            {hoursLeft(device.expiresAt)}
                          </em>
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm d-inline-flex align-items-center gap-1 flex-shrink-0"
                        onClick={() => dropDevice(device)}
                        disabled={deviceBusy === device.id}
                      >
                        <LogOut size={13} aria-hidden="true" />
                        {device.current ? "Sign out" : "Kick out"}
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-2"
                  onClick={dropOtherDevices}
                  disabled={deviceBusy === "all" || devices.every((device) => device.current)}
                >
                  <ShieldCheck size={14} aria-hidden="true" />
                  Sign out everywhere else
                </button>
              </>
            ) : null}
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
