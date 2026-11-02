import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  ClipboardList,
  Filter,
  ListChecks,
  LogIn,
  RotateCcw,
  Search,
  Send,
  Target,
  Trophy,
  XCircle
} from "lucide-react";
import * as api from "../lib/api.js";
import { useApp } from "../store/AppContext.jsx";
import UserAvatar from "../components/UserAvatar.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { kindLabel, LEADERBOARD_SCOPES, optionLetter, QUESTION_KINDS, rankMedal } from "../lib/practice.js";

// A signed-in room: the leaderboard, the question bank and the exams all sit behind the
// account, the same way the chatroom does. A visitor is offered the sign-in door, not a wall.
function PracticeSignIn() {
  const { goLogin, goLibrary } = useApp();
  return (
    <div className="ws-page">
      <div className="card p-4 text-center mx-auto" style={{ maxWidth: 560 }}>
        <ClipboardList size={28} className="mb-2 text-secondary" aria-hidden="true" />
        <h1 className="h5">Practice is for Wollo Share students</h1>
        <p className="small text-secondary">
          Browse course questions, take timed exams, save your favourites and climb the top-students leaderboard. Sign in to start practising.
        </p>
        <div className="d-flex justify-content-center gap-2">
          <button type="button" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2" onClick={() => goLogin("signin")}>
            <LogIn size={15} aria-hidden="true" />
            Sign in
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={goLibrary}>
            Back to library
          </button>
        </div>
      </div>
    </div>
  );
}

function PracticeError({ message }) {
  if (!message) return null;
  return (
    <div className="banner warn mb-3" role="alert">
      <span>{message}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ top students */
function TopStudents({ scope, onScope }) {
  const { session } = useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.getPracticeLeaderboard(scope, session?.authToken || "").then((res) => {
      if (cancelled) return;
      if (!res || res.ok === false) {
        setError((res && res.error) || "The leaderboard could not be loaded.");
        setRows([]);
      } else {
        setRows(Array.isArray(res.leaderboard) ? res.leaderboard : []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, session?.authToken]);

  return (
    <section className="ws-leaderboard" aria-label="Top students">
      <div className="ws-section-head">
        <div>
          <h2 className="h5 mb-1 d-inline-flex align-items-center gap-2">
            <Trophy size={18} aria-hidden="true" />
            Top students
          </h2>
          <p className="small text-secondary mb-0">Ranked by real practice points — nothing invented.</p>
        </div>
        <div className="btn-group btn-group-sm" role="group" aria-label="Leaderboard scope">
          {LEADERBOARD_SCOPES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`btn ${scope === key ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => onScope(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="ws-leaderboard-row">
          {[0, 1, 2, 3, 4].map((i) => (
            <span className="ws-skeleton" key={i} style={{ height: 64, flex: "1 1 200px" }} />
          ))}
        </div>
      ) : error ? (
        <PracticeError message={error} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Award} title="No practice scores yet" body="Be the first student to answer a question and take the top spot." />
      ) : (
        <div className="ws-leaderboard-row" role="list">
          {rows.slice(0, 8).map((entry) => (
            <article className="ws-leader-card" key={entry.user_id} role="listitem">
              <span className="ws-leader-rank" style={{ background: rankMedal(entry.rank) }}>
                {entry.rank}
              </span>
              <UserAvatar photo={entry.avatarUrl} name={entry.name} size={42} alt="" />
              <div className="ws-leader-body">
                <strong className="ws-leader-name">{entry.name}</strong>
                <span className="ws-leader-dept text-secondary small">{entry.department || "Wollo University"}</span>
                <span className="ws-leader-stats">
                  <span><Trophy size={12} aria-hidden="true" /> {entry.total_points} pts</span>
                  <span><ListChecks size={12} aria-hidden="true" /> {entry.questions_answered}</span>
                  <span><Target size={12} aria-hidden="true" /> {entry.avg_score}% avg</span>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ question card */
function QuestionAnswerInput({ question, value, onChange, disabled }) {
  if (question.kind === "mcq" && Array.isArray(question.options) && question.options.length) {
    return (
      <div className="ws-options" role="group" aria-label="Answer choices">
        {question.options.map((option, index) => {
          const selected = value === option;
          return (
            <label key={index} className={`ws-option${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}>
              <input
                type="radio"
                name={`q-${question.id}`}
                value={option}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option)}
              />
              <span className="ws-option-mark">{optionLetter(index)}</span>
              <span className="ws-option-text">{option}</span>
            </label>
          );
        })}
      </div>
    );
  }
  if (question.kind === "truefalse") {
    return (
      <div className="ws-options" role="group" aria-label="True or false">
        {["true", "false"].map((option) => {
          const selected = String(value || "").toLowerCase() === option;
          return (
            <label key={option} className={`ws-option${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}>
              <input
                type="radio"
                name={`q-${question.id}`}
                value={option}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option)}
              />
              <span className="ws-option-text">{option === "true" ? "True" : "False"}</span>
            </label>
          );
        })}
      </div>
    );
  }
  return (
    <input
      className="form-control"
      placeholder="Type your answer"
      value={value || ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function QuestionImage({ question }) {
  if (!question.image) return null;
  return <img className="ws-question-image" src={question.image} alt="" loading="lazy" />;
}

function QuestionCard({ question, index, value, onChange, disabled, onFavorite, isFavorite, reveal, answerState }) {
  return (
    <article className="ws-question">
      <header className="ws-question-head">
        <span className="ws-question-index">Q{index + 1}</span>
        <span className="badge rounded-pill text-bg-light">{kindLabel(question.kind)}</span>
        {question.points ? <span className="badge rounded-pill text-bg-light">{question.points} pt{question.points === 1 ? "" : "s"}</span> : null}
        {question.chapter ? <span className="badge rounded-pill text-bg-light">{question.chapter}</span> : null}
        {question.category ? <span className="badge rounded-pill text-bg-light">{question.category}</span> : null}
        {onFavorite ? (
          <button type="button" className="btn btn-link btn-sm p-0 ms-auto ws-favorite" onClick={() => onFavorite(question.id)} title={isFavorite ? "Remove from saved" : "Save question"} aria-label={isFavorite ? "Remove from saved" : "Save question"}>
            {isFavorite ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}
          </button>
        ) : null}
      </header>
      <p className="ws-question-body">{question.body || "(no question text)"}</p>
      <QuestionImage question={question} />
      <QuestionAnswerInput question={question} value={value} onChange={onChange} disabled={disabled || reveal} />
      {reveal && answerState ? (
        <div className={`ws-answer-review${answerState.correct ? " is-correct" : " is-wrong"}`}>
          <div className="ws-answer-line">
            {answerState.correct ? <CheckCircle2 size={15} aria-hidden="true" /> : <XCircle size={15} aria-hidden="true" />}
            <span>Your answer: <strong>{answerState.given || "—"}</strong></span>
          </div>
          {!answerState.correct && question.correct_answer ? (
            <div className="ws-answer-line">
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>Correct answer: <strong>{question.correct_answer}</strong></span>
            </div>
          ) : null}
          {question.explanation ? <p className="ws-explanation">{question.explanation}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

/* ------------------------------------------------------------------ runner (taking a set) */
function Runner({ taking, answers, setAnswer, onSubmit, onCancel, submitting, secondsLeft }) {
  const total = taking.questions.length;
  const answered = Object.values(answers).filter((value) => String(value || "").trim()).length;
  const timed = Boolean(taking.durationMinutes);
  const progress = total ? Math.round((answered / total) * 100) : 0;

  return (
    <div className="ws-runner">
      <div className="ws-runner-bar">
        <div>
          <span className="ws-section-kicker">{taking.mode === "exam" ? "Examination" : "Practice"}</span>
          <h1 className="h5 mb-0">{taking.title}</h1>
        </div>
        <div className="d-flex align-items-center gap-2">
          {timed ? (
            <span className={`badge rounded-pill ${secondsLeft <= 30 ? "text-bg-danger" : "text-bg-light"}`}>
              <Clock size={12} className="me-1 align-text-bottom" aria-hidden="true" />
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </span>
          ) : null}
          <span className="small text-secondary">{answered}/{total} answered</span>
        </div>
      </div>

      <div className="progress mb-3" style={{ height: 6 }} role="progressbar" aria-label="Answered" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-bar" style={{ width: `${progress}%` }} />
      </div>

      <div className="ws-question-list">
        {taking.questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            value={answers[question.id]}
            onChange={(value) => setAnswer(question.id, value)}
          />
        ))}
      </div>

      <div className="d-flex justify-content-between gap-2 mt-3">
        <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={onSubmit} disabled={submitting || answered === 0}>
          <Send size={15} aria-hidden="true" />
          {submitting ? "Grading…" : "Submit answers"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ results */
function Results({ result, onRetry, onBack }) {
  const { score, max_score, percent, correct_count, total_count, questions, answers } = result;
  return (
    <div className="ws-results">
      <div className="ws-results-hero">
        <span className="ws-section-kicker">Results</span>
        <h1 className="h3 mb-1">{percent}%</h1>
        <p className="small text-secondary mb-0">
          {correct_count} of {total_count} correct · {score} of {max_score} points
        </p>
        <div className="d-flex gap-2 mt-3">
          <button type="button" className="btn btn-soft btn-sm d-inline-flex align-items-center gap-2" onClick={onRetry}>
            <RotateCcw size={14} aria-hidden="true" /> Retry
          </button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onBack}>Back to practice</button>
        </div>
      </div>
      <div className="ws-question-list">
        {questions.map((question, index) => (
          <QuestionCard key={question.id} question={question} index={index} reveal answerState={answers[question.id]} disabled />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ browser */
function FilterBar({ filters, setFilters, coursesData, session }) {
  const colleges = useMemo(
    () => Array.from(new Set(coursesData.map((c) => c.college).filter(Boolean))).sort(),
    [coursesData]
  );
  const set = (patch) => setFilters((prev) => ({ ...prev, ...patch }));
  return (
    <div className="ws-practice-filters card p-3 mb-3">
      <div className="row g-2">
        <div className="col-12 col-md-4">
          <label className="form-label small fw-semibold">Search</label>
          <div className="ws-field-icon">
            <Search size={16} aria-hidden="true" />
            <input className="form-control" placeholder="Question, chapter or category" value={filters.search || ""} onChange={(e) => set({ search: e.target.value })} />
          </div>
        </div>
        <div className="col-6 col-md-3">
          <label className="form-label small fw-semibold">College</label>
          <select className="form-select" value={filters.college || ""} onChange={(e) => set({ college: e.target.value })}>
            <option value="">All colleges</option>
            {colleges.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <label className="form-label small fw-semibold">Chapter</label>
          <input className="form-control" placeholder="e.g. Chapter 4" value={filters.chapter || ""} onChange={(e) => set({ chapter: e.target.value })} />
        </div>
        <div className="col-6 col-md-2">
          <label className="form-label small fw-semibold">Category</label>
          <input className="form-control" placeholder="e.g. Midterm" value={filters.category || ""} onChange={(e) => set({ category: e.target.value })} />
        </div>
        <div className="col-6 col-md-1">
          <label className="form-label small fw-semibold">Type</label>
          <select className="form-select" value={filters.kind || ""} onChange={(e) => set({ kind: e.target.value })}>
            <option value="">All</option>
            {QUESTION_KINDS.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function Browser({ session, favorites, onToggleFavorite }) {
  const { coursesData } = useApp();
  const [filters, setFilters] = useState({ search: "", college: "", chapter: "", category: "", kind: "" });
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(null);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api.listPracticeQuestions(filters, session?.authToken || "").then((res) => {
      if (!res || res.ok === false) {
        setError((res && res.error) || "Could not load questions.");
        setQuestions([]);
      } else {
        setQuestions(Array.isArray(res.questions) ? res.questions : []);
      }
      setLoading(false);
    });
  }, [filters, session?.authToken]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 280);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [load]);

  const setAnswer = (id, value) => setAnswers((prev) => ({ ...prev, [id]: value }));
  const answeredCount = Object.values(answers).filter((value) => String(value || "").trim()).length;

  const submit = async () => {
    const payload = Object.entries(answers)
      .filter(([, value]) => String(value || "").trim())
      .map(([questionId, given]) => ({ questionId, given: String(given) }));
    if (!payload.length) return;
    setBusy(true);
    const res = await api.submitPractice({ answers: payload, mode: "practice", title: "Practice set" }, session?.authToken || "");
    setBusy(false);
    if (!res || res.ok === false) {
      setError((res && res.error) || "Could not grade your answers.");
      return;
    }
    setSubmitted(res.result);
  };

  if (submitted) {
    return (
      <Results
        result={submitted}
        onRetry={() => {
          setAnswers({});
          setSubmitted(null);
        }}
        onBack={() => {
          setAnswers({});
          setSubmitted(null);
        }}
      />
    );
  }

  return (
    <section aria-label="Practice questions">
      <FilterBar filters={filters} setFilters={setFilters} coursesData={coursesData} session={session} />
      <PracticeError message={error} />
      {loading ? (
        <div className="ws-question-list">
          {[0, 1, 2].map((i) => (
            <span className="ws-skeleton" key={i} style={{ height: 120 }} />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No questions match" body="Try different filters, or ask your administrator to add questions for this course." />
      ) : (
        <>
          <div className="ws-question-list">
            {questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                question={question}
                index={index}
                value={answers[question.id]}
                onChange={(value) => setAnswer(question.id, value)}
                onFavorite={(id) => onToggleFavorite(id)}
                isFavorite={favorites.includes(question.id)}
              />
            ))}
          </div>
          <div className="d-flex justify-content-end mt-3">
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={submit} disabled={busy || answeredCount === 0}>
              <Send size={15} aria-hidden="true" />
              {busy ? "Grading…" : `Submit ${answeredCount} answer${answeredCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ exams */
function Exams({ session }) {
  const { toast } = useApp();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taking, setTaking] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.listPracticeExams("", session?.authToken || "").then((res) => {
      if (!res || res.ok === false) {
        setError((res && res.error) || "Could not load exams.");
        setExams([]);
      } else {
        setExams(Array.isArray(res.exams) ? res.exams : []);
      }
      setLoading(false);
    });
  }, [session?.authToken]);

  useEffect(() => {
    load();
  }, [load]);

  // The exam timer ticks down and auto-submits at zero — a graded exam cannot be left open.
  useEffect(() => {
    if (!taking || !taking.durationMinutes) return undefined;
    setSecondsLeft(taking.durationMinutes * 60);
    const timer = setInterval(() => {
      setSecondsLeft((left) => {
        if (left <= 1) {
          clearInterval(timer);
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [taking]);

  // Auto-submit when the clock runs out.
  useEffect(() => {
    if (!taking || !taking.durationMinutes || secondsLeft > 0) return;
    if (submitting) return;
    submitAttempt(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, taking]);

  const start = async (exam) => {
    setError("");
    const res = await api.startPracticeExam(exam.id, session?.authToken || "");
    if (!res || res.ok === false) {
      setError((res && res.error) || "Could not start this exam.");
      return;
    }
    setAnswers({});
    setResult(null);
    setTaking({ questions: res.questions || [], mode: "exam", examId: exam.id, title: exam.title, durationMinutes: exam.duration_minutes || 0, startedAt: new Date().toISOString() });
  };

  async function submitAttempt(auto = false) {
    if (!taking) return;
    setSubmitting(true);
    const payload = Object.entries(answers)
      .filter(([, value]) => String(value || "").trim())
      .map(([questionId, given]) => ({ questionId, given: String(given) }));
    const durationSeconds = taking.durationMinutes ? taking.durationMinutes * 60 - secondsLeft : 0;
    const res = await api.submitPractice(
      { answers: payload, mode: "exam", examId: taking.examId, title: taking.title, durationSeconds: Math.max(0, durationSeconds), startedAt: taking.startedAt },
      session?.authToken || ""
    );
    setSubmitting(false);
    if (!res || res.ok === false) {
      setError((res && res.error) || "Could not grade your exam.");
      return;
    }
    setResult(res.result);
    setTaking(null);
    setAnswers({});
    if (auto) toast("Time is up — your exam was submitted.");
  }

  const setAnswer = (id, value) => setAnswers((prev) => ({ ...prev, [id]: value }));

  if (result) {
    return (
      <Results
        result={result}
        onRetry={() => {
          const exam = exams.find((e) => e.id === result.attempt?.exam_id) || exams[0];
          if (exam) start(exam);
          else setResult(null);
        }}
        onBack={() => setResult(null)}
      />
    );
  }

  if (taking) {
    return (
      <Runner
        taking={taking}
        answers={answers}
        setAnswer={setAnswer}
        onSubmit={() => submitAttempt(false)}
        onCancel={() => {
          setTaking(null);
          setAnswers({});
        }}
        submitting={submitting}
        secondsLeft={secondsLeft}
      />
    );
  }

  return (
    <section aria-label="Practice exams">
      <PracticeError message={error} />
      {loading ? (
        <div className="ws-exam-grid">
          {[0, 1, 2].map((i) => (
            <span className="ws-skeleton" key={i} style={{ height: 140 }} />
          ))}
        </div>
      ) : exams.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No exams published yet" body="When an administrator publishes a timed exam, it appears here for you to take." />
      ) : (
        <div className="ws-exam-grid">
          {exams.map((exam) => (
            <article className="ws-exam-card" key={exam.id}>
              <header className="ws-exam-head">
                <span className="ws-section-kicker">{exam.department || exam.college || "Exam"}</span>
                <h3 className="h6 mb-1">{exam.title}</h3>
                {exam.description ? <p className="small text-secondary mb-0">{exam.description}</p> : null}
              </header>
              <div className="ws-exam-meta">
                {exam.duration_minutes ? <span className="badge rounded-pill text-bg-light"><Clock size={12} className="me-1 align-text-bottom" aria-hidden="true" /> {exam.duration_minutes} min</span> : null}
                {exam.question_count ? <span className="badge rounded-pill text-bg-light">{exam.question_count} questions</span> : null}
                {exam.chapter ? <span className="badge rounded-pill text-bg-light">{exam.chapter}</span> : null}
                {exam.category ? <span className="badge rounded-pill text-bg-light">{exam.category}</span> : null}
              </div>
              <button type="button" className="btn btn-primary btn-sm mt-2 d-inline-flex align-items-center gap-2" onClick={() => start(exam)}>
                Start exam <ChevronRight size={14} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

// toast is provided by the app context; keep a tiny local shim so the exam auto-submit message
// does not need to thread it through the whole tree.
function toast(message) {
  try {
    window.dispatchEvent(new CustomEvent("wollo:toast", { detail: message }));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ saved + history */
function Saved({ session, favorites, onToggleFavorite }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.listPracticeFavorites(session?.authToken || "").then((res) => {
      if (!res || res.ok === false) {
        setError((res && res.error) || "Could not load saved questions.");
        setQuestions([]);
      } else {
        setQuestions(Array.isArray(res.questions) ? res.questions : []);
      }
      setLoading(false);
    });
  }, [session?.authToken]);

  useEffect(() => {
    load();
  }, [load, favorites.length]);

  const submit = async () => {
    const payload = Object.entries(answers)
      .filter(([, value]) => String(value || "").trim())
      .map(([questionId, given]) => ({ questionId, given: String(given) }));
    if (!payload.length) return;
    setBusy(true);
    const res = await api.submitPractice({ answers: payload, mode: "practice", title: "Saved questions" }, session?.authToken || "");
    setBusy(false);
    if (!res || res.ok === false) {
      setError((res && res.error) || "Could not grade your answers.");
      return;
    }
    setResult(res.result);
  };

  if (result) {
    return <Results result={result} onRetry={() => { setAnswers({}); setResult(null); }} onBack={() => { setAnswers({}); setResult(null); }} />;
  }

  return (
    <section aria-label="Saved questions">
      <PracticeError message={error} />
      {loading ? (
        <EmptyState icon={Bookmark} title="Loading saved questions" body="" />
      ) : questions.length === 0 ? (
        <EmptyState icon={Bookmark} title="No saved questions yet" body="Tap the bookmark on any question to keep it here for later." />
      ) : (
        <>
          <div className="ws-question-list">
            {questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                question={question}
                index={index}
                value={answers[question.id]}
                onChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
                onFavorite={(id) => onToggleFavorite(id)}
                isFavorite={favorites.includes(question.id)}
              />
            ))}
          </div>
          <div className="d-flex justify-content-end mt-3">
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2" onClick={submit} disabled={busy}>
              <Send size={15} aria-hidden="true" /> {busy ? "Grading…" : "Submit answers"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function History({ session }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listPracticeAttempts(session?.authToken || "").then((res) => {
      if (cancelled) return;
      if (!res || res.ok === false) {
        setError((res && res.error) || "Could not load your history.");
        setAttempts([]);
      } else {
        setAttempts(Array.isArray(res.attempts) ? res.attempts : []);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.authToken]);

  if (loading) return <EmptyState icon={ListChecks} title="Loading your attempts" body="" />;
  if (error) return <PracticeError message={error} />;
  if (attempts.length === 0) return <EmptyState icon={ListChecks} title="No attempts yet" body="Your practice and exam attempts will appear here, with your scores." />;

  return (
    <div className="ws-history-list">
      {attempts.map((attempt) => (
        <article className="ws-history-row" key={attempt.id}>
          <div>
            <strong>{attempt.title || "Practice"}</strong>
            <span className="text-secondary small ms-2">{attempt.mode === "exam" ? "Exam" : "Practice"}</span>
            {attempt.exam_id ? <span className="badge rounded-pill text-bg-light ms-2">Timed</span> : null}
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2 mt-1">
            <span className={`badge rounded-pill ${attempt.percent >= 80 ? "text-bg-success" : attempt.percent >= 50 ? "text-bg-warning" : "text-bg-secondary"}`}>
              {attempt.percent}%
            </span>
            <span className="small text-secondary">{attempt.correct_count}/{attempt.total_count} correct · {attempt.score}/{attempt.max_score} pts</span>
            <span className="small text-secondary ms-auto">{new Date(attempt.submitted_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ page */
const TABS = [
  ["practice", "Questions", ClipboardList],
  ["exams", "Exams", Target],
  ["saved", "Saved", Bookmark],
  ["history", "History", ListChecks]
];

export default function PracticePage() {
  const { session } = useApp();
  const [tab, setTab] = useState("practice");
  const [scope, setScope] = useState("weekly");
  const [favorites, setFavorites] = useState([]);

  // The saved list is the page's, so a toggle updates the bookmark state in one place and
  // every list (browser, saved) re-renders from the same source.
  const toggleFavorite = useCallback(
    async (questionId) => {
      const res = await api.togglePracticeFavorite(questionId, session?.authToken || "");
      if (res && res.ok) {
        setFavorites((prev) => (res.favorited ? Array.from(new Set([...prev, questionId])) : prev.filter((id) => id !== questionId)));
      }
    },
    [session?.authToken]
  );

  useEffect(() => {
    if (!session) return;
    api.listPracticeFavorites(session.authToken).then((res) => {
      if (res && res.ok) setFavorites(Array.isArray(res.favorites) ? res.favorites : []);
    });
  }, [session?.authToken]);

  if (!session) return <PracticeSignIn />;

  return (
    <div className="ws-page">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <div>
          <span className="ws-section-kicker">Wollo University · practice</span>
          <h1 className="h3 mb-1">Practice &amp; exams</h1>
          <p className="small text-secondary mb-0">Answer questions, take timed exams and track your progress.</p>
        </div>
      </div>

      <TopStudents scope={scope} onScope={setScope} />

      <nav className="admin-nav my-4" aria-label="Practice sections">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            <Icon size={14} className="me-1 align-text-bottom" aria-hidden="true" />
            {label}
            {key === "saved" && favorites.length ? <span className="ms-2 mono" style={{ fontSize: 11 }}>({favorites.length})</span> : null}
          </button>
        ))}
      </nav>

      {tab === "practice" ? <Browser session={session} favorites={favorites} onToggleFavorite={toggleFavorite} /> : null}
      {tab === "exams" ? <Exams session={session} /> : null}
      {tab === "saved" ? <Saved session={session} favorites={favorites} onToggleFavorite={toggleFavorite} /> : null}
      {tab === "history" ? <History session={session} /> : null}
    </div>
  );
}
