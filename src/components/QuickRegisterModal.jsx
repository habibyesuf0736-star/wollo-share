import React, { useState } from "react";
import Modal from "./Modal.jsx";
import DepartmentSelect from "./DepartmentSelect.jsx";
import { useApp } from "../store/AppContext.jsx";
import { phoneProblem } from "../lib/utils.js";
import { resendVerificationCode } from "../lib/api.js";
import { FRESHMAN_DEPARTMENT } from "../lib/departments.js";

export default function QuickRegisterModal() {
  const { gate, closeGate, setGate, register, verifySignup, adoptSession, goLogin, toast, coursesData } = useApp();
  const open = Boolean(gate && gate.type === "register");
  const [stage, setStage] = useState("form");
  const [form, setForm] = useState({ name: "", email: "", password: "", department: FRESHMAN_DEPARTMENT, phone: "" });
  const [pending, setPending] = useState({ email: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (!open) return null;

  // The student is now a signed-in member of the library, so hand them back to whatever
  // gate their download hit next instead of dropping them at the top of the site.
  const releaseToNextGate = (name) => {
    toast(`Account created — welcome, ${name}!`);
    if (gate.materialId) {
      setGate({ type: "upgrade", courseId: gate.courseId, materialId: gate.materialId, sideMaterialId: gate.sideMaterialId, title: gate.title });
    } else {
      closeGate();
    }
    setStage("form");
    setForm({ name: "", email: "", password: "", department: FRESHMAN_DEPARTMENT, phone: "" });
    setPending({ email: "", code: "" });
    setNotice("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.email.includes("@") || form.password.length < 4) {
      setError("Enter a valid email and a password with at least 4 characters.");
      return;
    }
    if (!form.department) {
      setError("Select your department / program so we can show your course materials first.");
      return;
    }
    const phoneError = phoneProblem(form.phone);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const res = await register({
      name: form.name.trim() || "Wollo Student",
      email: form.email.trim(),
      password: form.password,
      department: form.department,
      phone: form.phone.trim()
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not create the account.");
      return;
    }
    if (res.pendingVerification) {
      // Code is on its way: stay in this dialog and collect it, so the download they
      // clicked is still the thing they finish.
      setPending({ email: res.email || form.email.trim(), code: "" });
      setStage("code");
      setNotice("");
      return;
    }
    releaseToNextGate(res.user ? res.user.name : "student");
  };

  const submitCode = async (event) => {
    event.preventDefault();
    const code = pending.code.replace(/\D/g, "");
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await verifySignup(pending.email, code);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "That code did not match.");
      return;
    }
    if (!res.signedIn) {
      // The address was already confirmed (an administrator did it), so the account
      // needs a normal sign-in rather than another code.
      toast(res.message || "That account is already verified. Sign in to continue.");
      closeGate();
      goLogin();
      return;
    }
    releaseToNextGate("student");
  };

  const resend = async () => {
    setBusy(true);
    setError("");
    const res = await resendVerificationCode(pending.email);
    setBusy(false);
    if (!res || res.ok !== true) {
      setError((res && res.error) || "Could not send another code.");
      return;
    }
    if (res.session) {
      // The provider refused the mail, so the server opened a plain student account
      // rather than leaving this dialog waiting for a code nobody receives.
      adoptSession(res.session);
      releaseToNextGate(res.user ? res.user.name : "student");
      return;
    }
    setNotice(res.message || "A new 6-digit code is on its way.");
  };

  if (stage === "code") {
    return (
      <Modal
        open={open}
        onClose={closeGate}
        title="Enter your verification code"
        subtitle={pending.email}
        size="narrow"
      >
        <form onSubmit={submitCode} className="d-flex flex-column gap-3">
          <input
            className="form-control text-center"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={pending.code}
            onChange={(e) => setPending({ ...pending, code: e.target.value.replace(/\D/g, "") })}
          />
          {notice ? <p className="small text-muted mb-0">{notice}</p> : null}
          {error ? <p className="text-danger small mb-0">{error}</p> : null}
          <div className="d-flex justify-content-between gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={resend} disabled={busy}>
              {busy ? "Sending…" : "Resend code"}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Verify and continue
            </button>
          </div>
          <button type="button" className="btn btn-link btn-sm p-0" onClick={() => { closeGate(); goLogin(); }}>
            Use a different email
          </button>
        </form>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={closeGate}
      title="Create your free student account"
      subtitle={gate.title ? `“${gate.title}” is reserved for registered Wollo Share students.` : "Registration is free and unlocks the shared library."}
      size="narrow"
    >
      <form onSubmit={submit} className="d-flex flex-column gap-3">
        <input className="form-control" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="form-control" type="email" placeholder="Student email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input
          className="form-control"
          type="password"
          placeholder="Choose a password (min 4 characters)"
          autoComplete="new-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <DepartmentSelect
          coursesData={coursesData}
          value={form.department}
          onChange={(department) => setForm({ ...form, department })}
        />
        <div>
          <input
            className="form-control"
            inputMode="tel"
            autoComplete="tel"
            placeholder="Phone number (e.g. 0912 345 678)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <p className="form-text small mb-0">Required — the library team uses it to reach you about your uploads.</p>
        </div>
        {error ? <p className="text-danger small mb-0">{error}</p> : null}
        <div className="d-flex justify-content-between gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={() => { closeGate(); goLogin(); }}>
            I already have an account
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
