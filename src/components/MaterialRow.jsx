import React from "react";
import { Download, Eye, FileSpreadsheet, FileText, Film, FolderOpen, Layers, Lock, Pencil, Play, Presentation, Trash2 } from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import StarRating from "./StarRating.jsx";
import { extractYouTubeVideoId, formatMaterialTerm, materialTypeClass } from "../lib/utils.js";

const TYPE_ICONS = {
  PDF: FileText,
  PPT: Presentation,
  DOC: FileText,
  XLS: FileSpreadsheet,
  Video: Film
};

function SideMaterials({ course, mat }) {
  const sides = mat.sideMaterials || [];
  if (!sides.length) return null;
  return (
    <div className="side-panel">
      <span className="mono d-block mb-1" style={{ fontSize: 10, letterSpacing: "0.11em", color: "var(--muted)" }}>
        <Layers size={11} className="me-1 align-text-bottom" aria-hidden="true" />
        {sides.length} COMPANION FILE{sides.length === 1 ? "" : "S"}
      </span>
      <ul className="list-unstyled d-flex flex-column gap-1 mb-0">
        {sides.map((side) => (
          <SideMaterialItem key={side.id} course={course} mat={mat} side={side} />
        ))}
      </ul>
    </div>
  );
}

function SideMaterialItem({ course, mat, side }) {
  const { requestDownload, canEdit, deleteSideMaterial, toast } = useApp();
  return (
    <li className="d-flex align-items-center justify-content-between gap-2">
      <span className="small text-truncate" style={{ maxWidth: 170 }}>
        {side.name} <span className="text-secondary">· {side.type} · {side.size}</span>
      </span>
      <span className="d-flex gap-1">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary py-0"
          onClick={() => requestDownload(course.id, mat.id, side.id)}
        >
          Get
        </button>
        {canEdit ? (
          <button
            type="button"
            className="btn btn-sm btn-coral py-0"
            onClick={() => {
              deleteSideMaterial(course.id, mat.id, side.id);
              toast("Companion material removed.");
            }}
          >
            ✕
          </button>
        ) : null}
      </span>
    </li>
  );
}

export default function MaterialRow({
  course,
  mat,
  isGlobal = false,
  query = "",
  onEdit,
  onDelete,
  onToggle,
  onAddSide
}) {
  const { requestDownload, setVideoTarget, goSublist, canEdit, downloadStatus, videoProgress } = useApp();
  const ytId = extractYouTubeVideoId(mat.url);
  const free = Boolean(mat.free);
  const locked = !free && !downloadStatus.canDownload;
  const progress = ytId ? videoProgress[`${course.id}::${mat.id}`] : null;
  const typeClass = materialTypeClass(mat.type);
  const TypeIcon = TYPE_ICONS[typeClass] || FileText;
  const metaParts = [
    formatMaterialTerm(mat),
    mat.subcategory || "Lecture Notes",
    mat.department && mat.department !== course.name ? `Dept: ${mat.department}` : "",
    mat.sharedBy ? `Shared by ${mat.sharedBy}` : ""
  ].filter(Boolean);

  return (
    <div className={`material-row ${mat.hidden ? "is-hidden" : ""}`}>
      <div className="d-flex gap-3 flex-grow-1" style={{ minWidth: 0 }}>
        <div className={`file-badge t-${typeClass}`}>
          <TypeIcon size={16} strokeWidth={1.9} aria-hidden="true" />
          <span>{mat.lessonNumber ? `#${mat.lessonNumber}` : mat.type}</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="mat-name">
            {mat.name}
            {free ? <span className="access-tag is-free">Free</span> : null}
            {locked ? <span className="access-tag is-premium">Premium</span> : null}
            {mat.hidden ? <span className="hidden-tag">Hidden from students</span> : null}
          </div>
          <div className="mat-meta mt-1">
            {isGlobal ? (
              <button type="button" className="btn btn-link btn-sm p-0 fw-semibold" onClick={() => goSublist(course.id)}>
                {course.name}
              </button>
            ) : null}
            <span>{metaParts.join(" · ")}</span>
            <span>·</span>
            <span>{mat.size}</span>
          </div>
          <div className="mt-1">
            <StarRating course={course} mat={mat} />
          </div>
          {progress ? (
            <div className="video-progress">
              <span className="video-progress-track" aria-hidden="true">
                <span style={{ width: `${progress.percent}%` }} />
              </span>
              <span className="video-progress-label">
                {progress.completed ? "Completed" : `${progress.percent}% watched`}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <SideMaterials course={course} mat={mat} />

      <div className="d-flex align-items-center flex-wrap gap-2">
        {canEdit ? (
          <>
            <button type="button" className="btn btn-sm btn-soft" onClick={() => onAddSide && onAddSide(course.id, mat.id)}>
              <Layers size={14} className="me-1 align-text-bottom" aria-hidden="true" />
              Side material
            </button>
            {!isGlobal ? (
              <>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onToggle && onToggle(course.id, mat.id)}>
                  {mat.hidden ? <Eye size={14} className="me-1 align-text-bottom" aria-hidden="true" /> : null}
                  {mat.hidden ? "Publish" : "Hide"}
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onEdit && onEdit(course.id, mat.id)}>
                  <Pencil size={14} className="me-1 align-text-bottom" aria-hidden="true" />
                  Edit
                </button>
                <button type="button" className="btn btn-sm btn-coral" onClick={() => onDelete && onDelete(course.id, mat.id)}>
                  <Trash2 size={14} className="me-1 align-text-bottom" aria-hidden="true" />
                  Delete
                </button>
              </>
            ) : null}
          </>
        ) : null}
        {isGlobal ? (
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => goSublist(course.id)}>
            <FolderOpen size={14} className="me-1 align-text-bottom" aria-hidden="true" />
            Open course
          </button>
        ) : null}
        {ytId ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setVideoTarget({ courseId: course.id, materialId: mat.id })}>
            <Play size={14} className="me-1 align-text-bottom" aria-hidden="true" />
            {progress ? (progress.completed ? "Watch again" : `Resume ${progress.percent}%`) : "Watch video"}
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => requestDownload(course.id, mat.id)}>
            {locked ? <Lock size={14} className="me-1 align-text-bottom" aria-hidden="true" /> : <Download size={14} className="me-1 align-text-bottom" aria-hidden="true" />}
            {free ? "Download free" : "Download"}
          </button>
        )}
      </div>
    </div>
  );
}
