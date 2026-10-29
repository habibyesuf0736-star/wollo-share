import React, { useState } from "react";
import Modal from "./Modal.jsx";
import DepartmentSelect from "./DepartmentSelect.jsx";
import PhoneField from "./PhoneField.jsx";
import { useApp } from "../store/AppContext.jsx";
import { resendVerificationCode } from "../lib/api.js";
import { phoneProblem } from "../lib/utils.js";
import { FRESHMAN_DEPARTMENT } from "../lib/departments.js";

const EMPTY_FORM = { name: "", email: "", password: "", department: FRESHMAN_DEPARTMENT, phone: "" };

export default function QuickRegisterModal() {
  const { gate, closeGate, setGate, register, verifySignup, goLogin, toast, coursesData } = useApp();
  const open = Boolean(gate && gate.type === "register");
  const [form, setForm] = useState(EMPTY_FORM);
  const [stage, setStage] = useState("form");
  const [code, setCode] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [mailSent, setMailSent] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const reset = () => {
    setForm(EMPTY_FORM);
    setStage("form");
    setCode("");
    setPendingEmail("");
    setNotice("");
    setError("");
  };

  const close = () => {
    reset();
    closeGate();
  };

  // Only after the address answers does the student land back on the download they wanted.
  const releaseToNextGate = (name) => {
    toast(`Email confirmed — welcome, ${name}!`);
    if (gate.materialId) {
      setGate({ type: "upgrade", courseId: gate.courseId, materialId: gate.materialId, sideMaterialId: gate.sideMaterialId, title: gate.title });
    } else {
      closeGate();
    }
    reset();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.email.includes("@") || form.password.length < 8) {
      setError("Enter a valid email and a password with at least 8 characters.");
      return;
    }
    if (!form.department) {
      setError("Select your department.");
      return;
    }
    const phoneError = phoneProblem(form.phone);
    if (phoneError) {
      setError(phoneError);
      return;
    }
    setBusy(true);
    setError("");
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
    setPendingEmail(res.email || form.email.trim());
    setMailSent(res.mailSent !== false);
    setCode("");
    setNotice("");
    setStage("verify");
  };

  const submitCode = async (event) => {
    event.preventDefault();
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await verifySignup(pendingEmail, code);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "That code did not work.");
      return;
    }
    releaseToNextGate(form.name.trim() || (res.session && res.session.name) || "student");
  };

  const resend = async () => {
    setError("");
    setBusy(true);
    const res = await resendVerificationCode(pendingEmail);
    setBusy(false);
    if (!res || res.ok !== true) {
      setError((res && res.error) || "Could not resend the code.");
      return;
    }
    setMailSent(Boolean(res.mailSent));
    setNotice(res.mailSent ? "A fresh code is on its way." : res.message || "The email could not be delivered.");
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={stage === "verify" ? "Confirm your email" : "Create your free student account"}
      subtitle={
        stage === "verify"
          ? mailSent
            ? `Code sent to ${pendingEmail}.`
            : `The code did not reach ${pendingEmail}.`
          : gate.title
          ? `“${gate.title}” is reserved for registered Wollo Share students.`
          : "Registration is free and unlocks the shared library."
      }
      size="narrow"
    >
      {stage === "verify" ? (
        <form onSubmit={submitCode} className="d-flex flex-column gap-3">
          <input
            className="form-control ws-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            placeholder="123456"
            aria-label="Email confirmation code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          {!mailSent ? (
            <p className="small text-secondary mb-0">
              Your account and password are ready. Resend the code, or{" "}
              <button
                type="button"
                className="btn btn-link btn-sm p-0 align-baseline"
                onClick={() => {
                  close();
                  goLogin();
                }}
              >
                sign in with your password
              </button>
              .
            </p>
          ) : null}
          {notice ? <p className="small text-secondary mb-0">{notice}</p> : null}
          {error ? <p className="text-danger small mb-0">{error}</p> : null}
          <div className="d-flex justify-content-between gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={resend} disabled={busy}>
              Resend code
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Checking…" : "Verify and continue"}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submit} className="d-flex flex-column gap-3">
          <input className="form-control" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="form-control" type="email" placeholder="Student email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input
            className="form-control"
            type="password"
            placeholder="Choose a password (min 8 characters)"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <DepartmentSelect coursesData={coursesData} value={form.department} onChange={(department) => setForm({ ...form, department })} />
          <PhoneField value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
          {error ? <p className="text-danger small mb-0">{error}</p> : null}
          <div className="d-flex justify-content-between gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={() => { close(); goLogin(); }}>
              I already have an account
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
