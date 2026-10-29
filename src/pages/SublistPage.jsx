import React, { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, FileText, Pencil, Plus, Search, X } from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import AdSlot from "../components/AdSlot.jsx";
import MaterialRow from "../components/MaterialRow.jsx";
import EmptyState from "../components/EmptyState.jsx";
import CourseFormModal from "../components/CourseFormModal.jsx";
import MaterialFormModal from "../components/MaterialFormModal.jsx";
import SideMaterialModal from "../components/SideMaterialModal.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { doesDocumentMatchQuery, getCourseSemesterEntries, programBlurb, sanitizeCourseCode, semesterName } from "../lib/utils.js";

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
  const [semester, setSemester] = useState("All");
  const [subcategory, setSubcategory] = useState("All");
  const [format, setFormat] = useState("All");
  const [query, setQuery] = useState(view.query || "");
  const [materialModal, setMaterialModal] = useState({ open: false, materialId: null, preset: null });
  const [sideModal, setSideModal] = useState({ open: false, courseId: null, materialId: null });
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, materialId: null });

  // A program is one flat set of files; its semesters are shown by name only, without
  // the year prefix some stored labels still carry.
  const semesterOptions = useMemo(() => {
    if (!course) return [];
    const names = new Set(getCourseSemesterEntries(course).map((entry) => semesterName(entry.sem)));
    (course.materials || []).forEach((mat) => {
      if (mat.semester) names.add(semesterName(mat.semester));
    });
    return Array.from(names);
  }, [course]);

  const materials = useMemo(() => {
    if (!course) return [];
    const needle = query.trim().toLowerCase();
    const list = (course.materials || []).filter((mat) => {
      if (!canEdit && mat.hidden) return false;
      if (semester !== "All" && semesterName(mat.semester || "First Semester") !== semester) return false;
      if (subcategory !== "All" && (mat.subcategory || "Lecture Notes") !== subcategory) return false;
      if (format !== "All" && (mat.type || "").toLowerCase() !== format.toLowerCase()) return false;
      if (needle && !doesDocumentMatchQuery(course, mat, needle)) return false;
      return true;
    });
    return list;
  }, [canEdit, course, format, query, semester, subcategory]);

  if (!course) {
    return (
      <div className="ws-page">
        <EmptyState
          title="Course not found"
          description="May have been removed."
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
  const backToCollege = Boolean(browse.college) && browse.college === course.college;

  return (
    <div className="ws-page">
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary mb-3"
        onClick={backToCollege ? () => goBrowse({ college: course.college, courseId: "" }) : goLibrary}
      >
        <ArrowLeft size={14} className="me-1 align-text-bottom" aria-hidden="true" />
        {backToCollege ? "Back to programs" : "Back to library"}
      </button>

      <section className="card ws-course-head p-3 p-md-4 mb-3">
        <div className="d-flex flex-wrap justify-content-between gap-3">
          <div style={{ minWidth: 0 }}>
            <span className="ws-hero-eyebrow mb-2">
              {sanitizeCourseCode(course.icon, course.name)} · {course.college || "Wollo University"}
            </span>
            <h1 className="ws-course-title mt-2 mb-1">{course.name}</h1>
            {programBlurb(course) ? (
              <p className="text-secondary mb-2" style={{ maxWidth: 820 }}>
                {programBlurb(course)}
              </p>
            ) : null}
            <div className="d-flex flex-wrap gap-2">
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
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setMaterialModal({ open: true, materialId: null, preset: { semester: semester !== "All" ? semester : null, subcategory: subcategory !== "All" ? subcategory : null } })}>
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
          <div className="col-12 col-md-6">
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
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Category</label>
            <select className="form-select" value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
              <option value="All">All categories</option>
              {subcategories.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-3">
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
          {semesterOptions.map((sem) => (
            <button key={sem} type="button" className={`chip ${semester === sem ? "active" : ""}`} onClick={() => setSemester(sem)}>
              {sem}
            </button>
          ))}
        </div>
      </section>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="small text-secondary">
          <strong>{materials.length}</strong> {materials.length === 1 ? "document" : "documents"}
          {semester !== "All" ? ` · ${semester}` : ""}
        </span>
      </div>

      <div className="d-flex flex-column gap-2 material-stack">
        {materials.length === 0 ? (
          <EmptyState
            title="No materials in this selection yet"
            description={canEdit ? "Add the first file for this semester." : "Nothing here yet. Try another filter."}
            action={
              canEdit ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    setMaterialModal({
                      open: true,
                      materialId: null,
                      preset: { semester: semester !== "All" ? semester : null, subcategory: subcategory !== "All" ? subcategory : null }
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
