import React, { useMemo } from "react";
import SearchSelect from "./SearchSelect.jsx";
import { buildDepartmentGroups } from "../lib/departments.js";

export default function DepartmentSelect({
  coursesData,
  value,
  onChange,
  id,
  placeholder = "Type or pick your department / program",
  className = "form-control"
}) {
  const groups = useMemo(() => buildDepartmentGroups(coursesData), [coursesData]);
  const options = useMemo(() => {
    const list = groups.flatMap((group) =>
      group.programs.map((program) => ({ value: program, label: program, group: group.college }))
    );
    // Legacy free-text departments stay selectable so editing an old account never silently drops them.
    if (value && !list.some((option) => option.value === value)) {
      list.unshift({ value, label: `${value} (saved)`, group: "Saved on this account" });
    }
    return list;
  }, [groups, value]);

  return (
    <SearchSelect
      id={id}
      className={className}
      value={value || ""}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      ariaLabel="Department / program"
      emptyLabel="No program matches — try another spelling."
    />
  );
}
