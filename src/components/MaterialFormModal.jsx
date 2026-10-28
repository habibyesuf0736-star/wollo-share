import React, { useEffect, useState } from "react";
import Modal from "./Modal.jsx";
import FileInput from "./FileInput.jsx";
import { useApp } from "../store/AppContext.jsx";
import { DEFAULT_SUBCATEGORIES, MATERIAL_TYPES, getCourseSemesterEntries } from "../lib/utils.js";

const EMPTY = {
  name: "",
  type: "PDF",
  size: "2.0 MB",
  url: "#sample-file",
  year: "Year 1",
  semester: "First Semester",
  subcategory: "Lecture Notes",
  hidden: false
};

export default function MaterialFormModal({ open, onClose, courseId, materialId, preset }) {
  const { coursesData, addMaterial, updateMaterial, toast } = useApp();
  const course = coursesData.find((c) => c.id === courseId);
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState(null);

  useEffect(() => {
    if (!open || !course) return;
    if (materialId) {
      const mat = (course.materials || []).find((m) => m.id === materialId);
      if (!mat) return;
      setForm({
        name: mat.name || "",
        type: mat.type || "PDF",
        size: mat.size || "1.0 MB",
        url: mat.url && mat.url.startsWith("data:") ? "" : mat.url || "",
        year: mat.year || course.defaultYear || "Year 1",
        semester: mat.semester || "First Semester",
        subcategory: mat.subcategory || "Lecture Notes",
        hidden: Boolean(mat.hidden)
      });
      setFile(mat.url && mat.url.startsWith("data:") ? { name: "(Uploaded local file)", dataUrl: mat.url, size: mat.size, type: mat.type } : null);
    } else {
      const entries = getCourseSemesterEntries(course);
      setForm({
        ...EMPTY,
        year: (preset && preset.year) || course.defaultYear || (entries[0] && entries[0].year) || "Year 1",
        semester: (preset && preset.semester) || (entries[0] && entries[0].sem) || "First Semester",
        subcategory: (preset && preset.subcategory) || (course.subcategories && course.subcategories[0]) || "Lecture Notes"
      });
      setFile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, materialId, courseId]);

  if (!course) return null;

  const years = Array.isArray(course.years) && course.years.length
    ? course.years
    : Array.from({ length: Number(course.durationYears) || 1 }, (_, i) => `Year ${i + 1}`);
  const semesters = (() => {
    const entries = getCourseSemesterEntries(course).filter((e) => e.year === form.year);
    const list = entries.map((e) => e.sem);
    return list.length ? list : ["First Semester", "Second Semester"];
  })();
  const subcategories = course.subcategories && course.subcategories.length ? course.subcategories : DEFAULT_SUBCATEGORIES;

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast("Give the material a title.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      type: form.type,
      size: form.size.trim() || "1.0 MB",
      url: file && file.dataUrl ? file.dataUrl : form.url.trim() || "#sample-file",
      year: form.year,
      semester: semesters.includes(form.semester) ? form.semester : semesters[0],
      subcategory: form.subcategory.trim() || "Lecture Notes",
      department: course.name,
      hidden: form.hidden
    };
    if (materialId) {
      updateMaterial(courseId, materialId, payload);
      toast(`Updated "${payload.name}"`);
    } else {
      addMaterial(courseId, { ...payload, ratingAvg: 0, ratingCount: 0, sideMaterials: [] });
      toast(`Added "${payload.name}" (${payload.year} · ${payload.semester})`);
    }
    setFile(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={materialId ? "Edit material" : `Add material to ${course.name}`}
    >
      <form onSubmit={submit} className="d-flex flex-column gap-3">
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label small fw-semibold">Document title</label>
            <input
              className="form-control"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="e.g. Data Structures — Mid Exam 2024"
            />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Academic year</label>
            <select className="form-select" value={form.year} onChange={(e) => update({ year: e.target.value, semester: "" })}>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Semester</label>
            <select className="form-select" value={form.semester} onChange={(e) => update({ semester: e.target.value })}>
              {semesters.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold">Category</label>
            <input
              className="form-control"
              list="wollo-subcategory-suggestions"
              value={form.subcategory}
              onChange={(e) => update({ subcategory: e.target.value })}
            />
            <datalist id="wollo-subcategory-suggestions">
              {subcategories.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Format</label>
            <select className="form-select" value={form.type} onChange={(e) => update({ type: e.target.value })}>
              {MATERIAL_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Size</label>
            <input className="form-control" value={form.size} onChange={(e) => update({ size: e.target.value })} />
          </div>
          <div className="col-12">
            <label className="form-label small fw-semibold">Direct link (optional)</label>
            <input
              className="form-control"
              placeholder="https://… or leave blank for an uploaded file"
              value={form.url}
              onChange={(e) => update({ url: e.target.value })}
            />
          </div>
          <div className="col-12">
            <label className="form-label small fw-semibold">Upload file</label>
            <FileInput
              onFile={(picked) => {
                setFile(picked);
                if (picked) {
                  update({
                    name: form.name || picked.name,
                    size: picked.size,
                    type: picked.type,
                    url: ""
                  });
                }
              }}
            />
          </div>
          <div className="col-12">
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                id="materialHiddenSwitch"
                checked={form.hidden}
                onChange={(e) => update({ hidden: e.target.checked })}
              />
              <label className="form-check-label small" htmlFor="materialHiddenSwitch">
                Hide from students (admin only)
              </label>
            </div>
          </div>
        </div>

        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {materialId ? "Save changes" : "Add material"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
