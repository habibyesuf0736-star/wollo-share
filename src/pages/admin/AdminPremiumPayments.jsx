import React, { useMemo, useRef, useState } from "react";
import { Check, Crown, Eye, Plus, Save, Send, Trash2, Upload, X } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import * as api from "../../lib/api.js";
import Modal from "../../components/Modal.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { bannerDataUrl } from "../../lib/imagePick.js";

const STATUS_LABEL = {
  pending: "Pending verification",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  resubmission_required: "New screenshot requested",
  cancelled: "Cancelled"
};

const STATUS_TONE = {
  pending: "text-bg-warning",
  under_review: "text-bg-info",
  approved: "text-bg-success",
  rejected: "text-bg-danger",
  resubmission_required: "text-bg-warning",
  cancelled: "text-bg-secondary"
};

const OPEN_STATES = ["pending", "under_review", "resubmission_required"];

function when(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const newMethod = (order) => ({
  id: `pm-${Date.now().toString(36)}-${Math.floor(Math.random() * 9000 + 1000)}`,
  name: "",
  provider: "",
  destination: "",
  holderName: "",
  instructions: "",
  qrImageUrl: "",
  active: true,
  order
});

export default function AdminPremiumPayments() {
  const { session, premiumPayments, paymentMethods, isAdmin, savePaymentMethod, deletePaymentMethod, decidePremiumPayment, toast } = useApp();
  const [editingMethod, setEditingMethod] = useState(null);
  const [openProof, setOpenProof] = useState(null);
  const [proofImage, setProofImage] = useState("");
  const [busy, setBusy] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const qrInput = useRef(null);

  const waiting = useMemo(() => premiumPayments.filter((p) => OPEN_STATES.includes(p.status)), [premiumPayments]);
  const decided = useMemo(() => premiumPayments.filter((p) => !OPEN_STATES.includes(p.status)).slice(0, 20), [premiumPayments]);
  const methods = useMemo(() => paymentMethods.slice().sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)), [paymentMethods]);

  const saveMethod = async () => {
    if (!editingMethod) return;
    if (!String(editingMethod.name || "").trim()) {
      toast("Give the method a name, like Telebirr.");
      return;
    }
    setBusy("method");
    const res = await savePaymentMethod(editingMethod);
    setBusy("");
    if (res && res.ok !== false) {
      setEditingMethod(null);
      toast("Payment method saved.");
    }
  };

  const removeMethod = async (method) => {
    const res = await deletePaymentMethod(method.id, session.authToken);
    if (res && res.ok !== false) toast("Payment method removed.");
  };

  const attachQr = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file || !editingMethod) return;
    try {
      const qrImageUrl = await bannerDataUrl(file, { out: 720 });
      setEditingMethod((prev) => ({ ...prev, qrImageUrl }));
    } catch (error) {
      toast(error.message || "That picture was not usable.");
    }
  };

  const openProofFor = async (payment) => {
    setOpenProof(payment);
    setProofImage("");
    setReason("");
    setNote("");
    const res = await api.readPremiumScreenshot(payment.id, session.authToken);
    if (res && res.ok !== false) setProofImage(res.screenshot || "");
    else toast((res && res.error) || "The screenshot could not be opened.");
  };

  const decide = async (action) => {
    if (!openProof) return;
    if (["reject", "resubmit", "cancel"].includes(action) && !reason.trim()) {
      toast("Say why, so the student knows what to fix.");
      return;
    }
    setBusy(action);
    const res = await decidePremiumPayment(openProof.id, { action, reason: reason.trim(), note: note.trim() });
    setBusy("");
    if (res && res.ok !== false) {
      toast(
        action === "approve"
          ? "Payment confirmed — Premium is live on that account."
          : action === "review"
            ? "Marked as under review."
            : "The student can see your note."
      );
      setOpenProof(null);
    }
  };

  if (!isAdmin) {
    return (
      <EmptyState
        icon={<Crown size={24} />}
        title="Administrator access required"
        description="Only an administrator reads payment proofs or writes the accounts students pay into."
      />
    );
  }

  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <span className="ws-section-kicker">Wollo Share Premium</span>
        <h2 className="h4 mb-1">Payment proofs</h2>
        <p className="small text-secondary mb-0">
          A screenshot is evidence, not a confirmation. Check the transfer against {methods.length ? methods[0].provider || "your bank or telebirr record" : "the payment method you configure"} before approving.
        </p>
      </div>

      <div className="card p-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h3 className="h6 mb-0">Payment methods students are sent to</h3>
          <button type="button" className="btn btn-sm btn-soft d-inline-flex align-items-center gap-1" onClick={() => setEditingMethod(newMethod((methods.length + 1) * 10))}>
            <Plus size={14} aria-hidden="true" />
            Add method
          </button>
        </div>
        <p className="small text-secondary mb-2">
          These details are the only payment information the app ever shows. Nothing here is written into the code.
        </p>
        <div className="d-flex flex-column gap-2">
          {methods.map((method) => (
            <div key={method.id} className="d-flex flex-wrap justify-content-between align-items-start gap-2 border rounded-3 p-2">
              <div style={{ minWidth: 0 }}>
                <div className="fw-semibold small">
                  {method.name}
                  {method.provider ? <span className="text-secondary fw-normal"> · {method.provider}</span> : null}
                  {!method.active ? <span className="badge rounded-pill text-bg-secondary ms-2">Hidden</span> : null}
                </div>
                <div className="small text-secondary mono">{method.destination || "No account set"}</div>
                {method.holderName ? <div className="small text-secondary">{method.holderName}</div> : null}
                {method.instructions ? <div className="small mt-1" style={{ whiteSpace: "pre-wrap" }}>{method.instructions}</div> : null}
              </div>
              <div className="d-flex gap-1">
                {method.qrImageUrl ? <img src={method.qrImageUrl} alt="" width={44} height={44} className="rounded-2 object-fit-cover" style={{ objectFit: "cover" }} /> : null}
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditingMethod({ ...method })}>
                  Edit
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => savePaymentMethod({ ...method, active: !method.active })}>
                  {method.active ? "Hide" : "Show"}
                </button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeMethod(method)} aria-label={`Delete ${method.name}`}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          {!methods.length ? (
            <div className="small text-secondary">
              No method yet. Until you add one, the premium page shows the plans but no account to pay into — and students cannot be sent anywhere invented.
            </div>
          ) : null}
        </div>
      </div>

      <div className="d-flex flex-column gap-2">
        <h3 className="h6 mb-0">Waiting on you ({waiting.length})</h3>
        {waiting.map((payment) => (
          <div key={payment.id} className="card p-3 d-flex flex-column gap-2">
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
              <div style={{ minWidth: 0 }}>
                <div className="fw-semibold">
                  {payment.userName || payment.userEmail}
                  <span className="small text-secondary fw-normal"> · {payment.userEmail}</span>
                </div>
                <div className="small text-secondary mono">
                  {payment.reference} · sent {when(payment.submittedAt)}
                </div>
              </div>
              <span className={`badge rounded-pill ${STATUS_TONE[payment.status] || "text-bg-secondary"}`}>{STATUS_LABEL[payment.status] || payment.status}</span>
            </div>
            <div className="d-flex flex-wrap gap-3 small">
              <span>
                <strong>{payment.planTitle}</strong> · {payment.amountBirr} Birr
              </span>
              {payment.methodName ? <span className="text-secondary">Paid to {payment.methodName}</span> : null}
              {payment.transactionId ? <span className="text-secondary mono">Transaction {payment.transactionId}</span> : null}
              {payment.reason ? <span className="text-secondary">Your note: {payment.reason}</span> : null}
            </div>
            <div className="d-flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => openProofFor(payment)}>
                <Eye size={14} aria-hidden="true" />
                Open screenshot
              </button>
              {payment.status === "pending" ? (
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => decidePremiumPayment(payment.id, { action: "review", note: "" })}>
                  Mark under review
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {!waiting.length ? (
          <EmptyState icon={<Crown size={24} />} title="No proofs waiting" description="Payment screenshots students send from the premium page land here, private to you and to them." />
        ) : null}
      </div>

      {decided.length ? (
        <div>
          <h3 className="h6 mb-2">Recently decided</h3>
          <ul className="list-unstyled mb-0 d-flex flex-column gap-1">
            {decided.map((payment) => (
              <li key={payment.id} className="small d-flex flex-wrap justify-content-between gap-2 border-bottom py-1">
                <span>
                  <strong>{payment.userName || payment.userEmail}</strong> · {payment.planTitle} · {payment.amountBirr} Birr
                  {payment.reviewedBy ? <span className="text-secondary"> · by {payment.reviewedBy}</span> : null}
                </span>
                <span className="d-flex gap-2">
                  <span className={`badge rounded-pill ${STATUS_TONE[payment.status] || "text-bg-secondary"}`}>{STATUS_LABEL[payment.status] || payment.status}</span>
                  <span className="text-secondary">{when(payment.reviewedAt || payment.submittedAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Modal open={Boolean(editingMethod)} title="Payment method" subtitle="Shown exactly as written here, on the website and in the app." onClose={() => setEditingMethod(null)}>
        {editingMethod ? (
          <div className="d-flex flex-column gap-2">
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label small fw-semibold">Name
                  <input className="form-control form-control-sm" maxLength={60} value={editingMethod.name} onChange={(e) => setEditingMethod({ ...editingMethod, name: e.target.value })} placeholder="Telebirr" />
                </label>
              </div>
              <div className="col-6">
                <label className="form-label small fw-semibold">Provider
                  <input className="form-control form-control-sm" maxLength={60} value={editingMethod.provider} onChange={(e) => setEditingMethod({ ...editingMethod, provider: e.target.value })} placeholder="Telebirr / CBE Birr / Bank" />
                </label>
              </div>
              <div className="col-12">
                <label className="form-label small fw-semibold">Account or phone number students pay
                  <input className="form-control form-control-sm mono" maxLength={120} value={editingMethod.destination} onChange={(e) => setEditingMethod({ ...editingMethod, destination: e.target.value })} placeholder="1001234567" />
                </label>
              </div>
              <div className="col-12">
                <label className="form-label small fw-semibold">Account holder
                  <input className="form-control form-control-sm" maxLength={80} value={editingMethod.holderName} onChange={(e) => setEditingMethod({ ...editingMethod, holderName: e.target.value })} />
                </label>
              </div>
              <div className="col-12">
                <label className="form-label small fw-semibold">What the student should do
                  <textarea className="form-control form-control-sm" rows={3} maxLength={600} value={editingMethod.instructions} onChange={(e) => setEditingMethod({ ...editingMethod, instructions: e.target.value })} placeholder="Send the amount, then put your Wollo Share email in the reason." />
                </label>
              </div>
            </div>
            <input ref={qrInput} type="file" accept="image/png,image/jpeg,image/webp" className="d-none" onChange={attachQr} />
            <div className="d-flex align-items-center gap-2">
              {editingMethod.qrImageUrl ? <img src={editingMethod.qrImageUrl} alt="" width={72} height={72} className="rounded-2" style={{ objectFit: "contain", border: "1px solid var(--line)" }} /> : null}
              <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => qrInput.current?.click()}>
                <Upload size={14} aria-hidden="true" />
                {editingMethod.qrImageUrl ? "Replace QR" : "Add QR picture"}
              </button>
              {editingMethod.qrImageUrl ? (
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setEditingMethod({ ...editingMethod, qrImageUrl: "" })}>
                  Remove
                </button>
              ) : null}
              <div className="form-check form-switch d-flex align-items-center gap-2 mb-0 ms-auto">
                <input className="form-check-input m-0" type="checkbox" role="switch" checked={editingMethod.active !== false} onChange={(e) => setEditingMethod({ ...editingMethod, active: e.target.checked })} />
                <span className="small fw-semibold">Offered to students</span>
              </div>
            </div>
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setEditingMethod(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1" onClick={saveMethod} disabled={busy === "method"}>
                <Save size={14} aria-hidden="true" />
                Save method
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(openProof)} title={openProof ? `${openProof.userName || openProof.userEmail} · ${openProof.planTitle}` : "Payment proof"} subtitle={openProof ? `${openProof.amountBirr} Birr · reference ${openProof.reference}` : ""} onClose={() => setOpenProof(null)} size="lg">
        {openProof ? (
          <div className="row g-3">
            <div className="col-12 col-md-7">
              <div className="border rounded-3 d-flex align-items-center justify-content-center p-2" style={{ minHeight: 260, background: "var(--surface-subtle)" }}>
                {proofImage ? (
                  <img src={proofImage} alt="Payment screenshot" className="w-100" style={{ objectFit: "contain", maxHeight: 420 }} />
                ) : (
                  <span className="small text-secondary">{busy ? "Loading…" : "No screenshot on this order."}</span>
                )}
              </div>
              <div className="small text-secondary mt-2">
                Opened only by you and this student. It is never a public link and it is not cached on the device.
              </div>
            </div>
            <div className="col-12 col-md-5">
              <div className="d-flex flex-column gap-2">
                <div className="small">
                  <div className="text-secondary">Student</div>
                  <div className="mono">{openProof.userEmail}</div>
                </div>
                <div className="small">
                  <div className="text-secondary">Paid into</div>
                  <div>{openProof.methodName || "Method not recorded"} {openProof.transactionId ? <span className="mono">· {openProof.transactionId}</span> : null}</div>
                </div>
                <div className="small">
                  <div className="text-secondary">Sent</div>
                  <div>{when(openProof.submittedAt)}</div>
                </div>
                <label className="form-label small fw-semibold mb-0">Your note (kept on the order)
                  <input className="form-control form-control-sm" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Checked against the telebirr statement at 14:20." />
                </label>
                <label className="form-label small fw-semibold mb-0">Reason (the student sees this)
                  <textarea className="form-control form-control-sm" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The screenshot shows a different amount." />
                </label>
                <div className="d-flex flex-wrap gap-2">
                  <button type="button" className="btn btn-sm btn-success d-inline-flex align-items-center gap-1" onClick={() => decide("approve")} disabled={busy === "approve"}>
                    <Check size={14} aria-hidden="true" />
                    {busy === "approve" ? "Confirming…" : "Payment verified — activate"}
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1" onClick={() => decide("reject")} disabled={busy === "reject"}>
                    <X size={14} aria-hidden="true" />
                    Reject
                  </button>
                  <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => decide("resubmit")} disabled={busy === "resubmit"}>
                    <Send size={14} aria-hidden="true" />
                    Ask for a new screenshot
                  </button>
                </div>
                <div className="small text-secondary">
                  Approving is the only thing that changes an account, and it is written to the audit log with your name.
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
