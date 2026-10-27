// Search-engine metadata for the running app. Google renders the SPA, so the page a
// crawler lands on has to carry its own title, description and canonical address.
export const SITE_ORIGIN = "https://wollo-share.vercel.app";
export const SITE_NAME = "Wollo Share";

function setText(selector, attr, value) {
  const el = document.querySelector(selector);
  if (el && value) el.setAttribute(attr, value);
}

export function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[&]/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

// "General Physics (Phys1011)" -> "general-physics-phys1011"; ids stay the fallback.
export function courseSlug(course) {
  return slugify(course && course.name) || String((course && course.id) || "");
}

export function findCourseBySlug(courses, slug) {
  const needle = String(slug || "").toLowerCase();
  if (!needle) return null;
  const list = courses || [];
  return list.find((course) => String(course.id).toLowerCase() === needle)
    || list.find((course) => courseSlug(course) === needle)
    || null;
}

function describeCourse(course) {
  const materials = (course.materials || []).filter((mat) => !mat.hidden);
  const kinds = Array.from(new Set(materials.map((mat) => mat.subcategory || mat.type).slice(0, 4)));
  const names = materials.slice(0, 6).map((mat) => mat.name);
  const where = course.college ? `${course.college}, Wollo University` : "Wollo University";
  const parts = [];
  parts.push(
    materials.length
      ? `${materials.length} downloadable PDF, slide and exam files for ${course.name} at ${where}`
      : `Lecture notes, slides, past exams and lab manuals PDFs for ${course.name} at ${where}`
  );
  if (kinds.length) parts.push(`covering ${kinds.join(", ")}`);
  if (names.length) parts.push(`including ${names.join(", ")}`);
  return parts.join(", ").slice(0, 300);
}

export function applyPageSeo({ title, description, path, noindex }) {
  const url = path && /^https?:\/\//.test(path) ? path : `${SITE_ORIGIN}${path && path !== "/" ? path : "/"}`;
  document.title = title;
  setText('meta[name="description"]', "content", description);
  setText('link[rel="canonical"]', "href", url);
  setText('meta[property="og:title"]', "content", title);
  setText('meta[property="og:description"]', "content", description);
  setText('meta[property="og:url"]', "content", url);
  setText('meta[name="twitter:title"]', "content", title);
  setText('meta[name="twitter:description"]', "content", description);
  if (noindex) {
    let el = document.querySelector('meta[name="robots"]');
    if (el) el.setAttribute("content", "noindex, nofollow");
  } else {
    const el = document.querySelector('meta[name="robots"]');
    if (el && el.getAttribute("content") === "noindex, nofollow") el.setAttribute("content", "index, follow");
  }
}

export function seoForCourse(course) {
  // The course name already carries its code in the "(PHYS1011)" suffix when one exists.
  const label = String(course.name || "Course").trim();
  return {
    path: `/c/${courseSlug(course)}`,
    title: `${label} — Wollo University notes, slides & past exam PDFs | ${SITE_NAME}`,
    description: describeCourse(course)
  };
}

export const LIBRARY_SEO = {
  path: "/",
  title: `${SITE_NAME} — Wollo University Course Materials, Past Exams & Notes PDFs`,
  description:
    "Free Wollo University student library: download lecture notes, slide decks, past exam PDFs, lab manuals and assignment solutions by college, program, year and semester — from Common Freshman courses to graduation."
};
