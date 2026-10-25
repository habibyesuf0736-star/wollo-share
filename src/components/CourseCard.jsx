import React from "react";
import { ArrowRight, Star } from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import Highlight from "./Highlight.jsx";
import { courseAverageRating, courseSemesterSummary, fileCountsByType, sanitizeCourseCode } from "../lib/utils.js";

export default function CourseCard({ course, query = "", index = 0, onMove, onEdit, onDelete, onToggleRestricted }) {
  const { canEdit, goSublist } = useApp();
  const materials = (course.materials || []).filter((m) => !m.hidden);
  const hiddenCount = (course.materials || []).length - materials.length;
  const avg = courseAverageRating(course);
  const semesterSummary = courseSemesterSummary(course);
  const formats = fileCountsByType(course).slice(0, 3);
  const isGreenArt = index % 2 === 0;

  const countLabel = canEdit && hiddenCount > 0
    ? `${materials.length} files (${hiddenCount} hidden)`
    : `${materials.length} ${materials.length === 1 ? "material" : "materials"}`;

  return (
    <article
      className="course-card"
      role="button"
      tabIndex={0}
      onClick={() => goSublist(course.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") goSublist(course.id);
      }}
    >
      <div
        className={`course-art ${isGreenArt ? "" : "alt"}`}
        style={
          !isGreenArt && course.color && course.color !== "#1d624f" ? { background: course.color, color: "#fff" } : undefined
        }
      >
        <span className="art-sheen" aria-hidden="true" />
        {course.restricted ? <span className="restricted-ribbon">Paid / Assigned</span> : null}
        <span className="art-top">
          <Highlight text={sanitizeCourseCode(course.icon, course.name)} query={query} /> ·{" "}
          <Highlight text={semesterSummary} query={query} /> · {materials.length} FILES
        </span>
        <span className="art-title">
          <Highlight text={course.name} query={query} />
        </span>
        <span className="art-arrow" aria-hidden="true">
          <ArrowRight size={16} />
        </span>
      </div>

      <div className="course-body">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <span className="d-inline-flex align-items-center gap-2 small text-secondary">
            <span className={`kind-dot ${course.restricted ? "coral" : ""}`} aria-hidden="true" />
            <Highlight text={`${countLabel}${course.restricted ? " · Paid Access" : ""}`} query={query} />
          </span>
          <span className="rating-pill">
            <Star size={12} fill="currentColor" strokeWidth={0} style={{ color: "#e0a92b" }} aria-hidden="true" />
            {avg ? avg.toFixed(1) : "New"}
          </span>
        </div>

        <h3>
          <Highlight text={course.name} query={query} />
        </h3>
        <p className="course-desc">
          <Highlight text={course.description || ""} query={query} />
        </p>

        <div className="d-flex flex-wrap gap-1">
          {course.college ? (
            <span className="tag">
              <Highlight text={course.college} query={query} />
            </span>
          ) : null}
          {formats.map(([type, count]) => (
            <span className="tag format" key={type}>
              {count} <Highlight text={type} query={query} />
            </span>
          ))}
          {(course.subcategories || []).slice(0, 2).map((sub) => (
            <span className="tag" key={sub}>
              <Highlight text={sub} query={query} />
            </span>
          ))}
        </div>

        {canEdit ? (
          <div className="d-flex flex-wrap gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onMove && onMove(-1)}>
              ↑
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onMove && onMove(1)}>
              ↓
            </button>
            <button type="button" className="btn btn-sm btn-soft" onClick={() => onEdit && onEdit(course.id)}>
              Edit
            </button>
            <button type="button" className="btn btn-sm btn-coral" onClick={() => onToggleRestricted && onToggleRestricted(course.id)}>
              {course.restricted ? "Make public" : "Restrict"}
            </button>
            <button type="button" className="btn btn-sm btn-coral" onClick={() => onDelete && onDelete(course.id)}>
              Delete
            </button>
          </div>
        ) : null}

        <div className="course-foot">
          <span>{semesterSummary}</span>
          <span className="d-inline-flex align-items-center gap-1">
            Explore materials <ArrowRight size={13} aria-hidden="true" />
          </span>
        </div>
      </div>
    </article>
  );
}
