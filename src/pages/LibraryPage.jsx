import React, { useMemo, useState } from "react";
import { ArrowRight, Building2, FolderDown, GraduationCap, LibraryBig, Search, Sparkles, Star, Upload, X } from "lucide-react";
import { useApp, DEFAULT_TEXTS } from "../store/AppContext.jsx";
import AnnouncementBanner from "../components/AnnouncementBanner.jsx";
import AdSlot from "../components/AdSlot.jsx";
import CourseCard from "../components/CourseCard.jsx";
import MaterialRow from "../components/MaterialRow.jsx";
import EmptyState from "../components/EmptyState.jsx";
import CourseFormModal from "../components/CourseFormModal.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { matchDepartmentPrograms, normalizeDepartment } from "../lib/departments.js";
import {
  courseAverageRating,
  doesDocumentMatchQuery,
  getCourseSemesterEntries,
  initialsOf,
  sanitizeCourseCode
} from "../lib/utils.js";

const TOPIC_FILTERS = ["All", "Video Lectures", "Lecture Notes", "Past Exams & Quizzes", "Lab Manuals", "Slides & Presentations", "Assignments & Projects"];

function splitHeroTitle(title) {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  const cut = text.lastIndexOf(" ");
  if (cut <= 0) return text;
  return (
    <>
      {text.slice(0, cut)} <span className="ws-accent">{text.slice(cut + 1)}</span>
    </>
  );
}

function visibleFileCount(course, canEdit) {
  return (course.materials || []).filter((m) => canEdit || !m.hidden).length;
}

function programYears(course) {
  const declared = Array.isArray(course.years) ? course.years.filter(Boolean) : [];
  if (declared.length) return declared;
  const duration = Number(course.durationYears) || 0;
  if (duration > 0) return Array.from({ length: duration }, (_, index) => `Year ${index + 1}`);
  const observed = Array.from(new Set([course.defaultYear, ...(course.materials || []).map((m) => m.year)].filter(Boolean)));
  return observed.length ? observed.sort() : ["Year 1"];
}

function countFilesInYear(course, year, canEdit) {
  return (course.materials || []).filter(
    (m) => (canEdit || !m.hidden) && (m.year || course.defaultYear || "Year 1") === year
  ).length;
}

function sortCourses(list, sort, canEdit) {
  const next = [...list];
  if (sort === "az") next.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "files") next.sort((a, b) => visibleFileCount(b, canEdit) - visibleFileCount(a, canEdit));
  else if (sort === "rating") next.sort((a, b) => (courseAverageRating(b) || 0) - (courseAverageRating(a) || 0));
  return next;
}

export default function LibraryPage() {
  const {
    coursesData,
    canSeeCourse,
    canEdit,
    pageTexts,
    appearanceSettings,
    stats,
    browse,
    goBrowse,
    goSublist,
    goLogin,
    moveCourse,
    deleteCourse,
    updateCourse,
    setGate,
    view,
    activeUser,
    session,
    studentPreview
  } = useApp();

  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("All");
  const [sort, setSort] = useState("default");
  const [docQuery, setDocQuery] = useState("");
  const [docFormat, setDocFormat] = useState("All");
  const [docSemester, setDocSemester] = useState("All");
  const [courseModal, setCourseModal] = useState({ open: false, courseId: null });
  const [confirm, setConfirm] = useState({ open: false, courseId: null });

  const modules = appearanceSettings.modules || { stats: true, topics: true, docs: true };
  const activeQuery = query.trim().toLowerCase();

  const accessible = useMemo(() => coursesData.filter(canSeeCourse), [canSeeCourse, coursesData]);

  const collegeGroups = useMemo(() => {
    const groups = new Map();
    accessible.forEach((course) => {
      const name = course.college || "Other programs";
      if (!groups.has(name)) groups.set(name, { name, courses: [], files: 0 });
      const group = groups.get(name);
      group.courses.push(course);
      group.files += visibleFileCount(course, canEdit);
    });
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [accessible, canEdit]);

  const activeCollege = browse.college ? collegeGroups.find((group) => group.name === browse.college) || null : null;
  const activeCourse =
    activeCollege && browse.courseId
      ? activeCollege.courses.find((course) => course.id === browse.courseId) || null
      : null;

  const filteredCourses = useMemo(() => {
    const list = accessible.filter((course) => {
      if (topic !== "All" && !(course.subcategories || []).includes(topic)) return false;
      if (!activeQuery) return true;
      const matchesCourse =
        course.name.toLowerCase().includes(activeQuery) ||
        (course.description || "").toLowerCase().includes(activeQuery) ||
        (course.defaultYear || "").toLowerCase().includes(activeQuery) ||
        (course.college || "").toLowerCase().includes(activeQuery);
      const matchesMaterial = (course.materials || []).some(
        (m) => (canEdit || !m.hidden) && doesDocumentMatchQuery(course, m, activeQuery)
      );
      return matchesCourse || matchesMaterial;
    });
    return sortCourses(list, sort, canEdit);
  }, [accessible, activeQuery, canEdit, sort, topic]);

  const globalDocs = useMemo(() => {
    const needle = (docQuery || query).trim();
    const rows = [];
    accessible.forEach((course) => {
      (course.materials || []).forEach((mat) => {
        if (!canEdit && mat.hidden) return;
        if (topic !== "All" && (mat.subcategory || "Lecture Notes") !== topic) return;
        if (docFormat !== "All" && (mat.type || "").toLowerCase() !== docFormat.toLowerCase()) return;
        if (docSemester !== "All" && (mat.semester || "First Semester") !== docSemester) return;
        if (needle && !doesDocumentMatchQuery(course, mat, needle)) return;
        rows.push({ course, mat });
      });
    });
    return rows;
  }, [accessible, canEdit, docFormat, docQuery, docSemester, query, topic]);

  const totalDocs = useMemo(() => accessible.reduce((sum, c) => sum + visibleFileCount(c, canEdit), 0), [accessible, canEdit]);

  // Signed-in students get their department's materials and related programs first.
  const departmentPanel = useMemo(() => {
    const saved = String((activeUser && activeUser.department) || "").trim();
    if (!saved || !session || studentPreview || session.role === "admin") return null;
    const programs = matchDepartmentPrograms(accessible, saved);
    const program = programs[0] || null;
    const programIds = new Set(programs.map((course) => course.id));
    const programNames = new Set(programs.map((course) => normalizeDepartment(course.name)));
    const needle = normalizeDepartment(saved);
    const materials = [];
    accessible.forEach((course) => {
      const fromProgram = programIds.has(course.id);
      (course.materials || []).forEach((mat) => {
        if (!canEdit && mat.hidden) return;
        const matDepartment = normalizeDepartment(mat.department);
        const taggedMine = Boolean(matDepartment) && (matDepartment === needle || programNames.has(matDepartment));
        if (fromProgram || taggedMine) materials.push({ course, mat });
      });
    });
    const college = program ? program.college : "";
    const others = accessible.filter((course) => !programIds.has(course.id));
    const sameCollege = college ? others.filter((course) => course.college === college) : [];
    const suggestions = [...(sameCollege.length ? sameCollege : others)]
      .sort((a, b) => visibleFileCount(b, canEdit) - visibleFileCount(a, canEdit))
      .slice(0, 6);
    return {
      saved,
      label: program ? program.name : saved,
      program,
      college,
      files: programs.reduce((sum, course) => sum + visibleFileCount(course, canEdit), 0),
      materials: materials.slice(0, 6),
      suggestions,
      suggestionScope: college || "the rest of the library"
    };
  }, [accessible, activeUser, canEdit, session, studentPreview]);

  const resultsMode = Boolean(activeQuery) || topic !== "All";
  const clearFilters = () => {
    setQuery("");
    setDocQuery("");
    setTopic("All");
    setDocFormat("All");
    setDocSemester("All");
  };

  const yearCards = useMemo(() => {
    if (!activeCourse) return [];
    const entries = getCourseSemesterEntries(activeCourse);
    return programYears(activeCourse).map((year) => ({
      year,
      files: countFilesInYear(activeCourse, year, canEdit),
      semesters: entries.filter((entry) => entry.year === year).length
    }));
  }, [activeCourse, canEdit]);

  const renderColleges = () => (
    <>
      <div className="ws-section-head">
        <div>
          <span className="ws-section-kicker">Step 1 of 3</span>
          <h2>Colleges, institutes &amp; schools</h2>
        </div>
        <span className="ws-section-note">
          <strong>{collegeGroups.length}</strong> colleges · <strong>{accessible.length}</strong> programs ·{" "}
          <strong>{totalDocs}</strong> files
          {canEdit ? (
            <button
              type="button"
              className="btn btn-sm btn-primary ms-2"
              onClick={() => setCourseModal({ open: true, courseId: null })}
            >
              + New course
            </button>
          ) : null}
        </span>
      </div>
      <div className="row g-3">
        {collegeGroups.map((group) => (
          <div className="col-12 col-sm-6 col-lg-4" key={group.name}>
            <button
              type="button"
              className="college-card"
              onClick={() => goBrowse({ college: group.name, courseId: "" })}
            >
              <span className="college-mark" aria-hidden="true">
                {initialsOf(group.name)}
              </span>
              <span className="college-name">{group.name}</span>
              <span className="college-meta">
                {group.courses.length} {group.courses.length === 1 ? "program" : "programs"} · {group.files}{" "}
                {group.files === 1 ? "file" : "files"}
              </span>
              <span className="college-preview">{group.courses.slice(0, 3).map((course) => course.name).join(" · ")}</span>
              <span className="college-open">
                Browse programs <ArrowRight size={13} aria-hidden="true" />
              </span>
            </button>
          </div>
        ))}
      </div>
    </>
  );

  const renderPrograms = () => {
    const programs = sortCourses(activeCollege.courses, sort, canEdit);
    return (
      <>
        <div className="ws-section-head">
          <div style={{ minWidth: 0 }}>
            <span className="ws-section-kicker">Step 2 of 3 · Programs</span>
            <h2>{activeCollege.name}</h2>
            <p className="small text-secondary mb-0 mt-1">
              {programs.length} {programs.length === 1 ? "program" : "programs"} · {activeCollege.files}{" "}
              {activeCollege.files === 1 ? "file" : "files"} — choose a program to see its years.
            </p>
          </div>
          {canEdit ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setCourseModal({ open: true, courseId: null })}>
              + New course
            </button>
          ) : null}
        </div>

        {programs.length === 0 ? (
          <EmptyState title="No programs here yet" description="This college has no programs visible to your account." />
        ) : (
          <ul className="browse-list">
            {programs.map((course) => {
              const years = programYears(course);
              const span = years.length > 1 ? `${years[0]} – ${years[years.length - 1]}` : years[0];
              const files = visibleFileCount(course, canEdit);
              return (
                <li key={course.id}>
                  <button type="button" className="browse-row" onClick={() => goBrowse({ courseId: course.id })}>
                    <span className="browse-code">{sanitizeCourseCode(course.icon, course.name)}</span>
                    <span className="browse-main">
                      <span className="browse-title">{course.name}</span>
                      <span className="browse-meta">
                        {span} · {files} {files === 1 ? "file" : "files"}
                        {course.restricted ? " · Paid / assigned access" : ""}
                      </span>
                    </span>
                    <span className="browse-arrow" aria-hidden="true">
                      <ArrowRight size={15} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  };

  const renderYears = () => {
    const allFiles = visibleFileCount(activeCourse, canEdit);
    const semesterCount = getCourseSemesterEntries(activeCourse).length;
    return (
      <>
        <div className="ws-dept mb-3">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
            <div style={{ minWidth: 0, maxWidth: 760 }}>
              <span className="ws-section-kicker">Step 3 of 3 · Academic years</span>
              <span className="ws-hero-eyebrow mb-1">{activeCollege.name}</span>
              <h2 className="h4 mt-2 mb-1">{activeCourse.name}</h2>
              <p className="small text-secondary mb-0">{activeCourse.description}</p>
            </div>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => goSublist(activeCourse.id)}>
              Open full program <ArrowRight size={14} className="ms-1 align-text-bottom" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="year-grid">
          {yearCards.map((card) => (
            <button key={card.year} type="button" className="year-tile" onClick={() => goSublist(activeCourse.id, "", card.year)}>
              <span className="year-label">{card.year}</span>
              <span className="year-meta">
                {card.files} {card.files === 1 ? "file" : "files"} · {card.semesters}{" "}
                {card.semesters === 1 ? "semester" : "semesters"}
              </span>
              <span className="year-go d-inline-flex align-items-center gap-1">
                View materials <ArrowRight size={12} aria-hidden="true" />
              </span>
            </button>
          ))}
          <button type="button" className="year-tile year-all" onClick={() => goSublist(activeCourse.id)}>
            <span className="year-label">All years</span>
            <span className="year-meta">
              {allFiles} {allFiles === 1 ? "file" : "files"} · {semesterCount} semesters
            </span>
            <span className="year-go d-inline-flex align-items-center gap-1">
              View everything <ArrowRight size={12} aria-hidden="true" />
            </span>
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="ws-page">
      <AnnouncementBanner />

      <section className="ws-hero">
        <span className="ws-hero-eyebrow">Wollo University · Student study & course resource hub</span>
        <h1 className="ws-hero-title">
          {splitHeroTitle(pageTexts.welcomeTitle || DEFAULT_TEXTS.welcomeTitle)}
        </h1>
        <p className="lead">{pageTexts.welcomeDesc}</p>

        <div className="d-flex flex-wrap gap-2 mt-3">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setGate({ type: "share", courseId: "" })}>
            <Upload size={15} className="me-1 align-text-bottom" aria-hidden="true" /> Share your material
          </button>
          <a className="btn btn-sm btn-outline-secondary" href="#ws-colleges">
            <LibraryBig size={15} className="me-1 align-text-bottom" aria-hidden="true" /> Browse by college
          </a>
          {session && !studentPreview ? null : (
            <button type="button" className="btn btn-sm btn-soft" onClick={goLogin}>
              <Sparkles size={15} className="me-1 align-text-bottom" aria-hidden="true" /> Create free account
            </button>
          )}
        </div>

        {modules.stats ? (
          <ul className="ws-hero-stats d-none d-md-flex">
            <li>
              <GraduationCap size={14} aria-hidden="true" />
              <strong>{stats.courses}</strong> Programs
            </li>
            <li>
              <FolderDown size={14} aria-hidden="true" />
              <strong>{stats.files}</strong> Study files
            </li>
            <li>
              <Star size={14} aria-hidden="true" />
              <strong>{stats.avgRating} ★</strong> Avg. rating
            </li>
            <li>
              <Building2 size={14} aria-hidden="true" />
              <strong>{stats.colleges.length}</strong> Colleges
            </li>
          </ul>
        ) : null}
      </section>

      <AdSlot placement="hero" />

      {departmentPanel && !resultsMode && !activeCollege ? (
        <section className="ws-dept mb-3" aria-label={`Your department: ${departmentPanel.label}`}>
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
            <div style={{ minWidth: 0 }}>
              <span className="ws-hero-eyebrow">Your department</span>
              <h2 className="h5 mb-1 mt-1">{departmentPanel.label}</h2>
              <p className="small text-secondary mb-0">
                {departmentPanel.college ? `${departmentPanel.college} · ` : ""}
                {departmentPanel.files} {departmentPanel.files === 1 ? "file" : "files"} in your program
                {departmentPanel.saved !== departmentPanel.label ? ` · saved as “${departmentPanel.saved}”` : ""}
              </p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              {departmentPanel.program ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => goBrowse({ college: departmentPanel.college, courseId: departmentPanel.program.id })}
                >
                  Open my program
                </button>
              ) : null}
              {departmentPanel.college ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => goBrowse({ college: departmentPanel.college, courseId: "" })}
                >
                  All {departmentPanel.college} programs
                </button>
              ) : null}
            </div>
          </div>

          {departmentPanel.materials.length ? (
            <div className="dept-materials mt-3">
              <h3 className="h6 mb-2">Latest material in your department</h3>
              <div className="d-flex flex-column gap-2 material-stack">
                {departmentPanel.materials.map(({ course, mat }) => (
                  <MaterialRow
                    key={`${course.id}-${mat.id}`}
                    course={course}
                    mat={mat}
                    onEdit={() => goSublist(course.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="dept-empty mt-3">
              <p className="small text-secondary mb-2">
                No material carries the “{departmentPanel.label}” department tag yet — contribute one and it shows here
                for every {departmentPanel.label} student.
              </p>
              {departmentPanel.program ? (
                <button
                  type="button"
                  className="btn btn-sm btn-soft"
                  onClick={() => setGate({ type: "share", courseId: departmentPanel.program.id })}
                >
                  + Contribute material
                </button>
              ) : null}
            </div>
          )}

          {departmentPanel.program && departmentPanel.suggestions.length ? (
            <div className="dept-suggest mt-3">
              <div className="d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2">
                <h3 className="h6 mb-0">Suggested courses</h3>
                <span className="small text-secondary">More from {departmentPanel.suggestionScope}</span>
              </div>
              <div className="dept-chip-row">
                {departmentPanel.suggestions.map((course) => {
                  const files = visibleFileCount(course, canEdit);
                  return (
                    <button
                      key={course.id}
                      type="button"
                      className="dept-chip"
                      onClick={() => goBrowse({ college: course.college, courseId: course.id })}
                    >
                      <span className="dept-chip-name">{course.name}</span>
                      <span className="dept-chip-meta">
                        {files} {files === 1 ? "file" : "files"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="ws-toolbar mb-3">
        <div className="row g-2 align-items-end">
          <div className="col-12 col-lg-9">
            <label className="form-label small fw-semibold" htmlFor="librarySearch">
              Search across every college, program and file
            </label>
            <span className="ws-search">
              <span className="ws-search-icon" aria-hidden="true">
                <Search size={17} />
              </span>
              <input
                id="librarySearch"
                className="form-control"
                placeholder="e.g. calculus second semester pdf past exam"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query ? (
                <button type="button" className="ws-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
                  <X size={14} />
                </button>
              ) : null}
            </span>
          </div>
          <div className="col-6 col-lg-3">
            <label className="form-label small fw-semibold" htmlFor="sortSelect">
              Sort
            </label>
            <select id="sortSelect" className="form-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="default">Curated order</option>
              <option value="az">A – Z</option>
              <option value="files">Most files</option>
              <option value="rating">Top rated</option>
            </select>
          </div>
        </div>

        {modules.topics ? (
          <div className="d-flex flex-wrap gap-2 mt-3">
            {TOPIC_FILTERS.map((t) => (
              <button key={t} type="button" className={`chip ${topic === t ? "active" : ""}`} onClick={() => setTopic(t)}>
                {t === "All" ? "All topics" : t}
              </button>
            ))}
            {resultsMode ? (
              <button type="button" className="chip ghost" onClick={clearFilters}>
                <X size={12} className="me-1 align-text-bottom" aria-hidden="true" /> Clear filters
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {activeCollege ? (
        <nav className="browse-crumbs" aria-label="Library location">
          <button type="button" className="crumb" onClick={() => goBrowse({ college: "", courseId: "" })}>
            Colleges
          </button>
          <span aria-hidden="true">/</span>
          {activeCourse ? (
            <>
              <button type="button" className="crumb" onClick={() => goBrowse({ courseId: "" })}>
                {activeCollege.name}
              </button>
              <span aria-hidden="true">/</span>
              <span className="crumb current">{activeCourse.name}</span>
            </>
          ) : (
            <span className="crumb current">{activeCollege.name}</span>
          )}
        </nav>
      ) : null}

      {resultsMode ? (
        <>
          <div className="d-flex justify-content-between align-items-center results-line mb-2">
            <span className="small text-secondary">
              <strong>{filteredCourses.length}</strong> {filteredCourses.length === 1 ? "program" : "programs"} matching your search
            </span>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearFilters}>
              Back to browsing
            </button>
          </div>

          {filteredCourses.length === 0 ? (
            <EmptyState
              title="No programs match that search"
              description="Try a shorter phrase, another file format, or clear the filters and browse by college."
              action={
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={clearFilters}>
                  Clear search
                </button>
              }
            />
          ) : (
            <div className="row g-3">
              {filteredCourses.map((course, index) => (
                <div className="col-12 col-sm-6 col-lg-4" key={course.id}>
                  <CourseCard
                    course={course}
                    index={index}
                    query={activeQuery}
                    onMove={(direction) => moveCourse(coursesData.indexOf(course), direction)}
                    onEdit={(id) => setCourseModal({ open: true, courseId: id })}
                    onToggleRestricted={(id) =>
                      updateCourse(id, { restricted: !(coursesData.find((c) => c.id === id) || {}).restricted })
                    }
                    onDelete={(id) => setConfirm({ open: true, courseId: id })}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      ) : activeCourse ? (
        <section aria-label={`${activeCourse.name} years`}>{renderYears()}</section>
      ) : activeCollege ? (
        <section aria-label={`${activeCollege.name} programs`}>{renderPrograms()}</section>
      ) : (
        <section id="ws-colleges" aria-label="Colleges, institutes and schools">{renderColleges()}</section>
      )}

      <AdSlot placement="middle" />

      {modules.docs ? (
        <section className="card p-3 p-md-4 mt-4">
          <div className="ws-section-head" style={{ marginTop: 0, borderTop: 0 }}>
            <div>
              <span className="ws-section-kicker">Everything in one place</span>
              <h2>Shared document library</h2>
              <p className="small text-secondary mb-0 mt-1">
                Every file across {accessible.length} programs — {globalDocs.length} of {totalDocs} shown
              </p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <span className="ws-search" style={{ minWidth: 220 }}>
                <span className="ws-search-icon" aria-hidden="true">
                  <Search size={15} />
                </span>
                <input
                  className="form-control form-control-sm"
                  placeholder="Search all documents"
                  value={docQuery}
                  onChange={(e) => setDocQuery(e.target.value)}
                />
              </span>
              <select className="form-select form-select-sm" style={{ width: "auto" }} value={docFormat} onChange={(e) => setDocFormat(e.target.value)}>
                {["All", "PDF", "PPT", "DOC", "XLS", "Video", "Other"].map((f) => (
                  <option key={f} value={f}>
                    {f === "All" ? "Any format" : f}
                  </option>
                ))}
              </select>
              <select className="form-select form-select-sm" style={{ width: "auto" }} value={docSemester} onChange={(e) => setDocSemester(e.target.value)}>
                {["All", "First Semester", "Second Semester"].map((s) => (
                  <option key={s} value={s}>
                    {s === "All" ? "Any semester" : s}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-sm btn-soft" onClick={() => setGate({ type: "share", courseId: view.courseId || "" })}>
                <Upload size={14} className="me-1 align-text-bottom" aria-hidden="true" /> Contribute
              </button>
            </div>
          </div>

          <div className="d-flex flex-column gap-2 material-stack" style={{ maxHeight: 560, overflowY: "auto" }}>
            {globalDocs.length === 0 ? (
              <EmptyState
                title="No documents match this search"
                description="Clear the format or semester filter, or search for a course name instead."
              />
            ) : (
              globalDocs.slice(0, 60).map(({ course, mat }) => (
                <MaterialRow key={`${course.id}-${mat.id}`} course={course} mat={mat} isGlobal query={docQuery || query} onEdit={() => goSublist(course.id)} />
              ))
            )}
            {globalDocs.length > 60 ? (
              <p className="small text-secondary mb-0">Showing the first 60 of {globalDocs.length} matches — refine the search to see more.</p>
            ) : null}
          </div>
        </section>
      ) : null}

      <AdSlot placement="footer" />

      <CourseFormModal
        open={courseModal.open}
        courseId={courseModal.courseId}
        onClose={() => setCourseModal({ open: false, courseId: null })}
      />
      <ConfirmModal
        open={confirm.open}
        title="Delete this course?"
        message="The course and all of its materials will be removed from the library for every visitor."
        onConfirm={() => {
          deleteCourse(confirm.courseId);
        }}
        onClose={() => setConfirm({ open: false, courseId: null })}
      />
    </div>
  );
}
