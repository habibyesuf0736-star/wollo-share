import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { PLANS } from "../lib/plans.js";
import { FRESHMAN_DEPARTMENT, buildDepartmentGroups, matchDepartmentPrograms } from "../lib/departments.js";
import { PHONE_PREFIX, phoneFromLocal, phoneLocalDigits, triggerBrowserDownload } from "../lib/utils.js";
import { createTicket, listMyTickets, replyTicket, requestPremiumPlan, requestRecovery, resendVerificationCode } from "../lib/api.js";
import { addToRecent, clearRecent, fileKey, listRecent, listShelf, loadLibrary, removeFromShelf, saveLibrary, toggleShelf, when } from "./local.js";

const COPY = {
  en: {
    brand: "Wollo Share",
    navCourses: "Courses",
    navPremium: "Premium",
    navAccount: "Account",
    loading: "Loading",
    signin: "Sign in",
    register: "Create account",
    back: "Back",
    identifier: "Email or phone",
    password: "Password",
    forgot: "Forgot password?",
    toRegister: "New here? Create an account",
    toSignin: "Already have an account?",
    name: "Full name",
    email: "Email",
    phone: "Phone",
    department: "Department",
    code: "Code from your email",
    confirm: "Confirm",
    resend: "Send the code again",
    reset: "Reset password",
    send: "Send code",
    newpass: "New password",
    your: "Your department",
    all: "Everything else",
    find: "Search courses and files",
    files: "files",
    download: "Download",
    open: "Open",
    none: "Nothing matches that.",
    plan: "Plan",
    left: "Downloads left",
    free: "Free",
    premium: "Premium",
    signout: "Sign out",
    lang: "Language",
    choose: "Choose a plan",
    pay: "Payment",
    reference: "Payment reference",
    sendref: "Send payment reference",
    sentref: "Sent. The team switches you over.",
    note: "Pay, then send the reference.",
    staff: "Staff tools are on a computer.",
    full: "Open the full workspace",
    spot: "One short spot, then your file.",
    ready: "Opening your file.",
    cancel: "Cancel",
    plans: "Choose a plan",
    locked: "This file needs Premium.",
    needboth: "Enter your email and password.",
    needcode: "Enter the 6-digit code.",
    fail: "Check your details and try again.",
    hi: "Welcome back",
    codesent: "Code sent.",
    navSaved: "Saved",
    starred: "Starred",
    recent: "Recent",
    noneSaved: "Nothing starred yet.",
    noneRecent: "Nothing downloaded yet.",
    save: "Star",
    unsave: "Unstar",
    remove: "Remove",
    clear: "Clear",
    again: "Download again",
    yourRate: "Your rating",
    average: "Rated",
    report: "Report a problem",
    topic: "Topic",
    what: "What happened?",
    submit: "Send",
    sent: "Sent.",
    mine: "Your reports",
    reply: "Reply",
    stopen: "Open",
    stanswered: "Answered",
    stclosed: "Closed",
    offline: "Offline · saved library",
    savedOn: "Saved on your phone",
    refresh: "Refresh",
    theme: "Appearance",
    auto: "Auto",
    light: "Light",
    dark: "Dark",
    cats: ["Broken or wrong material", "Download problem", "Missing course material", "Account or payment", "Something else"]
  },
  am: {
    brand: "ወሎ ሼር",
    navCourses: "ኮርሶች",
    navPremium: "ፕሪሚየም",
    navAccount: "መገለጫ",
    loading: "በማዘጋጀት ላይ",
    signin: "ግቡ",
    register: "መለያ ፍጠሩ",
    back: "ተመለሱ",
    identifier: "ኢሜይል ወይም ስልክ",
    password: "የይለፍ ቃል",
    forgot: "የይለፍ ቃል ረሱ?",
    toRegister: "አዲስ ነዎት? መለያ ይፍጠሩ",
    toSignin: "አስቀድሞ መለያ አለዎት?",
    name: "ሙሉ ስም",
    email: "ኢሜይል",
    phone: "ስልክ",
    department: "ክፍል",
    code: "ከኢሜይል የመጣ ኮድ",
    confirm: "አረጋግጡ",
    resend: "ኮዱን እንደገና ላኩ",
    reset: "የይለፍ ቃል ዳግም አስተካክሉ",
    send: "ኮድ ላኩ",
    newpass: "አዲስ የይለፍ ቃል",
    your: "የእርስዎ ክፍል",
    all: "ሌሎች ሁሉ",
    find: "ኮርስ ወይም ፋይል ይፈልጉ",
    files: "ፋይሎች",
    download: "አውርድ",
    open: "ክፈት",
    none: "የተፈለገው አልተገኘም።",
    plan: "አባልነት",
    left: "ቀሪ ማውረጃዎች",
    free: "ነጻ",
    premium: "ፕሪሚየም",
    signout: "ውጡ",
    lang: "ቋንቋ",
    choose: "አባልነት ይምረጡ",
    pay: "ክፍያ",
    reference: "የክፍያ ማጣቀሻ",
    sendref: "ማጣቀሻውን ላኩ",
    sentref: "ተልኳል። ቡድኑ ያቀናብሮታል።",
    note: "ክፍያ ይፈጽሙ፣ ከዚያ ማጣቀሻውን ይላኩ።",
    staff: "የሠራተኛ መሣሪያዎች በኮምፒውተር ላይ ናቸው።",
    full: "ሙሉ የሥራ ቦታውን ክፈቱ",
    spot: "አጭር ማስታወቂያ፣ ከዚያ ፋይልዎ።",
    ready: "ፋይልዎ እየተከፈተ ነው።",
    cancel: "ተወው",
    plans: "አባልነት ይምረጡ",
    locked: "ይህ ፋይል ፕሪሚየም ይፈልጋል።",
    needboth: "ኢሜይልዎን እና የይለፍ ቃልዎን ያስገቡ።",
    needcode: "6 አሃዙን ኮድ ያስገቡ።",
    fail: "መረጃዎን ያረጋግጡ እና እንደገና ይሞክሩ።",
    hi: "እንኳን ደህና መጡ",
    codesent: "ኮድ ተልኳል።",
    navSaved: "የተቀመጡ",
    starred: "የተመረጡ",
    recent: "ቅርብ",
    noneSaved: "ምንም አልተመረጠም።",
    noneRecent: "ምንም አልወረደም።",
    save: "ምረጥ",
    unsave: "አስወግድ",
    remove: "አስወግድ",
    clear: "አጽዳ",
    again: "እንደገና አውርድ",
    yourRate: "የእርስዎ ደረጃ",
    average: "ደረጃ",
    report: "ችግር ይዘግቡ",
    topic: "ርዕስ",
    what: "ምን ተከሰተ?",
    submit: "ላክ",
    sent: "ተልኳል።",
    mine: "የእርስዎ ሪፖርቶች",
    reply: "መልስ ስጥ",
    stopen: "ክፍት",
    stanswered: "መልስ ተሰጥቷል",
    stclosed: "ተዘጋ",
    offline: "ከመስመር ውጭ · የተቀመጠ መጻሕፍት",
    savedOn: "በስልክዎ ላይ ተቀምጧል",
    refresh: "አድስ",
    theme: "መልክ",
    auto: "ራስ-ሰር",
    light: "ብሩህ",
    dark: "ጠቆር ያለ",
    cats: ["ፋይል ተሳስቷል", "ማውረድ ችግር", "ፋይል ጎዶሎ", "መለያ ወይም ክፍያ", "ሌላ"]
  }
};

const digitCode = (event, set) => set(event.target.value.replace(/\D/g, "").slice(0, 6));
const openFile = (mat) => mat.type === "Video" || /^https:\/\/(www\.)?(youtube\.com|youtu\.be)/i.test(String(mat.url || ""));

function Toasts() {
  const { toasts } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="m-toast" role="status" aria-live="polite">
      <div className="toast show border-0 mb-0">
        <div className="toast-body py-2">{toasts[toasts.length - 1].message}</div>
      </div>
    </div>
  );
}

function Sheet({ t, children, actions }) {
  return (
    <div className="m-sheet bg-body">
      <p className="m-brand">{t.brand}</p>
      <div className="m-mid">{children}</div>
      <div className="d-flex flex-wrap gap-3">{actions}</div>
    </div>
  );
}

function AdSheet({ t }) {
  const { downloadPolicy, downloadStatus, gate, setGate, closeGate, completeAdGate } = useApp();
  const seconds = downloadPolicy.adSeconds;
  const [left, setLeft] = useState(seconds);
  const finish = useRef(completeAdGate);
  finish.current = completeAdGate;
  const file = `${gate.courseId || ""}::${gate.materialId || ""}::${gate.sideMaterialId || ""}`;

  useEffect(() => {
    setLeft(seconds);
    const started = Date.now();
    const timer = setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(timer);
        finish.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [seconds, file]);

  return (
    <Sheet
      t={t}
      actions={
        <>
          <button className="m-link" onClick={() => setGate({ ...gate, type: "upgrade" })}>
            {t.plans}
          </button>
          <button className="m-link" onClick={closeGate}>
            {t.cancel}
          </button>
        </>
      }
    >
      <p className="m-count">{left}</p>
      <div className="progress mt-3" style={{ height: "2px" }} role="progressbar" aria-valuemin={0} aria-valuemax={seconds} aria-valuenow={seconds - left}>
        <div className="progress-bar" style={{ width: `${((seconds - left) / (seconds || 1)) * 100}%` }} />
      </div>
      <p className="m-quiet">{left > 0 ? t.spot : t.ready}</p>
      <p className="m-quiet">
        {downloadStatus.premium ? (
          <span className="badge rounded-pill badge-wollo mt-2">{t.premium}</span>
        ) : downloadPolicy.mode === "credits" && downloadStatus.plan === "unpaid" ? (
          <span className="badge rounded-pill text-bg-secondary mt-2">
            {t.left}: {Math.max(0, downloadStatus.credits - 1)}
          </span>
        ) : (
          <span className="badge rounded-pill text-bg-secondary mt-2">{t.free}</span>
        )}
      </p>
    </Sheet>
  );
}

function UpgradeSheet({ t, onPlans }) {
  const { gate, closeGate } = useApp();
  return (
    <Sheet
      t={t}
      actions={
        <>
          <button className="m-link" onClick={onPlans}>
            {t.plans}
          </button>
          <button className="m-link" onClick={closeGate}>
            {t.cancel}
          </button>
        </>
      }
    >
      <p className="m-title">{gate.title}</p>
      <p className="m-quiet">{t.locked}</p>
      <div className="list-group list-group-flush mt-2">
        {PLANS.map((plan) => (
          <div className="m-row list-group-item" key={plan.key}>
            <span className="m-row-t">
              {plan.title}
              <em>{plan.detail}</em>
            </span>
            <span className="badge rounded-pill text-bg-secondary">{plan.price}</span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function Field({ label, children }) {
  return (
    <label className="m-field mt-3">
      <span className="m-label">{label}</span>
      {children}
    </label>
  );
}

function Notice({ kind, text }) {
  if (!text) return null;
  return (
    <div className={`alert alert-${kind} py-2 px-3 small mt-4 mb-0 rounded-3`} role={kind === "danger" ? "alert" : "status"}>
      {text}
    </div>
  );
}

function Auth({ t }) {
  const { login, register, verifySignup, signInWithCode, resendSignInCode, finishRecovery, coursesData, toast } = useApp();
  const [mode, setMode] = useState("signin");
  const [signin, setSignin] = useState({ identifier: "", password: "" });
  const [signup, setSignup] = useState({ name: "", email: "", phone: "", password: "", department: FRESHMAN_DEPARTMENT });
  const [pending, setPending] = useState("");
  const [code, setCode] = useState("");
  const [reset, setReset] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => buildDepartmentGroups(coursesData), [coursesData]);

  const fail = (message) => {
    setBusy(false);
    setError(message);
  };

  const signIn = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!signin.identifier.trim() || !signin.password) return fail(t.needboth);
    setBusy(true);
    const res = await login({ identifier: signin.identifier.trim(), password: signin.password });
    setBusy(false);
    if (res.ok) return toast(`${t.hi}, ${(res.session.name || res.session.email || "").split(" ")[0]}`);
    if (res.twoFactor) {
      setPending(res.identifier);
      setCode("");
      setMode("twofactor");
      return setNotice(res.message || t.codesent);
    }
    if (res.needsRecovery) {
      setReset({ email: res.email || signin.identifier.trim(), password: "" });
      setCode("");
      return setMode("reset");
    }
    setError(res.error || t.fail);
  };

  const twoFactor = async (event) => {
    event.preventDefault();
    setError("");
    if (code.length !== 6) return fail(t.needcode);
    setBusy(true);
    const res = await signInWithCode({ identifier: pending, code });
    setBusy(false);
    if (!res.ok) return setError(res.error || t.fail);
    toast(`${t.hi}, ${(res.session.name || res.session.email || "").split(" ")[0]}`);
  };

  const signUp = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!signup.email.trim() || signup.password.length < 8) return fail(t.needboth);
    setBusy(true);
    const res = await register({
      name: signup.name.trim() || "Wollo Student",
      email: signup.email.trim(),
      phone: signup.phone.trim(),
      password: signup.password,
      department: signup.department
    });
    setBusy(false);
    if (!res.ok) return setError(res.error || t.fail);
    setPending(res.email);
    setCode("");
    setMode("verify");
    setNotice(res.message || t.codesent);
  };

  const confirmCode = async (event) => {
    event.preventDefault();
    setError("");
    if (code.length !== 6) return fail(t.needcode);
    setBusy(true);
    const res = await verifySignup(pending, code);
    setBusy(false);
    if (!res.ok) return setError(res.error || t.fail);
    if (!res.session) {
      setMode("signin");
      return setNotice(res.message || t.codesent);
    }
    toast(`${t.hi}, ${(res.session.name || res.session.email || "").split(" ")[0]}`);
  };

  const askReset = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const res = await requestRecovery(reset.email.trim() || signin.identifier.trim());
    setBusy(false);
    if (!res || res.ok !== true) return setError((res && res.error) || t.fail);
    setCode("");
    setMode("resetcode");
    setNotice(t.codesent);
  };

  const finishReset = async (event) => {
    event.preventDefault();
    setError("");
    if (code.length !== 6 || reset.password.length < 8) return fail(t.needcode);
    setBusy(true);
    const res = await finishRecovery({ email: reset.email.trim() || signin.identifier.trim(), code, newPassword: reset.password });
    setBusy(false);
    if (!res.ok) return setError(res.error || t.fail);
    if (!res.signedIn) {
      setMode("signin");
      return setNotice(res.message || t.codesent);
    }
    toast(`${t.hi}, ${(res.session.name || res.session.email || "").split(" ")[0]}`);
  };

  const again = async () => {
    if (mode === "verify") return resendVerificationCode(pending).then((res) => res && res.ok === true && setNotice(t.codesent));
    const res = await resendSignInCode(pending);
    if (res && res.ok === true) setNotice(t.codesent);
    return undefined;
  };

  if (mode === "verify" || mode === "twofactor" || mode === "resetcode") {
    const submit = mode === "twofactor" ? twoFactor : mode === "verify" ? confirmCode : finishReset;
    return (
      <main className="m">
        <p className="m-brand">{t.brand}</p>
        {mode === "resetcode" ? (
          <>
            <p className="m-title">{t.reset}</p>
            <p className="m-quiet">{reset.email || signin.identifier}</p>
          </>
        ) : (
          <>
            <p className="m-title">{t.confirm}</p>
            <p className="m-quiet">{pending}</p>
          </>
        )}
        {notice ? <Notice kind="success" text={notice} /> : null}
        {error ? <Notice kind="danger" text={error} /> : null}
        <form onSubmit={submit}>
          <Field label={t.code}>
            <input
              className="form-control"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => digitCode(event, setCode)}
              placeholder="000000"
              required
            />
          </Field>
          {mode === "resetcode" ? (
            <Field label={t.newpass}>
              <input
                className="form-control"
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={reset.password}
                onChange={(event) => setReset((old) => ({ ...old, password: event.target.value }))}
                required
              />
            </Field>
          ) : null}
          <button className="m-go btn btn-wollo w-100 mt-4" disabled={busy}>
            {t.confirm}
            <i>→</i>
          </button>
        </form>
        <div className="d-flex flex-wrap gap-3 align-items-center mt-4">
          <button className="m-link" onClick={again}>
            {t.resend}
          </button>
          <button className="m-link" onClick={() => setMode("signin")}>
            {t.back}
          </button>
        </div>
      </main>
    );
  }

  if (mode === "reset") {
    return (
      <main className="m">
        <p className="m-brand">{t.brand}</p>
        <p className="m-title">{t.reset}</p>
        {error ? <Notice kind="danger" text={error} /> : null}
        <form onSubmit={askReset}>
          <Field label={t.email}>
            <input className="form-control" type="email" value={reset.email} onChange={(event) => setReset((old) => ({ ...old, email: event.target.value }))} required />
          </Field>
          <button className="m-go btn btn-wollo w-100 mt-4" disabled={busy}>
            {t.send}
            <i>→</i>
          </button>
        </form>
        <div className="d-flex flex-wrap gap-3 align-items-center mt-4">
          <button className="m-link" onClick={() => setMode("signin")}>
            {t.back}
          </button>
        </div>
      </main>
    );
  }

  if (mode === "register") {
    return (
      <main className="m">
        <p className="m-brand">{t.brand}</p>
        <p className="m-title">{t.register}</p>
        {error ? <Notice kind="danger" text={error} /> : null}
        <form onSubmit={signUp}>
          <Field label={t.name}>
            <input className="form-control" value={signup.name} onChange={(event) => setSignup((old) => ({ ...old, name: event.target.value }))} autoComplete="name" />
          </Field>
          <Field label={t.email}>
            <input
              className="form-control"
              type="email"
              value={signup.email}
              onChange={(event) => setSignup((old) => ({ ...old, email: event.target.value }))}
              autoComplete="email"
              placeholder="student@wollo.edu.et"
              required
            />
          </Field>
          <Field label={t.phone}>
            <div className="input-group m-phone">
              <span className="input-group-text">{PHONE_PREFIX}</span>
              <input
                className="form-control"
                type="tel"
                inputMode="numeric"
                maxLength={9}
                placeholder="912345678"
                autoComplete="tel-national"
                value={phoneLocalDigits(signup.phone)}
                onChange={(event) => setSignup((old) => ({ ...old, phone: phoneFromLocal(event.target.value) }))}
              />
            </div>
          </Field>
          <Field label={t.department}>
            <select className="form-select" value={signup.department} onChange={(event) => setSignup((old) => ({ ...old, department: event.target.value }))}>
              {groups.map((group) => (
                <optgroup key={group.college} label={group.college}>
                  {group.programs.map((program) => (
                    <option key={`${group.college}-${program}`} value={program}>
                      {program}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label={t.password}>
            <input
              className="form-control"
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={signup.password}
              onChange={(event) => setSignup((old) => ({ ...old, password: event.target.value }))}
              required
            />
          </Field>
          <button className="m-go btn btn-wollo w-100 mt-4" disabled={busy}>
            {t.register}
            <i>→</i>
          </button>
        </form>
        <div className="d-flex flex-wrap gap-3 align-items-center mt-4">
          <button className="m-link" onClick={() => setMode("signin")}>
            {t.toSignin}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="m">
      <p className="m-brand">{t.brand}</p>
      <p className="m-title">{t.signin}</p>
      {notice ? <Notice kind="success" text={notice} /> : null}
      {error ? <Notice kind="danger" text={error} /> : null}
      <form onSubmit={signIn}>
        <Field label={t.identifier}>
          <input
            className="form-control"
            value={signin.identifier}
            onChange={(event) => setSignin((old) => ({ ...old, identifier: event.target.value }))}
            autoComplete="username"
            placeholder="student@wollo.edu.et"
            required
          />
        </Field>
        <Field label={t.password}>
          <input
            className="form-control"
            type="password"
            value={signin.password}
            onChange={(event) => setSignin((old) => ({ ...old, password: event.target.value }))}
            autoComplete="current-password"
            required
          />
        </Field>
        <button className="m-go btn btn-wollo w-100 mt-4" disabled={busy}>
          {t.signin}
          <i>→</i>
        </button>
      </form>
      <div className="d-flex flex-wrap gap-3 align-items-center mt-4">
        <button
          className="m-link"
          onClick={() => {
            setReset({ email: signin.identifier, password: "" });
            setMode("reset");
          }}
        >
          {t.forgot}
        </button>
        <button className="m-link" onClick={() => setMode("register")}>
          {t.toRegister}
        </button>
      </div>
    </main>
  );
}

function Staff({ t }) {
  const { session, logout } = useApp();
  return (
    <main className="m">
      <header className="m-top sticky-top d-flex align-items-center justify-content-between gap-3 bg-body">
        <span className="m-word">{t.brand}</span>
        <nav className="m-nav">
          <a className="m-link" href="/#admin">
            {t.full}
          </a>
        </nav>
      </header>
      <p className="m-title">{session.name || session.email}</p>
      <p className="m-quiet">{t.staff}</p>
      <div className="list-group list-group-flush mt-2">
        <div className="m-row list-group-item">
          <span className="m-row-t">{t.email}</span>
          <span className="m-row-n">{session.email}</span>
        </div>
      </div>
      <button className="m-go btn btn-wollo w-100 mt-4" onClick={() => logout()}>
        {t.signout}
        <i>→</i>
      </button>
    </main>
  );
}

/* The topics the support inbox accepts. The strings sent to the server stay these, so a
   translated label never invents a category the team does not read. */
const TICKET_TOPICS = [
  "Broken or wrong material",
  "Download problem",
  "Missing course material",
  "Account or payment",
  "Something else"
];

const STARS = [1, 2, 3, 4, 5];

function Stars({ value, onPick }) {
  return (
    <span className="m-rate">
      {STARS.map((n) => (
        <button type="button" key={n} className={n <= value ? "on" : ""} onClick={() => onPick(n)}>
          {n <= value ? "★" : "☆"}
        </button>
      ))}
    </span>
  );
}

function FileSheet({ t, course, mat, side, starred, onClose, onDownload, onToggleStar, onReport }) {
  const { myRatingFor, rateMaterial } = useApp();
  const file = side || mat;
  const mine = myRatingFor(mat.id);
  const average = Number(mat.ratingAvg) || 0;

  return (
    <div className="m-sheet bg-body">
      <p className="m-brand">{course.name}</p>
      <div className="m-mid">
        <p className="m-title">{file.name}</p>
        <p className="d-flex flex-wrap gap-2 mt-2 mb-0">
          {[file.type, file.size].filter(Boolean).map((bit) => (
            <span className="badge rounded-pill text-bg-secondary" key={bit}>
              {bit}
            </span>
          ))}
        </p>
        <div className="list-group list-group-flush mt-3">
          <div className="m-row list-group-item">
            <span className="m-row-t">{t.yourRate}</span>
            <span className="m-row-n">
              <Stars
                value={mine}
                onPick={(stars) => {
                  rateMaterial(course.id, mat.id, stars);
                }}
              />
            </span>
          </div>
          {average ? (
            <div className="m-row list-group-item">
              <span className="m-row-t">{t.average}</span>
              <span className="m-row-n">
                <span className="badge text-bg-warning rounded-pill">
                  ★ {average.toFixed(1)}
                </span>{" "}
                {mat.ratingCount || 0}
              </span>
            </div>
          ) : null}
          <button type="button" className="m-row list-group-item text-start w-100 border-0 bg-transparent" onClick={onToggleStar}>
            <span className="m-row-t">{starred ? t.unsave : t.save}</span>
            <span className={`badge rounded-pill${starred ? " text-bg-warning" : " text-bg-secondary"}`}>{starred ? "★" : "☆"}</span>
          </button>
        </div>
        <div className="d-flex flex-wrap gap-3 align-items-center mt-4">
          <button className="btn btn-sm btn-outline-secondary rounded-pill" onClick={onReport}>
            {t.report}
          </button>
        </div>
      </div>
      <div>
        <button className="m-go btn btn-wollo w-100" onClick={onDownload}>
          {openFile(file) ? t.open : t.download}
          <i>→</i>
        </button>
        <div className="d-flex flex-wrap gap-3 align-items-center mt-3">
          <button className="m-link" onClick={onClose}>
            {t.back}
          </button>
        </div>
      </div>
    </div>
  );
}

function SupportScreen({ t, prefill, onBack }) {
  const { session, toast } = useApp();
  const [topic, setTopic] = useState(TICKET_TOPICS[0]);
  const [message, setMessage] = useState(prefill?.text || "");
  const [tickets, setTickets] = useState([]);
  const [openId, setOpenId] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    listMyTickets(session.authToken).then((res) => {
      if (live && res && res.ok === true) setTickets(res.tickets || []);
    });
    return () => {
      live = false;
    };
  }, [session.authToken]);

  const send = async () => {
    setError("");
    setBusy(true);
    const res = await createTicket(
      { message: message.trim(), category: topic, ...(prefill?.courseId ? { courseId: prefill.courseId } : {}) },
      session.authToken
    );
    setBusy(false);
    if (!res || res.ok !== true) return setError((res && res.error) || t.fail);
    setTickets((prev) => [res.ticket, ...prev]);
    setMessage("");
    toast(t.sent);
    return undefined;
  };

  const sendAnswer = async (ticketId) => {
    setError("");
    setBusy(true);
    const res = await replyTicket(ticketId, answer.trim(), session.authToken);
    setBusy(false);
    if (!res || res.ok !== true) return setError((res && res.error) || t.fail);
    setTickets((prev) => prev.map((item) => (item.id === ticketId ? res.ticket : item)));
    setAnswer("");
    toast(t.sent);
    return undefined;
  };

  const statusWord = (ticket) =>
    ticket.status === "closed" ? t.stclosed : ticket.status === "answered" ? t.stanswered : t.stopen;
  const statusTone = (ticket) => (ticket.status === "closed" ? "secondary" : ticket.status === "answered" ? "success" : "warning");

  return (
    <>
      <button className="m-back btn btn-link p-0 mt-2" onClick={onBack}>
        ← {t.navAccount}
      </button>
      <p className="m-title">{t.report}</p>
      {error ? <Notice kind="danger" text={error} /> : null}
      <Field label={t.topic}>
        <select className="form-select" value={topic} onChange={(event) => setTopic(event.target.value)}>
          {TICKET_TOPICS.map((value, index) => (
            <option key={value} value={value}>
              {t.cats[index]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.what}>
        <textarea className="form-control" rows={4} value={message} onChange={(event) => setMessage(event.target.value)} />
      </Field>
      <button className="m-go btn btn-wollo w-100 mt-4" onClick={send} disabled={busy}>
        {t.submit}
        <i>→</i>
      </button>

      {tickets.length ? (
        <>
          <p className="m-h">{t.mine}</p>
          <div className="list-group list-group-flush mt-2">
            {tickets.map((ticket) => (
              <div key={ticket.id}>
                <div className="m-row list-group-item">
                  <button className="m-row-t" onClick={() => setOpenId(openId === ticket.id ? "" : ticket.id)}>
                    {ticket.message}
                    <em>{t.cats[TICKET_TOPICS.indexOf(ticket.category)] || ticket.category}</em>
                  </button>
                  <span className={`badge rounded-pill text-bg-${statusTone(ticket)}`}>{statusWord(ticket)}</span>
                </div>
                {openId === ticket.id ? (
                  <div className="m-thread">
                    {(ticket.replies || []).map((reply) => (
                      <p className="m-quiet" key={reply.id}>
                        <span className="fw-semibold text-body">{reply.authorName}</span>: {reply.text}
                      </p>
                    ))}
                    {ticket.status !== "closed" ? (
                      <>
                        <Field label={t.reply}>
                          <textarea className="form-control" rows={2} value={answer} onChange={(event) => setAnswer(event.target.value)} />
                        </Field>
                        <button className="btn btn-sm btn-outline-wollo rounded-pill mt-3" onClick={() => sendAnswer(ticket.id)} disabled={busy}>
                          {t.submit}
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

function Student({ t, lang, onLang, theme, onTheme }) {
  const {
    session,
    activeUser,
    coursesData,
    canSeeCourse,
    downloadStatus,
    downloadPolicy,
    pageTexts,
    gate,
    closeGate,
    requestDownload,
    logout,
    toast,
    refreshFromServer
  } = useApp();
  const [tab, setTab] = useState("courses");
  const [courseId, setCourseId] = useState(null);
  const [query, setQuery] = useState("");
  const [plan, setPlan] = useState(PLANS[0].key);
  const [reference, setReference] = useState("");
  const [sent, setSent] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);
  const [support, setSupport] = useState(null);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [shelf, setShelf] = useState(() => listShelf());
  const [recent, setRecent] = useState(() => listRecent());
  const [saved, setSaved] = useState(() => loadLibrary());

  const department = String(activeUser?.department || "").trim();
  const live = useMemo(() => coursesData.filter((course) => canSeeCourse(course)), [canSeeCourse, coursesData]);
  // Without a network the list on the device is the library: the names, the sizes and the
  // ratings are all there is until the student is back online.
  const visible = online ? live : saved?.list || live;

  // The store only calls this once a file is really handed to the browser, so the list
  // records what came down rather than what was tapped.
  useEffect(() => {
    window.__WS_ON_DOWNLOAD__ = (file) => {
      addToRecent({ ...file, key: fileKey(file.courseId, file.materialId, file.sideMaterialId || "") });
      setRecent(listRecent());
    };
    return () => {
      delete window.__WS_ON_DOWNLOAD__;
    };
  }, []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    if (!online || !live.length) return;
    const at = saveLibrary(live);
    if (at) setSaved({ at, list: live });
  }, [online, live]);

  const shelfKeys = useMemo(() => new Set(shelf.map((item) => item.key)), [shelf]);
  const mine = useMemo(() => {
    const ids = new Set(matchDepartmentPrograms(visible, department).map((course) => course.id));
    return visible.filter((course) => ids.has(course.id));
  }, [department, visible]);
  const others = useMemo(() => {
    const ids = new Set(mine.map((course) => course.id));
    return visible.filter((course) => !ids.has(course.id));
  }, [mine, visible]);

  const needle = query.trim().toLowerCase();
  const matches = (course) =>
    !needle ||
    course.name.toLowerCase().includes(needle) ||
    (course.materials || []).some((mat) => String(mat.name || "").toLowerCase().includes(needle));
  const filesOf = (course) => (course.materials || []).filter((mat) => !mat.hidden);
  const shownMine = mine.filter(matches);
  const shownOthers = others.filter(matches);
  const course = courseId ? visible.find((item) => item.id === courseId) : null;

  const go = (next) => {
    setTab(next);
    setCourseId(null);
    setSupport(null);
    setError("");
  };

  const openCourse = (id) => {
    setCourseId(id);
    setTab("courses");
  };

  const take = (item, mat, side) => {
    requestDownload(item.id, mat.id, side ? side.id : "");
  };

  const star = (item, mat, side) => {
    const file = side || mat;
    const added = toggleShelf({
      key: fileKey(item.id, mat.id, side ? side.id : ""),
      name: file.name,
      course: item.name,
      courseId: item.id,
      materialId: mat.id,
      sideMaterialId: side ? side.id : "",
      type: file.type,
      size: file.size,
      url: file.url && !String(file.url).startsWith("#sample") ? file.url : ""
    });
    setShelf(listShelf());
    return added;
  };

  const openSaved = (entry) => {
    if (entry.url) triggerBrowserDownload(entry.url, entry.name);
    else if (entry.courseId) openCourse(entry.courseId);
  };

  const sendOrder = async () => {
    setError("");
    setBusy(true);
    const res = await requestPremiumPlan(plan, reference.trim(), session.authToken);
    setBusy(false);
    if (!res || res.ok !== true) return setError((res && res.error) || t.fail);
    setSent(res.request || res.ticket || res);
    setReference("");
    toast(t.sentref);
  };

  const courseRow = (item) => (
    <button className="m-row list-group-item" key={item.id} onClick={() => openCourse(item.id)}>
      <span className="m-row-t">{item.name}</span>
      <span className="badge rounded-pill text-bg-secondary">{filesOf(item).length}</span>
    </button>
  );

  const fileRow = (item, mat, side) => {
    const file = side || mat;
    const key = fileKey(item.id, mat.id, side ? side.id : "");
    const meta = side ? mat.name : [mat.type, mat.size].filter(Boolean).join(" · ");
    return (
      <div className="m-row list-group-item" key={key}>
        <button className="m-row-t" onClick={() => take(item, mat, side)}>
          {file.name}
          {shelfKeys.has(key) ? <span className="text-warning"> ★</span> : null}
          <em>{meta}</em>
        </button>
        <span className="m-row-n">{openFile(file) ? t.open : t.download}</span>
        <button className="m-more" onClick={() => setDetail({ course: item, mat, side })}>
          ⋯
        </button>
      </div>
    );
  };

  const payTo = String(pageTexts.premiumPayment || "").trim();

  return (
    <>
      <main className="m">
        <header className="m-top sticky-top d-flex align-items-center justify-content-between gap-3 bg-body">
          <span className="m-word">{t.brand}</span>
          <nav className="m-nav nav gap-0">
            <button type="button" className={`nav-link${tab === "courses" ? " active" : ""}`} onClick={() => go("courses")}>
              {t.navCourses}
            </button>
            <button type="button" className={`nav-link${tab === "saved" ? " active" : ""}`} onClick={() => go("saved")}>
              {t.navSaved}
            </button>
            <button type="button" className={`nav-link${tab === "premium" ? " active" : ""}`} onClick={() => go("premium")}>
              {t.navPremium}
            </button>
            <button type="button" className={`nav-link${tab === "account" ? " active" : ""}`} onClick={() => go("account")}>
              {t.navAccount}
            </button>
          </nav>
        </header>

        {support ? (
          <SupportScreen
            t={t}
            prefill={support}
            onBack={() => {
              setSupport(null);
              setDetail(null);
            }}
          />
        ) : course ? (
          <>
            <button className="m-back btn btn-link p-0 mt-2" onClick={() => setCourseId(null)}>
              ← {t.navCourses}
            </button>
            <p className="m-title">{course.name}</p>
            <p className="m-quiet">{course.college || department}</p>
            <div className="list-group list-group-flush mt-2">
              {filesOf(course).map((mat) => (
                <React.Fragment key={mat.id}>
                  {fileRow(course, mat)}
                  {(mat.sideMaterials || []).filter((side) => !side.hidden).map((side) => fileRow(course, mat, side))}
                </React.Fragment>
              ))}
              {!filesOf(course).length ? <p className="m-quiet">{t.none}</p> : null}
            </div>
          </>
        ) : tab === "saved" ? (
          <>
            <p className="m-title">{t.navSaved}</p>
            <p className="m-quiet">
              {online ? (
                <>
                  <span className="badge rounded-pill badge-wollo me-2">{t.savedOn}</span>
                  {when(saved?.at)}
                  {" · "}
                  <button className="m-link" onClick={() => refreshFromServer()}>
                    {t.refresh}
                  </button>
                </>
              ) : (
                <span className="badge rounded-pill text-bg-warning">{t.offline}</span>
              )}
            </p>
            <p className="m-h">{t.starred}</p>
            <div className="list-group list-group-flush mt-2">
              {shelf.map((entry) => (
                <div className="m-row list-group-item" key={entry.key}>
                  <button className="m-row-t" onClick={() => openSaved(entry)}>
                    {entry.name}
                    <em>{entry.course}</em>
                  </button>
                  <span className="m-row-n">{when(entry.savedAt)}</span>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label={t.remove}
                    onClick={() => {
                      removeFromShelf(entry.key);
                      setShelf(listShelf());
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {!shelf.length ? <p className="m-quiet">{t.noneSaved}</p> : null}
            </div>
            <p className="m-h">{t.recent}</p>
            <div className="list-group list-group-flush mt-2">
              {recent.map((entry) => (
                <div className="m-row list-group-item" key={entry.key}>
                  <button className="m-row-t" onClick={() => openSaved(entry)}>
                    {entry.name}
                    <em>{entry.course}</em>
                  </button>
                  <span className="m-row-n">{when(entry.at)}</span>
                  <button className="m-more" title={t.again} onClick={() => openSaved(entry)}>
                    ↻
                  </button>
                </div>
              ))}
              {!recent.length ? <p className="m-quiet">{t.noneRecent}</p> : null}
              {recent.length ? (
                <p className="d-flex flex-wrap gap-3 align-items-center mt-4">
                  <button
                    className="btn btn-sm btn-outline-secondary rounded-pill"
                    onClick={() => {
                      clearRecent();
                      setRecent([]);
                    }}
                  >
                    {t.clear}
                  </button>
                </p>
              ) : null}
            </div>
          </>
        ) : tab === "courses" ? (
          <>
            {!online ? (
              <div className="alert alert-warning py-2 px-3 small mt-4 mb-0" role="status">
                {t.offline}
              </div>
            ) : null}
            <input className="m-find form-control rounded-pill" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.find} />
            {shownMine.length ? (
              <>
                <p className="m-h">{department || t.your}</p>
                <div className="list-group list-group-flush mt-2">{shownMine.map(courseRow)}</div>
              </>
            ) : null}
            {shownOthers.length ? (
              <>
                <p className="m-h">{t.all}</p>
                <div className="list-group list-group-flush mt-2">{shownOthers.map(courseRow)}</div>
              </>
            ) : null}
            {!shownMine.length && !shownOthers.length ? <p className="m-quiet">{t.none}</p> : null}
          </>
        ) : tab === "premium" ? (
          <>
            <p className="m-title">{t.choose}</p>
            {error ? <Notice kind="danger" text={error} /> : null}
            <div className="list-group list-group-flush mt-2">
              {PLANS.map((item) => (
                <button className={`m-row list-group-item${plan === item.key ? " active" : ""}`} key={item.key} onClick={() => setPlan(item.key)}>
                  <span className="m-row-t">
                    {item.title}
                    <em>{item.detail}</em>
                  </span>
                  <span className="badge rounded-pill text-bg-secondary">{item.price}</span>
                </button>
              ))}
            </div>
            {payTo ? (
              <>
                <p className="m-h">{t.pay}</p>
                <div className="card bg-body-tertiary border-0">
                  <div className="card-body py-3 px-3 small m-pay text-body-secondary">{payTo}</div>
                </div>
              </>
            ) : null}
            <Field label={t.reference}>
              <input className="form-control" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Telebirr · 123456" />
            </Field>
            <button className="m-go btn btn-wollo w-100 mt-4" onClick={sendOrder} disabled={busy}>
              {t.sendref}
              <i>→</i>
            </button>
            {sent ? (
              <div className="alert alert-success py-2 px-3 small mt-4 mb-0" role="status">
                {t.sentref}
                {sent.premiumReference ? ` · ${sent.premiumReference}` : ""}
              </div>
            ) : (
              <p className="m-quiet">{t.note}</p>
            )}
          </>
        ) : (
          <>
            <div className="d-flex align-items-center gap-3 mt-4">
              <span className="m-word flex-grow-1">{activeUser?.name || session.name || t.brand}</span>
              <span className={`badge rounded-pill${downloadStatus.premium ? " badge-wollo" : " text-bg-secondary"}`}>
                {downloadStatus.premium ? t.premium : t.free}
              </span>
            </div>
            <div className="list-group list-group-flush mt-2">
              <div className="m-row list-group-item">
                <span className="m-row-t">{t.email}</span>
                <span className="m-row-n">{activeUser?.email || session.email}</span>
              </div>
              {!downloadStatus.premium && downloadPolicy.mode === "credits" ? (
                <div className="m-row list-group-item">
                  <span className="m-row-t">{t.left}</span>
                  <span className="badge rounded-pill text-bg-secondary">{downloadStatus.credits}</span>
                </div>
              ) : null}
              {department ? (
                <div className="m-row list-group-item">
                  <span className="m-row-t">{t.your}</span>
                  <span className="m-row-n">{department}</span>
                </div>
              ) : null}
              <div className="m-row list-group-item">
                <span className="m-row-t">{t.lang}</span>
                <span className="btn-group btn-group-sm" role="group">
                  <button type="button" className={`btn${lang === "en" ? " btn-outline-wollo" : " btn-outline-secondary"}`} onClick={() => onLang("en")}>
                    EN
                  </button>
                  <button type="button" className={`btn${lang === "am" ? " btn-outline-wollo" : " btn-outline-secondary"}`} onClick={() => onLang("am")}>
                    አማ
                  </button>
                </span>
              </div>
              <div className="m-row list-group-item">
                <span className="m-row-t">{t.theme}</span>
                <span className="btn-group btn-group-sm" role="group">
                  {["auto", "light", "dark"].map((mode) => (
                    <button
                      type="button"
                      key={mode}
                      className={`btn${theme === mode ? " btn-outline-wollo" : " btn-outline-secondary"}`}
                      onClick={() => onTheme(mode)}
                    >
                      {mode === "auto" ? t.auto : mode === "light" ? t.light : t.dark}
                    </button>
                  ))}
                </span>
              </div>
            </div>
            <div className="d-flex flex-wrap gap-3 align-items-center mt-4">
              <button className="btn btn-sm btn-outline-secondary rounded-pill" onClick={() => setSupport({})}>
                {t.report}
              </button>
            </div>
            <button className="m-go btn btn-wollo w-100 mt-4" onClick={() => logout()}>
              {t.signout}
              <i>→</i>
            </button>
          </>
        )}
      </main>

      {detail ? (
        <FileSheet
          t={t}
          course={detail.course}
          mat={detail.mat}
          side={detail.side}
          starred={shelfKeys.has(fileKey(detail.course.id, detail.mat.id, detail.side ? detail.side.id : ""))}
          onClose={() => setDetail(null)}
          onDownload={() => {
            take(detail.course, detail.mat, detail.side);
            setDetail(null);
          }}
          onToggleStar={() => star(detail.course, detail.mat, detail.side)}
          onReport={() => {
            setSupport({
              courseId: detail.course.id,
              text: `${detail.course.name} — ${detail.mat.name}${detail.side ? ` (${detail.side.name})` : ""}: `
            });
          }}
        />
      ) : null}

      {gate && gate.type === "ad" ? <AdSheet t={t} /> : null}
      {gate && gate.type === "upgrade" ? (
        <UpgradeSheet
          t={t}
          onPlans={() => {
            closeGate();
            go("premium");
          }}
        />
      ) : null}
    </>
  );
}

export default function MobileApp() {
  const { booting, session, isStaff } = useApp();
  const [lang, setLang] = useState(() => localStorage.getItem("wollo_mobile_lang") || "en");
  const [theme, setTheme] = useState(() => localStorage.getItem("wollo_mobile_theme") || "auto");

  useEffect(() => {
    localStorage.setItem("wollo_mobile_lang", lang);
    document.documentElement.lang = lang;
  }, [lang]);

  // Bootstrap owns the palette, so the appearance switch writes data-bs-theme and lets
  // "auto" follow the phone itself.
  useEffect(() => {
    localStorage.setItem("wollo_mobile_theme", theme);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.bsTheme = theme === "dark" || (theme === "auto" && prefersDark.matches) ? "dark" : "light";
    };
    apply();
    if (theme !== "auto") return undefined;
    prefersDark.addEventListener("change", apply);
    return () => prefersDark.removeEventListener("change", apply);
  }, [theme]);

  const t = COPY[lang] || COPY.en;

  if (booting) {
    return (
      <main className="m" data-lang={lang}>
        <p className="m-brand">{t.brand}</p>
        <div className="placeholder-glow d-flex gap-3 mt-4" aria-hidden="true">
          <span className="placeholder col-4 rounded-pill" />
          <span className="placeholder col-3 rounded-pill" />
        </div>
        <p className="m-quiet">{t.loading}</p>
      </main>
    );
  }

  return (
    <div data-lang={lang}>
      {!session ? <Auth t={t} /> : isStaff ? <Staff t={t} /> : <Student t={t} lang={lang} onLang={setLang} theme={theme} onTheme={setTheme} />}
      <Toasts />
    </div>
  );
}
