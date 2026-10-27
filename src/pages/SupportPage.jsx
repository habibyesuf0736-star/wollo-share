import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileText,
  Inbox,
  Layers,
  LifeBuoy,
  RefreshCw,
  Send,
  ShieldCheck,
  Sprout,
  ThumbsDown,
  X
} from "lucide-react";
import * as api from "../lib/api.js";
import EmptyState from "../components/EmptyState.jsx";
import FileInput from "../components/FileInput.jsx";
import { useApp } from "../store/AppContext.jsx";
import { DEFAULT_SUBCATEGORIES, MATERIAL_TYPES, getCourseSemesterEntries } from "../lib/utils.js";

const TICKET_CATEGORIES = [
  "Broken or wrong material",
  "Download problem",
  "Missing course material",
  "Account or payment",
  "Something else"
];

function when(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ticketBadge(status) {
  if (status === "open") return <span className="badge rounded-pill text-bg-warning">waiting for support</span>;
  if (status === "answered") return <span className="badge rounded-pill text-bg-success">answered</span>;
  return <span className="badge rounded-pill text-bg-secondary">closed</span>;
}

const EMPTY_COMPLAINT = { category: TICKET_CATEGORIES[0], courseId: "", message: "" };

function ComplaintComposer({ onSent }) {
  const { session, coursesData, toast } = useApp();
  const [form, setForm] = useState(EMPTY_COMPLAINT);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const courses = useMemo(() => [...coursesData].sort((a, b) => String(a.name).localeCompare(String(b.name))), [coursesData]);

  const submit = async (event) => {
    event.preventDefault();
    if (form.message.trim().length < 10) {
      setError("Tell the support team what happened — at least a full sentence.");
      return;
    }
    setError("");
    setBusy(true);
    const res = await api.createTicket(form, session.authToken);
    setBusy(false);
    if (!res || res.ok === false) {
      setError((res && res.error) || "The complaint was not saved.");
      return;
    }
    setForm(EMPTY_COMPLAINT);
    toast("Sent to the support team — you will see their reply in this thread.");
    onSent(res.ticket);
  };

  return (
    <form className="card p-3 d-flex flex-column gap-2" onSubmit={submit}>
      {error ? (
        <div className="banner warn" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="row g-2">
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold" htmlFor="tkCategory">
            What is it about?
          </label>
          <select id="tkCategory" className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {TICKET_CATEGORIES.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold" htmlFor="tkCourse">
            Course (optional)
          </label>
          <select id="tkCourse" className="form-select" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
            <option value="">Not about one course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="form-label small fw-semibold mb-0" htmlFor="tkMessage">
        Your complaint or problem
      </label>
      <textarea
        id="tkMessage"
        className="form-control"
        rows={4}
        maxLength={2000}
        placeholder="What went wrong, which file, and what you expected instead…"
        value={form.message}
        onChange={(e) => setForm({ ...form, message: e.target.value })}
      />
      <div className="d-flex justify-content-end">
        <button type="submit" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2" disabled={busy}>
          <Send size={15} aria-hidden="true" />
          {busy ? "Sending…" : "Send to support"}
        </button>
      </div>
    </form>
  );
}

function TicketThread({ ticket, canReply, onDone }) {
  const { session, toast } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");

  const reply = async () => {
    if (text.trim().length < 2) return;
    setBusy("reply");
    const res = await api.replyTicket(ticket.id, text.trim(), session.authToken);
    setBusy("");
    if (!res || res.ok === false) {
      toast((res && res.error) || "The reply was not saved.");
      return;
    }
    setText("");
    onDone(res.ticket);
  };

  const close = async () => {
    setBusy("close");
    const res = await api.closeTicket(ticket.id, session.authToken);
    setBusy("");
    if (!res || res.ok === false) {
      toast((res && res.error) || "The complaint is still open.");
      return;
    }
    onDone(res.ticket);
  };

  return (
    <div className="card p-3 d-flex flex-column gap-2">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div className="fw-semibold">{ticket.category}</div>
        {ticketBadge(ticket.status)}
      </div>
      <div className="small text-secondary">
        {ticket.userName} · {ticket.userEmail} · {when(ticket.createdAt)}
      </div>
      <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
        {ticket.message}
      </p>
      {(ticket.replies || []).map((item) => (
        <div key={item.id} className={`small p-2 rounded ${item.by === "staff" ? "bg-light" : ""}`}>
          <strong>{item.authorName}</strong> · {when(item.createdAt)}
          <div style={{ whiteSpace: "pre-wrap" }}>{item.text}</div>
        </div>
      ))}
      {canReply && ticket.status !== "closed" ? (
        <div className="d-flex flex-column gap-2">
          <textarea
            className="form-control form-control-sm"
            rows={2}
            placeholder="Write your reply…"
            aria-label="Reply to this complaint"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={close} disabled={Boolean(busy)}>
              Mark resolved
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={reply} disabled={busy === "reply"}>
              {busy === "reply" ? "Sending…" : "Reply"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StudentSupport() {
  const { session, goLogin } = useApp();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const res = await api.listMyTickets(session.authToken);
    if (res && res.ok !== false) setTickets(Array.isArray(res.tickets) ? res.tickets : []);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  if (!session) {
    return (
      <div className="card p-4 text-center mx-auto" style={{ maxWidth: 560 }}>
        <h2 className="h5">Sign in to reach the support team</h2>
        <p className="text-secondary small">Complaints are answered in your account thread, so the team can find your course and file.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={goLogin}>
          Sign in
        </button>
      </div>
    );
  }

  const merge = (next) => setTickets((prev) => [next, ...prev.filter((t) => t.id !== next.id)]);

  return (
    <div className="d-flex flex-column gap-3">
      <div className="banner info" role="status">
        <LifeBuoy size={15} aria-hidden="true" />
        <span>
          Something broken, missing or wrong? Leave your complaint or problem here — the Wollo Share support team answers in this
          thread and fixes the library.
        </span>
      </div>
      <ComplaintComposer onSent={merge} />
      <div>
        <h3 className="h6 mb-2">Your complaints ({tickets.length})</h3>
        {loading ? <p className="small text-secondary">Loading your threads…</p> : null}
        <div className="d-flex flex-column gap-2">
          {tickets.map((ticket) => (
            <TicketThread key={ticket.id} ticket={ticket} canReply onDone={merge} />
          ))}
        </div>
        {!loading && !tickets.length ? (
          <EmptyState
            icon={<Inbox size={24} />}
            title="No complaints yet"
            description="Send the support team a note above and it will appear here with their reply."
          />
        ) : null}
      </div>
    </div>
  );
}

function ComplaintInbox({ tickets, onTicket }) {
  const [filter, setFilter] = useState("open");
  const visible = useMemo(
    () => tickets.filter((t) => (filter === "all" ? true : filter === "open" ? t.status !== "closed" : t.status === filter)),
    [filter, tickets]
  );
  const counts = {
    open: tickets.filter((t) => t.status === "open").length,
    answered: tickets.filter((t) => t.status === "answered").length,
    closed: tickets.filter((t) => t.status === "closed").length
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <span className="ws-section-kicker">Support team</span>
          <h2 className="h4 mb-1">Complaints &amp; problems</h2>
          <p className="small text-secondary mb-0">
            {counts.open} waiting · {counts.answered} answered · {counts.closed} resolved. Reply here and the student sees it in
            their own support screen.
          </p>
        </div>
        <div className="ws-segmented" role="tablist" aria-label="Complaint filter">
          {["open", "answered", "closed", "all"].map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {key}
            </button>
          ))}
        </div>
      </div>
      <div className="d-flex flex-column gap-2">
        {visible.map((ticket) => (
          <TicketThread key={ticket.id} ticket={ticket} canReply onDone={onTicket} />
        ))}
      </div>
      {!visible.length ? (
        <EmptyState
          icon={<Inbox size={24} />}
          title="Nothing here"
          description="Students reach the team from their support screen; new complaints land in this inbox."
        />
      ) : null}
    </div>
  );
}

function ReviewQueue({ onCountChange }) {
  const { session, approveSubmission, rejectSubmission, toast } = useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending");
  const [rejecting, setRejecting] = useState(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const res = await api.listMaterialSubmissions(session.authToken);
    if (res && res.ok !== false) {
      const list = Array.isArray(res.submissions) ? res.submissions : [];
      setRows(list);
      onCountChange(list.filter((s) => s.status === "pending").length);
    } else if (res && res.error) toast(res.error);
    setLoading(false);
  }, [onCountChange, session, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () => rows.filter((s) => (status === "all" ? true : status === "pending" ? s.status === "pending" : s.status === status)),
    [rows, status]
  );

  const decide = async (sub, action) => {
    setBusyId(sub.id);
    const res = action === "approve" ? await approveSubmission(sub.id) : await rejectSubmission(sub.id, rejecting ? rejecting.reason : "");
    setBusyId("");
    if (res && res.ok !== false) {
      setRejecting(null);
      load();
    } else if (res && res.error) toast(res.error);
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <span className="ws-section-kicker">Support team</span>
          <h2 className="h4 mb-1">Uploaded materials</h2>
          <p className="small text-secondary mb-0">Publish what checks out and reject the rest — the student is told why.</p>
        </div>
        <div className="d-flex gap-2">
          <div className="ws-segmented" role="tablist" aria-label="Review filter">
            {["pending", "approved", "rejected", "all"].map((key) => (
              <button key={key} type="button" role="tab" aria-selected={status === key} className={status === key ? "active" : ""} onClick={() => setStatus(key)}>
                {key}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={`me-1 align-text-bottom ${loading ? "spin" : ""}`} aria-hidden="true" />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {rejecting ? (
        <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2 mb-0" role="alert">
          <strong className="me-1">Reject “{rejecting.name}”?</strong>
          <input
            className="form-control form-control-sm flex-grow-1"
            style={{ minWidth: 220 }}
            placeholder="Reason shown to the student"
            value={rejecting.reason}
            onChange={(e) => setRejecting({ ...rejecting, reason: e.target.value })}
          />
          <button type="button" className="btn btn-sm btn-coral" onClick={() => decide(rejecting, "reject")}>
            Confirm rejection
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setRejecting(null)}>
            <X size={14} className="me-1 align-text-bottom" aria-hidden="true" />
            Cancel
          </button>
        </div>
      ) : null}

      <div className="card p-0 table-responsive table-stack">
        <table className="table align-middle mb-0">
          <thead>
            <tr>
              <th>Document</th>
              <th>Course · year · semester</th>
              <th>Shared by</th>
              <th>Sent</th>
              <th className="text-end">Decision</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((sub) => (
              <tr key={sub.id}>
                <td style={{ minWidth: 200 }}>
                  <div className="fw-semibold text-truncate">{sub.name}</div>
                  <div className="small text-secondary">
                    {sub.type} · {sub.size} · {sub.subcategory}
                  </div>
                  {sub.reason ? <div className="small text-danger mt-1">{sub.reason}</div> : null}
                </td>
                <td className="small">
                  <div className="text-truncate" style={{ maxWidth: 190 }}>
                    {sub.courseName}
                  </div>
                  <div className="text-secondary">
                    {sub.year} · {sub.semester}
                  </div>
                </td>
                <td className="small">
                  <div>{sub.contributorName}</div>
                  <div className="text-secondary">{sub.userEmail}</div>
                </td>
                <td className="small text-secondary text-nowrap">{when(sub.createdAt)}</td>
                <td className="text-end text-nowrap">
                  {sub.status === "pending" ? (
                    <>
                      <button type="button" className="btn btn-sm btn-primary me-1" disabled={busyId === sub.id} onClick={() => decide(sub, "approve")}>
                        <Check size={14} className="me-1 align-text-bottom" aria-hidden="true" />
                        Publish
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busyId === sub.id} onClick={() => setRejecting({ id: sub.id, name: sub.name, reason: "" })}>
                        <ThumbsDown size={14} className="me-1 align-text-bottom" aria-hidden="true" />
                        Reject
                      </button>
                    </>
                  ) : sub.url && !sub.url.startsWith("#") ? (
                    <a className="btn btn-sm btn-outline-secondary" href={sub.url} target="_blank" rel="noopener noreferrer">
                      Open file
                    </a>
                  ) : (
                    <span className="small text-secondary">{sub.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && !loading ? (
        <EmptyState icon={<FileText size={24} />} title="Nothing to review" description="Student uploads appear here the moment they are sent." />
      ) : null}
    </div>
  );
}

function AddMaterialForm() {
  const { session, coursesData, toast, refreshFromServer } = useApp();
  const courses = useMemo(() => [...coursesData].sort((a, b) => String(a.name).localeCompare(String(b.name))), [coursesData]);
  const [courseId, setCourseId] = useState(courses.length ? courses[0].id : "");
  const course = courses.find((c) => c.id === courseId) || null;
  const entries = useMemo(() => (course ? getCourseSemesterEntries(course) : []), [course]);
  const EMPTY = { name: "", type: "PDF", size: "1.8 MB", subcategory: DEFAULT_SUBCATEGORIES[1] || "Lecture Notes", department: "", url: "", hidden: false };
  const [form, setForm] = useState(EMPTY);
  const [semesterLabel, setSemesterLabel] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSemesterLabel(entries.length ? entries[0].label : "");
    setError("");
  }, [courseId, entries.length]);

  const submit = async (event) => {
    event.preventDefault();
    if (!course) {
      setError("Choose the course this belongs to.");
      return;
    }
    if (!form.name.trim()) {
      setError("Give the document a title.");
      return;
    }
    const entry = entries.find((e) => e.label === semesterLabel) || entries[0] || { year: course.defaultYear || "Year 1", sem: "First Semester" };
    setError("");
    setBusy(true);
    const res = await api.addCourseMaterial(
      course.id,
      {
        name: form.name.trim(),
        type: form.type,
        size: form.size.trim() || "1.0 MB",
        subcategory: form.subcategory,
        department: form.department.trim() || course.name,
        year: entry.year,
        semesterLabel: entry.label,
        semester: entry.sem,
        url: file && file.dataUrl ? file.dataUrl : form.url.trim() || "#sample-file",
        hidden: form.hidden
      },
      session.authToken
    );
    setBusy(false);
    if (!res || res.ok === false) {
      setError((res && res.error) || "The material was not saved.");
      return;
    }
    setForm(EMPTY);
    setFile(null);
    toast(`“${res.material.name}” is live in ${course.name}.`);
    await refreshFromServer();
  };

  return (
    <form className="card p-3 d-flex flex-column gap-3" onSubmit={submit}>
      <div>
        <span className="ws-section-kicker">Support team</span>
        <h2 className="h4 mb-1">Add a material to the library</h2>
        <p className="small text-secondary mb-0">Writes straight into the shared database — students see it on refresh.</p>
      </div>
      {error ? (
        <div className="banner warn" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="row g-2">
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold" htmlFor="amCourse">
            Course
          </label>
          <select id="amCourse" className="form-select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold" htmlFor="amSemester">
            Year &amp; semester
          </label>
          <select id="amSemester" className="form-select" value={semesterLabel} onChange={(e) => setSemesterLabel(e.target.value)}>
            {entries.map((e) => (
              <option key={e.label} value={e.label}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="form-label small fw-semibold mb-0" htmlFor="amName">
        Document title
      </label>
      <input id="amName" className="form-control" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Thermodynamics — Chapter 3 Slides" />
      <div className="row g-2">
        <div className="col-6 col-md-3">
          <label className="form-label small fw-semibold" htmlFor="amType">
            Format
          </label>
          <select id="amType" className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {MATERIAL_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label small fw-semibold" htmlFor="amSize">
            Size
          </label>
          <input id="amSize" className="form-control" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold" htmlFor="amCategory">
            Category
          </label>
          <select id="amCategory" className="form-select" value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })}>
            {(course && course.subcategories && course.subcategories.length ? course.subcategories : DEFAULT_SUBCATEGORIES).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="row g-2">
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold" htmlFor="amDept">
            Department (optional)
          </label>
          <input id="amDept" className="form-control" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder={course ? course.name : ""} />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold" htmlFor="amUrl">
            Direct link (optional)
          </label>
          <input id="amUrl" className="form-control" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
        </div>
      </div>
      <FileInput onFile={setFile} />
      <div className="form-check">
        <input className="form-check-input" type="checkbox" id="amHidden" checked={form.hidden} onChange={(e) => setForm({ ...form, hidden: e.target.checked })} />
        <label className="form-check-label small" htmlFor="amHidden">
          Save as hidden (only staff see it)
        </label>
      </div>
      <div className="d-flex justify-content-end">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Saving…" : "Add to library"}
        </button>
      </div>
    </form>
  );
}

function ReferenceMaterials() {
  const { session, coursesData, toast, refreshFromServer } = useApp();
  const courses = useMemo(() => [...coursesData].sort((a, b) => String(a.name).localeCompare(String(b.name))), [coursesData]);
  const [courseId, setCourseId] = useState(courses.length ? courses[0].id : "");
  const course = courses.find((c) => c.id === courseId) || null;
  const materials = useMemo(() => (course ? course.materials || [] : []), [course, coursesData]);
  const [materialId, setMaterialId] = useState("");
  const material = materials.find((m) => m.id === materialId) || null;
  const [form, setForm] = useState({ name: "", type: "PDF", size: "1.4 MB", url: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    setMaterialId(materials.length ? materials[0].id : "");
  }, [courseId, materials.length]);

  const add = async (event) => {
    event.preventDefault();
    if (!course || !material) return;
    if (!form.name.trim()) {
      toast("Name the reference file first.");
      return;
    }
    setBusy("add");
    const res = await api.saveSideMaterial(
      course.id,
      material.id,
      {
        name: form.name.trim(),
        type: form.type,
        size: form.size.trim() || "1.0 MB",
        url: file && file.dataUrl ? file.dataUrl : form.url.trim() || "#sample-file"
      },
      session.authToken
    );
    setBusy("");
    if (!res || res.ok === false) {
      toast((res && res.error) || "The reference file was not saved.");
      return;
    }
    setForm({ name: "", type: "PDF", size: "1.4 MB", url: "" });
    setFile(null);
    toast(`Reference added to “${material.name}”.`);
    await refreshFromServer();
  };

  const remove = async (sideMaterial) => {
    if (!course || !material) return;
    setBusy(sideMaterial.id);
    const res = await api.deleteSideMaterialApi(course.id, material.id, sideMaterial.id, session.authToken);
    setBusy("");
    if (!res || res.ok === false) {
      toast((res && res.error) || "That reference file is still attached.");
      return;
    }
    toast("Reference removed.");
    await refreshFromServer();
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <span className="ws-section-kicker">Support team</span>
        <h2 className="h4 mb-1">Reference materials</h2>
        <p className="small text-secondary mb-0">
          Companion files attached to a material — transcripts, slide PDFs, solution sheets. Students download them with the main
          document.
        </p>
      </div>
      <div className="row g-2">
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold" htmlFor="rmCourse">
            Course
          </label>
          <select id="rmCourse" className="form-select" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold" htmlFor="rmMaterial">
            Material
          </label>
          <select id="rmMaterial" className="form-select" value={materialId} onChange={(e) => setMaterialId(e.target.value)} disabled={!materials.length}>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!materials.length ? (
        <EmptyState icon={<Layers size={24} />} title="This course has no materials" description="Publish a material first, then attach its reference files here." />
      ) : null}
      {material ? (
        <>
          <div className="card p-3">
            <h3 className="h6 mb-2">Attached to “{material.name}”</h3>
            {(material.sideMaterials || []).length ? (
              <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
                {(material.sideMaterials || []).map((side) => (
                  <li key={side.id} className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <span className="small">
                      <strong>{side.name}</strong> · {side.type} · {side.size}
                    </span>
                    <button type="button" className="btn btn-sm btn-outline-secondary py-0" disabled={busy === side.id} onClick={() => remove(side)}>
                      {busy === side.id ? "Removing…" : "Remove"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small text-secondary mb-0">No reference files yet.</p>
            )}
          </div>
          <form className="card p-3 d-flex flex-column gap-2" onSubmit={add}>
            <h3 className="h6 mb-0">Add a reference file</h3>
            <input className="form-control" placeholder="Title (e.g. Transcript, Slide PDF)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="d-flex gap-2">
              <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {MATERIAL_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input className="form-control" style={{ maxWidth: 130 }} value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
            </div>
            <input className="form-control" placeholder="https:// direct link (optional)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <FileInput onFile={setFile} />
            <div className="d-flex justify-content-end">
              <button type="submit" className="btn btn-primary btn-sm" disabled={busy === "add"}>
                {busy === "add" ? "Saving…" : "Attach reference"}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}

function FreshmanSeeder() {
  const { session, toast, refreshFromServer } = useApp();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const check = async () => {
    setBusy("preview");
    setError("");
    const res = await api.seedFreshmanMaterials(true, session.authToken);
    setBusy("");
    if (!res || res.ok === false) {
      setError((res && res.error) || "The server did not return a preview.");
      return;
    }
    setPreview(res);
  };

  const publish = async () => {
    setBusy("publish");
    setError("");
    const res = await api.seedFreshmanMaterials(false, session.authToken);
    setBusy("");
    if (!res || res.ok === false) {
      setError((res && res.error) || "Nothing was published.");
      return;
    }
    setPreview(null);
    toast(`${res.added} freshman materials published across ${res.courses} Year 1 courses.`);
    await refreshFromServer();
    // Re-run the preview so the panel reports the fresh state instead of going blank.
    await check();
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div>
        <span className="ws-section-kicker">Support team</span>
        <h2 className="h4 mb-1">Freshman Year 1 library</h2>
        <p className="small text-secondary mb-0">
          The 14 common freshman courses start empty. This publishes the starter pack — notes, slides, past exams and assignments —
          into each course on its own semester. Semester I is tagged for the natural sciences, Semester II for pre-engineering,
          medicine and the other fields. Nothing is written until you press publish.
        </p>
      </div>
      {error ? (
        <div className="banner warn" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="card p-3 d-flex flex-column gap-2 align-start">
        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2" onClick={check} disabled={Boolean(busy)}>
            <Sprout size={15} aria-hidden="true" />
            {busy === "preview" ? "Checking…" : "Preview what is missing"}
          </button>
          {preview && preview.wouldAdd ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={publish} disabled={busy === "publish"}>
              {busy === "publish" ? "Publishing…" : `Publish ${preview.wouldAdd} materials`}
            </button>
          ) : null}
        </div>
        {preview ? (
          <>
            <p className="small mb-0">
              {preview.wouldAdd === 0
                ? `All ${preview.courses} freshman courses already have the full starter pack.`
                : `${preview.wouldAdd} materials missing across ${preview.courses} courses.`}
            </p>
            {preview.sample && preview.sample.length ? (
              <ul className="small text-secondary mb-0 ps-3 d-flex flex-column gap-1">
                {preview.sample.map((item) => (
                  <li key={item.course}>
                    {item.course} · {item.semester} · {item.department} · {item.count} new
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

const STAFF_TABS = [
  ["complaints", "Complaints", LifeBuoy],
  ["reviews", "Material reviews", Inbox],
  ["add", "Add material", FileText],
  ["reference", "Reference materials", Layers],
  ["freshman", "Freshman library", Sprout]
];

export default function SupportPage() {
  const { session, isStaff, ownerIsStaff, view, goAdmin, goLibrary, studentPreview } = useApp();
  const [tab, setTab] = useState("complaints");
  const [tickets, setTickets] = useState([]);
  const [pendingReviews, setPendingReviews] = useState(0);

  const staffMode = isStaff && !studentPreview;

  const loadTickets = useCallback(async () => {
    if (!session || !ownerIsStaff) return;
    const res = await api.listTickets(session.authToken);
    if (res && res.ok !== false) setTickets(Array.isArray(res.tickets) ? res.tickets : []);
  }, [ownerIsStaff, session]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets, tab]);

  // A staff member arriving on the panel with student preview on is browsing, not working.
  useEffect(() => {
    if (view.name === "support" && session && !ownerIsStaff) setTab("complaints");
  }, [ownerIsStaff, session, view.name]);

  if (!session) return <StudentSupport />;

  const counts = { complaints: tickets.filter((t) => t.status === "open").length, reviews: pendingReviews };

  return (
    <div className="ws-page">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <span className="ws-section-kicker">Wollo Share · support</span>
          <h1 className="h3 mb-1">{staffMode ? "Support team panel" : "Help & complaints"}</h1>
          <p className="small text-secondary mb-0">
            {staffMode
              ? "Everything here is saved to the shared Wollo Share database."
              : "Leave your complaints and problems here — the support team answers in this thread."}
          </p>
        </div>
        <div className="d-flex gap-2">
          {staffMode ? (
            <>
              <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={goLibrary}>
                <ShieldCheck size={14} aria-hidden="true" />
                View library
              </button>
              {session.role === "admin" ? (
                <button type="button" className="btn btn-sm btn-soft" onClick={goAdmin}>
                  Admin workspace
                </button>
              ) : null}
            </>
          ) : (
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={goLibrary}>
              Back to library
            </button>
          )}
        </div>
      </div>

      {staffMode ? (
        <>
          <nav className="admin-nav my-3" aria-label="Support sections">
            {STAFF_TABS.map(([key, label, Icon]) => (
              <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
                <Icon size={14} className="me-1 align-text-bottom" aria-hidden="true" />
                {label}
                {counts[key] !== undefined ? <span className="ms-2 mono" style={{ fontSize: 11 }}>({counts[key]})</span> : null}
              </button>
            ))}
          </nav>
          {tab === "complaints" ? <ComplaintInbox tickets={tickets} onTicket={loadTickets} /> : null}
          {tab === "reviews" ? <ReviewQueue onCountChange={setPendingReviews} /> : null}
          {tab === "add" ? <AddMaterialForm /> : null}
          {tab === "reference" ? <ReferenceMaterials /> : null}
          {tab === "freshman" ? <FreshmanSeeder /> : null}
        </>
      ) : (
        <StudentSupport />
      )}
    </div>
  );
}
