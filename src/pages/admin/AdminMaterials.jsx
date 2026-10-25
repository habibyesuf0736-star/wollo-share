import React, { useMemo, useState } from "react";
import { useApp } from "../../store/AppContext.jsx";
import MaterialFormModal from "../../components/MaterialFormModal.jsx";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import { doesDocumentMatchQuery, formatMaterialTerm } from "../../lib/utils.js";

const MAX_ROWS = 300;

export default function AdminMaterials() {
  const { coursesData, deleteMaterial, toggleMaterialVisibility, toast } = useApp();
  const [courseFilter, setCourseFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState({ open: false, courseId: null, materialId: null });
  const [confirm, setConfirm] = useState({ open: false, courseId: null, materialId: null, bulk: false });
  const [selected, setSelected] = useState(() => new Set());

  const keyOf = (courseId, materialId) => `${courseId}|${materialId}`;

  const rows = useMemo(() => {
    const list = [];
    coursesData.forEach((course) => {
      if (courseFilter !== "All" && course.id !== courseFilter) return;
      (course.materials || []).forEach((mat) => {
        if (typeFilter !== "All" && (mat.type || "Other") !== typeFilter) return;
        if (statusFilter === "hidden" && !mat.hidden) return;
        if (statusFilter === "visible" && mat.hidden) return;
        if (statusFilter === "student" && !mat.sharedBy) return;
        if (search.trim() && !doesDocumentMatchQuery(course, mat, search.trim())) return;
        list.push({ course, mat });
      });
    });
    return list;
  }, [courseFilter, coursesData, search, statusFilter, typeFilter]);

  const types = useMemo(
    () => Array.from(new Set(coursesData.flatMap((c) => (c.materials || []).map((m) => m.type || "Other")))).sort(),
    [coursesData]
  );

  const totalMaterials = coursesData.reduce((sum, c) => sum + (c.materials || []).length, 0);
  const visible = rows.slice(0, MAX_ROWS);
  const selectedRows = visible.filter(({ course, mat }) => selected.has(keyOf(course.id, mat.id)));
  const allSelected = visible.length > 0 && selectedRows.length === visible.length;

  const toggleOne = (key) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAll = () =>
    setSelected(
      allSelected ? new Set() : new Set(visible.map(({ course, mat }) => keyOf(course.id, mat.id)))
    );

  const bulkVisibility = (hidden) => {
    let changed = 0;
    selectedRows.forEach(({ course, mat }) => {
      if (!!mat.hidden !== hidden) {
        toggleMaterialVisibility(course.id, mat.id);
        changed += 1;
      }
    });
    toast(changed ? `${changed} material(s) ${hidden ? "hidden from students" : "published"}` : "Nothing to change.");
    setSelected(new Set());
  };

  const bulkDelete = () => {
    const count = selectedRows.length;
    selectedRows.forEach(({ course, mat }) => deleteMaterial(course.id, mat.id));
    toast(`${count} material(s) deleted.`);
    setSelected(new Set());
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card p-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <div>
            <h3 className="h6 mb-1">Central material control</h3>
            <p className="small text-secondary mb-0">
              {rows.length} of {totalMaterials} documents match the current filters.
            </p>
          </div>
          <div className="d-flex gap-2 flex-grow-1 justify-content-sm-end" style={{ minWidth: 0 }}>
            <select
              className="form-select form-select-sm"
              style={{ width: "auto", maxWidth: "100%" }}
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setModal({ open: true, courseId: e.target.value, materialId: null });
                e.target.value = "";
              }}
            >
              <option value="">+ Add material to…</option>
              {coursesData.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row g-2">
          <div className="col-12 col-md-4">
            <input className="form-control form-control-sm" placeholder="Search title, format, semester…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="col-6 col-md-3">
            <select className="form-select form-select-sm" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="All">All courses</option>
              {coursesData.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-3 col-md-2">
            <select className="form-select form-select-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="All">Any format</option>
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="col-3 col-md-3">
            <select className="form-select form-select-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="visible">Published only</option>
              <option value="hidden">Hidden only</option>
              <option value="student">Student-shared</option>
            </select>
          </div>
        </div>

        {selectedRows.length > 0 ? (
          <div className="d-flex flex-wrap align-items-center gap-2 mt-3 p-2 rounded-3" style={{ background: "var(--green-soft)" }}>
            <span className="small fw-semibold">{selectedRows.length} selected</span>
            <button type="button" className="btn btn-sm btn-primary py-0" onClick={() => bulkVisibility(false)}>
              Publish
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={() => bulkVisibility(true)}>
              Hide
            </button>
            <button
              type="button"
              className="btn btn-sm btn-coral py-0"
              onClick={() => setConfirm({ open: true, courseId: null, materialId: null, bulk: true })}
            >
              Delete
            </button>
            <button type="button" className="btn btn-sm btn-link py-0 ms-auto" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </div>
        ) : null}
      </div>

      <div className="card p-0 table-responsive table-stack">
        <table className="table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  className="form-check-input m-0"
                  type="checkbox"
                  aria-label="Select all matching materials"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              <th>Material</th>
              <th>Course</th>
              <th>Placement</th>
              <th>Format</th>
              <th>Rating</th>
              <th>Status</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ course, mat }) => (
              <tr key={`${course.id}-${mat.id}`}>
                <td data-label="Select">
                  <input
                    className="form-check-input m-0"
                    type="checkbox"
                    aria-label={`Select ${mat.name}`}
                    checked={selected.has(keyOf(course.id, mat.id))}
                    onChange={() => toggleOne(keyOf(course.id, mat.id))}
                  />
                </td>
                <td data-label="Material">
                  <div className="fw-semibold table-cell-title" style={{ maxWidth: 320 }}>
                    {mat.name}
                  </div>
                  {mat.sharedBy ? <div className="small text-secondary">Shared by {mat.sharedBy}</div> : null}
                </td>
                <td className="small" data-label="Course">{course.name}</td>
                <td className="small" data-label="Placement">
                  {formatMaterialTerm(mat)} · {mat.subcategory || "Lecture Notes"}
                </td>
                <td className="small" data-label="Format">
                  {mat.type} · {mat.size}
                </td>
                <td className="small" data-label="Rating">
                  {mat.ratingAvg ? `${mat.ratingAvg.toFixed(1)} ★ (${mat.ratingCount})` : "—"}
                </td>
                <td data-label="Status">
                  <span className={`badge ${mat.hidden ? "text-bg-warning" : "text-bg-success"}`}>{mat.hidden ? "Hidden" : "Published"}</span>
                </td>
                <td className="text-end table-actions">
                  <div className="d-flex gap-1 flex-wrap justify-content-end">
                    <button type="button" className="btn btn-sm btn-soft py-0" onClick={() => setModal({ open: true, courseId: course.id, materialId: mat.id })}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary py-0"
                      onClick={() => {
                        toggleMaterialVisibility(course.id, mat.id);
                        toast(mat.hidden ? `Published "${mat.name}"` : `Hidden "${mat.name}" from students`);
                      }}
                    >
                      {mat.hidden ? "Publish" : "Hide"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-coral py-0"
                      onClick={() => setConfirm({ open: true, courseId: course.id, materialId: mat.id })}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-secondary small py-4">
                  No materials match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {rows.length > MAX_ROWS ? (
          <p className="small text-secondary px-3 py-2 mb-0">Showing the first {MAX_ROWS} rows — narrow the filters to see the rest.</p>
        ) : null}
      </div>

      <MaterialFormModal
        open={modal.open}
        courseId={modal.courseId}
        materialId={modal.materialId}
        onClose={() => setModal({ open: false, courseId: null, materialId: null })}
      />
      <ConfirmModal
        open={confirm.open}
        title={confirm.bulk ? "Delete selected materials" : "Delete material"}
        message={
          confirm.bulk
            ? `${selectedRows.length} document(s) will be removed from their courses immediately.`
            : "This document will be removed from the course library immediately."
        }
        onConfirm={() => {
          if (confirm.bulk) bulkDelete();
          else {
            deleteMaterial(confirm.courseId, confirm.materialId);
            toast("Material deleted.");
          }
        }}
        onClose={() => setConfirm({ open: false, courseId: null, materialId: null, bulk: false })}
      />
    </div>
  );
}
