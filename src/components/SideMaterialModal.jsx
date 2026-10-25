import React, { useState } from "react";
import Modal from "./Modal.jsx";
import FileInput from "./FileInput.jsx";
import { useApp } from "../store/AppContext.jsx";
import { MATERIAL_TYPES } from "../lib/utils.js";

export default function SideMaterialModal({ open, onClose, courseId, materialId }) {
  const { coursesData, addSideMaterial, toast } = useApp();
  const course = coursesData.find((c) => c.id === courseId);
  const mat = course ? (course.materials || []).find((m) => m.id === materialId) : null;
  const [form, setForm] = useState({ name: "", type: "PDF", size: "1.4 MB", url: "" });
  const [file, setFile] = useState(null);

  if (!course || !mat) return null;

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast("Name the companion material.");
      return;
    }
    addSideMaterial(courseId, materialId, {
      name: form.name.trim(),
      type: form.type,
      size: form.size.trim() || "1.0 MB",
      url: file && file.dataUrl ? file.dataUrl : form.url.trim() || "#sample-file"
    });
    toast(`Companion material added to "${mat.name}"`);
    setForm({ name: "", type: "PDF", size: "1.4 MB", url: "" });
    setFile(null);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add side material" subtitle={`Companion file for “${mat.name}”`} size="narrow">
      <form onSubmit={submit} className="d-flex flex-column gap-3">
        <input
          className="form-control"
          placeholder="Companion title (e.g. Slide PDF, Transcript)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <div className="d-flex gap-2">
          <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {MATERIAL_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input
            className="form-control"
            style={{ maxWidth: 120 }}
            value={form.size}
            onChange={(e) => setForm({ ...form, size: e.target.value })}
          />
        </div>
        <input
          className="form-control"
          placeholder="https:// direct link (optional)"
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
        />
        <FileInput onFile={(picked) => setFile(picked)} />
        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save side material
          </button>
        </div>
      </form>
    </Modal>
  );
}
