import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import "dotenv/config";

// The practice room lives in its own Postgres tables, exactly the way the chatroom does:
// a practice attempt writes every answer, and each of those writes would otherwise rewrite
// the whole wollo_state document — every account, course and file — over the network. Keeping
// it apart also keeps the correct answers on the server: a student never receives a question's
// answer or its explanation until they have submitted, and the catalog queries that the app uses
// for browsing strip both fields out.
//
//   practice_questions   the bank, with a `status` of draft or published
//   practice_exams        curated sets, with an optional timer and an answer-reveal policy
//   practice_attempts     one per finished practice/exam, the source of every leaderboard number
//   practice_favorites    questions a student starred for later

const QUESTIONS = "practice_questions";
const EXAMS = "practice_exams";
const ATTEMPTS = "practice_attempts";
const FAVORITES = "practice_favorites";

const POST = "POST";
const PATCH = "PATCH";
const DELETE = "DELETE";

export type QuestionKind = "mcq" | "truefalse" | "short";
export type QuestionStatus = "draft" | "published";

export interface PracticeQuestion {
  id: string;
  course_id: string | null;
  college: string;
  department: string;
  program: string;
  academic_year: string;
  semester: string;
  chapter: string;
  category: string;
  kind: QuestionKind;
  body: string;
  image: string | null;
  options: string[] | null;
  // The answer and the explanation are the secret half of a question. They never leave the
  // server through a student-facing query — only through the grading reply, after submit.
  correct_answer: string;
  explanation: string;
  points: number;
  status: QuestionStatus;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
  usage_count: number;
  correct_count: number;
}

export interface PracticeExam {
  id: string;
  title: string;
  description: string;
  course_id: string | null;
  college: string;
  department: string;
  program: string;
  academic_year: string;
  semester: string;
  chapter: string;
  category: string;
  question_ids: string[];
  question_count: number;
  duration_minutes: number;
  shuffle: boolean;
  // always = reveal answers while answering (practice); after_submit = only on the result
  // page; never = never (used for graded exams that stay open).
  show_answers: "always" | "after_submit" | "never";
  status: QuestionStatus;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export interface PracticeAnswer {
  questionId: string;
  given: string;
  correct: boolean;
  points: number;
}

export interface PracticeAttempt {
  id: string;
  user_id: string;
  user_name: string;
  user_department: string;
  exam_id: string | null;
  title: string;
  mode: "practice" | "exam";
  question_ids: string[];
  answers: Record<string, PracticeAnswer>;
  score: number;
  max_score: number;
  percent: number;
  correct_count: number;
  total_count: number;
  duration_seconds: number;
  started_at: string;
  submitted_at: string;
}

export interface PracticeFavorite {
  user_id: string;
  question_id: string;
  created_at: string;
}

interface LocalStore {
  questions: PracticeQuestion[];
  exams: PracticeExam[];
  attempts: PracticeAttempt[];
  favorites: PracticeFavorite[];
}

const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
const apiKey = String(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();

export function practiceRemoteEnabled(): boolean {
  return process.env.WOLLO_STATE_STORE === "supabase" && Boolean(url && serviceKey && apiKey);
}

function headers() {
  return { apikey: apiKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRACTICE_FILE = process.env.WOLLO_PRACTICE_FILE
  ? path.resolve(process.env.WOLLO_PRACTICE_FILE)
  : path.join(ROOT, "data", "wollo-practice.json");

function emptyLocal(): LocalStore {
  return { questions: [], exams: [], attempts: [], favorites: [] };
}

function readLocal(): LocalStore {
  try {
    if (!fs.existsSync(PRACTICE_FILE)) return emptyLocal();
    const parsed = JSON.parse(fs.readFileSync(PRACTICE_FILE, "utf-8"));
    return {
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      exams: Array.isArray(parsed.exams) ? parsed.exams : [],
      attempts: Array.isArray(parsed.attempts) ? parsed.attempts : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : []
    };
  } catch {
    return emptyLocal();
  }
}

function writeLocal(store: LocalStore): void {
  try {
    const dir = path.dirname(PRACTICE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PRACTICE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("practice file write failed:", err instanceof Error ? err.message : err);
  }
}

// --------------------------------------------------------------------------- change signal
// Long polling waits on this instead of hammering the database. Every write bumps it.
let revision = Date.now();
const waiters = new Set<() => void>();

function signal() {
  revision = Date.now();
  waiters.forEach((wake) => wake());
  waiters.clear();
}

export function practiceRevision(): number {
  return revision;
}

export function waitForPracticeChange(after: number, timeoutMs: number): Promise<boolean> {
  if (revision > after) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      waiters.delete(wake);
      clearTimeout(timer);
      resolve(value);
    };
    const wake = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    waiters.add(wake);
  });
}

// ---------------------------------------------------------------------------------- helpers
function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomInt(100000, 999999).toString(36)}`;
}

const KINDS: QuestionKind[] = ["mcq", "truefalse", "short"];
const STATUSES: QuestionStatus[] = ["draft", "published"];

function isKind(value: unknown): value is QuestionKind {
  return KINDS.includes(value as QuestionKind);
}

function pickStatus(value: unknown, fallback: QuestionStatus): QuestionStatus {
  return STATUSES.includes(value as QuestionStatus) ? (value as QuestionStatus) : fallback;
}

function pickShowAnswers(value: unknown, fallback: PracticeExam["show_answers"]): PracticeExam["show_answers"] {
  return (["always", "after_submit", "never"] as readonly string[]).includes(String(value)) ? (String(value) as PracticeExam["show_answers"]) : fallback;
}

async function postgrest<T>(table: string, query: string, options: { method?: string; body?: unknown } = {}): Promise<T[]> {
  const res = await fetch(`${url}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: { ...headers(), ...(options.method ? { prefer: "return=representation" } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  if (!res.ok) throw new Error(`practice read failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
  const text = await res.text();
  return text ? (JSON.parse(text) as T[]) : [];
}

// ---------------------------------------------------------------------------------- questions
function normalizeQuestion(raw: unknown): PracticeQuestion | null {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const id = String(source.id || "").trim();
  if (!id) return null;
  const kind = isKind(source.kind) ? source.kind : "mcq";
  const status: QuestionStatus = STATUSES.includes(source.status) ? source.status : "draft";
  return {
    id,
    course_id: source.course_id ? String(source.course_id) : null,
    college: String(source.college || ""),
    department: String(source.department || ""),
    program: String(source.program || ""),
    academic_year: String(source.academic_year || ""),
    semester: String(source.semester || ""),
    chapter: String(source.chapter || ""),
    category: String(source.category || ""),
    kind,
    body: String(source.body || ""),
    image: source.image ? String(source.image) : null,
    options: Array.isArray(source.options) ? source.options.map((o: any) => String(o)).slice(0, 8) : null,
    correct_answer: String(source.correct_answer || ""),
    explanation: String(source.explanation || ""),
    points: Math.max(1, Math.min(20, Math.round(Number(source.points) || 1))),
    status,
    author_id: String(source.author_id || ""),
    author_name: String(source.author_name || ""),
    created_at: String(source.created_at || new Date().toISOString()),
    updated_at: String(source.updated_at || new Date().toISOString()),
    usage_count: Math.max(0, Math.round(Number(source.usage_count) || 0)),
    correct_count: Math.max(0, Math.round(Number(source.correct_count) || 0))
  };
}

/** The public shape a student sees while browsing or answering — answers and explanations stripped. */
export function safeQuestion(q: PracticeQuestion): Omit<PracticeQuestion, "correct_answer" | "explanation"> {
  const { correct_answer: _a, explanation: _e, ...rest } = q;
  return rest;
}

/** The graded shape, handed back only after a submit, with the answer and explanation filled in. */
export function gradedQuestion(q: PracticeQuestion) {
  return { ...q };
}

export interface QuestionFilter {
  status?: QuestionStatus | "any";
  courseId?: string;
  college?: string;
  department?: string;
  program?: string;
  academicYear?: string;
  semester?: string;
  chapter?: string;
  category?: string;
  kind?: QuestionKind;
  search?: string;
  limit?: number;
}

function matchesFilter(q: PracticeQuestion, f: QuestionFilter): boolean {
  if (f.status && f.status !== "any" && q.status !== f.status) return false;
  if (f.courseId && q.course_id !== f.courseId) return false;
  if (f.college && q.college !== f.college) return false;
  if (f.department && q.department !== f.department) return false;
  if (f.program && q.program !== f.program) return false;
  if (f.academicYear && q.academic_year !== f.academicYear) return false;
  if (f.semester && q.semester !== f.semester) return false;
  if (f.chapter && q.chapter !== f.chapter) return false;
  if (f.category && q.category !== f.category) return false;
  if (f.kind && q.kind !== f.kind) return false;
  if (f.search) {
    const needle = f.search.toLowerCase();
    if (!q.body.toLowerCase().includes(needle) && !q.chapter.toLowerCase().includes(needle) && !q.category.toLowerCase().includes(needle)) return false;
  }
  return true;
}

export async function listQuestions(filter: QuestionFilter = {}, includeAnswers = false): Promise<PracticeQuestion[]> {
  const limit = Math.min(500, Math.max(1, Number(filter.limit) || 200));
  if (practiceRemoteEnabled()) {
    const parts = ["select=*"];
    if (filter.status && filter.status !== "any") parts.push(`status=eq.${encodeURIComponent(filter.status)}`);
    if (filter.courseId) parts.push(`course_id=eq.${encodeURIComponent(filter.courseId)}`);
    if (filter.college) parts.push(`college=eq.${encodeURIComponent(filter.college)}`);
    if (filter.department) parts.push(`department=eq.${encodeURIComponent(filter.department)}`);
    if (filter.program) parts.push(`program=eq.${encodeURIComponent(filter.program)}`);
    if (filter.academicYear) parts.push(`academic_year=eq.${encodeURIComponent(filter.academicYear)}`);
    if (filter.semester) parts.push(`semester=eq.${encodeURIComponent(filter.semester)}`);
    if (filter.chapter) parts.push(`chapter=eq.${encodeURIComponent(filter.chapter)}`);
    if (filter.category) parts.push(`category=eq.${encodeURIComponent(filter.category)}`);
    if (filter.kind) parts.push(`kind=eq.${encodeURIComponent(filter.kind)}`);
    let rows = await postgrest<PracticeQuestion>(QUESTIONS, `?${parts.join("&")}&order=created_at.desc&limit=${limit}`);
    rows = rows.map((r) => normalizeQuestion(r)).filter(Boolean) as PracticeQuestion[];
    // Search and the looser filters run in memory for parity with the local store.
    if (filter.search) rows = rows.filter((q) => matchesFilter(q, { search: filter.search }));
    return rows;
  }
  const all = readLocal().questions;
  return all
    .filter((q) => matchesFilter(q, filter))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function getQuestion(id: string): Promise<PracticeQuestion | null> {
  if (practiceRemoteEnabled()) {
    const rows = await postgrest<PracticeQuestion>(QUESTIONS, `?id=eq.${encodeURIComponent(id)}&limit=1`);
    return normalizeQuestion(rows[0] || null);
  }
  return readLocal().questions.find((q) => q.id === id) || null;
}

export async function listQuestionsByIds(ids: string[]): Promise<PracticeQuestion[]> {
  const wanted = Array.from(new Set(ids.filter(Boolean)));
  if (!wanted.length) return [];
  if (practiceRemoteEnabled()) {
    const inList = `(${wanted.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")})`;
    const rows = await postgrest<PracticeQuestion>(QUESTIONS, `?id=in.${inList}&order=created_at.desc&limit=${wanted.length}`);
    return rows.map((r) => normalizeQuestion(r)).filter(Boolean) as PracticeQuestion[];
  }
  const all = readLocal().questions;
  return wanted.map((id) => all.find((q) => q.id === id)).filter(Boolean) as PracticeQuestion[];
}

export async function insertQuestion(input: Partial<PracticeQuestion> & { author_id: string; author_name: string }): Promise<PracticeQuestion> {
  const now = new Date().toISOString();
  const row: PracticeQuestion = {
    id: newId("q"),
    course_id: input.course_id || null,
    college: String(input.college || ""),
    department: String(input.department || ""),
    program: String(input.program || ""),
    academic_year: String(input.academic_year || ""),
    semester: String(input.semester || ""),
    chapter: String(input.chapter || ""),
    category: String(input.category || ""),
    kind: isKind(input.kind) ? input.kind : "mcq",
    body: String(input.body || ""),
    image: input.image ? String(input.image) : null,
    options: Array.isArray(input.options) ? input.options.map((o: any) => String(o)).slice(0, 8) : null,
    correct_answer: String(input.correct_answer || ""),
    explanation: String(input.explanation || ""),
    points: Math.max(1, Math.min(20, Math.round(Number(input.points) || 1))),
    status: pickStatus(input.status, "draft"),
    author_id: String(input.author_id || ""),
    author_name: String(input.author_name || ""),
    created_at: now,
    updated_at: now,
    usage_count: 0,
    correct_count: 0
  };
  if (practiceRemoteEnabled()) {
    await postgrest(QUESTIONS, "", { method: POST, body: row });
  } else {
    const store = readLocal();
    store.questions.unshift(row);
    writeLocal(store);
  }
  signal();
  return row;
}

export async function updateQuestion(id: string, patch: Partial<PracticeQuestion>): Promise<PracticeQuestion | null> {
  const existing = await getQuestion(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next: PracticeQuestion = {
    ...existing,
    ...patch,
    id: existing.id,
    kind: isKind(patch.kind) ? patch.kind : existing.kind,
    status: pickStatus(patch.status, existing.status),
    options: Array.isArray(patch.options) ? patch.options.map((o: any) => String(o)).slice(0, 8) : patch.options === null ? null : existing.options,
    points: Math.max(1, Math.min(20, Math.round(Number(patch.points) || existing.points))),
    updated_at: now
  };
  if (practiceRemoteEnabled()) {
    await postgrest(QUESTIONS, `?id=eq.${encodeURIComponent(id)}`, { method: PATCH, body: next });
  } else {
    const store = readLocal();
    store.questions = store.questions.map((q) => (q.id === id ? next : q));
    writeLocal(store);
  }
  signal();
  return next;
}

export async function deleteQuestion(id: string): Promise<boolean> {
  if (practiceRemoteEnabled()) {
    const rows = await postgrest<PracticeQuestion>(QUESTIONS, `?id=eq.${encodeURIComponent(id)}`, { method: DELETE });
    if (!rows.length) return false;
  } else {
    const store = readLocal();
    const before = store.questions.length;
    store.questions = store.questions.filter((q) => q.id !== id);
    store.favorites = store.favorites.filter((f) => f.question_id !== id);
    writeLocal(store);
    if (store.questions.length === before) return false;
  }
  signal();
  return true;
}

// ---------------------------------------------------------------------------------- exams
function normalizeExam(raw: unknown): PracticeExam | null {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const id = String(source.id || "").trim();
  if (!id) return null;
  return {
    id,
    title: String(source.title || ""),
    description: String(source.description || ""),
    course_id: source.course_id ? String(source.course_id) : null,
    college: String(source.college || ""),
    department: String(source.department || ""),
    program: String(source.program || ""),
    academic_year: String(source.academic_year || ""),
    semester: String(source.semester || ""),
    chapter: String(source.chapter || ""),
    category: String(source.category || ""),
    question_ids: Array.isArray(source.question_ids) ? source.question_ids.map((id: any) => String(id)) : [],
    question_count: Math.max(0, Math.round(Number(source.question_count) || 0)),
    duration_minutes: Math.max(0, Math.min(300, Math.round(Number(source.duration_minutes) || 0))),
    shuffle: Boolean(source.shuffle),
    show_answers: ["always", "after_submit", "never"].includes(source.show_answers) ? source.show_answers : "after_submit",
    status: STATUSES.includes(source.status) ? source.status : "draft",
    author_id: String(source.author_id || ""),
    author_name: String(source.author_name || ""),
    created_at: String(source.created_at || new Date().toISOString()),
    updated_at: String(source.updated_at || new Date().toISOString())
  };
}

export async function listExams(filter: { status?: QuestionStatus | "any"; courseId?: string; limit?: number } = {}): Promise<PracticeExam[]> {
  const limit = Math.min(200, Math.max(1, Number(filter.limit) || 100));
  if (practiceRemoteEnabled()) {
    const parts = ["select=*"];
    if (filter.status && filter.status !== "any") parts.push(`status=eq.${encodeURIComponent(filter.status)}`);
    if (filter.courseId) parts.push(`course_id=eq.${encodeURIComponent(filter.courseId)}`);
    const rows = await postgrest<PracticeExam>(EXAMS, `?${parts.join("&")}&order=created_at.desc&limit=${limit}`);
    return rows.map((r) => normalizeExam(r)).filter(Boolean) as PracticeExam[];
  }
  return readLocal()
    .exams.filter((e) => (!filter.status || filter.status === "any" || e.status === filter.status) && (!filter.courseId || e.course_id === filter.courseId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function getExam(id: string): Promise<PracticeExam | null> {
  if (practiceRemoteEnabled()) {
    const rows = await postgrest<PracticeExam>(EXAMS, `?id=eq.${encodeURIComponent(id)}&limit=1`);
    return normalizeExam(rows[0] || null);
  }
  return readLocal().exams.find((e) => e.id === id) || null;
}

export async function insertExam(input: Partial<PracticeExam> & { author_id: string; author_name: string }): Promise<PracticeExam> {
  const now = new Date().toISOString();
  const row: PracticeExam = {
    id: newId("ex"),
    title: String(input.title || "Untitled exam"),
    description: String(input.description || ""),
    course_id: input.course_id || null,
    college: String(input.college || ""),
    department: String(input.department || ""),
    program: String(input.program || ""),
    academic_year: String(input.academic_year || ""),
    semester: String(input.semester || ""),
    chapter: String(input.chapter || ""),
    category: String(input.category || ""),
    question_ids: Array.isArray(input.question_ids) ? input.question_ids.map((id: any) => String(id)) : [],
    question_count: Math.max(0, Math.round(Number(input.question_count) || 0)),
    duration_minutes: Math.max(0, Math.min(300, Math.round(Number(input.duration_minutes) || 0))),
    shuffle: Boolean(input.shuffle),
    show_answers: pickShowAnswers(input.show_answers, "after_submit"),
    status: pickStatus(input.status, "draft"),
    author_id: String(input.author_id || ""),
    author_name: String(input.author_name || ""),
    created_at: now,
    updated_at: now
  };
  if (practiceRemoteEnabled()) {
    await postgrest(EXAMS, "", { method: POST, body: row });
  } else {
    const store = readLocal();
    store.exams.unshift(row);
    writeLocal(store);
  }
  signal();
  return row;
}

export async function updateExam(id: string, patch: Partial<PracticeExam>): Promise<PracticeExam | null> {
  const existing = await getExam(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const next: PracticeExam = {
    ...existing,
    ...patch,
    id: existing.id,
    question_ids: Array.isArray(patch.question_ids) ? patch.question_ids.map((id: any) => String(id)) : existing.question_ids,
    question_count: Math.max(0, Math.round(Number(patch.question_count ?? existing.question_count))),
    duration_minutes: Math.max(0, Math.min(300, Math.round(Number(patch.duration_minutes ?? existing.duration_minutes)))),
    shuffle: patch.shuffle === undefined ? existing.shuffle : Boolean(patch.shuffle),
    show_answers: pickShowAnswers(patch.show_answers, existing.show_answers),
    status: pickStatus(patch.status, existing.status),
    updated_at: now
  };
  if (practiceRemoteEnabled()) {
    await postgrest(EXAMS, `?id=eq.${encodeURIComponent(id)}`, { method: PATCH, body: next });
  } else {
    const store = readLocal();
    store.exams = store.exams.map((e) => (e.id === id ? next : e));
    writeLocal(store);
  }
  signal();
  return next;
}

export async function deleteExam(id: string): Promise<boolean> {
  if (practiceRemoteEnabled()) {
    const rows = await postgrest<PracticeExam>(EXAMS, `?id=eq.${encodeURIComponent(id)}`, { method: DELETE });
    if (!rows.length) return false;
  } else {
    const store = readLocal();
    const before = store.exams.length;
    store.exams = store.exams.filter((e) => e.id !== id);
    writeLocal(store);
    if (store.exams.length === before) return false;
  }
  signal();
  return true;
}

// ---------------------------------------------------------------------------------- grading
function normalizeText(value: string): string {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Correct iff the given answer matches the expected one. Short-answer accepts any of a
 *  comma- or slash-separated list of acceptable answers as a match. */
export function isCorrect(q: PracticeQuestion, given: string): boolean {
  const expected = String(q.correct_answer || "").trim();
  const g = normalizeText(given);
  if (!g) return false;
  if (q.kind === "mcq" || q.kind === "truefalse") {
    return g === normalizeText(expected);
  }
  // short-answer: accept any acceptable variant
  return expected
    .split(/[,/]| or /i)
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .some((variant) => variant === g);
}

export interface GradeInput {
  questionId: string;
  given: string;
}

export interface GradeResult {
  answers: Record<string, PracticeAnswer>;
  score: number;
  max_score: number;
  percent: number;
  correct_count: number;
  total_count: number;
  // The graded questions, with answers and explanations, returned to the student after submit.
  questions: PracticeQuestion[];
}

/** Grade a submitted attempt and record it. Returns the graded questions only for the set
 *  the student actually answered, never the whole bank. */
export async function gradeAndRecordAttempt(input: {
  user_id: string;
  user_name: string;
  user_department: string;
  exam_id: string | null;
  title: string;
  mode: "practice" | "exam";
  answers: GradeInput[];
  duration_seconds: number;
  started_at: string;
}): Promise<{ attempt: PracticeAttempt; result: GradeResult }> {
  const ids = input.answers.map((a) => a.questionId).filter(Boolean);
  const questions = await listQuestionsByIds(ids);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const graded: Record<string, PracticeAnswer> = {};
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  for (const item of input.answers) {
    const q = byId.get(item.questionId);
    if (!q) continue;
    const correct = isCorrect(q, item.given);
    const points = correct ? q.points : 0;
    graded[item.questionId] = { questionId: item.questionId, given: String(item.given || ""), correct, points };
    score += points;
    maxScore += q.points;
    if (correct) correctCount += 1;
  }
  const total = Object.keys(graded).length;
  const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const now = new Date().toISOString();

  // Bump the per-question usage and correctness counters so an admin can see what is hard.
  if (questions.length) {
    for (const q of questions) {
      const answered = graded[q.id];
      q.usage_count = (Number(q.usage_count) || 0) + 1;
      if (answered && answered.correct) q.correct_count = (Number(q.correct_count) || 0) + 1;
    }
    if (practiceRemoteEnabled()) {
      await Promise.all(
        questions.map((q) =>
          postgrest(QUESTIONS, `?id=eq.${encodeURIComponent(q.id)}`, {
            method: PATCH,
            body: { usage_count: q.usage_count, correct_count: q.correct_count }
          })
        )
      );
    } else {
      const store = readLocal();
      store.questions = store.questions.map((existing) => {
        const updated = questions.find((q) => q.id === existing.id);
        return updated ? { ...existing, usage_count: updated.usage_count, correct_count: updated.correct_count } : existing;
      });
      writeLocal(store);
    }
  }

  const attempt: PracticeAttempt = {
    id: newId("att"),
    user_id: input.user_id,
    user_name: input.user_name,
    user_department: input.user_department,
    exam_id: input.exam_id,
    title: input.title,
    mode: input.mode,
    question_ids: ids,
    answers: graded,
    score,
    max_score: maxScore,
    percent,
    correct_count: correctCount,
    total_count: total,
    duration_seconds: Math.max(0, Math.round(Number(input.duration_seconds) || 0)),
    started_at: input.started_at || now,
    submitted_at: now
  };
  if (practiceRemoteEnabled()) {
    await postgrest(ATTEMPTS, "", { method: POST, body: attempt });
  } else {
    const store = readLocal();
    store.attempts.unshift(attempt);
    // Keep the local log from growing without bound.
    if (store.attempts.length > 5000) store.attempts = store.attempts.slice(0, 5000);
    writeLocal(store);
  }
  signal();
  return { attempt, result: { answers: graded, score, max_score: maxScore, percent, correct_count: correctCount, total_count: total, questions } };
}

export async function listAttempts(userId: string, limit = 100): Promise<PracticeAttempt[]> {
  if (practiceRemoteEnabled()) {
    return postgrest<PracticeAttempt>(ATTEMPTS, `?user_id=eq.${encodeURIComponent(userId)}&order=submitted_at.desc&limit=${Math.min(500, limit)}`);
  }
  return readLocal()
    .attempts.filter((a) => a.user_id === userId)
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
    .slice(0, limit);
}

export async function listAllAttempts(limit = 500): Promise<PracticeAttempt[]> {
  if (practiceRemoteEnabled()) {
    return postgrest<PracticeAttempt>(ATTEMPTS, `?order=submitted_at.desc&limit=${Math.min(2000, limit)}`);
  }
  return readLocal()
    .attempts.slice()
    .sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------------- favorites
export async function listFavorites(userId: string): Promise<PracticeFavorite[]> {
  if (practiceRemoteEnabled()) {
    return postgrest<PracticeFavorite>(FAVORITES, `?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=200`);
  }
  return readLocal().favorites.filter((f) => f.user_id === userId);
}

export async function toggleFavorite(userId: string, questionId: string): Promise<boolean> {
  // Returns true when favorited, false when un-favorited.
  if (practiceRemoteEnabled()) {
    const existing = await postgrest<PracticeFavorite>(FAVORITES, `?user_id=eq.${encodeURIComponent(userId)}&question_id=eq.${encodeURIComponent(questionId)}&limit=1`);
    if (existing.length) {
      await postgrest(FAVORITES, `?user_id=eq.${encodeURIComponent(userId)}&question_id=eq.${encodeURIComponent(questionId)}`, { method: DELETE });
      return false;
    }
    await postgrest(FAVORITES, "", { method: POST, body: { user_id: userId, question_id: questionId, created_at: new Date().toISOString() } });
    return true;
  }
  const store = readLocal();
  const at = store.favorites.findIndex((f) => f.user_id === userId && f.question_id === questionId);
  if (at >= 0) {
    store.favorites.splice(at, 1);
    writeLocal(store);
    return false;
  }
  store.favorites.unshift({ user_id: userId, question_id: questionId, created_at: new Date().toISOString() });
  writeLocal(store);
  return true;
}

// ---------------------------------------------------------------------------------- leaderboard
export interface LeaderboardEntry {
  user_id: string;
  name: string;
  department: string;
  avatarUrl?: string;
  total_points: number;
  attempts: number;
  questions_answered: number;
  avg_score: number;
  rank: number;
}

// The leaderboard is computed from real attempts only — never invented. The weekly window is
// the last seven days of submissions.
export async function leaderboard(scope: "overall" | "weekly", usersData: { id: string; name: string; department?: string; avatarUrl?: string }[] = [], limit = 50): Promise<LeaderboardEntry[]> {
  const all = await listAllAttempts(5000);
  const cutoff = scope === "weekly" ? Date.now() - 7 * 86_400_000 : 0;
  const rows = all.filter((a) => Date.parse(a.submitted_at) >= cutoff);
  const byUser = new Map<string, { user_id: string; name: string; department: string; total_points: number; attempts: number; questions_answered: number; score_sum: number }>();
  const profileById = new Map(usersData.map((u) => [u.id, u]));
  for (const a of rows) {
    const profile = profileById.get(a.user_id);
    const key = a.user_id;
    const entry = byUser.get(key) || {
      user_id: a.user_id,
      name: profile?.name || a.user_name || "Student",
      department: profile?.department || a.user_department || "",
      total_points: 0,
      attempts: 0,
      questions_answered: 0,
      score_sum: 0
    };
    entry.total_points += a.score;
    entry.attempts += 1;
    entry.questions_answered += a.total_count;
    entry.score_sum += a.percent;
    byUser.set(key, entry);
  }
  const ranked = Array.from(byUser.values())
    .map((e) => ({
      user_id: e.user_id,
      name: e.name,
      department: e.department,
      avatarUrl: profileById.get(e.user_id)?.avatarUrl,
      total_points: e.total_points,
      attempts: e.attempts,
      questions_answered: e.questions_answered,
      avg_score: e.attempts ? Math.round(e.score_sum / e.attempts) : 0
    }))
    .sort((a, b) => b.total_points - a.total_points || b.avg_score - a.avg_score || b.attempts - a.attempts)
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
  return ranked;
}

// ---------------------------------------------------------------------------------- stats (admin overview)
export async function practiceStats(): Promise<{
  questions: number;
  published_questions: number;
  drafts: number;
  exams: number;
  published_exams: number;
  attempts: number;
  weekly_attempts: number;
}> {
  const [questions, exams, attempts] = await Promise.all([listQuestions({ status: "any", limit: 5000 }), listExams({ status: "any", limit: 500 }), listAllAttempts(5000)]);
  return {
    questions: questions.length,
    published_questions: questions.filter((q) => q.status === "published").length,
    drafts: questions.filter((q) => q.status === "draft").length,
    exams: exams.length,
    published_exams: exams.filter((e) => e.status === "published").length,
    attempts: attempts.length,
    weekly_attempts: attempts.filter((a) => Date.parse(a.submitted_at) >= Date.now() - 7 * 86_400_000).length
  };
}
