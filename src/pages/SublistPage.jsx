import React, { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, FileText, Layers, Pencil, Plus, Search, X } from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import AdSlot from "../components/AdSlot.jsx";
import MaterialRow from "../components/MaterialRow.jsx";
import EmptyState from "../components/EmptyState.jsx";
import CourseFormModal from "../components/CourseFormModal.jsx";
import MaterialFormModal from "../components/MaterialFormModal.jsx";
import SideMaterialModal from "../components/SideMaterialModal.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { courseSemesterSummary, doesDocumentMatchQuery, getCourseSemesterEntries, sanitizeCourseCode } from "../lib/utils.js";

const FORMATS = ["All", "PDF", "PPT", "DOC", "XLS", "Video", "Other"];

export default function SublistPage() {
  const {
    view,
    browse,
    coursesData,
    goLibrary,
    goBrowse,
    canEdit,
    addMaterial,
    updateMaterial,
    deleteMaterial,
    toggleMaterialVisibility,
    pageTexts
  } = useApp();

  const course = coursesData.find((c) => c.id === view.courseId);
  const [year, setYear] = useState(view.year || "All");
  const [semester, setSemester] = useState("All");
  const [subcategory, setSubcategory] = useState("All");
  const [format, setFormat] = useState("All");
  const [query, setQuery] = useState(view.query || "");
  const [materialModal, setMaterialModal] = useState({ open: false, materialId: null, preset: null });
  const [sideModal, setSideModal] = useState({ open: false, courseId: null, materialId: null });
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, materialId: null });

  const entries = useMemo(() => (course ? getCourseSemesterEntries(course) : []), [course]);
  const years = useMemo(() => Array.from(new Set(entries.map((e) => e.year))), [entries]);
  const yearOptions = useMemo(
    () => (year !== "All" && !years.includes(year) ? [...years, year] : years),
    [year, years]
  );
  const semestersForYear = useMemo(
    () => Array.from(new Set(entries.filter((e) => year === "All" || e.year === year).map((e) => e.sem))),
    [entries, year]
  );

  const materials = useMemo(() => {
    if (!course) return [];
    const needle = query.trim().toLowerCase();
    const list = (course.materials || []).filter((mat) => {
      if (!canEdit && mat.hidden) return false;
      if (year !== "All" && (mat.year || course.defaultYear || "Year 1") !== year) return false;
      if (semester !== "All" && (mat.semester || "First Semester") !== semester) return false;
      if (subcategory !== "All" && (mat.subcategory || "Lecture Notes") !== subcategory) return false;
      if (format !== "All" && (mat.type || "").toLowerCase() !== format.toLowerCase()) return false;
      if (needle && !doesDocumentMatchQuery(course, mat, needle)) return false;
      return true;
    });
    return list;
  }, [canEdit, course, format, query, semester, subcategory, year]);

  if (!course) {
    return (
      <div className="ws-page">
        <EmptyState
          title="Course not found"
          description="This course may have been removed from the library."
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={goLibrary}>
              Back to library
            </button>
          }
        />
      </div>
    );
  }

  const visibleCount = (course.materials || []).filter((m) => canEdit || !m.hidden).length;
  const subcategories = course.subcategories && course.subcategories.length ? course.subcategories : ["Lecture Notes"];
  const backToYears = browse.courseId === course.id;

  return (
    <div className="ws-page">
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary mb-3"
        onClick={backToYears ? () => goBrowse({ courseId: course.id }) : goLibrary}
      >
        <ArrowLeft size={14} className="me-1 align-text-bottom" aria-hidden="true" />
        {backToYears ? "Back to years" : "Back to library"}
      </button>

      <section className="card ws-course-head p-3 p-md-4 mb-3">
        <div className="d-flex flex-wrap justify-content-between gap-3">
          <div style={{ minWidth: 0 }}>
            <span className="ws-hero-eyebrow mb-2">
              {sanitizeCourseCode(course.icon, course.name)} · {course.college || "Wollo University"}
            </span>
            <h1 className="ws-course-title mt-2 mb-1">{course.name}</h1>
            <p className="text-secondary mb-2" style={{ maxWidth: 820 }}>
              {course.description}
            </p>
            <div className="d-flex flex-wrap gap-2">
              {year !== "All" ? (
                <span className="tag format">
                  <Layers size={11} aria-hidden="true" /> {year}
                </span>
              ) : null}
              <span className="tag">{courseSemesterSummary(course)}</span>
              <span className="tag format">
                <FileText size={11} aria-hidden="true" /> {visibleCount} files
              </span>
              {course.restricted ? <span className="tag" style={{ color: "var(--danger)" }}>Paid / assigned access</span> : null}
              {subcategories.slice(0, 3).map((s) => (
                <span className="tag" key={s}>
                  {s}
                </span>
              ))}
            </div>
          </div>
          {canEdit ? (
            <div className="d-flex flex-column gap-2">
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setMaterialModal({ open: true, materialId: null, preset: { year: year !== "All" ? year : null, semester: semester !== "All" ? semester : null, subcategory: subcategory !== "All" ? subcategory : null } })}>
                <Plus size={14} className="me-1 align-text-bottom" aria-hidden="true" /> Add material
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setCourseModalOpen(true)}>
                <Pencil size={14} className="me-1 align-text-bottom" aria-hidden="true" /> Edit course
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <AdSlot placement="hero" />

      <section className="ws-toolbar mb-3">
        <div className="row g-2">
          <div className="col-12 col-md-5">
            <label className="form-label small fw-semibold" htmlFor="matSearch">
              Search inside {pageTexts.siteTitle || "Wollo Share"} · {course.name}
            </label>
            <span className="ws-search">
              <span className="ws-search-icon" aria-hidden="true">
                <Search size={17} />
              </span>
              <input
                id="matSearch"
                className="form-control"
                placeholder="Topic, exam year, file format…"
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
          <div className="col-6 col-md-2">
            <label className="form-label small fw-semibold">Academic year</label>
            <select className="form-select" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="All">All years</option>
              {yearOptions.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small fw-semibold">Category</label>
            <select className="form-select" value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
              <option value="All">All categories</option>
              {subcategories.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label small fw-semibold">Format</label>
            <select className="form-select" value={format} onChange={(e) => setFormat(e.target.value)}>
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f === "All" ? "Any format" : f}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2 mt-3">
          <button type="button" className={`chip ${semester === "All" ? "active" : ""}`} onClick={() => setSemester("All")}>
            All semesters
          </button>
          {semestersForYear.map((sem) => (
            <button key={sem} type="button" className={`chip ${semester === sem ? "active" : ""}`} onClick={() => setSemester(sem)}>
              {year === "All" ? "" : `${year} · `}
              {sem}
            </button>
          ))}
        </div>
      </section>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="small text-secondary">
          <strong>{materials.length}</strong> {materials.length === 1 ? "document" : "documents"}
          {year !== "All" || semester !== "All" ? ` · ${year === "All" ? "All years" : year} · ${semester === "All" ? "both semesters" : semester}` : ""}
        </span>
        <span className="small text-secondary mono">{getCourseSemesterEntries(course).length} semesters mapped</span>
      </div>

      <div className="d-flex flex-column gap-2 material-stack">
        {materials.length === 0 ? (
          <EmptyState
            title="No materials in this selection yet"
            description={canEdit ? "Add the first lecture note, exam or slide deck for this semester." : "Students and lecturers have not uploaded files here — try another semester or category."}
            action={
              canEdit ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    setMaterialModal({
                      open: true,
                      materialId: null,
                      preset: { year: year !== "All" ? year : null, semester: semester !== "All" ? semester : null, subcategory: subcategory !== "All" ? subcategory : null }
                    })
                  }
                >
                  + Add material
                </button>
              ) : null
            }
          />
        ) : (
          materials.map((mat) => (
            <MaterialRow
              key={mat.id}
              course={course}
              mat={mat}
              query={query}
              onEdit={(courseId, materialId) => setMaterialModal({ open: true, materialId, preset: null })}
              onToggle={(courseId, materialId) => toggleMaterialVisibility(courseId, materialId)}
              onDelete={(courseId, materialId) => setConfirm({ open: true, materialId })}
              onAddSide={(courseId, materialId) => setSideModal({ open: true, courseId, materialId })}
            />
          ))
        )}
      </div>

      <AdSlot placement="middle" />

      <CourseFormModal open={courseModalOpen} courseId={course.id} onClose={() => setCourseModalOpen(false)} />
      <MaterialFormModal
        open={materialModal.open}
        courseId={course.id}
        materialId={materialModal.materialId}
        preset={materialModal.preset}
        onClose={() => setMaterialModal({ open: false, materialId: null, preset: null })}
      />
      <SideMaterialModal
        open={sideModal.open}
        courseId={sideModal.courseId}
        materialId={sideModal.materialId}
        onClose={() => setSideModal({ open: false, courseId: null, materialId: null })}
      />
      <ConfirmModal
        open={confirm.open}
        title="Delete this material?"
        message="Students will no longer see or download this document."
        onConfirm={() => deleteMaterial(course.id, confirm.materialId)}
        onClose={() => setConfirm({ open: false, materialId: null })}
      />
    </div>
  );
}
