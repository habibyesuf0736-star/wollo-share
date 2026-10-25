import React, { useEffect, useMemo, useState } from "react";
import Modal from "./Modal.jsx";
import FileInput from "./FileInput.jsx";
import { useApp } from "../store/AppContext.jsx";
import { DEFAULT_SUBCATEGORIES, MATERIAL_TYPES, buildProgramSemesterLabels, uniqueId } from "../lib/utils.js";

const BLANK = {
  name: "",
  description: "",
  college: "",
  icon: "",
  color: "#1d624f",
  durationYears: 1,
  defaultYear: "Year 1",
  restricted: false,
  subcategories: DEFAULT_SUBCATEGORIES.join(", ")
};

export default function CourseFormModal({ open, onClose, courseId }) {
  const { coursesData, addCourse, updateCourse, toast } = useApp();
  const editing = useMemo(() => coursesData.find((c) => c.id === courseId), [coursesData, courseId]);
  const colleges = useMemo(
    () => Array.from(new Set(coursesData.map((c) => c.college).filter(Boolean))).sort(),
    [coursesData]
  );
  const [form, setForm] = useState(BLANK);
  const [draftMaterials, setDraftMaterials] = useState([]);
  const [draftFile, setDraftFile] = useState(null);
  const [draft, setDraft] = useState({ name: "", type: "PDF", size: "2.0 MB", year: "Year 1", semester: "First Semester", subcategory: "Lecture Notes" });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name || "",
        description: editing.description || "",
        college: editing.college || "",
        icon: editing.icon || "",
        color: editing.color || "#1d624f",
        durationYears: Number(editing.durationYears) || 1,
        defaultYear: editing.defaultYear || "Year 1",
        restricted: Boolean(editing.restricted),
        subcategories: (editing.subcategories || DEFAULT_SUBCATEGORIES).join(", ")
      });
      setDraftMaterials([]);
    } else {
      setForm(BLANK);
      setDraftMaterials([]);
    }
    setDraftFile(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, courseId]);

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast("A course title is required.");
      return;
    }
    const durationYears = Math.max(1, Math.min(7, Number(form.durationYears) || 1));
    const semesters = buildProgramSemesterLabels(durationYears);
    const years = Array.from({ length: durationYears }, (_, i) => `Year ${i + 1}`);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || `${form.name.trim()} study materials for Wollo University students.`,
      college: form.college.trim() || "Common Freshman Courses",
      icon: form.icon.trim() || form.name.trim().slice(0, 4).toUpperCase(),
      color: form.color,
      durationYears,
      years,
      semesters,
      defaultYear: years.includes(form.defaultYear) ? form.defaultYear : years[0],
      restricted: form.restricted,
      allowStudentSideMaterials: true,
      subcategories: form.subcategories
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    };

    if (editing) {
      updateCourse(editing.id, payload);
      toast(`Course "${payload.name}" updated`);
    } else {
      const created = addCourse({ ...payload, id: uniqueId("course"), materials: draftMaterials });
      toast(`Course "${created.name}" created with ${draftMaterials.length} material(s)`);
    }
    setDraftMaterials([]);
    onClose();
  };

  const addDraftMaterial = () => {
    if (!draft.name.trim()) {
      toast("Type a material title first.");
      return;
    }
    setDraftMaterials((prev) => [
      ...prev,
      {
        id: uniqueId("mat"),
        name: draft.name.trim(),
        type: draft.type,
        size: draft.size,
        url: draftFile && draftFile.dataUrl ? draftFile.dataUrl : "#sample-file",
        year: draft.year,
        semester: draft.semester,
        subcategory: draft.subcategory,
        department: form.name,
        hidden: false,
        ratingAvg: 0,
        ratingCount: 0,
        sideMaterials: []
      }
    ]);
    setDraftFile(null);
    setDraft((prev) => ({ ...prev, name: "" }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : "Create a new course"}
      subtitle="Course structure drives the year, semester and category filters students use."
      size="wide"
    >
      <form onSubmit={submit} className="d-flex flex-column gap-3">
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold">Course / program title</label>
            <input className="form-control" value={form.name} onChange={(e) => update({ name: e.target.value })} />
          </div>
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold">College or school</label>
            <input
              className="form-control"
              list="wollo-college-suggestions"
              value={form.college}
              onChange={(e) => update({ college: e.target.value })}
              placeholder="Common Freshman Courses"
            />
            <datalist id="wollo-college-suggestions">
              {colleges.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="col-12">
            <label className="form-label small fw-semibold">Description</label>
            <textarea className="form-control" rows={2} value={form.description} onChange={(e) => update({ description: e.target.value })} />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Course code</label>
            <input className="form-control" value={form.icon} onChange={(e) => update({ icon: e.target.value })} placeholder="e.g. CScw" />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Years</label>
            <select className="form-select" value={form.durationYears} onChange={(e) => update({ durationYears: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} year{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Default year</label>
            <select className="form-select" value={form.defaultYear} onChange={(e) => update({ defaultYear: e.target.value })}>
              {Array.from({ length: Math.max(1, Number(form.durationYears) || 1) }, (_, i) => `Year ${i + 1}`).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">Accent colour</label>
            <input type="color" className="form-control form-control-color w-100" value={form.color} onChange={(e) => update({ color: e.target.value })} />
          </div>
          <div className="col-12">
            <label className="form-label small fw-semibold">Categories (comma separated)</label>
            <input className="form-control" value={form.subcategories} onChange={(e) => update({ subcategories: e.target.value })} />
          </div>
          <div className="col-12">
            <div className="form-check form-switch">
              <input
                className="form-check-input"
                type="checkbox"
                id="courseRestrictedSwitch"
                checked={form.restricted}
                onChange={(e) => update({ restricted: e.target.checked })}
              />
              <label className="form-check-label small" htmlFor="courseRestrictedSwitch">
                Restrict to assigned / paid student accounts
              </label>
            </div>
          </div>
        </div>

        {!editing ? (
          <div className="card p-3">
            <h4 className="h6 mb-3">Add materials now (optional)</h4>
            <div className="row g-2">
              <div className="col-12 col-md-5">
                <input
                  className="form-control"
                  placeholder="Material title"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="col-6 col-md-2">
                <select className="form-select" value={draft.year} onChange={(e) => setDraft({ ...draft, year: e.target.value })}>
                  {Array.from({ length: Math.max(1, Number(form.durationYears) || 1) }, (_, i) => `Year ${i + 1}`).map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="col-6 col-md-2">
                <select className="form-select" value={draft.semester} onChange={(e) => setDraft({ ...draft, semester: e.target.value })}>
                  <option>First Semester</option>
                  <option>Second Semester</option>
                </select>
              </div>
              <div className="col-6 col-md-2">
                <select className="form-select" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                  {MATERIAL_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="col-6 col-md-1">
                <input className="form-control" value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value })} />
              </div>
              <div className="col-12">
                <FileInput onFile={(picked) => setDraftFile(picked)} />
              </div>
              <div className="col-12">
                <button type="button" className="btn btn-soft btn-sm" onClick={addDraftMaterial}>
                  + Queue material
                </button>
              </div>
            </div>
            {draftMaterials.length ? (
              <ul className="list-unstyled mt-3 mb-0 d-flex flex-column gap-1">
                {draftMaterials.map((m) => (
                  <li key={m.id} className="d-flex justify-content-between align-items-center small">
                    <span>
                      {m.name} <span className="text-secondary">· {m.year} · {m.semester} · {m.type}</span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-coral py-0"
                      onClick={() => setDraftMaterials((prev) => prev.filter((x) => x.id !== m.id))}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            {editing ? "Save course" : "Create course"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
