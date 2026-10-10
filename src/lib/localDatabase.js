import { videos } from "../resources.js";

const STORAGE_KEY = "evangadi-local-database";
const FILE_DATABASE_NAME = "evangadi-local-files";
const FILE_STORE_NAME = "files";
const DATABASE_VERSION = 1;
const PASSWORD_ITERATIONS = 210_000;
const MAX_ACTIVITY_EVENTS = 1_000;
export const ADMIN_EMAIL = "habibyesuf81@gmail.com";

function emptyDatabase() {
  return { version: DATABASE_VERSION, users: [], progress: [], activity: [], categories: [], customMaterials: [], sessionUserId: null };
}

function readDatabase() {
  const serialized = window.localStorage.getItem(STORAGE_KEY);
  if (serialized === null) return emptyDatabase();

  let database;
  try {
    database = JSON.parse(serialized);
  } catch {
    throw new Error("Local database is unreadable. Clear this site's local storage to start fresh.");
  }

  if (
    database?.version !== DATABASE_VERSION ||
    !Array.isArray(database.users) ||
    !Array.isArray(database.progress) ||
    !Array.isArray(database.activity)
  ) {
    throw new Error("Local database has an unsupported format. Clear this site's local storage to start fresh.");
  }
  if (database.customMaterials !== undefined && !Array.isArray(database.customMaterials)) {
    throw new Error("Local materials database has an unsupported format. Clear this site's local storage to start fresh.");
  }
  if (database.categories !== undefined && !Array.isArray(database.categories)) {
    throw new Error("Local categories database has an unsupported format. Clear this site's local storage to start fresh.");
  }
  return {
    ...database,
    users: database.users.map((user) => ({
      ...user,
      role: user.email.toLowerCase() === ADMIN_EMAIL ? "admin" : "learner",
      access_granted: user.email.toLowerCase() === ADMIN_EMAIL || user.access_granted === true
    })),
    categories: database.categories || [],
    customMaterials: (database.customMaterials || []).map((material) => ({
      ...material,
      categoryId: material.categoryId || "",
      subcategoryId: material.subcategoryId || ""
    }))
  };
}

function writeDatabase(database) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
}

function openFileDatabase() {
  if (!window.indexedDB) {
    return Promise.reject(new Error("This browser does not support local file storage."));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(FILE_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FILE_STORE_NAME)) {
        request.result.createObjectStore(FILE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local file storage."));
    request.onblocked = () => reject(new Error("Local file storage is busy in another tab. Close other app tabs and try again."));
  });
}

function runFileTransaction(mode, operation) {
  return openFileDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, mode);
    const request = operation(transaction.objectStore(FILE_STORE_NAME));
    let result;
    let settled = false;

    request.onsuccess = () => { result = request.result; };
    request.onerror = () => {
      settled = true;
      database.close();
      reject(request.error || new Error("Could not access local file storage."));
    };
    transaction.oncomplete = () => {
      database.close();
      if (!settled) resolve(result);
    };
    transaction.onerror = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(transaction.error || new Error("Could not save to local file storage."));
    };
    transaction.onabort = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(transaction.error || new Error("Local file storage was interrupted."));
    };
  }));
}

function storeLocalFile(materialId, file) {
  return runFileTransaction("readwrite", (store) => store.put(file, materialId));
}

function deleteLocalFile(materialId) {
  return runFileTransaction("readwrite", (store) => store.delete(materialId));
}

export async function getLocalFileUrl(materialId) {
  const file = await runFileTransaction("readonly", (store) => store.get(materialId));
  if (!(file instanceof Blob)) {
    throw new Error("This uploaded file is missing from this browser. Remove it and upload it again.");
  }
  return URL.createObjectURL(file);
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(window.atob(value), (character) => character.charCodeAt(0));
}

async function hashPassword(password, salt) {
  const key = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await window.crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256
  );
  return new Uint8Array(bits);
}

function toSession(user) {
  return user ? { user: { id: user.id, email: user.email } } : null;
}

export function getSession() {
  const database = readDatabase();
  return toSession(database.users.find((user) => user.id === database.sessionUserId));
}

export async function createAccount(emailInput, password) {
  const email = emailInput.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Enter a valid email address.");
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");

  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const passwordHash = await hashPassword(password, salt);
  const database = readDatabase();
  if (database.users.some((user) => user.email === email)) {
    throw new Error("An account with this email already exists. Sign in instead.");
  }

  const isAdmin = email === ADMIN_EMAIL;
  const user = {
    id: window.crypto.randomUUID(),
    email,
    passwordSalt: bytesToBase64(salt),
    passwordHash: bytesToBase64(passwordHash),
    role: isAdmin ? "admin" : "learner",
    access_granted: isAdmin,
    created_at: new Date().toISOString()
  };
  database.users.push(user);
  database.sessionUserId = user.id;
  writeDatabase(database);
  return toSession(user);
}

export async function signIn(emailInput, password) {
  const email = emailInput.trim().toLowerCase();
  const database = readDatabase();
  const user = database.users.find((account) => account.email === email);
  if (!user) throw new Error("Incorrect email or password.");

  const candidateHash = await hashPassword(password, base64ToBytes(user.passwordSalt));
  const storedHash = base64ToBytes(user.passwordHash);
  let difference = candidateHash.length ^ storedHash.length;
  for (let index = 0; index < Math.max(candidateHash.length, storedHash.length); index += 1) {
    difference |= (candidateHash[index] || 0) ^ (storedHash[index] || 0);
  }
  if (difference !== 0) throw new Error("Incorrect email or password.");

  database.sessionUserId = user.id;
  writeDatabase(database);
  return toSession(user);
}

export function signOut() {
  const database = readDatabase();
  database.sessionUserId = null;
  writeDatabase(database);
}

export function getProfile(userId) {
  const user = readDatabase().users.find((account) => account.id === userId);
  if (!user) throw new Error("Your local account could not be found. Sign in again.");
  return { id: user.id, role: user.role, access_granted: user.access_granted };
}

export function getProgress(userId) {
  return readDatabase().progress
    .filter((item) => item.user_id === userId)
    .map((item) => item.video_id);
}

export function getCustomMaterials() {
  return readDatabase().customMaterials;
}

export function getCategories() {
  return readDatabase().categories;
}

function requireLocalAdmin(database, userId) {
  const user = database.users.find((account) => account.id === userId);
  if (
    database.sessionUserId !== userId ||
    !user ||
    user.role !== "admin" ||
    user.email.toLowerCase() !== ADMIN_EMAIL
  ) {
    throw new Error("Only the local admin can manage learning materials and categories.");
  }
}

function validateName(value, label) {
  const name = value.trim();
  if (!name || name.length > 60) {
    throw new Error(`Enter a ${label} name with no more than 60 characters.`);
  }
  return name;
}

function recordCatalogActivity(database, userId, eventType, resourceId) {
  database.activity.unshift({
    id: `activity:${window.crypto.randomUUID()}`,
    user_id: userId,
    event_type: eventType,
    resource_id: resourceId,
    created_at: new Date().toISOString()
  });
  database.activity.length = Math.min(database.activity.length, MAX_ACTIVITY_EVENTS);
}

export function addCategory(userId, nameInput) {
  const database = readDatabase();
  requireLocalAdmin(database, userId);
  const name = validateName(nameInput, "category");
  if (database.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("A category with that name already exists.");
  }

  const category = { id: `category:${window.crypto.randomUUID()}`, name, subcategories: [] };
  database.categories.push(category);
  recordCatalogActivity(database, userId, "category_added", category.id);
  writeDatabase(database);
  return category;
}

export function addSubcategory(userId, categoryId, nameInput) {
  const database = readDatabase();
  requireLocalAdmin(database, userId);
  const category = database.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error("Select an existing category for this subcategory.");

  const name = validateName(nameInput, "subcategory");
  if (category.subcategories.some((subcategory) => subcategory.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("That subcategory already exists in this category.");
  }

  const subcategory = { id: `subcategory:${window.crypto.randomUUID()}`, name };
  category.subcategories.push(subcategory);
  recordCatalogActivity(database, userId, "subcategory_added", subcategory.id);
  writeDatabase(database);
  return subcategory;
}

export function addCustomMaterial(userId, {
  type: typeInput,
  title: titleInput,
  url: urlInput,
  description: descriptionInput,
  categoryId,
  subcategoryId
}) {
  const database = readDatabase();
  requireLocalAdmin(database, userId);

  const title = titleInput.trim();
  const url = urlInput.trim();
  const description = descriptionInput.trim();
  const type = typeInput === "code" ? "code" : "material";
  if (!title || title.length > 120) throw new Error("Enter a title with no more than 120 characters.");
  if (description.length > 500) throw new Error("Keep the description to 500 characters or fewer.");
  const category = database.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error("Create or select a category for this material.");
  const subcategory = category.subcategories.find((item) => item.id === subcategoryId);
  if (!subcategory) throw new Error("Select a subcategory within this category.");

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Enter a valid web address beginning with https:// or http://.");
  }
  if (!["https:", "http:"].includes(parsedUrl.protocol)) {
    throw new Error("Materials must link to a secure (https://) or standard (http://) web address.");
  }
  if (database.customMaterials.some((material) => material.url === parsedUrl.href)) {
    throw new Error("That material has already been added.");
  }

  const material = {
    id: `material:${window.crypto.randomUUID()}`,
    type,
    title,
    url: parsedUrl.href,
    description,
    categoryId: category.id,
    subcategoryId: subcategory.id,
    created_by: userId,
    created_at: new Date().toISOString()
  };
  database.customMaterials.unshift(material);
  recordCatalogActivity(database, userId, "material_added", material.id);
  writeDatabase(database);
  return material;
}

export async function addCustomFileMaterial(userId, {
  type: typeInput,
  title: titleInput,
  description: descriptionInput,
  categoryId,
  subcategoryId,
  file
}) {
  const database = readDatabase();
  requireLocalAdmin(database, userId);

  const title = titleInput.trim();
  const description = descriptionInput.trim();
  const type = typeInput === "code" ? "code" : "material";
  if (!title || title.length > 120) throw new Error("Enter a title with no more than 120 characters.");
  if (description.length > 500) throw new Error("Keep the description to 500 characters or fewer.");
  if (!(file instanceof Blob) || !file.name) throw new Error("Choose a file from your computer.");
  const category = database.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error("Create or select a category for this material.");
  const subcategory = category.subcategories.find((item) => item.id === subcategoryId);
  if (!subcategory) throw new Error("Select a subcategory within this category.");

  const material = {
    id: `material:${window.crypto.randomUUID()}`,
    type,
    title,
    url: "",
    localFile: true,
    fileName: file.name,
    mimeType: file.type,
    byteSize: file.size,
    description,
    categoryId: category.id,
    subcategoryId: subcategory.id,
    created_by: userId,
    created_at: new Date().toISOString()
  };

  try {
    await storeLocalFile(material.id, file);
  } catch (error) {
    throw new Error(`Could not save "${file.name}" in this browser: ${error.message}`);
  }

  database.customMaterials.unshift(material);
  recordCatalogActivity(database, userId, "material_added", material.id);
  try {
    writeDatabase(database);
  } catch (error) {
    await deleteLocalFile(material.id);
    throw error;
  }
  return material;
}

export async function removeCustomMaterial(userId, materialId) {
  const database = readDatabase();
  requireLocalAdmin(database, userId);

  const materialIndex = database.customMaterials.findIndex((material) => material.id === materialId);
  if (materialIndex === -1) throw new Error("That learning material was not found.");
  const [material] = database.customMaterials.splice(materialIndex, 1);
  recordCatalogActivity(database, userId, "material_removed", material.id);
  writeDatabase(database);
  if (material.localFile) {
    try {
      await deleteLocalFile(material.id);
    } catch (error) {
      throw new Error(`The material was removed, but its stored file could not be cleared: ${error.message}`);
    }
  }
}

export function recordActivity(userId, eventType, resourceId = null) {
  const database = readDatabase();
  if (database.sessionUserId !== userId || !database.users.some((user) => user.id === userId)) {
    throw new Error("Sign in again to record activity.");
  }
  database.activity.unshift({
    id: window.crypto.randomUUID(),
    user_id: userId,
    event_type: eventType,
    resource_id: resourceId,
    created_at: new Date().toISOString()
  });
  database.activity.length = Math.min(database.activity.length, MAX_ACTIVITY_EVENTS);
  writeDatabase(database);
}

export function setVideoCompleted(userId, videoId, completed) {
  if (!videos.some((video) => video.id === videoId)) throw new Error("Unknown course video.");

  const database = readDatabase();
  const user = database.users.find((account) => account.id === userId);
  if (
    database.sessionUserId !== userId ||
    !user ||
    (user.role !== "admin" && !user.access_granted)
  ) {
    throw new Error("Sign in with an account that has progress access.");
  }

  const existingIndex = database.progress.findIndex(
    (item) => item.user_id === userId && item.video_id === videoId
  );
  if (completed && existingIndex === -1) {
    database.progress.push({ user_id: userId, video_id: videoId });
  } else if (!completed && existingIndex !== -1) {
    database.progress.splice(existingIndex, 1);
  }
  database.activity.unshift({
    id: window.crypto.randomUUID(),
    user_id: userId,
    event_type: completed ? "video_completed" : "video_uncompleted",
    resource_id: videoId,
    created_at: new Date().toISOString()
  });
  database.activity.length = Math.min(database.activity.length, MAX_ACTIVITY_EVENTS);
  writeDatabase(database);
}

export function getDashboardData() {
  const database = readDatabase();
  const user = database.users.find((account) => account.id === database.sessionUserId);
  if (!user || user.role !== "admin" || user.email.toLowerCase() !== ADMIN_EMAIL) {
    throw new Error("Only the local admin can view user activity.");
  }
  return {
    profiles: database.users
      .map(({ id, email, role, access_granted, created_at }) => ({ id, email, role, access_granted, created_at }))
      .sort((first, second) => first.email.localeCompare(second.email)),
    progress: database.progress,
    activity: database.activity.slice(0, 50)
  };
}

export function setUserAccess(userId, accessGranted) {
  const database = readDatabase();
  const admin = database.users.find((account) => account.id === database.sessionUserId);
  const user = database.users.find((account) => account.id === userId);
  if (
    !admin ||
    admin.role !== "admin" ||
    admin.email.toLowerCase() !== ADMIN_EMAIL ||
    !user
  ) {
    throw new Error("Only the local admin can change learner access.");
  }
  if (user.role === "admin") throw new Error("Admin access cannot be changed.");
  user.access_granted = accessGranted;
  writeDatabase(database);
}
