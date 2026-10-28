import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import Modal from "./Modal.jsx";
import FileInput from "./FileInput.jsx";
import DepartmentSelect from "./DepartmentSelect.jsx";
import { useApp } from "../store/AppContext.jsx";
import { catalogDepartmentName } from "../lib/departments.js";
import { DEFAULT_SUBCATEGORIES, MATERIAL_TYPES, getCourseSemesterEntries } from "../lib/utils.js";

export default function ShareMaterialModal() {
  const {
    gate,
    closeGate,
    coursesData,
    canSeeCourse,
    submitMaterialForReview,
    activeUser,
    goLogin,
    session,
    toast,
    downloadStatus,
    mySubmissions
  } = useApp();
  const open = Boolean(gate && gate.type === "share");
  const accessible = useMemo(() => coursesData.filter(canSeeCourse), [canSeeCourse, coursesData]);

  const [courseQuery, setCourseQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [year, setYear] = useState("Year 1");
  const [semester, setSemester] = useState("First Semester");
  const [subcategory, setSubcategory] = useState("Lecture Notes");
  const [form, setForm] = useState({ name: "", type: "PDF", size: "2.0 MB", url: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const course = useMemo(() => {
    const q = courseQuery.trim().toLowerCase();
    if (!q) return null;
    return (
      accessible.find((c) => c.name.trim().toLowerCase() === q) ||
      accessible.find((c) => String(c.id).toLowerCase() === q) ||
      null
    );
  }, [accessible, courseQuery]);

  useEffect(() => {
    if (!open) return;
    setCourseQuery((prev) => {
      if (prev) return prev;
      const fromGate = gate.courseId && coursesData.find((c) => c.id === gate.courseId);
      return (fromGate && fromGate.name) || (accessible[0] && accessible[0].name) || "";
    });
    setDepartment((prev) => prev || catalogDepartmentName(coursesData, activeUser?.department));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!course) return;
    const entries = getCourseSemesterEntries(course);
    if (!entries.some((e) => e.year === year && e.sem === semester)) {
      const first = entries.find((e) => e.year === year) || entries[0];
      if (first) {
        setYear(first.year);
        setSemester(first.sem);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id]);

  if (!open) return null;

  const years = Array.from(new Set(getCourseSemesterEntries(course || { durationYears: 1 }).map((e) => e.year)));
  const semesters = Array.from(
    new Set(getCourseSemesterEntries(course || { durationYears: 1 }).filter((e) => e.year === year).map((e) => e.sem))
  );
  const subcategories = Array.from(new Set([...((course && course.subcategories) || DEFAULT_SUBCATEGORIES), ...DEFAULT_SUBCATEGORIES]));

  const submit = async (event) => {
    event.preventDefault();
    if (!session) {
      closeGate();
      goLogin();
      return;
    }
    if (!course) {
      setError("Pick a course.");
      return;
    }
    if (!form.name.trim() && !file) {
      toast("Add a title or attach the document you are sharing.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await submitMaterialForReview({
      courseId: course.id,
      name: (form.name || (file && file.name) || "").trim(),
      type: form.type,
      size: form.size || (file && file.size) || "2.0 MB",
      url: file && file.dataUrl ? file.dataUrl : form.url.trim() || "#sample-file",
      year,
      semester,
      subcategory,
      department,
      contributorName: activeUser?.name || ""
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not send the document for review.");
      return;
    }
    setForm({ name: "", type: "PDF", size: "2.0 MB", url: "" });
    setFile(null);
    toast("Sent for review.");
    closeGate();
  };

  return (
    <Modal
      open={open}
      onClose={closeGate}
      title="Share a study material"
      subtitle="An admin checks each upload."
    >
      {!session ? (
        <div className="text-center py-4">
          <p className="text-secondary">Sign in to contribute.</p>
          <button type="button" className="btn btn-primary" onClick={() => { closeGate(); goLogin(); }}>
            Go to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="d-flex flex-column gap-3">
          <div className="review-note">
            <strong>Upload 2, unlock 1 download:</strong> {downloadStatus.progress || 0} of{" "}
            {downloadStatus.requiredCount || 2} approved.
          </div>

          {mySubmissions.length ? (
            <ul className="list-group list-group-flush small">
              {mySubmissions.slice(0, 3).map((s) => (
                <li key={s.id} className="list-group-item d-flex justify-content-between align-items-center gap-2 px-0">
                  <span className="text-truncate">
                    {s.name} <span className="text-secondary">· {s.courseName} · {s.year} · {s.semester}</span>
                  </span>
                  <span
                    className={`badge rounded-pill flex-shrink-0 ${
                      s.status === "approved"
                        ? "text-bg-success"
                        : s.status === "pending"
                        ? "text-bg-warning"
                        : "text-bg-secondary"
                    }`}
                  >
                    {s.status === "rejected" && s.decidedBy === "automatic-duplicate-guard" ? "duplicate" : s.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {error ? (
            <div className="alert alert-warning small mb-0" role="alert">
              {error}
            </div>
          ) : null}

          <div className="row g-3">
            <div className="col-12">
              <label className="form-label small fw-semibold" htmlFor="share-course">Contribute to course</label>
              <input
                id="share-course"
                className="form-control"
                list="share-course-options"
                autoComplete="off"
                placeholder="Course name"
                value={courseQuery}
                onChange={(e) => {
                  setCourseQuery(e.target.value);
                  setError("");
                }}
              />
              <datalist id="share-course-options">
                {accessible.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
              <div className="form-text">
                {course ? (
                  <span className="d-inline-flex align-items-center gap-1">
                    <CheckCircle2 size={13} className="text-success" aria-hidden="true" />
                    {course.name}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Document title</label>
              <input
                className="form-control"
                placeholder="e.g. Operating Systems — Chapter 4 notes"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small fw-semibold">Year</label>
              <select className="form-select" value={year} onChange={(e) => setYear(e.target.value)}>
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small fw-semibold">Semester</label>
              <select className="form-select" value={semester} onChange={(e) => setSemester(e.target.value)}>
                {semesters.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label small fw-semibold">Category</label>
              <select className="form-select" value={subcategory} onChange={(e) => setSubcategory(e.target.value)}>
                {Array.from(new Set([...subcategories, ...DEFAULT_SUBCATEGORIES])).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small fw-semibold">Format</label>
              <select className="form-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {MATERIAL_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small fw-semibold">Size</label>
              <input className="form-control" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Department</label>
              <DepartmentSelect coursesData={coursesData} value={department} onChange={setDepartment} />
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">Link or file</label>
              <input
                className="form-control mb-2"
                placeholder="https:// shared document link (optional)"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
              />
              <FileInput onFile={(picked) => setFile(picked)} />
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={closeGate}>
              Not now
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Sending…" : "Send for review"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
