import React from "react";
import { useApp } from "../store/AppContext.jsx";
import { CheckCircle2, Crown, Download, LifeBuoy, MailWarning, QrCode, Send, Upload } from "lucide-react";

const ASKS = ["Broken or wrong material", "Download problem", "Missing course material", "Account or payment"];

const FAQS = [
  { q: "No email code arrived", a: "Wait a minute, check spam and promotions, then ask for the code again. If it still does not come, open a support thread — the team can verify the account." },
  { q: "I have credits but the file refuses", a: "Files still under review, or Premium-only files, do not open with free credits. A file marked free never needs credits." },
  { q: "My course is not listed", a: "Ask for it in a support thread with the course name and code. Students share the material and the team publishes it." },
  { q: "A course my class uses is locked", a: "Some programs are shared only with their own students. Open a support thread and say which course you need." },
  { q: "Does it work on a phone?", a: "Yes — open the site in the phone browser and sign in the same way. Files download as PDFs you can read offline." },
  { q: "I paid for Premium", a: "Send the payment reference in a support thread or from the Premium page. The account switches over the same day." }
];

export default function HelpPage() {
  const { session, downloadPolicy, downloadStatus, goLibrary, goLogin, goPremium, goSupport, setGate, view } = useApp();

  const openSupport = session ? goSupport : goLogin;

  const downloadLines = [];
  if (!session) {
    downloadLines.push("Without an account only files marked free open. A free account unlocks the rest.");
  } else if (downloadStatus.premium) {
    downloadLines.push("Your account has unlimited downloads and no sponsor spot.");
  } else if (downloadPolicy.mode === "free") {
    downloadLines.push("Every signed-in student downloads without limits right now.");
  } else if (downloadPolicy.mode === "premium") {
    downloadLines.push("Downloads are Premium-only on this site right now.");
  } else {
    const perCredit = downloadPolicy.uploadsPerCredit;
    downloadLines.push(
      `${perCredit} approved upload${perCredit === 1 ? "" : "s"} earn${perCredit === 1 ? "s" : ""} you 1 download credit.`
    );
    downloadLines.push(`You have ${downloadStatus.credits} credit${downloadStatus.credits === 1 ? "" : "s"} ready.`);
  }
  // The sponsor spot only plays for an account that is actually allowed to download;
  // a visitor meets the sign-in gate and a Premium-only site meets the upgrade gate.
  if (session && !downloadStatus.premium && downloadPolicy.mode !== "premium" && downloadPolicy.adSeconds > 0) {
    downloadLines.push(`A ${downloadPolicy.adSeconds}-second sponsor spot plays before each free download.`);
  }

  return (
    <div className="ws-page ws-help">
      <section className="ws-hero">
        <span className="ws-hero-eyebrow">Help</span>
        <h1>How Wollo Share works</h1>
        <p className="lead">
          The rules for downloading and sharing course material, getting back into an account, and reaching the student
          support team.
        </p>
        <div className="d-flex flex-wrap gap-2 mt-3">
          <button type="button" className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1" onClick={openSupport}>
            <LifeBuoy size={15} aria-hidden="true" />
            Message support
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={goLibrary}>
            <Download size={15} aria-hidden="true" />
            Open the library
          </button>
        </div>
      </section>

      <div className="ws-section-head">
        <h2>Downloads</h2>
        <span className="ws-section-note">Running on this site today</span>
      </div>
      <div className="d-flex flex-wrap gap-2">
        {downloadLines.map((line) => (
          <div key={line} className="ws-rule-line">
            <Download size={15} aria-hidden="true" />
            <span>{line}</span>
          </div>
        ))}
        <div className="ws-rule-line is-lime">
          <Crown size={15} aria-hidden="true" />
          <span>
            Premium removes the credits and the wait: 100 Birr a month, 250 Birr a year or 500 Birr for life.{" "}
            <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={goPremium}>
              See the plans
            </button>
          </span>
        </div>
      </div>

      <div className="ws-section-head">
        <h2>Share your own files</h2>
        <span className="ws-section-note">This is how the library grows</span>
      </div>
      <ol className="ws-step-list">
        <li>
          <Upload size={15} aria-hidden="true" />
          <span className="ws-step-index">1</span>
          <span>
            <strong>Pick the course and the kind</strong>
            <span className="d-block small text-secondary">Notes, slides, past exams, lab manuals or assignments.</span>
          </span>
        </li>
        <li>
          <Send size={15} aria-hidden="true" />
          <span className="ws-step-index">2</span>
          <span>
            <strong>Upload the PDF</strong>
            <span className="d-block small text-secondary">One file per submission, named after the course or exam year.</span>
          </span>
        </li>
        <li>
          <CheckCircle2 size={15} aria-hidden="true" />
          <span className="ws-step-index">3</span>
          <span>
            <strong>It lands in the course page</strong>
            <span className="d-block small text-secondary">Approved uploads are what pay for your own downloads.</span>
          </span>
        </li>
      </ol>
      <p className="banner info mt-2 mb-0">
        <Upload size={15} aria-hidden="true" />
        <span>
          {session ? (
            <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setGate({ type: "share", courseId: view.courseId || "" })}>
              Share a file now
            </button>
          ) : (
            <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={goLogin}>
              Sign in to share a file
            </button>
          )}
        </span>
      </p>

      <div className="ws-section-head">
        <h2>Accounts and sign-in</h2>
      </div>
      <ol className="ws-step-list">
        <li>
          <MailWarning size={15} aria-hidden="true" />
          <span className="ws-step-index">1</span>
          <span>
            <strong>A 6-digit code opens a new account</strong>
            <span className="d-block small text-secondary">It stays valid for 30 minutes. Check spam before asking for another.</span>
          </span>
        </li>
        <li>
          <QrCode size={15} aria-hidden="true" />
          <span className="ws-step-index">2</span>
          <span>
            <strong>Sign in on a laptop with your phone</strong>
            <span className="d-block small text-secondary">On the sign-in page, scan the code with the phone that holds your account.</span>
          </span>
        </li>
        <li>
          <LifeBuoy size={15} aria-hidden="true" />
          <span className="ws-step-index">3</span>
          <span>
            <strong>Forgot the password</strong>
            <span className="d-block small text-secondary">Use “Forgot password” — a code arrives by email and lets you set a new one.</span>
          </span>
        </li>
      </ol>
      <p className="banner info mt-2 mb-0">
        <LifeBuoy size={15} aria-hidden="true" />
        <span>Accounts need an Ethiopian phone number (+251, 9 digits) so the team can reach you about your upload.</span>
      </p>

      <div className="ws-section-head">
        <h2>Ask the support team</h2>
        <span className="ws-section-note">Answers arrive in your own thread</span>
      </div>
      <p className="mb-2" style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
        Pick what the problem is about: {ASKS.join(", ")} and anything else. Keep it to one file or one course so the
        reply is quick.
      </p>
      <button type="button" className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1" onClick={openSupport}>
        <LifeBuoy size={15} aria-hidden="true" />
        {session ? "Open my threads" : "Sign in to open a thread"}
      </button>

      <div className="ws-section-head">
        <h2>Common questions</h2>
      </div>
      <div className="ws-faq">
        {FAQS.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
