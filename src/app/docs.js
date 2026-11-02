/* The offline library. Once a student is allowed a file, its bytes are kept on the device
   and the reader works from those bytes alone, so a document still opens in airplane mode.
   On the phone the files live in the app's own data directory; in a browser they go to
   IndexedDB. Only the index — names, sizes, where each file came from — sits in
   localStorage, and none of it authorises anything: the server decides that at download. */

const INDEX_KEY = "wollo_app_docs_v1";
const DIR = "wollo-docs";
const LIMIT = 120;

function native() {
  return typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true;
}

/* ------------------------------------------------------------------- the index */

function readIndex() {
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeIndex(list) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    /* a full localStorage simply means the list will start from what the disk holds */
  }
  // The screens that list what is on the phone listen for this instead of polling the disk.
  window.dispatchEvent(new CustomEvent("wollo:docs"));
}

export function listDocs() {
  return readIndex();
}

export function findDoc(key) {
  return readIndex().find((item) => item.key === key) || null;
}

export function hasDoc(key) {
  return readIndex().some((item) => item.key === key);
}

/* ------------------------------------------------------------------ base64 glue */

function toBase64(bytes) {
  let text = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    text += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(text);
}

function fromBase64(value) {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/* --------------------------------------------------------------------- web side */

function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("wollo-docs", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("files")) request.result.createObjectStore("files");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function webPut(key, bytes) {
  const db = await openStore();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(bytes, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function webGet(key) {
  const db = await openStore();
  const found = await new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly");
    const read = tx.objectStore("files").get(key);
    read.onsuccess = () => resolve(read.result || null);
    read.onerror = () => reject(read.error);
  });
  db.close();
  return found;
}

async function webDel(key) {
  const db = await openStore();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/* ------------------------------------------------------------------- native side */

let fsPromise = null;

function filesystem() {
  if (!fsPromise) fsPromise = import("@capacitor/filesystem");
  return fsPromise;
}

async function nativePut(file, bytes) {
  const { Filesystem, Directory } = await filesystem();
  await Filesystem.writeFile({ path: `${DIR}/${file}`, data: toBase64(bytes), directory: Directory.Data, recursive: true });
}

async function nativeGet(file) {
  const { Filesystem, Directory } = await filesystem();
  try {
    const found = await Filesystem.readFile({ path: `${DIR}/${file}`, directory: Directory.Data });
    return typeof found?.data === "string" ? fromBase64(found.data) : null;
  } catch {
    return null;
  }
}

async function nativeDel(file) {
  const { Filesystem, Directory } = await filesystem();
  await Filesystem.deleteFile({ path: `${DIR}/${file}`, directory: Directory.Data }).catch(() => null);
}

// The name on the phone is the student's own file name, cleaned for a filesystem and given a
// short tail of its library key so two "Chapter 1.pdf" files never overwrite each other.
function fileName(name, key, ext) {
  const stem = String(name || "document")
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 46);
  const tail = String(key).replace(/[^\p{L}\p{N}]+/gu, "").slice(-8);
  return `${stem || "document"}-${tail || "file"}.${ext || "bin"}`;
}

/* ------------------------------------------------------------------ public store */

export async function storeDoc(entry, bytes, kind) {
  const ext = { pdf: "pdf", docx: "docx", pptx: "pptx", text: "txt", html: "html" }[kind] || "bin";
  const file = fileName(entry.name, entry.key, ext);
  if (native()) await nativePut(file, bytes);
  else await webPut(entry.key, bytes);
  const list = readIndex().filter((item) => item.key !== entry.key);
  list.unshift({ ...entry, file, ext, kind, size: bytes.length, at: new Date().toISOString() });
  writeIndex(list);
  return true;
}

export async function takeDoc(key) {
  const meta = findDoc(key);
  const bytes = meta && native() ? await nativeGet(meta.file) : await webGet(key);
  if (!bytes || !bytes.length) return null;
  return { meta, bytes, name: meta?.name || "document", kind: meta?.kind || sniff(bytes) };
}

export async function docUri(key) {
  const meta = findDoc(key);
  if (!meta || !native()) return null;
  const { Filesystem, Directory } = await filesystem();
  try {
    const found = await Filesystem.getUri({ path: `${DIR}/${meta.file}`, directory: Directory.Data });
    return found.uri;
  } catch {
    return null;
  }
}

export async function dropDoc(key) {
  const meta = findDoc(key);
  if (native()) {
    if (meta) await nativeDel(meta.file);
  } else {
    await webDel(key).catch(() => null);
  }
  writeIndex(readIndex().filter((item) => item.key !== key));
}

/* ------------------------------------------------------------------- what is it? */

function head(bytes, at) {
  return bytes.length > at ? bytes[at] : -1;
}

export function sniff(bytes) {
  if (!bytes || !bytes.length) return "empty";
  if (head(bytes, 0) === 0x25 && head(bytes, 1) === 0x50 && head(bytes, 2) === 0x44 && head(bytes, 3) === 0x46) return "pdf";
  if (head(bytes, 0) === 0x50 && head(bytes, 1) === 0x4b) return "zip";
  if (head(bytes, 0) === 0xd0 && head(bytes, 1) === 0xcf && head(bytes, 2) === 0x11 && head(bytes, 3) === 0xe0) return "ole";
  const text = String.fromCharCode(head(bytes, 0), head(bytes, 1), head(bytes, 2), head(bytes, 3)).toLowerCase();
  if (text.startsWith("{\\rt")) return "rtf";
  if (text.startsWith("<htm") || text.startsWith("!doc") || text.startsWith("<?xm")) return "html";
  // A file that starts with printable text is readable text, whatever the library calls it.
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  const control = [...sample].filter((code) => code < 9 || (code > 13 && code < 32)).length;
  return control / sample.length > 0.06 ? "binary" : "text";
}

// A .docx and a .pptx are the same zip container, so the folder inside decides the reader.
export async function sniffKind(bytes) {
  const magic = sniff(bytes);
  if (magic !== "zip") return magic;
  const { default: JSZip } = await import("jszip");
  try {
    const zip = await JSZip.loadAsync(bytes);
    if (zip.file(/word\/document\.xml/)[0]) return "docx";
    if (zip.file(/ppt\/presentation\.xml/)[0] || zip.file(/^ppt\/slides\//)[0]) return "pptx";
    return "zip";
  } catch {
    return "corrupt";
  }
}

/* ---------------------------------------------------------------------- fetching */

// Pulls the bytes behind a material link. Google Drive shares answer with a redirect to a
// signed host that will not accept a cross-origin read, so those files stay browser-only.
export async function fetchBytes(url) {
  // On the phone the document sits on the device's own origin, so a root-relative material
  // path has to be read against the site — the files themselves are never in the bundle.
  const site = window.Capacitor?.isNativePlatform?.() === true ? "https://wollo-share.vercel.app" : document.baseURI;
  const absolute = new URL(url, site).href;
  if (/drive\.google\.com|docs\.google\.com/i.test(absolute)) return { error: "remote" };
  // A dead network rejects, a slow one can sit unanswered, and either way the screen needs to
  // hear back: the deadline gives the caller the same "remote" answer a refused read gives.
  let response = null;
  try {
    response = await Promise.race([
      fetch(absolute, { credentials: "omit" }),
      new Promise((resolve) => setTimeout(() => resolve(null), 60000)),
    ]);
  } catch {
    response = null;
  }
  if (!response) return { error: "remote" };
  if (!response.ok) return { error: "http", status: response.status };
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) return { error: "empty" };
  return { bytes: new Uint8Array(buffer) };
}

export function isDrive(url) {
  return /drive\.google\.com|docs\.google\.com/i.test(String(url || ""));
}

// One call for the whole keep-on-the-phone step: pull the bytes, learn what they really are,
// file them under the student's own name and hand the copy back for reading. A file the
// reader cannot draw is never stored — a saved copy that only opens as an error would be
// worse than no copy at all.
const DRAWABLE = ["pdf", "docx", "pptx", "text", "html"];

export async function prepareDoc(entry, url) {
  const got = await fetchBytes(url);
  if (got.error) return { error: "remote" };
  const kind = await sniffKind(got.bytes).catch(() => "binary");
  if (!DRAWABLE.includes(kind)) return { error: "unsupported" };
  await storeDoc(entry, got.bytes, kind);
  return { key: entry.key, kind, bytes: got.bytes };
}

// Reading a file once is not keeping it: the bytes come and go without touching the store,
// so a student who only glances at a 5 MB module does not silently fill the phone.
export async function viewDoc(url) {
  const got = await fetchBytes(url);
  if (got.error) return { error: "remote" };
  const kind = await sniffKind(got.bytes).catch(() => "binary");
  if (!DRAWABLE.includes(kind)) return { error: "unsupported" };
  return { kind, bytes: got.bytes };
}
