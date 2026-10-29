import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Modal from "./Modal.jsx";

/**
 * Which accounts may open one restricted course. Staff are left out of the list: they
 * already see the whole library, so a tick there would only be noise.
 */
export default function CourseStudentsModal({ course, onClose }) {
  const { usersData, setCourseAccess, toast } = useApp();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    if (!course) return;
    setSearch("");
    setPicked(
      usersData
        .filter((user) => (user.role || "user") === "user")
        .filter((user) => (user.allowedCourseIds || []).includes(course.id))
        .map((user) => user.id)
    );
    // The roster is seeded once per course; later store saves must not wipe a half-made edit.
  }, [course]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return usersData
      .filter((user) => (user.role || "user") === "user")
      .filter(
        (user) =>
          !needle ||
          (user.name || "").toLowerCase().includes(needle) ||
          (user.email || "").toLowerCase().includes(needle) ||
          (user.department || "").toLowerCase().includes(needle)
      )
      .sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));
  }, [search, usersData]);

  const toggle = (userId) =>
    setPicked((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));

  const save = () => {
    const res = setCourseAccess(course.id, picked);
    if (!res || res.ok === false) {
      toast((res && res.error) || "Could not save the access list.");
      return;
    }
    toast(`${course.name} is open to ${picked.length} ${picked.length === 1 ? "account" : "accounts"}.`);
    onClose();
  };

  return (
    <Modal
      open={Boolean(course)}
      onClose={onClose}
      title="Accounts that can open this course"
      subtitle={course ? `${course.name} · only the accounts ticked below open it` : ""}
    >
      {course ? (
        <div className="d-flex flex-column gap-2">
          <input
            className="form-control form-control-sm"
            placeholder="Search name, email or department"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ maxHeight: "min(52vh, 420px)", overflowY: "auto" }}>
            <ul className="list-unstyled mb-0 d-flex flex-column">
              {rows.map((user) => (
                <li key={user.id} className="form-check d-flex align-items-center gap-2 mb-0">
                  <input
                    className="form-check-input mt-0 flex-shrink-0"
                    type="checkbox"
                    id={`student-${user.id}`}
                    checked={picked.includes(user.id)}
                    onChange={() => toggle(user.id)}
                  />
                  <label className="form-check-label small d-flex align-items-center gap-2 w-100" htmlFor={`student-${user.id}`}>
                    <span className="text-truncate fw-semibold">{user.name || user.email}</span>
                    <span className="text-secondary text-truncate">{user.email}</span>
                  </label>
                </li>
              ))}
            </ul>
            {!rows.length ? <p className="small text-secondary mb-0">No account matches this search.</p> : null}
          </div>

          <div className="d-flex flex-wrap align-items-center gap-2 pt-2">
            <span className="small text-secondary">
              {picked.length} assigned
              {picked.length ? (
                <button type="button" className="btn btn-sm btn-link p-0 ms-2 align-baseline" onClick={() => setPicked([])}>
                  Clear all
                </button>
              ) : null}
            </span>
            <span className="flex-grow-1" />
            <button type="button" className="btn btn-sm btn-outline-secondary py-0" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-sm btn-primary py-0" onClick={save}>
              Save access
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
