// Department handling: catalog programs grouped by college, plus tolerant matching
// for accounts registered before departments became a select ("information tecnology").
export function normalizeDepartment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export function isProgramCourse(course) {
  return String((course && course.id) || "").startsWith("prog-");
}

// Most new students start in Year 1, so the signup forms default to this department and it
// matches every Common Freshman course instead of one program.
export const FRESHMAN_DEPARTMENT = "Freshman (Year 1)";

export function isFreshmanDepartment(value) {
  const needle = normalizeDepartment(value);
  return needle.includes("freshman") || /(^| )year ?1( |$)/.test(needle);
}

export function buildDepartmentGroups(coursesData) {
  const groups = new Map([["Common Freshman Courses", [FRESHMAN_DEPARTMENT]]]);
  (coursesData || []).forEach((course) => {
    if (!isProgramCourse(course)) return;
    const college = course.college || "Other programs";
    if (!groups.has(college)) groups.set(college, []);
    groups.get(college).push(course.name);
  });
  return Array.from(groups, ([college, programs]) => ({
    college,
    programs: programs.sort((a, b) => a.localeCompare(b))
  })).sort((a, b) => {
    // The freshman group always leads; students pick out of it only if they are in a program.
    if (a.college === "Common Freshman Courses") return -1;
    if (b.college === "Common Freshman Courses") return 1;
    return a.college.localeCompare(b.college);
  });
}

// Programs that belong to the saved department, best match first.
export function matchDepartmentPrograms(coursesData, department) {
  const needle = normalizeDepartment(department);
  if (!needle) return [];
  if (isFreshmanDepartment(needle)) {
    return (coursesData || []).filter((course) => normalizeDepartment(course.college) === "common freshman courses");
  }
  const programs = (coursesData || []).filter(isProgramCourse);
  const exact = programs.filter((course) => normalizeDepartment(course.name) === needle);
  if (exact.length) return exact;

  const partial = programs.filter((course) => {
    const name = normalizeDepartment(course.name);
    return name.includes(needle) || needle.includes(name) || editDistance(name, needle) <= 2;
  });
  if (partial.length) return partial;

  // A department name that matches a college (e.g. "College of Informatics") opens that college's programs.
  return coursesData && Array.isArray(coursesData)
    ? coursesData.filter((course) => isProgramCourse(course) && normalizeDepartment(course.college) === needle)
    : [];
}

// The closest catalog program for a legacy free-text department, used to normalise data on edit.
export function catalogDepartmentName(coursesData, department) {
  const match = matchDepartmentPrograms(coursesData, department)[0];
  return match ? match.name : String(department || "").trim();
}
