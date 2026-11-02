// Practice & examination: shared constants and small helpers the page and the admin panel
// both need. The grading itself happens on the server; these only describe what a question is
// and how to display one.

export const QUESTION_KINDS = [
  ["mcq", "Multiple choice"],
  ["truefalse", "True or false"],
  ["short", "Short answer"]
];

export const QUESTION_STATUSES = [
  ["draft", "Draft"],
  ["published", "Published"]
];

export const EXAM_REVEAL = [
  ["after_submit", "Reveal answers after submit"],
  ["always", "Reveal while answering (practice)"],
  ["never", "Never reveal"]
];

export const LEADERBOARD_SCOPES = [
  ["overall", "All time"],
  ["weekly", "This week"]
];

export function kindLabel(kind) {
  return (QUESTION_KINDS.find((entry) => entry[0] === kind) || [, kind])[1] || kind;
}

export function statusLabel(status) {
  return (QUESTION_STATUSES.find((entry) => entry[0] === status) || [, status])[1] || status;
}

export function revealLabel(value) {
  return (EXAM_REVEAL.find((entry) => entry[0] === value) || [, value])[1] || value;
}

export function newQuestion(seed = {}) {
  return {
    id: "",
    course_id: null,
    college: "",
    department: "",
    program: "",
    academic_year: "",
    semester: "",
    chapter: "",
    category: "General",
    kind: "mcq",
    body: "",
    image: null,
    options: ["", "", "", ""],
    correct_answer: "",
    explanation: "",
    points: 1,
    status: "draft",
    ...seed
  };
}

export function newExam(seed = {}) {
  return {
    id: "",
    title: "",
    description: "",
    course_id: null,
    college: "",
    department: "",
    program: "",
    academic_year: "",
    semester: "",
    chapter: "",
    category: "",
    question_ids: [],
    question_count: 0,
    duration_minutes: 0,
    shuffle: false,
    show_answers: "after_submit",
    status: "draft",
    ...seed
  };
}

// A short answer normalises the same way the server does, so a client-side preview of
// "would this be correct?" matches what the grader returns. Used only for showing ticks
// while a student is reviewing their own attempt.
export function normalizeShort(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function optionLetter(index) {
  return String.fromCharCode(65 + index);
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  if (minutes <= 0) return `${secs}s`;
  return `${minutes}m ${String(secs).padStart(2, "0")}s`;
}

export function rankMedal(rank) {
  if (rank === 1) return "#ffd24a";
  if (rank === 2) return "#c9ccd4";
  if (rank === 3) return "#cd7f4a";
  return "transparent";
}
