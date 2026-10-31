/* Everything the phone surface keeps on the device itself: the library list for offline
   browsing, the files a student starred, and the files they already pulled down. */

const LIBRARY_KEY = "wollo_mobile_library_v1";
const SHELF_KEY = "wollo_mobile_shelf_v1";
const RECENT_KEY = "wollo_mobile_recent_v1";

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function fileKey(courseId, materialId, sideMaterialId = "") {
  return `${courseId}::${materialId}::${sideMaterialId}`;
}

// Only the list is stored, never the files: a Google Drive link cannot be read into
// memory from the page, so the offline promise is "browse", not "read".
export function saveLibrary(courses) {
  const list = (courses || []).map((course) => ({
    id: course.id,
    name: course.name,
    college: course.college,
    materials: (course.materials || [])
      .filter((mat) => !mat.hidden)
      .map((mat) => ({
        id: mat.id,
        name: mat.name,
        type: mat.type,
        size: mat.size,
        url: mat.url,
        ratingAvg: mat.ratingAvg,
        ratingCount: mat.ratingCount,
        sideMaterials: (mat.sideMaterials || [])
          .filter((side) => !side.hidden)
          .map((side) => ({ id: side.id, name: side.name, type: side.type, size: side.size, url: side.url }))
      }))
  }));
  const at = new Date().toISOString();
  return write(LIBRARY_KEY, { at, list }) ? at : null;
}

export function loadLibrary() {
  const saved = read(LIBRARY_KEY);
  return saved && Array.isArray(saved.list) ? saved : null;
}

export function listShelf() {
  return read(SHELF_KEY) || [];
}

export function isInShelf(key) {
  return listShelf().some((item) => item.key === key);
}

// Returns true when the entry was added, false when it was taken back off the shelf.
export function toggleShelf(entry) {
  const list = listShelf();
  const at = list.findIndex((item) => item.key === entry.key);
  if (at >= 0) list.splice(at, 1);
  else list.unshift({ ...entry, savedAt: new Date().toISOString() });
  write(SHELF_KEY, list.slice(0, 200));
  return at < 0;
}

export function removeFromShelf(key) {
  write(
    SHELF_KEY,
    listShelf().filter((item) => item.key !== key)
  );
}

export function listRecent() {
  return read(RECENT_KEY) || [];
}

export function addToRecent(entry) {
  const list = listRecent().filter((item) => item.key !== entry.key);
  list.unshift({ ...entry, at: new Date().toISOString() });
  write(RECENT_KEY, list.slice(0, 30));
}

export function clearRecent() {
  write(RECENT_KEY, []);
}

export function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
