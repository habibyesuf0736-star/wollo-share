import React, { useEffect, useMemo, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import Modal from "./Modal.jsx";
import { assignedCourseIds, isStaffOnlyCourse, sanitizeCourseCode } from "../lib/utils.js";

/**
 * Which restricted courses one account may open. A public course gates nobody, so it is
 * left out of both the list and the saved allow-list.
 */
export default function CourseAccessModal({ user, onClose }) {
  const { coursesData, saveUser, toast } = useApp();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]);

  const gated = useMemo(() => coursesData.filter((course) => course.restricted && !isStaffOnlyCourse(course)), [coursesData]);

  useEffect(() => {
    if (!user) return;
    setSearch("");
    setPicked(assignedCourseIds(user, coursesData));
    // Seeded once per account: a later store save must not wipe a half-made edit.
  }, [user]);

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const byCollege = new Map();
    gated
      .filter(
        (course) =>
          !needle ||
          course.name.toLowerCase().includes(needle) ||
          (course.college || "").toLowerCase().includes(needle) ||
          sanitizeCourseCode(course.icon, course.name).toLowerCase().includes(needle)
      )
      .forEach((course) => {
        const key = course.college || "Other";
        if (!byCollege.has(key)) byCollege.set(key, []);
        byCollege.get(key).push(course);
      });
    return Array.from(byCollege.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [gated, search]);

  const toggle = (courseId) =>
    setPicked((prev) => (prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]));

  const save = () => {
    saveUser({ ...user, allowedCourseIds: picked });
    toast(`${user.name || user.email} can open ${picked.length} restricted ${picked.length === 1 ? "course" : "courses"}.`);
    onClose();
  };

  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title="Course access"
      subtitle={user ? `${user.name || user.email} · restricted courses open only for the accounts assigned to them` : ""}
    >
      {user ? (
        <div className="d-flex flex-column gap-2">
          <input
            className="form-control form-control-sm"
            placeholder="Search course, code or college"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div style={{ maxHeight: "min(52vh, 420px)", overflowY: "auto" }}>
            {groups.map(([college, list]) => (
              <div key={college} className="mb-2">
                <div className="small fw-semibold text-secondary text-uppercase">{college}</div>
                <ul className="list-unstyled mb-0 d-flex flex-column">
                  {list.map((course) => (
                    <li key={course.id} className="form-check d-flex align-items-center gap-2 mb-0">
                      <input
                        className="form-check-input mt-0 flex-shrink-0"
                        type="checkbox"
                        id={`access-${course.id}`}
                        checked={picked.includes(course.id)}
                        onChange={() => toggle(course.id)}
                      />
                      <label className="form-check-label small d-flex align-items-center gap-2 w-100" htmlFor={`access-${course.id}`}>
                        <span className="text-truncate">{course.name}</span>
                        <span className="mono text-secondary flex-shrink-0" style={{ fontSize: 11 }}>
                          {sanitizeCourseCode(course.icon, course.name)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!groups.length ? <p className="small text-secondary mb-0">{gated.length ? "No course matches this search." : "No restricted course yet."}</p> : null}
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
