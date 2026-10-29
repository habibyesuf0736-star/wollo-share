import React, { useMemo, useState } from "react";
import { useApp } from "../../store/AppContext.jsx";
import CourseFormModal from "../../components/CourseFormModal.jsx";
import CourseStudentsModal from "../../components/CourseStudentsModal.jsx";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import { courseAverageRating, isStaffOnlyCourse, sanitizeCourseCode } from "../../lib/utils.js";

export default function AdminCourses() {
  const { coursesData, usersData, updateCourse, deleteCourse, moveCourse, toast } = useApp();
  const [search, setSearch] = useState("");
  const [college, setCollege] = useState("All");
  const [modal, setModal] = useState({ open: false, courseId: null });
  const [confirm, setConfirm] = useState({ open: false, courseId: null });
  const [accessCourse, setAccessCourse] = useState(null);

  const assignedCount = (course) =>
    usersData.filter((user) => (user.role || "user") === "user" && (user.allowedCourseIds || []).includes(course.id)).length;

  const colleges = useMemo(() => Array.from(new Set(coursesData.map((c) => c.college).filter(Boolean))).sort(), [coursesData]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return coursesData.filter((c) => {
      if (college !== "All" && c.college !== college) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.icon || "").toLowerCase().includes(needle) ||
        (c.description || "").toLowerCase().includes(needle)
      );
    });
  }, [college, coursesData, search]);

  return (
    <div className="d-flex flex-column gap-3">
      <div className="card p-3">
        <div className="row g-2 align-items-end">
          <div className="col-12 col-md-5">
            <label className="form-label small fw-semibold">Search courses</label>
            <input className="form-control" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, code or description" />
          </div>
          <div className="col-6 col-md-3">
            <label className="form-label small fw-semibold">College</label>
            <select className="form-select" value={college} onChange={(e) => setCollege(e.target.value)}>
              <option value="All">All colleges</option>
              {colleges.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="col-6 col-md-4 text-md-end">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ open: true, courseId: null })}>
              + New course
            </button>
          </div>
        </div>
      </div>

      <div className="card p-0 table-responsive table-stack">
        <table className="table table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Course</th>
              <th>College</th>
              <th>Structure</th>
              <th>Files</th>
              <th>Rating</th>
              <th>Access</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((course) => {
              const index = coursesData.indexOf(course);
              const avg = courseAverageRating(course);
              const files = (course.materials || []).length;
              return (
                <tr key={course.id}>
                  <td data-label="Course">
                    <div className="fw-semibold">{course.name}</div>
                    <div className="mono small text-secondary">{sanitizeCourseCode(course.icon, course.name)}</div>
                  </td>
                  <td className="small" data-label="College">{course.college}</td>
                  <td className="small" data-label="Structure">
                    {course.durationYears || 1} yr · {(course.semesters || []).length} semesters · default {course.defaultYear}
                  </td>
                  <td className="small" data-label="Files">
                    {files} {course.materials && course.materials.some((m) => m.hidden) ? `(${course.materials.filter((m) => m.hidden).length} hidden)` : ""}
                  </td>
                  <td className="small" data-label="Rating">{avg ? `${avg.toFixed(1)} ★` : "—"}</td>
                  <td data-label="Access">
                    <button
                      type="button"
                      className={`btn btn-sm ${course.restricted ? "btn-coral" : "btn-soft"}`}
                      onClick={() => {
                        updateCourse(course.id, { restricted: !course.restricted });
                        toast(course.restricted ? `${course.name} is now public.` : `${course.name} is now restricted to assigned accounts.`);
                      }}
                    >
                      {course.restricted ? "Restricted" : "Public"}
                    </button>
                    <div className="mt-1 d-flex align-items-center gap-2">
                      {isStaffOnlyCourse(course) ? <span className="small text-secondary">Staff only</span> : null}
                      {course.restricted || isStaffOnlyCourse(course) ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary py-0 px-1 border-0"
                          title="Choose which accounts may open this course"
                          onClick={() => setAccessCourse(course)}
                        >
                          {assignedCount(course)} assigned
                        </button>
                      ) : (
                        <span className="small text-secondary">Everyone</span>
                      )}
                    </div>
                  </td>
                  <td className="text-end table-actions">
                    <div className="d-flex gap-1 flex-wrap justify-content-end">
                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" title="Move up" onClick={() => moveCourse(index, -1)}>
                        ↑
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-secondary py-0" title="Move down" onClick={() => moveCourse(index, 1)}>
                        ↓
                      </button>
                      <button type="button" className="btn btn-sm btn-soft py-0" onClick={() => setModal({ open: true, courseId: course.id })}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-coral py-0" onClick={() => setConfirm({ open: true, courseId: course.id })}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-secondary small py-4">
                  No courses match this search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <CourseStudentsModal course={accessCourse} onClose={() => setAccessCourse(null)} />
      <CourseFormModal open={modal.open} courseId={modal.courseId} onClose={() => setModal({ open: false, courseId: null })} />
      <ConfirmModal
        open={confirm.open}
        title="Delete course"
        message="This removes the course and every material it holds."
        onConfirm={() => {
          deleteCourse(confirm.courseId);
          toast("Course deleted.");
        }}
        onClose={() => setConfirm({ open: false, courseId: null })}
      />
    </div>
  );
}
