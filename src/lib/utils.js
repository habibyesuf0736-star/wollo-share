export const DEFAULT_SUBCATEGORIES = [
  "Video Lectures",
  "Lecture Notes",
  "Past Exams & Quizzes",
  "Lab Manuals",
  "Slides & Presentations",
  "Assignments & Projects"
];

export const MATERIAL_TYPES = ["PDF", "PPT", "DOC", "XLS", "Video", "Other"];

export function sanitizeCourseCode(rawIcon, courseName = "") {
  const cleaned = String(rawIcon || "").replace(/[^\x20-\x7E]/g, "").trim();
  if (cleaned) return cleaned.toUpperCase();
  const words = String(courseName || "COURSE").trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(courseName || "COURSE").slice(0, 4).toUpperCase();
}

export function buildProgramSemesterLabels(durationYears) {
  const labels = [];
  for (let year = 1; year <= durationYears; year++) {
    labels.push(`Year ${year} · First Semester`);
    labels.push(`Year ${year} · Second Semester`);
  }
  return labels;
}

export function getCourseSemesterEntries(course) {
  const labels =
    Array.isArray(course.semesters) && course.semesters.length
      ? course.semesters
      : buildProgramSemesterLabels(Number(course.durationYears) || 4);
  const defYear = course.defaultYear || "Year 1";
  return labels.map((label) => {
    const m = /^Year (\d+) · (.+)$/.exec(label);
    return m ? { label, year: `Year ${m[1]}`, sem: m[2] } : { label, year: defYear, sem: label };
  });
}

export function formatMaterialTerm(material) {
  const semester = String(material.semester || "First Semester").replace(/^Year \d+ · /, "");
  return `${material.year || "Year 1"} · ${semester}`;
}

export function doesDocumentMatchQuery(course, mat, rawQuery) {
  if (!rawQuery) return true;
  const cleanQuery = String(rawQuery).trim().toLowerCase();
  if (!cleanQuery) return true;

  const rawTitle = (mat.name || "").toLowerCase();
  const normalizedTitle = rawTitle.replace(/[_\-.]+/g, " ");
  const fileFormat = (mat.type || "").toLowerCase();
  const fileExt = rawTitle.includes(".") ? rawTitle.split(".").pop() : "";
  const formatSynonyms =
    {
      pdf: "pdf document portable",
      ppt: "ppt pptx powerpoint presentation slides",
      doc: "doc docx word document",
      xls: "xls xlsx csv excel spreadsheet",
      video: "video mp4 lecture recording",
      other: "other zip archive file"
    }[fileFormat] || "";

  const haystack = [
    rawTitle,
    normalizedTitle,
    (mat.subcategory || "Lecture Notes").toLowerCase(),
    (mat.year || (course && course.defaultYear) || "Year 1").toLowerCase(),
    (mat.semester || "First Semester").toLowerCase(),
    (mat.department || (course && course.name) || "").toLowerCase(),
    ((course && course.name) || "").toLowerCase(),
    ((course && course.icon) || "").toLowerCase(),
    fileFormat,
    fileExt,
    formatSynonyms,
    (mat.sideMaterials || []).map((sm) => `${sm.name || ""} ${sm.type || ""}`).join(" ").toLowerCase()
  ].join(" ");

  if (haystack.includes(cleanQuery)) return true;
  return cleanQuery.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
}

export function extractYouTubeVideoId(url) {
  if (!url || typeof url !== "string") return null;
  const regExp =
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
  const match = url.match(regExp);
  return match && match[1] ? match[1] : null;
}

export function buildDownloadHref(material) {
  if (material.url && !material.url.startsWith("#sample")) return material.url;
  const content = `Wollo Share Course Material
File: ${material.name}
Year: ${material.year || "Year 1"}
Subcategory: ${material.subcategory || "Lecture Notes"}
Type: ${material.type}
Size: ${material.size}
Downloaded from Wollo Share Course Materials Library.`;
  return "data:text/plain;charset=utf-8," + encodeURIComponent(content);
}

export function buildSideDownloadHref(sideMat, parentMat) {
  if (sideMat.url && !sideMat.url.startsWith("#sample")) return sideMat.url;
  const content = `Wollo Share Companion Material
Video Lesson: ${parentMat ? parentMat.name : "Lesson"}
Material: ${sideMat.name}
Format: ${sideMat.type || "PDF"}
Size: ${sideMat.size || "1.4 MB"}
Downloaded from Wollo Share Resources.`;
  return "data:text/plain;charset=utf-8," + encodeURIComponent(content);
}

export function triggerBrowserDownload(href, fileName) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.rel = "noopener noreferrer";
  const remote = /^https?:\/\//i.test(href) && !href.startsWith(window.location.origin);
  const looksLikeFile = /\.(pdf|zip|rar|7z|docx?|pptx?|xlsx?|jpe?g|png|mp4|mkv|webm|txt)(\?|#|$)/i.test(href);
  if (remote && !looksLikeFile) {
    // A cross-origin link cannot be forced into a file save, so open it honestly
    // instead of showing a download that does nothing.
    anchor.target = "_blank";
  } else {
    anchor.download = fileName || "wollo-share-material";
    anchor.target = remote ? "_blank" : "_self";
  }
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function buildPlaceholderDataUrl(file, formattedSize) {
  if (!file) return null;
  const safeMime = file.type || "application/octet-stream";
  const fileName = file.name || "uploaded-material";
  return `data:${safeMime};charset=utf-8,${encodeURIComponent(
    `Wollo Share Uploaded Material\nFile: ${fileName}\nSize: ${formattedSize || "1.0 MB"}\nType: ${safeMime}`
  )}`;
}

export function readSmallFileAsDataUrl(file, limitBytes = 250 * 1024) {
  if (!file || file.size <= 0 || file.size > limitBytes || typeof FileReader === "undefined") {
    return Promise.resolve(buildPlaceholderDataUrl(file, formatFileSize(file ? file.size : 0)));
  }
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(buildPlaceholderDataUrl(file, formatFileSize(file.size)));
    reader.readAsDataURL(file);
  });
}

export function typeFromFileName(fileName) {
  const ext = String(fileName || "").split(".").pop().toLowerCase();
  if (ext === "pdf") return "PDF";
  if (["ppt", "pptx"].includes(ext)) return "PPT";
  if (["doc", "docx"].includes(ext)) return "DOC";
  if (["xls", "xlsx", "csv"].includes(ext)) return "XLS";
  if (["mp4", "mkv", "webm", "mov"].includes(ext)) return "Video";
  return "Other";
}

export function formatFileSize(bytes) {
  const kb = Number(bytes) / 1024;
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(kb))} KB`;
}

export function materialTypeClass(type) {
  return MATERIAL_TYPES.includes(type) ? type : "Other";
}

export function courseAverageRating(course) {
  const rated = (course.materials || []).filter(
    (m) => !m.hidden && typeof m.ratingAvg === "number" && m.ratingAvg > 0
  );
  if (!rated.length) return null;
  return rated.reduce((sum, m) => sum + m.ratingAvg, 0) / rated.length;
}

export function courseSemesterSummary(course) {
  const durationYears = Number(course.durationYears) || 0;
  if (Array.isArray(course.years) && course.years.length === 1 && durationYears > 1) return course.years[0];
  if (durationYears > 1) return `Year 1–${durationYears} · ${durationYears * 2} Semesters`;
  if (durationYears === 1) return "Year 1 · 2 Semesters";
  const years = new Set([course.defaultYear, ...(course.materials || []).map((m) => m.year)].filter(Boolean));
  return Array.from(years).sort().join(", ") || "All Years";
}

export function fileCountsByType(course) {
  const counts = {};
  (course.materials || [])
    .filter((m) => !m.hidden)
    .forEach((m) => {
      const t = m.type || "File";
      counts[t] = (counts[t] || 0) + 1;
    });
  return Object.entries(counts);
}

export function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

export function parseStamp(ts) {
  if (!ts) return null;
  const text = String(ts);
  if (text === "Active now") return new Date();
  const normalized = text.includes("T") ? text : text.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function initialsOf(name) {
  return String(name || "WU")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}
