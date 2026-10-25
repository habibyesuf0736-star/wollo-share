import React, { useMemo } from "react";
import { buildDepartmentGroups } from "../lib/departments.js";

export default function DepartmentSelect({
  coursesData,
  value,
  onChange,
  id,
  placeholder = "Select your department / program",
  className = "form-select"
}) {
  const groups = useMemo(() => buildDepartmentGroups(coursesData), [coursesData]);
  const known = groups.some((group) => group.programs.includes(value));

  return (
    <select id={id} className={className} value={value || ""} onChange={(event) => onChange(event.target.value)}>
      <option value="">{placeholder}</option>
      {/* Legacy free-text departments stay selectable so editing an old account never silently drops them. */}
      {value && !known ? <option value={value}>{value} (saved)</option> : null}
      {groups.map((group) => (
        <optgroup key={group.college} label={group.college}>
          {group.programs.map((program) => (
            <option key={program} value={program}>
              {program}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
