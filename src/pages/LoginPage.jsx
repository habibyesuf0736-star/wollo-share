import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lock,
  Mail,
  QrCode,
  Sparkles,
  User
} from "lucide-react";
import { DEFAULT_TEXTS, useApp } from "../store/AppContext.jsx";
import AnnouncementBanner from "../components/AnnouncementBanner.jsx";
import DepartmentSelect from "../components/DepartmentSelect.jsx";
import PhoneField from "../components/PhoneField.jsx";
import { pollQrLogin, requestRecovery, resendVerificationCode, startQrLogin } from "../lib/api.js";
import { phoneProblem } from "../lib/utils.js";
import { FRESHMAN_DEPARTMENT } from "../lib/departments.js";
import { SITE_ORIGIN } from "../lib/seo.js";

const TABS = [
  ["signin", "Sign in"],
  ["qr", "Scan with phone"],
  ["register", "Create account"],
  ["recovery", "Recover access"]
];

// Shown on the phone so the student knows which screen they are signing in.
function deviceLabel() {
  const ua = String(navigator.userAgent || "");
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "another device";
  return `${browser} on ${os}`;
}

export default function LoginPage() {
  const {
    login,
    signInWithCode,
    resendSignInCode,
    register,
    verifySignup,
    finishRecovery,
    adoptSession,
    goLibrary,
    toast,
    goAdmin,
    goSupport,
    isAdmin,
    coursesData,
    pageTexts
  } = useApp();
  const [tab, setTab] = useState("signin");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signin, setSignin] = useState({ identifier: "", password: "" });
  const [signup, setSignup] = useState({ name: "", email: "", password: "", department: FRESHMAN_DEPARTMENT, phone: "" });
  // Signup stops on the code step: the account only opens once the address answers.
  const [signupStage, setSignupStage] = useState("form");
  const [signupCode, setSignupCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [signupMailSent, setSignupMailSent] = useState(true);
  const [recovery, setRecovery] = useState({ email: "", code: "", newPassword: "", stage: "request" });
  const [twoFactor, setTwoFactor] = useState({ identifier: "", email: "", code: "", minutesLeft: 10 });
  const [qr, setQr] = useState({ id: "", url: "", status: "idle", secondsLeft: 0, error: "" });
  const [qrNonce, setQrNonce] = useState(0);

  // Opening the QR tab mints a code, shows it, and collects the session the moment the
  // phone approves it. Leaving the tab stops both the countdown and the polling.
  useEffect(() => {
    if (tab !== "qr") return undefined;
    let cancelled = false;
    let timer = null;
    let requestId = "";
    let expiresAt = 0;

    const clear = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    timer = setInterval(async () => {
      if (!requestId) return;
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      if (left === 0) {
        clear();
        setQr((prev) => (prev.id === requestId ? { ...prev, secondsLeft: 0, status: "expired" } : prev));
        return;
      }
      setQr((prev) => (prev.id === requestId ? { ...prev, secondsLeft: left } : prev));
      const poll = await pollQrLogin(requestId);
      if (cancelled) return;
      if (poll && poll.status === "approved" && poll.session) {
        clear();
        setQr((prev) => ({ ...prev, status: "approved" }));
        const session = adoptSession(poll.session);
        toast(`Signed in as ${session.name || session.email}`);
        if (session.role === "admin") goAdmin();
        else if (session.role === "support") goSupport();
        else goLibrary();
        return;
      }
      if (poll && (poll.status === "expired" || poll.status === "consumed")) {
        clear();
        setQr((prev) => ({ ...prev, status: poll.status === "expired" ? "expired" : "used" }));
      }
    }, 1500);

    (async () => {
      setQr({ id: "", url: "", status: "starting", secondsLeft: 0, error: "" });
      const res = await startQrLogin(deviceLabel());
      if (cancelled) return;
      if (!res || !res.ok || !res.id) {
        clear();
        setQr({ id: "", url: "", status: "error", secondsLeft: 0, error: (res && res.error) || "Could not create a sign-in code." });
        return;
      }
      requestId = res.id;
      expiresAt = Number(res.expiresAt) || Date.now() + 120000;
      setQr({
        id: res.id,
        url: `${SITE_ORIGIN}/authorize/${res.id}`,
        status: "waiting",
        secondsLeft: Math.max(0, Math.round((expiresAt - Date.now()) / 1000)),
        error: ""
      });
    })();

    return () => {
      cancelled = true;
      clear();
    };
  }, [adoptSession, goAdmin, goLibrary, goSupport, qrNonce, tab, toast]);

  const submitSignIn = async (event) => {
    event.preventDefault();
    setError("");
    if (!signin.identifier.trim() || !signin.password) {
      setError("Enter your sign-in name and your password.");
      return;
    }
    setBusy(true);
    const res = await login({ identifier: signin.identifier.trim(), password: signin.password });
    setBusy(false);
    if (!res.ok) {
      if (res.twoFactor) {
        setError("");
        setNotice(res.message || "We emailed you a 6-digit code to finish signing in.");
        setTwoFactor({ identifier: res.identifier || signin.identifier.trim(), email: res.email, code: "", minutesLeft: res.minutesLeft || 10 });
        return;
      }
      setError(res.error || "Unable to sign in.");
      if (res.needsRecovery) {
        setRecovery({ email: res.email || signin.identifier.trim(), code: "", newPassword: "", stage: "code" });
        setTab("recovery");
      }
      return;
    }
    setTwoFactor({ identifier: "", email: "", code: "", minutesLeft: 10 });
    if (res.verifiedNow) toast("Account verified — welcome back.");
    else if (res.codeSkipped) toast(res.message || "Signed in — the code email was unavailable.");
    else toast(`Welcome back, ${res.session.name || res.session.email}`);
    if (res.session.role === "admin") goAdmin();
    else if (res.session.role === "support") goSupport();
    else goLibrary();
  };

  const submitSignInCode = async (event) => {
    event.preventDefault();
    setError("");
    if (twoFactor.code.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    const res = await signInWithCode({ identifier: twoFactor.identifier, code: twoFactor.code });
    setBusy(false);
    if (!res.ok) {
      if (res.expired) {
        setTwoFactor({ identifier: "", email: "", code: "", minutesLeft: 10 });
        setNotice("That sign-in code expired. Enter your password again to get a new one.");
      } else {
        setError(res.error || "That code did not work.");
      }
      return;
    }
    toast(`Welcome back, ${res.session.name || res.session.email}`);
    if (res.session.role === "admin") goAdmin();
    else if (res.session.role === "support") goSupport();
    else goLibrary();
  };

  const resendSignIn = async () => {
    setError("");
    setBusy(true);
    const res = await resendSignInCode(twoFactor.identifier);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not resend the code.");
      return;
    }
    if (res.codeInvalidated) {
      setTwoFactor({ identifier: "", email: "", code: "", minutesLeft: 10 });
      setNotice(res.message || "Enter your password again to get a new code.");
      return;
    }
    setNotice(res.message || "A new code is on its way.");
  };

  const submitRegister = async (event) => {
    event.preventDefault();
    setError("");
    if (!signup.email.includes("@") || signup.password.length < 8) {
      setError("Enter a valid email and a password of at least 8 characters.");
      return;
    }
    if (!signup.department) {
      setError("Select your department / program so we can surface your course materials.");
      return;
    }
    const phoneError = phoneProblem(signup.phone);
    if (phoneError) {
      setError(phoneError);
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
    // The account is created but not opened: the student confirms the address with the
    // emailed code first, and only then is signed in and taken to the library.
    setPendingEmail(res.email || signup.email.trim());
    setSignupMailSent(res.mailSent !== false);
    setSignupCode("");
    setSignupStage("verify");
    setNotice("");
  };

  const submitSignupCode = async (event) => {
    event.preventDefault();
    setError("");
    if (signupCode.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    const res = await verifySignup(pendingEmail, signupCode);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "That code did not work.");
      return;
    }
    toast("Email confirmed — welcome to Wollo Share.");
    setSignupStage("form");
    setSignupCode("");
    setSignup({ name: "", email: "", password: "", department: FRESHMAN_DEPARTMENT, phone: "" });
    goLibrary();
  };

  const resendSignupCode = async () => {
    setError("");
    setBusy(true);
    const res = await resendVerificationCode(pendingEmail);
    setBusy(false);
    if (!res || res.ok !== true) {
      setError((res && res.error) || "Could not resend the code.");
      return;
    }
    setSignupMailSent(Boolean(res.mailSent));
    setNotice(res.mailSent ? "A fresh code is on its way." : res.message || "The email could not be delivered.");
  };

  const submitRecovery = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (recovery.stage === "request") {
      if (!recovery.email.includes("@")) {
        setError("Enter the email you use to sign in.");
        return;
      }
      setBusy(true);
      const res = await requestRecovery(recovery.email);
      setBusy(false);
      if (res && res.ok) {
        setNotice(res.message || "If the account exists, a code is on its way.");
        setRecovery({ ...recovery, stage: "code" });
      } else {
        setError((res && res.error) || "Recovery request failed.");
      }
      return;
    }
    if (recovery.code.length !== 6) {
      setError("Enter the 6-digit recovery code from your email.");
      return;
    }
    if (recovery.newPassword.length < 8) {
      setError("Choose a new password of at least 8 characters.");
      return;
    }
    setBusy(true);
    const res = await finishRecovery({ email: recovery.email, code: recovery.code, newPassword: recovery.newPassword });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Recovery failed.");
      return;
    }
    setRecovery({ email: "", code: "", newPassword: "", stage: "request" });
    if (res.signedIn) {
      toast("Password updated — you are signed in.");
      if (res.session.role === "admin") goAdmin();
      else if (res.session.role === "support") goSupport();
      else goLibrary();
      return;
    }
    setNotice("Password updated — sign in with your new password.");
    setTab("signin");
  };

  const switchTab = (key) => {
    setTab(key);
    setError("");
    setNotice("");
    if (key !== "register") setSignupStage("form");
    if (key !== "signin") setTwoFactor({ identifier: "", email: "", code: "", minutesLeft: 10 });
  };

  const loginTitle = String(pageTexts.loginTitle ?? DEFAULT_TEXTS.loginTitle).trim();
  const loginLines = String(pageTexts.loginLines ?? DEFAULT_TEXTS.loginLines ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="ws-page">
      <AnnouncementBanner />

      <div className={`ws-auth${loginTitle || loginLines.length ? "" : " is-single"}`}>
        {loginTitle || loginLines.length ? (
          <aside className="ws-auth-aside">
            {loginTitle ? <h1>{loginTitle}</h1> : null}
            {loginLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </aside>
        ) : null}

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

          {tab === "signin" && twoFactor.identifier ? (
            <form onSubmit={submitSignInCode} className="d-flex flex-column gap-3">
              <p className="small text-secondary mb-0">
                Code sent to <strong>{twoFactor.email}</strong>. Expires in {twoFactor.minutesLeft} minutes.
              </p>
              <div>
                <label className="form-label small fw-semibold mb-0" htmlFor="signinCode">
                  Sign-in code
                </label>
                <input
                  id="signinCode"
                  className="form-control ws-code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  placeholder="123456"
                  value={twoFactor.code}
                  onChange={(e) => setTwoFactor({ ...twoFactor, code: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                />
              </div>
              <button type="submit" className="btn btn-primary d-inline-flex align-items-center justify-content-center gap-2" disabled={busy}>
                {busy ? "Checking…" : "Verify and sign in"}
                {busy ? null : <BadgeCheck size={16} aria-hidden="true" />}
              </button>
              <div className="d-flex gap-3 flex-wrap align-items-center">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={resendSignIn} disabled={busy}>
                  Resend code
                </button>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0"
                  onClick={() => {
                    setTwoFactor({ identifier: "", email: "", code: "", minutesLeft: 10 });
                    setError("");
                    setNotice("");
                  }}
                >
                  Use a different account
                </button>
              </div>
            </form>
          ) : null}

          {tab === "signin" && !twoFactor.identifier ? (
            <form onSubmit={submitSignIn} className="d-flex flex-column gap-3">
              <div>
                <label className="form-label small fw-semibold" htmlFor="loginId">
                  Email, username or phone
                </label>
                <div className="ws-field-icon">
                  <Mail size={16} aria-hidden="true" />
                  <input
                    id="loginId"
                    className="form-control"
                    autoComplete="username"
                    value={signin.identifier}
                    onChange={(e) => setSignin({ ...signin, identifier: e.target.value })}
                    placeholder="your.email@wollouniv.edu.et or 912 345 678"
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
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary ws-pw-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-pressed={showPassword}
                    aria-controls="loginPw"
                  >
                    {showPassword ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
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

          {tab === "qr" ? (
            <div className="d-flex flex-column align-items-center gap-3 text-center">
              <p className="small text-secondary mb-0">Scan with the phone you signed in on.</p>
              {qr.status === "waiting" && qr.url ? (
                <div
                  className="d-inline-block p-3"
                  style={{ background: "#fff", border: "1px solid rgba(15,23,42,.08)", borderRadius: 16 }}
                >
                  <QRCodeSVG value={qr.url} size={196} level="M" aria-label="Wollo Share sign-in code" />
                </div>
              ) : (
                <div
                  className="d-flex align-items-center justify-content-center text-secondary small text-center px-3"
                  style={{ width: 226, height: 226, border: "1px dashed rgba(15,23,42,.18)", borderRadius: 16 }}
                >
                  {qr.status === "approved" ? (
                    <span className="d-inline-flex align-items-center gap-2">
                      <BadgeCheck size={16} aria-hidden="true" /> Signed in…
                    </span>
                  ) : qr.status === "starting" ? (
                    "Creating your code…"
                  ) : (
                    <QrCode size={34} aria-hidden="true" />
                  )}
                </div>
              )}
              <div className="small text-secondary" role="status">
                {qr.status === "waiting" ? `Valid for another ${qr.secondsLeft}s.` : null}
                {qr.status === "expired" ? "This code expired — nothing was signed in." : null}
                {qr.status === "used" ? "That code was already used on another screen." : null}
                {qr.status === "error" ? qr.error : null}
              </div>
              <button type="button" className="btn btn-primary" onClick={() => setQrNonce((n) => n + 1)}>
                {qr.status === "waiting" ? "New code" : qr.status === "error" ? "Try again" : "Show a new code"}
              </button>
              <p className="form-text small mb-0">Only scan codes you asked for.</p>
            </div>
          ) : null}

          {tab === "register" && signupStage === "form" ? (
            <form onSubmit={submitRegister} className="d-flex flex-column gap-3">
              <div className="row g-2">
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold" htmlFor="signupName">
                    Full name
                  </label>
                  <div className="ws-field-icon">
                    <User size={16} aria-hidden="true" />
                    <input
                      id="signupName"
                      className="form-control"
                      name="name"
                      autoComplete="name"
                      value={signup.name}
                      onChange={(e) => setSignup({ ...signup, name: e.target.value })}
                      placeholder="Abebe Kebede"
                    />
                  </div>
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold" htmlFor="signupEmail">
                    Student email
                  </label>
                  <div className="ws-field-icon">
                    <Mail size={16} aria-hidden="true" />
                    <input
                      id="signupEmail"
                      className="form-control"
                      type="email"
                      name="email"
                      autoComplete="email"
                      value={signup.email}
                      onChange={(e) => setSignup({ ...signup, email: e.target.value })}
                      placeholder="you@student.wollogu.edu.et"
                    />
                  </div>
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold" htmlFor="signupPassword">
                    Password
                  </label>
                  <div className="ws-field-icon">
                    <Lock size={16} aria-hidden="true" />
                    <input
                      id="signupPassword"
                      className="form-control"
                      type="password"
                      name="password"
                      autoComplete="new-password"
                      value={signup.password}
                      onChange={(e) => setSignup({ ...signup, password: e.target.value })}
                      placeholder="At least 8 characters"
                    />
                  </div>
                </div>
                <div className="col-12 col-sm-6">
                  <label className="form-label small fw-semibold" htmlFor="signupPhone">
                    Phone number
                  </label>
                  <PhoneField
                    id="signupPhone"
                    name="phone"
                    value={signup.phone}
                    onChange={(phone) => setSignup({ ...signup, phone })}
                  />
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
                    />
                  </div>
                  <p className="form-text small mb-0">Shows your courses first.</p>
                </div>
              </div>
              <button type="submit" className="btn btn-primary d-inline-flex align-items-center justify-content-center gap-2" disabled={busy}>
                {busy ? <Sparkles size={16} aria-hidden="true" /> : <BookOpenCheck size={16} aria-hidden="true" />}
                {busy ? "Creating account…" : "Create free account"}
              </button>
              <p className="form-text small mb-0">We email a 6-digit code — enter it next to open your account.</p>
            </form>
          ) : null}

          {tab === "register" && signupStage === "verify" ? (
            <form onSubmit={submitSignupCode} className="d-flex flex-column gap-3">
              <p className="small text-secondary mb-0">
                {signupMailSent ? (
                  <>
                    Code sent to <strong>{pendingEmail}</strong>. Enter the 6 digits to open your account.
                  </>
                ) : (
                  <>
                    The code did not reach <strong>{pendingEmail}</strong>. Your account and password are ready —
                    resend the code, or sign in with your password.
                  </>
                )}
              </p>
              <div>
                <label className="form-label small fw-semibold" htmlFor="signupCode">
                  Confirmation code
                </label>
                <input
                  id="signupCode"
                  className="form-control ws-code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  placeholder="123456"
                  value={signupCode}
                  onChange={(e) => setSignupCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
              <button type="submit" className="btn btn-primary d-inline-flex align-items-center justify-content-center gap-2" disabled={busy}>
                {busy ? "Checking…" : "Verify and open my account"}
                {busy ? null : <BadgeCheck size={16} aria-hidden="true" />}
              </button>
              <div className="d-flex flex-wrap gap-3 align-items-center">
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={resendSignupCode} disabled={busy}>
                  Resend code
                </button>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0"
                  onClick={() => {
                    setSignupStage("form");
                    setSignupCode("");
                    setError("");
                    setNotice("");
                    setSignup({ ...signup, email: pendingEmail });
                  }}
                >
                  Change the address
                </button>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0"
                  onClick={() => {
                    setSignin({ identifier: pendingEmail, password: "" });
                    switchTab("signin");
                  }}
                >
                  {signupMailSent ? "Already confirmed? Sign in" : "Sign in with my password"}
                </button>
              </div>
            </form>
          ) : null}

          {tab === "recovery" ? (
            <form onSubmit={submitRecovery} className="d-flex flex-column gap-3">
              <p className="small text-secondary">We email a one-time code that expires in 30 minutes.</p>
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
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="6-digit code from your email"
                        value={recovery.code}
                        onChange={(e) => setRecovery({ ...recovery, code: e.target.value.replace(/\D/g, "").slice(0, 6) })}
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
