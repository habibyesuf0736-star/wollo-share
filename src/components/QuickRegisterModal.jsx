import React, { useState } from "react";
import Modal from "./Modal.jsx";
import DepartmentSelect from "./DepartmentSelect.jsx";
import { useApp } from "../store/AppContext.jsx";
import { phoneProblem } from "../lib/utils.js";
import { FRESHMAN_DEPARTMENT } from "../lib/departments.js";

export default function QuickRegisterModal() {
  const { gate, closeGate, setGate, register, goLogin, toast, coursesData } = useApp();
  const open = Boolean(gate && gate.type === "register");
  const [form, setForm] = useState({ name: "", email: "", password: "", department: FRESHMAN_DEPARTMENT, phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    setForm({ name: "", email: "", password: "", department: FRESHMAN_DEPARTMENT, phone: "" });
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.email.includes("@") || form.password.length < 8) {
      setError("Enter a valid email and a password with at least 8 characters.");
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
    if (!res.signedIn) {
      toast(res.message || "Account created — sign in to continue.");
      closeGate();
      goLogin();
      return;
    }
    // The emailed 6-digit code is confirmed after sign-in, from the library's
    // "Confirm your email" bar, so the download they clicked is never blocked by it.
    releaseToNextGate(res.user ? res.user.name : "student");
  };

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
          placeholder="Choose a password (min 8 characters)"
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
