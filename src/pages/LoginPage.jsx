import React, { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Download,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  Upload,
  User
} from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import AnnouncementBanner from "../components/AnnouncementBanner.jsx";
import DepartmentSelect from "../components/DepartmentSelect.jsx";
import { completeRecovery, requestRecovery } from "../lib/api.js";

const TABS = [
  ["signin", "Sign in"],
  ["register", "Create account"],
  ["recovery", "Recover access"]
];

export default function LoginPage() {
  const { login, register, goLibrary, stats, pageTexts, toast, goAdmin, isAdmin, coursesData } = useApp();
  const [tab, setTab] = useState("signin");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signin, setSignin] = useState({ identifier: "", password: "" });
  const [signup, setSignup] = useState({ name: "", email: "", password: "", department: "", phone: "" });
  const [recovery, setRecovery] = useState({ email: "", code: "", newPassword: "", stage: "request" });

  const submitSignIn = async (event) => {
    event.preventDefault();
    setError("");
    if (!signin.identifier.trim() || !signin.password) {
      setError("Enter both your email/username and your password.");
      return;
    }
    setBusy(true);
    const res = await login({ identifier: signin.identifier.trim(), password: signin.password });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Unable to sign in.");
      return;
    }
    toast(`Welcome back, ${res.session.name || res.session.email}`);
    if (res.session.role === "admin") goAdmin();
    else goLibrary();
  };

  const submitRegister = async (event) => {
    event.preventDefault();
    setError("");
    if (!signup.email.includes("@") || signup.password.length < 4) {
      setError("Enter a valid email and a password of at least 4 characters.");
      return;
    }
    if (!signup.department) {
      setError("Select your department / program so we can surface your course materials.");
      return;
    }
    setBusy(true);
    const res = await register({
      name: signup.name.trim() || "Wollo Student",
      email: signup.email.trim(),
      password: signup.password,
      department: signup.department,
      phone: signup.phone.trim()
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Registration failed.");
      return;
    }
    toast("Account created — you are signed in.");
    goLibrary();
  };

  const submitRecovery = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    if (recovery.stage === "request") {
      const res = await requestRecovery(recovery.email);
      setBusy(false);
      if (res && res.ok) {
        setNotice(res.message || "A recovery code was emailed to that address if the account exists. It expires in 30 minutes.");
        setRecovery({ ...recovery, stage: "code" });
      } else {
        setError((res && res.error) || "Recovery request failed.");
      }
      return;
    }
    const res = await completeRecovery({ email: recovery.email, code: recovery.code, newPassword: recovery.newPassword });
    setBusy(false);
    if (res && res.ok) {
      setNotice("Password updated — sign in with your new password.");
      setRecovery({ email: recovery.email, code: "", newPassword: "", stage: "request" });
      setTab("signin");
    } else {
      setError((res && res.error) || "Recovery failed.");
    }
  };

  const switchTab = (key) => {
    setTab(key);
    setError("");
    setNotice("");
  };

  return (
    <div className="ws-page">
      <AnnouncementBanner />

      <div className="ws-auth">
        <aside className="ws-auth-aside">
          <span className="ws-hero-eyebrow" style={{ background: "rgba(255,255,255,.14)", borderColor: "rgba(255,255,255,.28)", color: "#fff" }}>
            Wollo University · {pageTexts.siteTitle || "Wollo Share"}
          </span>
          <h1>One account for the whole library</h1>
          <p>
            Sign in to download materials, rate documents, keep your contribution history and unlock paid or assigned
            courses across every college.
          </p>

          <div className="mt-4">
            <div className="ws-auth-feature">
              <Download size={16} aria-hidden="true" />
              <span>Unlimited downloads for your own program — notes, slides, lab manuals and past exams.</span>
            </div>
            <div className="ws-auth-feature">
              <Star size={16} aria-hidden="true" />
              <span>Rate every document so the next cohort sees the best material first.</span>
            </div>
            <div className="ws-auth-feature">
              <Upload size={16} aria-hidden="true" />
              <span>Share your own files and build up your contributor balance.</span>
            </div>
            <div className="ws-auth-feature">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>Passwords are hashed, recovery codes are one-time and expire in 30 minutes.</span>
            </div>
          </div>

          <div className="ws-auth-stat">
            <span>
              <strong>{stats.courses}</strong>
              <em>Programs</em>
            </span>
            <span>
              <strong>{stats.files}</strong>
              <em>Files</em>
            </span>
            <span>
              <strong>{stats.colleges.length}</strong>
              <em>Colleges</em>
            </span>
            <span>
              <strong>{stats.avgRating}★</strong>
              <em>Avg rating</em>
            </span>
          </div>

          <p className="small mb-0 mt-3" style={{ color: "rgba(255,255,255,.72)" }}>
            Unpaid students send 2 documents to earn each download · Premium from 100 Birr, lifetime access 500 Birr.
          </p>
        </aside>

        <section className="ws-auth-form">
          <div className="ws-segmented mb-4" role="tablist">
            {TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => switchTab(key)}>
                {label}
              </button>
            ))}
          </div>

          {notice ? (
            <div className="banner info mb-3" role="status">
              <span>
                <BadgeCheck size={16} aria-hidden="true" /> {notice}
              </span>
            </div>
          ) : null}
          {error ? (
            <div className="banner warn mb-3" role="alert">
              <span>
                <KeyRound size={16} aria-hidden="true" /> {error}
              </span>
            </div>
          ) : null}

          {tab === "signin" ? (
            <form onSubmit={submitSignIn} className="d-flex flex-column gap-3">
              <div>
                <label className="form-label small fw-semibold" htmlFor="loginId">
                  Email or username
                </label>
                <div className="ws-field-icon">
                  <Mail size={16} aria-hidden="true" />
                  <input
                    id="loginId"
                    className="form-control"
                    autoComplete="username"
                    value={signin.identifier}
                    onChange={(e) => setSignin({ ...signin, identifier: e.target.value })}
                    placeholder="your.email@wollouniv.edu.et"
                  />
                </div>
              </div>
              <div>
                <label className="form-label small fw-semibold" htmlFor="loginPw">
                  Password
                </label>
                <div className="ws-field-icon">
                  <Lock size={16} aria-hidden="true" />
                  <input
                    id="loginPw"
                    type={showPassword ? "text" : "password"}
                    className="form-control"
                    autoComplete="current-password"
                    value={signin.password}
                    onChange={(e) => setSignin({ ...signin, password: e.target.value })}
                    placeholder="Enter your account password"
                    style={{ paddingRight: 88 }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary position-absolute"
                    style={{ right: 6, top: "50%", transform: "translateY(-50%)", zIndex: 2 }}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={14} className="me-1 align-text-bottom" aria-hidden="true" /> : <Eye size={14} className="me-1 align-text-bottom" aria-hidden="true" />}
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <button type="submit" className="btn btn-primary d-inline-flex align-items-center justify-content-center gap-2" disabled={busy}>
                {busy ? "Signing in…" : "Sign in to portal"}
                {busy ? null : <ArrowRight size={16} aria-hidden="true" />}
              </button>
              <button type="button" className="btn btn-link btn-sm p-0" onClick={() => switchTab("recovery")}>
                Forgot your password?
              </button>
            </form>
          ) : null}

          {tab === "register" ? (
            <form onSubmit={submitRegister} className="d-flex flex-column gap-3">
              <div className="row g-2">
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold">Full name</label>
                  <div className="ws-field-icon">
                    <User size={16} aria-hidden="true" />
                    <input className="form-control" value={signup.name} onChange={(e) => setSignup({ ...signup, name: e.target.value })} placeholder="Abebe Kebede" />
                  </div>
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold">Student email</label>
                  <div className="ws-field-icon">
                    <Mail size={16} aria-hidden="true" />
                    <input className="form-control" type="email" value={signup.email} onChange={(e) => setSignup({ ...signup, email: e.target.value })} placeholder="you@student.wollogu.edu.et" />
                  </div>
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold">Password</label>
                  <div className="ws-field-icon">
                    <Lock size={16} aria-hidden="true" />
                    <input
                      className="form-control"
                      type="password"
                      autoComplete="new-password"
                      value={signup.password}
                      onChange={(e) => setSignup({ ...signup, password: e.target.value })}
                      placeholder="At least 4 characters"
                    />
                  </div>
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold">Phone (optional)</label>
                  <div className="ws-field-icon">
                    <Phone size={16} aria-hidden="true" />
                    <input className="form-control" value={signup.phone} onChange={(e) => setSignup({ ...signup, phone: e.target.value })} placeholder="+251 …" />
                  </div>
                </div>
                <div className="col-12">
                  <label className="form-label small fw-semibold" htmlFor="signupDepartment">
                    Department / program
                  </label>
                  <div className="ws-field-icon">
                    <GraduationCap size={16} aria-hidden="true" />
                    <DepartmentSelect
                      id="signupDepartment"
                      coursesData={coursesData}
                      value={signup.department}
                      onChange={(department) => setSignup({ ...signup, department })}
                      className="form-select"
                    />
                  </div>
                  <p className="form-text small mb-0">Used to suggest courses and show your department's materials first.</p>
                </div>
              </div>
              <button type="submit" className="btn btn-primary d-inline-flex align-items-center justify-content-center gap-2" disabled={busy}>
                {busy ? <Sparkles size={16} aria-hidden="true" /> : <BookOpenCheck size={16} aria-hidden="true" />}
                {busy ? "Creating account…" : "Create free account"}
              </button>
            </form>
          ) : null}

          {tab === "recovery" ? (
            <form onSubmit={submitRecovery} className="d-flex flex-column gap-3">
              <p className="small text-secondary">
                Passwords are stored hashed and never shown. Enter your account email and we send a one-time recovery
                code to that inbox — it is never displayed on this page. The code expires in 30 minutes.
              </p>
              <div>
                <label className="form-label small fw-semibold mb-0">Account email</label>
                <div className="ws-field-icon">
                  <Mail size={16} aria-hidden="true" />
                  <input className="form-control" type="email" value={recovery.email} onChange={(e) => setRecovery({ ...recovery, email: e.target.value })} />
                </div>
              </div>
              {recovery.stage === "code" ? (
                <>
                  <div>
                    <label className="form-label small fw-semibold mb-0">Recovery code</label>
                    <div className="ws-field-icon">
                      <KeyRound size={16} aria-hidden="true" />
                      <input
                        className="form-control mono"
                        placeholder="8-digit code from your email"
                        value={recovery.code}
                        onChange={(e) => setRecovery({ ...recovery, code: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="form-label small fw-semibold mb-0">New password</label>
                    <div className="ws-field-icon">
                      <Lock size={16} aria-hidden="true" />
                      <input
                        className="form-control"
                        type="password"
                        placeholder="New password (min 8 characters)"
                        autoComplete="new-password"
                        value={recovery.newPassword}
                        onChange={(e) => setRecovery({ ...recovery, newPassword: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {recovery.stage === "request" ? "Request recovery code" : "Set new password"}
              </button>
              {isAdmin ? null : (
                <button type="button" className="btn btn-link btn-sm p-0" onClick={() => switchTab("signin")}>
                  Back to sign in
                </button>
              )}
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}
