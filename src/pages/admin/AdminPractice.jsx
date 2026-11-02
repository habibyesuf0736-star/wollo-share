import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Edit3,
  Eye,
  EyeOff,
  Image as ImageIcon,
  ListChecks,
  PlusCircle,
  RefreshCw,
  Save,
  Target,
  Trash2,
  X
} from "lucide-react";
import * as api from "../../lib/api.js";
import { useApp } from "../../store/AppContext.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { EXAM_REVEAL, kindLabel, newExam, newQuestion, optionLetter, QUESTION_KINDS, revealLabel, statusLabel } from "../../lib/practice.js";
import { bannerDataUrl } from "../../lib/imagePick.js";

/* ------------------------------------------------------------- question form */
function QuestionForm({ question: initial, onSave, onCancel, coursesData }) {
  const [form, setForm] = useState(() => ({
    ...newQuestion(),
    ...initial,
    options: Array.isArray(initial?.options) && initial.options.length ? [...initial.options] : ["", "", "", ""]
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { session } = useApp();
  const fileRef = useRef(null);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const pickImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await bannerDataUrl(file);
      set({ image: dataUrl });
    } catch (err) {
      setError(err?.message || "Could not load that image.");
    }
  };

  const save = async () => {
    if (!form.body.trim()) {
      setError("Add the question text.");
      return;
    }
    if (!form.correct_answer.trim()) {
      setError("Add the correct answer.");
      return;
    }
    if (form.kind === "mcq") {
      const filled = form.options.filter((o) => o.trim());
      if (filled.length < 2) {
        setError("Add at least two answer choices.");
        return;
      }
    }
    setError("");
    setBusy(true);
    const payload = {
      ...form,
      options: form.kind === "mcq" ? form.options.filter((o) => o.trim()) : form.kind === "truefalse" ? null : null,
      points: Math.max(1, Math.min(20, Number(form.points) || 1))
    };
    const res = form.id
      ? await api.updatePracticeQuestion(form.id, payload, session.authToken)
      : await api.createPracticeQuestion(payload, session.authToken);
    setBusy(false);
    if (!res || res.ok === false) {
      setError((res && res.error) || "Could not save the question.");
      return;
    }
    onSave(res.question);
  };

  return (
    <div className="card p-3">
      <h3 className="h6 mb-3">{form.id ? "Edit question" : "New question"}</h3>
      {error ? <div className="banner warn mb-3" role="alert"><span>{error}</span></div> : null}

      <div className="row g-3">
        <div className="col-6 col-md-3">
          <label className="form-label small fw-semibold">Type</label>
          <select className="form-select" value={form.kind} onChange={(e) => set({ kind: e.target.value, options: e.target.value === "mcq" ? (form.options.length ? form.options : ["", "", "", ""]) : null, correct_answer: "" })}>
            {QUESTION_KINDS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label className="form-label small fw-semibold">Points</label>
          <input className="form-control" type="number" min="1" max="20" value={form.points} onChange={(e) => set({ points: e.target.value })} />
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label small fw-semibold">College</label>
          <input className="form-control" list="admin-practice-colleges" placeholder="e.g. Engineering" value={form.college} onChange={(e) => set({ college: e.target.value })} />
          <datalist id="admin-practice-colleges">
            {Array.from(new Set(coursesData.map((c) => c.college).filter(Boolean))).map((name) => <option key={name} value={name} />)}
          </datalist>
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label small fw-semibold">Department</label>
          <input className="form-control" placeholder="Department / program" value={form.department} onChange={(e) => set({ department: e.target.value })} />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label small fw-semibold">Chapter</label>
          <input className="form-control" placeholder="e.g. Chapter 4" value={form.chapter} onChange={(e) => set({ chapter: e.target.value })} />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label small fw-semibold">Category</label>
          <input className="form-control" placeholder="e.g. Midterm, Final" value={form.category} onChange={(e) => set({ category: e.target.value })} />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label small fw-semibold">Academic year</label>
          <input className="form-control" placeholder="Year 1" value={form.academic_year} onChange={(e) => set({ academic_year: e.target.value })} />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label small fw-semibold">Semester</label>
          <input className="form-control" placeholder="First Semester" value={form.semester} onChange={(e) => set({ semester: e.target.value })} />
        </div>

        <div className="col-12">
          <label className="form-label small fw-semibold">Question text</label>
          <textarea className="form-control" rows={3} placeholder="Write the question clearly and completely." value={form.body} onChange={(e) => set({ body: e.target.value })} />
        </div>

        <div className="col-12">
          <label className="form-label small fw-semibold">Image (optional)</label>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            {form.image ? (
              <>
                <img src={form.image} alt="Question" style={{ height: 64, borderRadius: 6, objectFit: "cover" }} />
                <button type="button" className="btn btn-sm btn-coral d-inline-flex gap-1 align-items-center" onClick={() => set({ image: null })}>
                  <X size={13} /> Remove
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex gap-1 align-items-center" onClick={() => fileRef.current?.click()}>
                <ImageIcon size={14} /> Add image
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="d-none" onChange={pickImage} />
          </div>
        </div>

        {form.kind === "mcq" ? (
          <div className="col-12">
            <label className="form-label small fw-semibold">Answer choices</label>
            <div className="d-flex flex-column gap-2">
              {(form.options || ["", "", "", ""]).map((option, index) => (
                <div key={index} className="d-flex align-items-center gap-2">
                  <span className="badge text-bg-light" style={{ minWidth: 24 }}>{optionLetter(index)}</span>
                  <input
                    className="form-control"
                    placeholder={`Choice ${optionLetter(index)}`}
                    value={option}
                    onChange={(e) => {
                      const next = [...(form.options || [])];
                      next[index] = e.target.value;
                      set({ options: next });
                    }}
                  />
                  <input
                    type="radio"
                    name="correct-mcq"
                    title="Mark as correct"
                    checked={form.correct_answer === option && Boolean(option)}
                    onChange={() => set({ correct_answer: option })}
                  />
                </div>
              ))}
              <button type="button" className="btn btn-sm btn-outline-secondary align-self-start" onClick={() => set({ options: [...(form.options || []), ""] })}>
                + Add choice
              </button>
            </div>
            <p className="form-text">Select the radio button next to the correct answer.</p>
          </div>
        ) : form.kind === "truefalse" ? (
          <div className="col-12">
            <label className="form-label small fw-semibold">Correct answer</label>
            <div className="d-flex gap-3">
              {["true", "false"].map((opt) => (
                <label key={opt} className="d-inline-flex align-items-center gap-2">
                  <input type="radio" name="correct-tf" value={opt} checked={form.correct_answer === opt} onChange={() => set({ correct_answer: opt })} />
                  <span className="text-capitalize">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="col-12">
            <label className="form-label small fw-semibold">Correct answer</label>
            <input className="form-control" placeholder="Accepted answer(s) — separate alternatives with a comma" value={form.correct_answer} onChange={(e) => set({ correct_answer: e.target.value })} />
          </div>
        )}

        <div className="col-12">
          <label className="form-label small fw-semibold">Explanation (shown after submit)</label>
          <textarea className="form-control" rows={2} placeholder="Explain why the answer is correct. Students see this after submitting." value={form.explanation} onChange={(e) => set({ explanation: e.target.value })} />
        </div>

        <div className="col-12 col-md-4">
          <label className="form-label small fw-semibold">Status</label>
          <select className="form-select" value={form.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="draft">Draft — hidden from students</option>
            <option value="published">Published — visible to students</option>
          </select>
        </div>
      </div>

      <div className="d-flex justify-content-end gap-2 mt-3">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary d-inline-flex gap-2 align-items-center" onClick={save} disabled={busy}>
          <Save size={15} aria-hidden="true" />
          {busy ? "Saving…" : form.id ? "Save changes" : "Add question"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- exam form */
function ExamForm({ exam: initial, allQuestions, onSave, onCancel }) {
  const [form, setForm] = useState(() => ({ ...newExam(), ...initial }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const { session } = useApp();

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const toggleQuestion = (id) => {
    const ids = form.question_ids.includes(id) ? form.question_ids.filter((q) => q !== id) : [...form.question_ids, id];
    set({ question_ids: ids });
  };

  const save = async () => {
    if (!form.title.trim()) {
      setError("Give the exam a title.");
      return;
    }
    setError("");
    setBusy(true);
    const payload = { ...form, question_count: form.question_count || form.question_ids.length };
    const res = form.id
      ? await api.updatePracticeExam(form.id, payload, session.authToken)
      : await api.createPracticeExam(payload, session.authToken);
    setBusy(false);
    if (!res || res.ok === false) {
      setError((res && res.error) || "Could not save the exam.");
      return;
    }
    onSave(res.exam);
  };

  const filtered = allQuestions.filter((q) => {
    const needle = search.toLowerCase();
    return !needle || q.body.toLowerCase().includes(needle) || q.chapter.toLowerCase().includes(needle) || q.category.toLowerCase().includes(needle);
  });

  return (
    <div className="card p-3">
      <h3 className="h6 mb-3">{form.id ? "Edit exam" : "New exam"}</h3>
      {error ? <div className="banner warn mb-3" role="alert"><span>{error}</span></div> : null}

      <div className="row g-3">
        <div className="col-12">
          <label className="form-label small fw-semibold">Exam title</label>
          <input className="form-control" placeholder="e.g. Data Structures — Midterm 2026" value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div className="col-12">
          <label className="form-label small fw-semibold">Description</label>
          <textarea className="form-control" rows={2} placeholder="What this exam covers" value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label small fw-semibold">Duration (minutes)</label>
          <input className="form-control" type="number" min="0" max="300" placeholder="0 = no limit" value={form.duration_minutes} onChange={(e) => set({ duration_minutes: e.target.value })} />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label small fw-semibold">Max questions shown</label>
          <input className="form-control" type="number" min="0" placeholder="0 = all" value={form.question_count} onChange={(e) => set({ question_count: e.target.value })} />
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label small fw-semibold">Answer reveal</label>
          <select className="form-select" value={form.show_answers} onChange={(e) => set({ show_answers: e.target.value })}>
            {EXAM_REVEAL.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label small fw-semibold">Shuffle questions</label>
          <select className="form-select" value={String(form.shuffle)} onChange={(e) => set({ shuffle: e.target.value === "true" })}>
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold">College</label>
          <input className="form-control" placeholder="Leave blank to pull from any college" value={form.college} onChange={(e) => set({ college: e.target.value })} />
        </div>
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold">Department / chapter / category filters</label>
          <input className="form-control" placeholder="e.g. Software Engineering" value={form.department} onChange={(e) => set({ department: e.target.value })} />
        </div>
        <div className="col-12 col-md-4">
          <label className="form-label small fw-semibold">Status</label>
          <select className="form-select" value={form.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>

        <div className="col-12">
          <label className="form-label small fw-semibold">Pick specific questions ({form.question_ids.length} selected, 0 = use bank filters)</label>
          <input className="form-control mb-2" placeholder="Search questions…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="ws-exam-question-picker">
            {filtered.slice(0, 60).map((q) => (
              <label key={q.id} className={`ws-exam-picker-row ${form.question_ids.includes(q.id) ? "is-selected" : ""}`}>
                <input type="checkbox" checked={form.question_ids.includes(q.id)} onChange={() => toggleQuestion(q.id)} />
                <span className="small text-truncate">{q.body.slice(0, 80)}</span>
                <span className="badge rounded-pill text-bg-light flex-shrink-0">{kindLabel(q.kind)}</span>
                <span className="badge rounded-pill text-bg-light flex-shrink-0">{q.chapter || "—"}</span>
              </label>
            ))}
            {filtered.length > 60 ? <p className="small text-secondary px-2 mb-0">…showing 60 of {filtered.length}. Narrow the search to see more.</p> : null}
            {filtered.length === 0 ? <p className="small text-secondary px-2 mb-0">No published questions match. Add questions first.</p> : null}
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-end gap-2 mt-3">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary d-inline-flex gap-2 align-items-center" onClick={save} disabled={busy}>
          <Save size={15} aria-hidden="true" />
          {busy ? "Saving…" : form.id ? "Save changes" : "Create exam"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- question list */
function QuestionRow({ question, onEdit, onDelete, onToggle }) {
  const { isAdmin } = useApp();
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="ws-practice-row">
      <div className="ws-practice-row-head" onClick={() => setExpanded((v) => !v)}>
        <span className={`badge rounded-pill ${question.status === "published" ? "text-bg-success" : "text-bg-secondary"}`}>
          {statusLabel(question.status)}
        </span>
        <span className="badge rounded-pill text-bg-light">{kindLabel(question.kind)}</span>
        <span className="badge rounded-pill text-bg-light">{question.points} pt{question.points === 1 ? "" : "s"}</span>
        {question.chapter ? <span className="badge rounded-pill text-bg-light">{question.chapter}</span> : null}
        {question.category ? <span className="badge rounded-pill text-bg-light">{question.category}</span> : null}
        <span className="small text-truncate flex-grow-1 ms-1">{question.body.slice(0, 80)}</span>
        <button type="button" className="btn btn-link p-0 ms-auto" aria-label={expanded ? "Collapse" : "Expand"}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded ? (
        <div className="ws-practice-row-body">
          <p className="mb-2">{question.body}</p>
          {question.image ? <img src={question.image} alt="" style={{ height: 80, borderRadius: 6, objectFit: "cover" }} className="mb-2" /> : null}
          {Array.isArray(question.options) && question.options.length ? (
            <ul className="list-unstyled mb-2">
              {question.options.map((option, i) => (
                <li key={i} className={`d-flex align-items-center gap-2 ${option === question.correct_answer ? "text-success fw-semibold" : ""}`}>
                  <span className="badge text-bg-light">{optionLetter(i)}</span> {option}
                  {option === question.correct_answer ? <Check size={14} aria-hidden="true" /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="small"><strong>Answer:</strong> {question.correct_answer}</p>
          )}
          {question.explanation ? <p className="small text-secondary"><strong>Explanation:</strong> {question.explanation}</p> : null}
          <p className="small text-secondary">Used {question.usage_count} time{question.usage_count === 1 ? "" : "s"} · {question.correct_count} correct</p>
          <div className="d-flex gap-2 flex-wrap">
            <button type="button" className="btn btn-sm btn-soft d-inline-flex gap-1 align-items-center" onClick={() => onEdit(question)}>
              <Edit3 size={13} /> Edit
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex gap-1 align-items-center" onClick={() => onToggle(question)}>
              {question.status === "published" ? <EyeOff size={13} /> : <Eye size={13} />}
              {question.status === "published" ? "Unpublish" : "Publish"}
            </button>
            {isAdmin ? (
              <button type="button" className="btn btn-sm btn-coral d-inline-flex gap-1 align-items-center" onClick={() => onDelete(question)}>
                <Trash2 size={13} /> Delete
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------- exam list */
function ExamRow({ exam, onEdit, onDelete, onToggle }) {
  const { isAdmin } = useApp();
  return (
    <article className="ws-practice-row">
      <div className="ws-practice-row-head">
        <span className={`badge rounded-pill ${exam.status === "published" ? "text-bg-success" : "text-bg-secondary"}`}>
          {statusLabel(exam.status)}
        </span>
        <span className="small fw-semibold flex-grow-1 text-truncate">{exam.title}</span>
        {exam.duration_minutes ? <span className="badge rounded-pill text-bg-light"><Clock size={11} className="me-1 align-text-bottom" aria-hidden="true" />{exam.duration_minutes}m</span> : null}
        <span className="badge rounded-pill text-bg-light">{exam.question_ids.length || exam.question_count} questions</span>
        <span className="badge rounded-pill text-bg-light">{revealLabel(exam.show_answers)}</span>
      </div>
      <div className="d-flex gap-2 flex-wrap px-2 pb-2">
        <button type="button" className="btn btn-sm btn-soft d-inline-flex gap-1 align-items-center" onClick={() => onEdit(exam)}>
          <Edit3 size={13} /> Edit
        </button>
        <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex gap-1 align-items-center" onClick={() => onToggle(exam)}>
          {exam.status === "published" ? <EyeOff size={13} /> : <Eye size={13} />}
          {exam.status === "published" ? "Unpublish" : "Publish"}
        </button>
        {isAdmin ? (
          <button type="button" className="btn btn-sm btn-coral d-inline-flex gap-1 align-items-center" onClick={() => onDelete(exam)}>
            <Trash2 size={13} /> Delete
          </button>
        ) : null}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------- stats */
function PracticeStats({ stats }) {
  if (!stats) return null;
  const items = [
    ["Questions", stats.questions, ClipboardList],
    ["Published", stats.published_questions, Eye],
    ["Drafts", stats.drafts, EyeOff],
    ["Exams", stats.exams, Target],
    ["Total attempts", stats.attempts, ListChecks],
    ["This week", stats.weekly_attempts, RefreshCw]
  ];
  return (
    <div className="row g-2 mb-3">
      {items.map(([label, value, Icon]) => (
        <div className="col-6 col-md-4 col-lg-2" key={label}>
          <div className="card p-2 text-center">
            <Icon size={16} className="mx-auto mb-1 text-secondary" aria-hidden="true" />
            <div className="h5 mb-0">{value ?? 0}</div>
            <div className="small text-secondary">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- main */
const TABS = [
  ["questions", "Questions", ClipboardList],
  ["exams", "Exams", Target]
];

export default function AdminPractice() {
  const { session, coursesData, toast } = useApp();
  const [tab, setTab] = useState("questions");
  const [questions, setQuestions] = useState([]);
  const [exams, setExams] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editingExam, setEditingExam] = useState(null);

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError("");
    Promise.all([
      api.listAdminPracticeQuestions({}, session.authToken),
      api.listAdminPracticeExams(session.authToken),
      api.getPracticeStats(session.authToken)
    ]).then(([qRes, eRes, sRes]) => {
      if (qRes?.ok !== false) setQuestions(Array.isArray(qRes?.questions) ? qRes.questions : []);
      else setError((qRes && qRes.error) || "Could not load questions.");
      if (eRes?.ok !== false) setExams(Array.isArray(eRes?.exams) ? eRes.exams : []);
      if (sRes?.ok !== false) setStats(sRes?.stats || null);
      setLoading(false);
    });
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  // questions
  const handleSaveQuestion = (savedQuestion) => {
    setQuestions((prev) => {
      const index = prev.findIndex((q) => q.id === savedQuestion.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = savedQuestion;
        return next;
      }
      return [savedQuestion, ...prev];
    });
    setEditingQuestion(null);
    toast(savedQuestion.status === "published" ? `"${savedQuestion.body.slice(0, 40)}…" published.` : "Question saved as draft.");
    api.getPracticeStats(session.authToken).then((res) => { if (res?.stats) setStats(res.stats); });
  };

  const handleToggleQuestion = async (q) => {
    const nextStatus = q.status === "published" ? "draft" : "published";
    const res = await api.updatePracticeQuestion(q.id, { status: nextStatus }, session.authToken);
    if (!res || res.ok === false) {
      toast((res && res.error) || "Could not change the question status.");
      return;
    }
    setQuestions((prev) => prev.map((item) => (item.id === q.id ? res.question : item)));
    toast(nextStatus === "published" ? "Question published." : "Question unpublished.");
  };

  const handleDeleteQuestion = async (q) => {
    if (!window.confirm(`Delete "${q.body.slice(0, 60)}…"? This cannot be undone.`)) return;
    const res = await api.deletePracticeQuestion(q.id, session.authToken);
    if (!res || res.ok === false) {
      toast((res && res.error) || "Could not delete the question.");
      return;
    }
    setQuestions((prev) => prev.filter((item) => item.id !== q.id));
    toast("Question deleted.");
  };

  // exams
  const handleSaveExam = (savedExam) => {
    setExams((prev) => {
      const index = prev.findIndex((e) => e.id === savedExam.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = savedExam;
        return next;
      }
      return [savedExam, ...prev];
    });
    setEditingExam(null);
    toast(`Exam "${savedExam.title}" saved.`);
  };

  const handleToggleExam = async (e) => {
    const nextStatus = e.status === "published" ? "draft" : "published";
    const res = await api.updatePracticeExam(e.id, { status: nextStatus }, session.authToken);
    if (!res || res.ok === false) {
      toast((res && res.error) || "Could not change the exam status.");
      return;
    }
    setExams((prev) => prev.map((item) => (item.id === e.id ? res.exam : item)));
    toast(nextStatus === "published" ? "Exam published." : "Exam unpublished.");
  };

  const handleDeleteExam = async (e) => {
    if (!window.confirm(`Delete "${e.title}"? This cannot be undone.`)) return;
    const res = await api.deletePracticeExam(e.id, session.authToken);
    if (!res || res.ok === false) {
      toast((res && res.error) || "Could not delete the exam.");
      return;
    }
    setExams((prev) => prev.filter((item) => item.id !== e.id));
    toast("Exam deleted.");
  };

  if (loading) {
    return (
      <div>
        <div className="ws-section-head mb-3">
          <h2 className="h5">Practice &amp; examinations</h2>
          <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex gap-2 align-items-center" onClick={load}>
            <RefreshCw size={14} /> Reload
          </button>
        </div>
        {[0, 1, 2].map((i) => <div key={i} className="ws-skeleton mb-2" style={{ height: 48 }} />)}
      </div>
    );
  }

  return (
    <div>
      <div className="ws-section-head mb-3">
        <div>
          <span className="ws-section-kicker">Admin · practice</span>
          <h2 className="h5 mb-1">Practice &amp; examinations</h2>
          <p className="small text-secondary mb-0">Create and publish questions and exams. Only published questions are visible to students.</p>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex gap-2 align-items-center" onClick={load}>
          <RefreshCw size={14} /> Reload
        </button>
      </div>

      <PracticeStats stats={stats} />

      {error ? <div className="banner warn mb-3" role="alert"><span>{error}</span></div> : null}

      <nav className="admin-nav mb-3" aria-label="Practice admin sections">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            <Icon size={14} className="me-1 align-text-bottom" aria-hidden="true" />
            {label}
            <span className="ms-2 mono" style={{ fontSize: 11 }}>
              ({tab === "questions" || key === "questions" ? questions.length : exams.length})
            </span>
          </button>
        ))}
      </nav>

      {tab === "questions" ? (
        <>
          {editingQuestion ? (
            <QuestionForm
              question={editingQuestion === "new" ? null : editingQuestion}
              onSave={handleSaveQuestion}
              onCancel={() => setEditingQuestion(null)}
              coursesData={coursesData}
            />
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary btn-sm mb-3 d-inline-flex gap-2 align-items-center"
                onClick={() => setEditingQuestion("new")}
              >
                <PlusCircle size={15} /> New question
              </button>
              {questions.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No questions yet" body="Add your first question and publish it to make it available to students." />
              ) : (
                <div className="d-flex flex-column gap-2">
                  {questions.map((q) => (
                    <QuestionRow
                      key={q.id}
                      question={q}
                      onEdit={(q) => setEditingQuestion(q)}
                      onDelete={handleDeleteQuestion}
                      onToggle={handleToggleQuestion}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : null}

      {tab === "exams" ? (
        <>
          {editingExam ? (
            <ExamForm
              exam={editingExam === "new" ? null : editingExam}
              allQuestions={questions.filter((q) => q.status === "published")}
              onSave={handleSaveExam}
              onCancel={() => setEditingExam(null)}
            />
          ) : (
            <>
              <button
                type="button"
                className="btn btn-primary btn-sm mb-3 d-inline-flex gap-2 align-items-center"
                onClick={() => setEditingExam("new")}
              >
                <PlusCircle size={15} /> New exam
              </button>
              {exams.length === 0 ? (
                <EmptyState icon={Target} title="No exams yet" body="Create an exam to group questions into a timed, marked experience for students." />
              ) : (
                <div className="d-flex flex-column gap-2">
                  {exams.map((e) => (
                    <ExamRow
                      key={e.id}
                      exam={e}
                      onEdit={(e) => setEditingExam(e)}
                      onDelete={handleDeleteExam}
                      onToggle={handleToggleExam}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
