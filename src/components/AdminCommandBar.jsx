import React, { useMemo, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { doesDocumentMatchQuery, formatMaterialTerm } from "../lib/utils.js";

const KIND_LABEL = { course: "Course", material: "Material", student: "Student" };

function courseText(course) {
  return [course.name, course.code, course.college, course.description, ...(course.subcategories || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function AdminCommandBar({ onSelectTab, onOpenCourse }) {
  const { coursesData, usersData } = useApp();
  const [term, setTerm] = useState("");

  const results = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (needle.length < 2) return [];

    const courses = coursesData
      .filter((course) => courseText(course).includes(needle))
      .slice(0, 4)
      .map((course) => ({
        key: `course-${course.id}`,
        kind: "course",
        title: course.name,
        hint: `${course.college || "Unassigned"} · ${(course.materials || []).length} files`,
        action: () => onOpenCourse(course.id)
      }));

    const materials = [];
    coursesData.forEach((course) => {
      (course.materials || []).forEach((mat) => {
        if (materials.length >= 6 || !doesDocumentMatchQuery(course, mat, needle)) return;
        materials.push({
          key: `material-${course.id}-${mat.id}`,
          kind: "material",
          title: mat.name,
          hint: `${course.name} · ${formatMaterialTerm(mat)} · ${mat.hidden ? "hidden" : "published"}`,
          action: () => onOpenCourse(course.id, mat.name)
        });
      });
    });

    const students = usersData
      .filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(needle))
      .slice(0, 3)
      .map((user) => ({
        key: `student-${user.id}`,
        kind: "student",
        title: user.name || user.email,
        hint: `${user.email} · ${user.accountPlan || "unpaid"}`,
        action: () => onSelectTab("users")
      }));

    return [...courses, ...materials, ...students];
  }, [coursesData, onOpenCourse, onSelectTab, term, usersData]);

  return (
    <div className="card p-3">
      <div className="d-flex flex-wrap align-items-center gap-2">
        <input
          className="form-control form-control-sm"
          style={{ maxWidth: 420 }}
          placeholder="Search the whole site — courses, documents, students…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Admin search"
        />
        <span className="small text-secondary">Jump straight to anything, then edit it in place.</span>
        {term ? (
          <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={() => setTerm("")}>
            Clear
          </button>
        ) : null}
      </div>

      {term.trim().length >= 2 ? (
        results.length === 0 ? (
          <p className="small text-secondary mt-3 mb-0">No course, document or student matches “{term.trim()}”.</p>
        ) : (
          <ul className="list-unstyled mt-3 mb-0 d-flex flex-column gap-2">
            {results.map((item) => (
              <li key={item.key} className="d-flex align-items-center gap-3">
                <span className="tag">{KIND_LABEL[item.kind]}</span>
                <span className="flex-grow-1" style={{ minWidth: 0 }}>
                  <span className="d-block small fw-semibold text-truncate">{item.title}</span>
                  <span className="d-block mono text-secondary" style={{ fontSize: 11 }}>
                    {item.hint}
                  </span>
                </span>
                <button type="button" className="btn btn-sm btn-soft py-0" onClick={item.action}>
                  Open
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
