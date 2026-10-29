// Build-time SEO prerender. `vite build` emits a single shell, so every /c/<slug> URL used to
// answer with the homepage metadata and Google could index none of the catalog. This step writes
// one static HTML page per program and per college into dist/ after the bundle exists; Vercel
// serves those files from outputDirectory: dist and only rewrites to /index.html when nothing
// matches, so the pages go live without any routing change.
//
// Slugs, titles and descriptions come from src/lib/seo.js so the static page and the SPA always
// agree — the client overwrites the head with the same values once React mounts.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { courseSlug, SITE_NAME, SITE_ORIGIN, slugify, seoForCourse } from "../src/lib/seo.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const SHELL = path.join(DIST, "index.html");
const DB_FILE = path.join(ROOT, "data/wollo-db.json");
const REMOTE_TIMEOUT_MS = Number(process.env.WOLLO_PRERENDER_TIMEOUT_MS || 20000);

type Material = {
  id?: string;
  name?: string;
  url?: string;
  size?: string;
  type?: string;
  year?: string;
  semester?: string;
  subcategory?: string;
  hidden?: boolean;
};

type Course = {
  id: string;
  name?: string;
  code?: string;
  college?: string;
  description?: string;
  restricted?: boolean;
  subcategories?: string[];
  materials?: Material[];
};

type StateDoc = { coursesData?: Course[] };

const written: string[] = [];

// ---------- data ----------

// The Evangadi pack is sold by that provider, so it never belongs to the public catalog.
// Mirrors isEvangadiCourse() in server.ts.
function isEvangadiCourse(course: { id?: unknown; name?: unknown }): boolean {
  return String(course.id || "") === "course-evangadi" || /evangadi/i.test(String(course.name || ""));
}

function readLocalDoc(): StateDoc {
  if (!fs.existsSync(DB_FILE)) throw new Error(`missing data file: ${DB_FILE}`);
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8")) as StateDoc;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// Production (Vercel) reads the live catalog out of Supabase; anything else, including a network
// hiccup, falls back to the committed snapshot so a build can never fail on data access.
async function loadDoc(): Promise<{ doc: StateDoc; source: string }> {
  if (process.env.WOLLO_STATE_STORE === "supabase") {
    try {
      const { loadRemoteState } = await import("../stateStore.ts");
      const remote = await withTimeout(Promise.resolve(loadRemoteState()), REMOTE_TIMEOUT_MS);
      if (remote && typeof remote === "object") {
        return { doc: remote as StateDoc, source: `supabase (after ${REMOTE_TIMEOUT_MS}ms cap)` };
      }
      console.warn("[prerender-seo] Supabase returned no document, using data/wollo-db.json");
    } catch (err: any) {
      console.warn(`[prerender-seo] Supabase read failed (${err?.message || err}), using data/wollo-db.json`);
    }
    return { doc: readLocalDoc(), source: "data/wollo-db.json (after a remote attempt)" };
  }
  return { doc: readLocalDoc(), source: "data/wollo-db.json" };
}

// ---------- escaping ----------

// Text nodes and attribute values share one escaper: & < > " are the only characters that can
// break the markup we emit, and attributes are always double-quoted.
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// JSON.stringify already handles quotes; the extra pass keeps a "</script>" inside a title from
// closing the ld+json block early.
function jsonLd(graph: unknown): string {
  return `<script type="application/ld+json">\n  ${JSON.stringify(graph).replace(/</g, "\\u003c")}\n  </script>`;
}

// ---------- head ----------

const shell = fs.existsSync(SHELL) ? fs.readFileSync(SHELL, "utf-8") : "";
if (!shell) {
  console.error(`[prerender-seo] ${path.relative(ROOT, SHELL)} is missing — run "vite build" first.`);
  process.exit(1);
}

const headOpen = shell.indexOf("<head");
const headClose = shell.indexOf("</head>");
if (headOpen < 0 || headClose < 0) {
  console.error(`[prerender-seo] ${path.relative(ROOT, SHELL)} has no <head> block to copy from.`);
  process.exit(1);
}

// A hand-run second pass must not inherit the previous injection, so the shell is cleaned first.
const CATALOG = /<!-- wollo-prerender:catalog-start -->[\s\S]*?<!-- wollo-prerender:catalog-end -->/;
const source = CATALOG.test(shell) ? shell.replace(CATALOG, "") : shell;

// Vite's own head (module script, font links, favicon) is copied verbatim into every generated
// page; the homepage JSON-LD is dropped so each page only carries its own schema graph.
const rawHead = source.slice(headOpen, headClose + "</head>".length);
const BASE_HEAD = rawHead.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "");

// Rewrites one attribute of the first tag matching `pattern`.
function setAttr(head: string, pattern: RegExp, attr: string, value: string): string {
  const match = head.match(pattern);
  if (!match) return head;
  const hasAttr = new RegExp(`\\b${attr}="[^"]*"`, "i").test(match[0]);
  const updated = hasAttr
    ? match[0].replace(new RegExp(`\\b${attr}="[^"]*"`, "i"), `${attr}="${esc(value)}"`)
    : match[0].replace(/<\w+/, (tag) => `${tag} ${attr}="${esc(value)}"`);
  return head.replace(pattern, () => updated);
}

// Replaces a head tag in place, or appends it when the shell did not carry one. The address tag
// is a <link href>, every other one is a <meta content>.
function upsertTag(head: string, find: RegExp, build: (value: string) => string, attr: string, value: string): string {
  return find.test(head) ? setAttr(head, find, attr, value) : head.replace("</head>", `  ${build(value)}\n</head>`);
}

function meta(attrs: string, value: string): string {
  return `<meta ${attrs} content="${esc(value)}" />`;
}

function absoluteUrl(pagePath: string): string {
  return `${SITE_ORIGIN}${pagePath === "/" ? "/" : pagePath}`;
}

const TITLE_TAG = /<title>[\s\S]*?<\/title>/i;
const DESCRIPTION_TAG = /<meta\b[^>]*name="description"[^>]*>/i;
const ROBOTS_TAG = /<meta\b[^>]*name="robots"[^>]*>/i;
const CANONICAL_TAG = /<link\b[^>]*rel="canonical"[^>]*>/i;

function headFor(pagePath: string, seo: { title: string; description: string }): string {
  const url = absoluteUrl(pagePath);
  let head = BASE_HEAD.replace(TITLE_TAG, () => `<title>${esc(seo.title)}</title>`);
  head = upsertTag(head, DESCRIPTION_TAG, (value) => meta('name="description"', value), "content", seo.description);
  head = upsertTag(head, ROBOTS_TAG, () => meta('name="robots"', "index, follow"), "content", "index, follow");
  head = upsertTag(
    head,
    CANONICAL_TAG,
    (value) => `<link rel="canonical" href="${esc(value)}" />`,
    "href",
    url
  );
  for (const [attrs, value] of [
    ['property="og:title"', seo.title],
    ['property="og:description"', seo.description],
    ['property="og:url"', url],
    ['name="twitter:title"', seo.title],
    ['name="twitter:description"', seo.description]
  ] as const) {
    head = upsertTag(head, new RegExp(`<meta\\b[^>]*${attrs}[^>]*>`, "i"), (content) => meta(attrs, content), "content", value);
  }
  return head;
}

// The shell's empty root div becomes the crawlable body; everything else in the document —
// including Vite's <script type="module"> — is left exactly as the bundler wrote it.
function page(head: string, body: string, schema: unknown): string {
  const open = source.indexOf('<div id="root"');
  if (open < 0) {
    console.error('[prerender-seo] dist/index.html has no <div id="root"> — refusing to guess where to inject.');
    process.exit(1);
  }
  const html = `${source.slice(0, headOpen)}${head}${source.slice(headClose + "</head>".length)}`;
  const rootOpen = html.indexOf('<div id="root"');
  const rootEnd = html.indexOf(">", rootOpen) + 1;
  return `${html.slice(0, rootEnd)}\n${body}\n    ${html.slice(rootEnd)}`.replace(
    "</head>",
    () => `  ${jsonLd(schema)}\n</head>`
  );
}

// ---------- prose ----------

// Students browse without academic years, so "— 4 years · 8 semesters." never reaches a page and
// neither does a "Year N" label (the same tail the client strips in programBlurb(), utils.js).
function blurbFor(course: Course): string {
  return String(course.description || "")
    .replace(/\s*[—–-]\s*\d+\s*years?\s*·\s*\d+\s*semesters?\s*\.?\s*$/i, "")
    .trim();
}

function termFor(material: Material): string {
  const semester = String(material.semester || "").replace(/^Year\s*\d+\s*[·-]\s*/i, "").trim();
  return /^year\s*\d+$/i.test(semester) ? "" : semester;
}

function visibleMaterials(course: Course): Material[] {
  return (course.materials || []).filter((mat) => !mat.hidden);
}

function isDownloadable(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//");
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function kindList(course: Course, materials: Material[]): string[] {
  const fromFiles = materials.map((mat) => String(mat.subcategory || mat.type || "").trim());
  const declared = materials.length ? [] : (course.subcategories || []).map((s) => String(s).trim());
  const cleaned: string[] = [];
  for (const raw of fromFiles.concat(declared)) {
    const lowered = raw.toLowerCase();
    if (!lowered) continue;
    if (!cleaned.some((c) => c.toLowerCase() === lowered)) cleaned.push(raw);
  }
  return cleaned;
}

function joinKinds(kinds: string[]): string {
  if (kinds.length <= 1) return kinds[0] || "";
  return `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`;
}

// Search-intent sentence; every number in it comes from the same list rendered below.
function intentSentence(course: Course, materials: Material[], downloads: Material[]): string {
  const name = String(course.name || "this program").trim();
  const college = String(course.college || "").trim();
  const where = college ? ` in ${college} at Wollo University` : " at Wollo University";
  const kinds = kindList(course, materials);
  const kindPhrase = kinds.length ? joinKinds(kinds.map((k) => k.toLowerCase())) : "lecture notes, slides and past exam PDFs";
  const asPdf = downloads.length > 0 && downloads.every((mat) => /pdf/i.test(String(mat.type || ""))) ? " as PDFs" : "";
  const listed = plural(materials.length, "file");
  const verb = materials.length === 1 ? "is" : "are";
  if (!materials.length) {
    return `${name}${where}: ${cap(kindPhrase)} are collected in one place on ${SITE_NAME}. No files are attached to this program yet, so new ${kindPhrase} show up here as students and staff add them.`;
  }
  if (!downloads.length) {
    return `Download Wollo University ${name} ${kindPhrase} on ${SITE_NAME}. ${cap(listed)} ${verb} listed for this program and opens to registered students after they sign in.`;
  }
  const gated = materials.length - downloads.length;
  const availability = gated
    ? `${cap(listed)} ${verb} available for free to registered students — ${plural(downloads.length, "direct download")} plus ${plural(gated, "item")} that opens after a sign-in.`
    : `${cap(listed)} ${verb} available for free to registered students as ${plural(downloads.length, "direct download")}.`;
  return `Download Wollo University ${name} ${kindPhrase}${asPdf} on ${SITE_NAME}. ${availability}`;
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function materialItem(material: Material): string {
  const label = esc(material.name || "Untitled file");
  const details = [material.type, material.size, termFor(material), material.subcategory]
    .map((v) => String(v || "").trim())
    .filter((v, index, all) => v && all.indexOf(v) === index);
  const tail = details.length ? ` <span class="wollo-material-meta">(${esc(details.join(" · "))})</span>` : "";
  // Only real public files under public/ (and therefore dist/) become hrefs; YouTube links and
  // gated uploads are named, never given an invented address.
  return isDownloadable(material.url)
    ? `<li><a href="${esc(material.url)}">${label}</a>${tail}</li>`
    : `<li>${label}${tail}</li>`;
}

// ---------- schema ----------

const PDF_FORMATS: Record<string, string> = {
  PDF: "application/pdf",
  PPT: "application/vnd.ms-powerpoint",
  DOC: "application/msword",
  XLS: "application/vnd.ms-excel"
};

function providerNode() {
  return { "@type": "EducationalOrganization", name: "Wollo University", url: `${SITE_ORIGIN}/` };
}

function breadcrumbFor(pagePath: string, steps: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(pagePath)}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_ORIGIN}/` },
      ...steps.map((step, index) => ({
        "@type": "ListItem",
        position: index + 2,
        name: step.name,
        item: absoluteUrl(step.path)
      }))
    ]
  };
}

function courseSchema(course: Course, materials: Material[], downloads: Material[], pagePath: string, seo: { title: string; description: string }) {
  const url = absoluteUrl(pagePath);
  const courseNode: Record<string, unknown> = {
    "@type": "Course",
    "@id": `${url}#course`,
    name: String(course.name || "Course").trim(),
    description: seo.description,
    url,
    inLanguage: "en",
    isAccessibleForFree: true,
    provider: providerNode()
  };
  if (downloads.length) {
    courseNode.hasPart = downloads.map((mat) => ({
      "@type": "LearningResource",
      name: String(mat.name || "File"),
      url: absoluteUrl(String(mat.url)),
      inLanguage: "en",
      ...(PDF_FORMATS[String(mat.type || "").toUpperCase()]
        ? { encodingFormat: PDF_FORMATS[String(mat.type || "").toUpperCase()] }
        : {})
    }));
  }
  const itemList = materials.map((mat, index) => ({
    "@type": "ListItem",
    position: index + 1,
    item: {
      "@type": "LearningResource",
      name: String(mat.name || "File"),
      ...(isDownloadable(mat.url) ? { url: absoluteUrl(mat.url) } : { url }),
      ...(mat.subcategory ? { additionalType: String(mat.subcategory) } : {})
    }
  }));
  return {
    "@context": "https://schema.org",
    "@graph": [
      courseNode,
      breadcrumbFor(pagePath, course.college ? [{ name: course.college, path: collegePath(course.college) }] : []),
      { "@type": "ItemList", "@id": `${url}#files`, name: `${course.name} files`, itemListElement: itemList }
    ]
  };
}

// ---------- paths ----------

function collegePath(college: string): string {
  return `/college/${slugify(college)}`;
}

// Two programs named "Physics" would collide on /c/physics, so later duplicates carry their id
// and each one keeps its own file instead of overwriting the first.
function buildCoursePaths(courses: Course[]): Map<string, string> {
  const paths = new Map<string, string>();
  for (const course of courses) {
    const base = courseSlug(course);
    if (!base) continue;
    let pagePath = `/c/${base}`;
    if (paths.has(pagePath)) {
      pagePath = `/c/${base}-${slugify(course.id) || course.id}`;
      let index = 2;
      while (paths.has(pagePath)) pagePath = `/c/${base}-${slugify(course.id) || course.id}-${index++}`;
    }
    paths.set(pagePath, course.id);
  }
  return paths;
}

// ---------- emit ----------

function writePage(file: string, html: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, "utf-8");
  written.push(path.relative(ROOT, file));
}

const { doc, source: dataSource } = await loadDoc();
const allCourses = Array.isArray(doc.coursesData) ? doc.coursesData : [];
const courses = allCourses.filter((course) => course && !isEvangadiCourse(course));

const pathByPage = buildCoursePaths(courses);
const pageByCourse = new Map<string, string>();
for (const [pagePath, id] of pathByPage) if (!pageByCourse.has(id)) pageByCourse.set(id, pagePath);

// A material href is only worth printing if Vite actually shipped the file.
const missingDownloads: string[] = [];

function shippedInDist(url: string): boolean {
  try {
    const clean = decodeURIComponent(url.split("?")[0].split("#")[0]).replace(/^\/+/, "");
    return fs.existsSync(path.join(DIST, clean));
  } catch {
    return false;
  }
}

for (const course of courses) {
  const pagePath = pageByCourse.get(course.id);
  if (!pagePath) continue;
  const materials = visibleMaterials(course);
  const downloads = materials.filter((mat) => isDownloadable(mat.url));
  const seo = seoForCourse(course);
  const college = String(course.college || "").trim();
  const collegeHref = college ? collegePath(college) : "";

  for (const mat of downloads) {
    if (!shippedInDist(String(mat.url))) missingDownloads.push(`${pagePath} -> ${mat.url}`);
  }

  const blurb = blurbFor(course);
  const crumbs = [`<a href="/">${esc(SITE_NAME)}</a>`];
  if (college) crumbs.push(`<a href="${esc(collegeHref)}">${esc(college)}</a>`);
  crumbs.push(esc(String(course.name || "Program")));

  const body = `
      <main class="wollo-prerender">
        <nav aria-label="Breadcrumb">${crumbs.join(" &rsaquo; ")}</nav>
        <h1>${esc(String(course.name || "Program"))}</h1>
        <p class="wollo-college">${college ? `${esc(college)} · Wollo University` : "Wollo University"}</p>
        ${blurb ? `<p>${esc(blurb)}</p>` : ""}
        <p>${esc(intentSentence(course, materials, downloads))}</p>
        <h2>${materials.length ? `Files for ${esc(String(course.name || "this program"))}` : "Files"}</h2>
        ${materials.length ? `<ul class="wollo-materials">\n        ${materials.map(materialItem).join("\n        ")}\n        </ul>` : `<p>${esc(String(course.name || "This program"))} has no files listed yet.</p>`}
        <p class="wollo-links">
          ${college ? `<a href="${esc(collegeHref)}">All programs in ${esc(college)}</a>` : ""}
          <a href="/">Back to the ${esc(SITE_NAME)} library</a>
        </p>
        <noscript>${esc(SITE_NAME)} needs JavaScript to open downloads; the program, college and file list above stay readable without it.</noscript>
      </main>`;

  writePage(path.join(DIST, pagePath.slice(1), "index.html"), page(headFor(pagePath, seo), body, courseSchema(course, materials, downloads, pagePath, seo)));
}

// One page per college/school/institute: the program list is the indexable content.
const grouped = new Map<string, Course[]>();
for (const course of courses) {
  const college = String(course.college || "").trim();
  if (!college) continue;
  const list = grouped.get(college) || [];
  list.push(course);
  grouped.set(college, list);
}

type CollegePage = { name: string; path: string; courses: Course[] };
const byPath = new Map<string, CollegePage>();
const collegePages: CollegePage[] = [];

for (const [college, list] of grouped) {
  const pagePath = collegePath(college);
  if (!pagePath.slice("/college/".length)) continue;
  const existing = byPath.get(pagePath);
  if (existing) {
    // "College of X" and "School of X" can slug alike; they share one page instead of overwriting.
    console.warn(`[prerender-seo] "${college}" and "${existing.name}" share the slug ${pagePath} — merged`);
    existing.courses.push(...list);
    continue;
  }
  const entry: CollegePage = { name: college, path: pagePath, courses: [...list] };
  byPath.set(pagePath, entry);
  collegePages.push(entry);
}

const linkedCourses = new Set<string>(collegePages.flatMap((entry) => entry.courses.map((course) => course.id)));

// Programs whose college is missing still need an inbound link, or the crawl graph drops them.
function orphanSection(): string {
  const orphans = courses.filter((course) => pageByCourse.has(course.id) && !linkedCourses.has(course.id));
  if (!orphans.length) return "";
  return `        <section class="wollo-catalog-college">
          <h3>Other programs</h3>
          <ul>
${orphans
  .map((course) => {
    const href = pageByCourse.get(course.id);
    return href ? `            <li><a href="${esc(href)}">${esc(String(course.name || course.id))}</a></li>` : "";
  })
  .join("\n")}
          </ul>
        </section>`;
}

for (const entry of collegePages) {
  const { name: college, path: pagePath, courses: list } = entry;
  const slug = pagePath.slice("/college/".length);

  const fileCount = list.reduce((sum, course) => sum + visibleMaterials(course).length, 0);
  const names = list.slice(0, 8).map((course) => String(course.name || "").trim()).filter(Boolean);
  const title = `${college} — Wollo University programs, notes & past exam PDFs | ${SITE_NAME}`;
  const description = `${college} at Wollo University: ${plural(list.length, "program")} and ${plural(fileCount, "file")} on ${SITE_NAME}${names.length ? `, including ${names.join(", ")}` : ""}.`.slice(0, 300);

  const body = `
      <main class="wollo-prerender">
        <nav aria-label="Breadcrumb"><a href="/">${esc(SITE_NAME)}</a> &rsaquo; ${esc(college)}</nav>
        <h1>${esc(college)}</h1>
        <p>${esc(`${plural(list.length, "program")} with ${plural(fileCount, "file")} listed on ${SITE_NAME}.`)}</p>
        <h2>Programs</h2>
        <ul class="wollo-programs">
${list
  .map((course) => {
    const href = pageByCourse.get(course.id);
    if (!href) return "";
    const count = visibleMaterials(course).length;
    return `          <li><a href="${esc(href)}">${esc(String(course.name || course.id))}</a>${count ? ` <span class="wollo-material-meta">(${esc(plural(count, "file"))})</span>` : ""}</li>`;
  })
  .filter(Boolean)
  .join("\n")}
        </ul>
        <p class="wollo-links"><a href="/">Back to the ${esc(SITE_NAME)} library</a></p>
        <noscript>${esc(SITE_NAME)} needs JavaScript to open downloads; the program list above stays readable without it.</noscript>
      </main>`;

  const items = list
    .map((course) => {
      const href = pageByCourse.get(course.id);
      return href ? { name: String(course.name || course.id), url: absoluteUrl(href) } : null;
    })
    .filter(Boolean) as { name: string; url: string }[];

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        "@id": `${absoluteUrl(pagePath)}#programs`,
        name: college,
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: { "@type": "Course", name: item.name, url: item.url }
        }))
      },
      breadcrumbFor(pagePath, [{ name: college, path: pagePath }])
    ]
  };

  writePage(path.join(DIST, "college", slug, "index.html"), page(headFor(pagePath, { title, description }), body, schema));
}

// Home shell: keep every head tag Vite produced and make the crawl graph complete by listing
// each college and program as a real link inside #root.
const catalog = `
      <!-- wollo-prerender:catalog-start -->
      <section class="wollo-catalog" aria-label="Wollo University colleges and programs">
        <h2>${esc(`${SITE_NAME} catalog — Wollo University materials by college and program`)}</h2>
        <p>${esc(`Files on ${SITE_NAME} are grouped by college, school or institute and then by program, so each degree page keeps its own lecture notes, slides, lab manuals and past exam PDFs together. Pick a program below to open its page.`)}</p>
${collegePages
  .map(
    (entry) => `        <section class="wollo-catalog-college">
          <h3><a href="${esc(entry.path)}">${esc(entry.name)}</a> <span class="wollo-material-meta">(${esc(plural(entry.courses.length, "program"))})</span></h3>
          <ul>
${entry.courses
  .map((course) => {
    const href = pageByCourse.get(course.id);
    return href ? `            <li><a href="${esc(href)}">${esc(String(course.name || course.id))}</a></li>` : "";
  })
  .filter(Boolean)
  .join("\n")}
          </ul>
        </section>`
  )
  .join("\n")}
${orphanSection()}
      </section>
      <!-- wollo-prerender:catalog-end -->`;

const homeRootOpen = source.indexOf('<div id="root"');
if (homeRootOpen < 0) {
  console.error('[prerender-seo] dist/index.html has no <div id="root"> to extend.');
  process.exit(1);
}
const homeRootEnd = source.indexOf(">", homeRootOpen) + 1;
writePage(SHELL, `${source.slice(0, homeRootEnd)}\n${catalog}\n    ${source.slice(homeRootEnd)}`);

console.log(
  `[prerender-seo] ${dataSource} · ${courses.length} programs across ${collegePages.length} colleges · ${written.length} HTML files written into dist/`
);
if (missingDownloads.length) {
  console.warn(`[prerender-seo] ${missingDownloads.length} linked file(s) were not found under dist/ — check public/:`);
  for (const line of missingDownloads.slice(0, 10)) console.warn(`  ${line}`);
}
