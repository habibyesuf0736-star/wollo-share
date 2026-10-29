import "dotenv/config";
import { encryptVaultSecret, hashPassword } from "./auth-crypto.ts";
import { configureMail, mailStatus, sendMail, activeMailProvider, effectiveMailConfig, normalizeMailSecret, type MailConfig } from "./mail.ts";
import { recoveryCodeEmail, recoveryRequestNoticeEmail, signInCodeEmail, signupCodeEmail, testEmailMessage } from "./emailTemplates.ts";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { remoteEnabled, loadRemoteState, queueRemoteSave, flushRemoteSaves } from "./stateStore.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Serverless bundles do not necessarily carry the JSON file next to the entry, so the
// config is looked for in a few places and a miss must not take the whole API down.
function readFirebaseConfig(): { apiKey?: string; projectId?: string } {
  const candidates = [
    path.join(__dirname, "firebase-applet-config.json"),
    path.join(process.cwd(), "firebase-applet-config.json"),
    path.join(__dirname, "..", "firebase-applet-config.json")
  ];
  for (const file of candidates) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as { apiKey?: string; projectId?: string };
    } catch {
      // try the next location
    }
  }
  return {};
}

const FIREBASE_CONFIG: { apiKey?: string; projectId?: string } = {
  apiKey: process.env.FIREBASE_WEB_API_KEY || readFirebaseConfig().apiKey,
  projectId: process.env.FIREBASE_PROJECT_ID || readFirebaseConfig().projectId
};

const DATA_DIR = process.env.WOLLO_DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "wollo-db.json");

const ADMIN_USERNAME = "admin";
const ADMIN_EMAIL = "habibyesuf81@gmail.com";
// The owner's second address, also accepted as an administrator sign-in name.
const OWNER_ALT_EMAIL = "habibyesuf0736@gmail.com";
const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || ADMIN_EMAIL;

// Script execution, framing and object embeds stay on this origin; the few third-party
// origins are the ones the app really needs (YouTube player, Firebase auth/analytics).
// connect-src is left open to https:/wss: because the Firebase SDK talks to rotating
// googleapis endpoints and blocking them would sign students out of Google login.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "script-src 'self' https://www.youtube.com https://www.googletagmanager.com https://www.google-analytics.com https://apis.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com https://www.gstatic.com",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://accounts.google.com https://apis.google.com",
  "upgrade-insecure-requests"
].join("; ");

// Salted multi-round SHA-256 hashes of primary & secondary admin passwords (never stored in plaintext)
const VAULT_MASTER_KEY = process.env.WOLLO_VAULT_MASTER_KEY || "WOLLO_SHARE_AES_CTR_HMAC_VAULT_KEY_2026_V1";
const SESSION_HMAC_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be configured in production.");
}
const ADMIN_PASSWORD_HASH =
  "enc$sha256$61646d696e2d6f776e6572$5d9572e8202a29b89081c4b507b69a8beca0238059f44f45871c9005897913a1";
const SECONDARY_ADMIN_PASSWORD_HASH =
  "enc$sha256$61646d696e2d6f776e6572$2684634a75636a6ea36853ed699c995de593d442ee9442986142b39252976151";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(String(input ?? ""), "utf8").digest("hex");
}

function utf8ToHex(str: string): string {
  return Buffer.from(String(str ?? ""), "utf8").toString("hex");
}

function hexToUtf8(hex: string): string {
  try {
    return Buffer.from(String(hex ?? ""), "hex").toString("utf8");
  } catch {
    return "";
  }
}

function verifyPasswordHash(candidatePlain: string, storedHash: string, fallbackSaltContext = "wollo_default_salt"): boolean {
  const candidate = String(candidatePlain ?? "");
  const stored = String(storedHash ?? "");
  if (!stored || !candidate) return false;
  if (candidate === stored) return true;
  if (stored.startsWith("enc$sha256$")) {
    const parts = stored.split("$");
    if (parts.length === 4) {
      const saltContext = hexToUtf8(parts[2]) || fallbackSaltContext;
      const recomputed = hashPassword(candidate, saltContext);
      return recomputed === stored;
    }
  }
  return false;
}

function decryptVaultSecret(vaultToken: string, contextKey = "default"): string {
  const token = String(vaultToken ?? "");
  if (!token.startsWith("enc$vault$")) return token;
  const parts = token.split("$");
  if (parts.length !== 5) return "";
  const [, , ivHex, cipherHex, macHex] = parts;
  const expectedMac = sha256Hex(`${VAULT_MASTER_KEY}::MAC::${contextKey}::${ivHex}::${cipherHex}`).slice(0, 24);
  if (expectedMac !== macHex) return "";
  const cipherBytes = Buffer.from(cipherHex, "hex");
  const outBytes = Buffer.alloc(cipherBytes.length);
  for (let blockIdx = 0; blockIdx * 32 < cipherBytes.length; blockIdx++) {
    const keystreamHex = sha256Hex(`${VAULT_MASTER_KEY}::STREAM::${contextKey}::${ivHex}::${blockIdx}`);
    const keystream = Buffer.from(keystreamHex, "hex");
    for (let j = 0; j < 32 && blockIdx * 32 + j < cipherBytes.length; j++) {
      outBytes[blockIdx * 32 + j] = cipherBytes[blockIdx * 32 + j] ^ keystream[j];
    }
  }
  return outBytes.toString("utf8");
}

// A student should not have to re-sign-in every time they power their machine on, so a
// session is good for a year of use. The serial baked in below is the LoginDevice id, which
// keeps "sign out everywhere" and the per-device revoke working as the real expiry.
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function createSignedSessionToken(session: { id: string; name: string; email: string; role: string }, deviceId = "") {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + SESSION_TTL_MS;
  const serial = deviceId || crypto.randomBytes(16).toString("base64url");
  const payloadStr = `${session.id}|${session.email}|${session.role}|${issuedAt}|${expiresAt}|${serial}`;
  const payloadHex = utf8ToHex(payloadStr);
  const sig = crypto.createHmac("sha256", SESSION_HMAC_SECRET).update(payloadHex).digest("hex").slice(0, 32);
  return {
    ...session,
    issuedAt,
    expiresAt,
    deviceId: serial,
    authToken: `wstok.${payloadHex}.${sig}`
  };
}

const DEVICE_BROWSER: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser/, "Samsung Internet"],
  [/Firefox/, "Firefox"],
  [/Chrome/, "Chrome"],
  [/Safari/, "Safari"]
];
const DEVICE_OS: [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Mac OS X/, "macOS"],
  [/CrOS/, "Chromebook"],
  [/Linux/, "Linux"]
];

function describeDevice(req: express.Request): string {
  const agent = String(req.get("user-agent") || "");
  const browser = DEVICE_BROWSER.find(([test]) => test.test(agent))?.[1] || "a browser";
  const system = DEVICE_OS.find(([test]) => test.test(agent))?.[1] || "an unknown system";
  return `${browser} on ${system}`;
}

// Minting the token and recording the screen behind it have to happen together, or a
// sign-in path can hand out a session the account is never able to see or revoke.
function issueDeviceSession(
  account: { id: string; name: string; email: string; role: string },
  req: express.Request,
  method: LoginDevice["method"],
  label?: string
) {
  const session = createSignedSessionToken(account);
  const now = Date.now();
  dbState.loginDevices = dbState.loginDevices.filter((device) => device.expiresAt > now);
  dbState.loginDevices.push({
    id: session.deviceId,
    accountId: account.id,
    email: account.email,
    name: account.name || "",
    role: account.role,
    label: String(label || describeDevice(req)).replace(/\s+/g, " ").trim().slice(0, 80),
    method,
    createdAt: new Date(now).toISOString(),
    expiresAt: session.expiresAt
  });
  // One account should not be able to grow the shared row by signing in forever.
  const mine = dbState.loginDevices.filter((device) => device.accountId === account.id);
  if (mine.length > 12) {
    const keep = new Set(mine.slice(-12).map((device) => device.id));
    dbState.loginDevices = dbState.loginDevices.filter(
      (device) => device.accountId !== account.id || keep.has(device.id)
    );
  }
  saveDatabase(dbState);
  return session;
}

function verifyRequestSession(req: express.Request) {
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "wstok" || !/^[a-f\d]+$/i.test(parts[1])) return null;
  const [, payloadHex, signature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", SESSION_HMAC_SECRET)
    .update(payloadHex)
    .digest("hex")
    .slice(0, 32);
  if (!/^[a-f\d]{32}$/i.test(signature)) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSignature, "hex"))) return null;

  const [id, email, role, issuedAtValue, expiresAtValue, serialValue] = Buffer.from(payloadHex, "hex")
    .toString("utf8")
    .split("|");
  const issuedAt = Number(issuedAtValue);
  const expiresAt = Number(expiresAtValue);
  if (!id || !email || !role || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
  if (issuedAt > Date.now() + 60_000 || expiresAt <= Date.now() || expiresAt - issuedAt > SESSION_TTL_MS + 60_000) return null;

  // A token from before the device list simply has no serial, and it stays usable until
  // its own expiry — shipping this feature must not sign anybody out.
  const deviceId = /^[A-Za-z0-9_-]{8,64}$/.test(String(serialValue || "")) ? serialValue : "";
  if (deviceId && dbState.loginDevices.some((device) => device.id === deviceId && device.revokedAt)) return null;

  if (id === "admin-owner") {
    return email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && role === "admin"
      ? { id, email, role, deviceId }
      : null;
  }
  const user = dbState.usersData.find((account) => account.id === id && account.email.toLowerCase() === email.toLowerCase());
  if (!user || role !== (user.role || "user")) return null;
  return { id, email, role, deviceId };
}

// Support staff run the review queue, the complaints inbox and the reference materials,
// so every "administrator or staff" gate is tested with this instead of role !== "admin".
const STAFF_ROLES = new Set(["admin", "support"]);
function isStaffSession(session: { role: string }): boolean {
  return STAFF_ROLES.has(String(session.role || ""));
}

function safeUserAccount(user: UserAccount) {
  const {
    password: _password,
    passwordHash: _passwordHash,
    passwordVault: _passwordVault,
    // The pending code is what proves the person owns the mailbox, so it must never
    // travel in a payload the account holder can read; admins get it from their own route.
    verificationCode: _verificationCode,
    verificationExpiresAt: _verificationExpiresAt,
    verificationAttempts: _verificationAttempts,
    verificationSentAt: _verificationSentAt,
    signInCode: _signInCode,
    signInCodeExpiresAt: _signInCodeExpiresAt,
    signInCodeAttempts: _signInCodeAttempts,
    signInCodeSentAt: _signInCodeSentAt,
    ...safeUser
  } = user;
  return safeUser;
}

function secureUserAccount(u: any): UserAccount {
  const saltContext = String(u.id || u.email || "wollo_user").toLowerCase().trim();
  const rawPw = String(u.password || "");
  if (rawPw && !rawPw.startsWith("enc$sha256$") && !rawPw.startsWith("enc$vault$")) {
    const hashed = hashPassword(rawPw, saltContext);
    const vaulted = encryptVaultSecret(rawPw, saltContext);
    u.password = hashed;
    u.passwordHash = hashed;
    u.passwordVault = vaulted;
  } else if (rawPw.startsWith("enc$vault$")) {
    u.passwordVault = rawPw;
    const dec = decryptVaultSecret(rawPw, saltContext);
    if (dec) {
      const hashed = hashPassword(dec, saltContext);
      u.password = hashed;
      u.passwordHash = hashed;
    }
  } else if (rawPw.startsWith("enc$sha256$")) {
    u.passwordHash = rawPw;
  } else if (u.passwordHash && String(u.passwordHash).startsWith("enc$sha256$")) {
    u.password = u.passwordHash;
  }
  u.encryptionAlg = "SHA-256+AES-VAULT";
  return u;
}

function verifyUserAccountPassword(candidatePassword: string, u: UserAccount): boolean {
  if (!u || !candidatePassword) return false;
  const saltContext = String(u.id || u.email || "wollo_user").toLowerCase().trim();
  const storedHash = u.passwordHash || u.password || "";
  if (verifyPasswordHash(candidatePassword, storedHash, saltContext)) return true;
  if (u.passwordVault) {
    const dec = decryptVaultSecret(u.passwordVault, saltContext);
    if (dec && dec === candidatePassword) return true;
  }
  return false;
}

// The custom administrator password lives in the document as one salted hash. Only a
// plaintext may be hashed again; an existing hash has to pass through untouched.
function ensureAdminPasswordHash(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("enc$sha256$") || raw.startsWith("enc$vault$")) return raw;
  return hashPassword(raw, "admin-owner");
}

// Older builds hashed the stored value on every load and every save, so an administrator
// password set back then is a chain of hashes. Walking that chain lets the holder of the
// password back in; the depth is then used to put a single hash back in the document.
const ADMIN_HASH_CHAIN_LIMIT = 30;
function matchAdminPasswordChain(candidatePassword: string, storedHash: string): number {
  if (!candidatePassword || !storedHash) return 0;
  let candidate = hashPassword(candidatePassword, "admin-owner");
  for (let depth = 1; depth <= ADMIN_HASH_CHAIN_LIMIT; depth++) {
    if (candidate === storedHash) return depth;
    candidate = hashPassword(candidate, "admin-owner");
  }
  return 0;
}

function verifyAdminAccountPassword(candidatePassword: string, customAdminHash: string): boolean {
  if (!candidatePassword) return false;
  if (customAdminHash) {
    if (verifyPasswordHash(candidatePassword, customAdminHash, "admin-owner")) return true;
    return matchAdminPasswordChain(candidatePassword, customAdminHash) > 0;
  }
  if (verifyPasswordHash(candidatePassword, ADMIN_PASSWORD_HASH, "admin-owner")) return true;
  if (verifyPasswordHash(candidatePassword, SECONDARY_ADMIN_PASSWORD_HASH, "admin-owner")) return true;
  return false;
}

// The phone is required at sign-up and is the thing students remember, so it signs in too.
function nationalPhoneDigits(value: unknown): string {
  const raw = String(value ?? "").trim();
  let digits = raw.replace(/\D/g, "");
  if (/^\+251/.test(raw)) digits = digits.slice(3);
  else if (digits.length > 9 && digits.startsWith("251")) digits = digits.slice(3);
  else if (digits.length > 9 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function findAccountByIdentifier(identifier: string): UserAccount | undefined {
  const lower = String(identifier || "").trim().toLowerCase();
  if (!lower) return undefined;
  const digits = nationalPhoneDigits(lower);
  return dbState.usersData.find(
    (account) =>
      account.email.toLowerCase() === lower ||
      account.name.toLowerCase() === lower ||
      (digits.length === 9 && nationalPhoneDigits(account.phone || "") === digits)
  );
}

const DEFAULT_SUBCATEGORIES = [
  "Lecture Notes",
  "Past Exams & Quizzes",
  "Lab Manuals",
  "Slides & Presentations",
  "Assignments & Projects"
];

const EVANGADI_VIDEO_LINKS = [
  { num: "01", title: "Course 01", url: "https://www.youtube.com/watch?v=WRf1tj2puMA" },
  { num: "02", title: "Course 02", url: "https://www.youtube.com/watch?v=8rASGjYVNh8" },
  { num: "03", title: "Course 03", url: "https://www.youtube.com/watch?v=F2Dn8a5K-ts" },
  { num: "04", title: "Course 04", url: "https://www.youtube.com/watch?v=VUb0vMzw35c" },
  { num: "05", title: "Course 05", url: "https://www.youtube.com/watch?v=O2z-sQWaM3k" },
  { num: "06", title: "Course 06", url: "https://www.youtube.com/watch?v=icvF1gqDgY4" },
  { num: "07", title: "Course 07", url: "https://www.youtube.com/watch?v=dT0ozRF_3BU" },
  { num: "08", title: "Course 08", url: "https://www.youtube.com/watch?v=cHplA6Vdhm0" },
  { num: "09", title: "Course 09", url: "https://www.youtube.com/watch?v=z1wtRc9kz0U" },
  { num: "10", title: "Course 10", url: "https://www.youtube.com/watch?v=Km-gbCGu86I" },
  { num: "11", title: "Course 11", url: "https://www.youtube.com/watch?v=j0Rmqx0r35I" },
  { num: "12", title: "Course 12", url: "https://www.youtube.com/watch?v=ZFoEf_Yrp88" },
  { num: "13", title: "Course 13", url: "https://www.youtube.com/watch?v=cWqmE5sc_cU" },
  { num: "14", title: "Course 14", url: "https://www.youtube.com/watch?v=LnGJA02es1Y" },
  { num: "15", title: "Course 15", url: "https://www.youtube.com/watch?v=6xwPC4T_m4c" },
  { num: "16", title: "Course 16", url: "https://www.youtube.com/watch?v=vSJv0RFtuv8" },
  { num: "17", title: "Course 17", url: "https://www.youtube.com/watch?v=1HLQMplhFy0" },
  { num: "18", title: "Course 18", url: "https://www.youtube.com/watch?v=ZlcUD0-zQhk" },
  { num: "19", title: "Course 19", url: "https://www.youtube.com/watch?v=QRnO29MRw_I" },
  { num: "20", title: "Course 20", url: "https://www.youtube.com/watch?v=7kZHkhaFeHc" },
  { num: "21", title: "Course 21", url: "https://www.youtube.com/watch?v=po9jZu0Xuas" },
  { num: "22", title: "Course 22", url: "https://www.youtube.com/watch?v=HVyCHv4YCXc" },
  { num: "23", title: "Course 23", url: "https://www.youtube.com/watch?v=c0DZ9SX_x3w" },
  { num: "24", title: "Course 24", url: "https://www.youtube.com/watch?v=Rs1L5XUplq8" },
  { num: "25", title: "Course 25", url: "https://www.youtube.com/watch?v=RkvWMwH_Suo" },
  { num: "26", title: "Course 26", url: "https://www.youtube.com/watch?v=FyiE3k--hVE" },
  { num: "27", title: "Course 27", url: "https://www.youtube.com/watch?v=q3SqeG1AWWI" },
  { num: "28", title: "Course 28", url: "https://www.youtube.com/watch?v=GISO5AKqah4" },
  { num: "29", title: "Course 29", url: "https://www.youtube.com/watch?v=h2EpUubVSPA" },
  { num: "30", title: "Course 30", url: "https://www.youtube.com/watch?v=FbBBsuUqr4g" },
  { num: "31", title: "Course 31", url: "https://www.youtube.com/watch?v=md9uzIxjRWA" },
  { num: "32", title: "Course 32", url: "https://www.youtube.com/watch?v=0IFTl23F5SI" },
  { num: "33", title: "Course 33", url: "https://www.youtube.com/watch?v=F74kHsLRR_I" },
  { num: "34", title: "Course 34", url: "https://www.youtube.com/watch?v=CcT_k_HjYCo" },
  { num: "35", title: "Course 35", url: "https://www.youtube.com/watch?v=aX40M_L6BL0" },
  { num: "36", title: "Course 36", url: "https://www.youtube.com/watch?v=9zuknPw1LgY" },
  { num: "37", title: "Course 37", url: "https://www.youtube.com/watch?v=-WoXdY3voy4" },
  { num: "38", title: "Course 38", url: "https://www.youtube.com/watch?v=7kQwJ_ZAHsE" },
  { num: "39", title: "Course 39", url: "https://www.youtube.com/watch?v=dpWF9LR5rDA" },
  { num: "40", title: "Course 40", url: "https://www.youtube.com/watch?v=Wp-Vy7R7alE" },
  { num: "41", title: "Course 41", url: "https://www.youtube.com/watch?v=kwZ-Q6_Rkyo" },
  { num: "42", title: "Course 42", url: "https://www.youtube.com/watch?v=ylT01vuvFXQ" },
  { num: "43", title: "Course 43", url: "https://www.youtube.com/watch?v=e8t5oLUBgUk" },
  { num: "44", title: "Course 44", url: "https://www.youtube.com/watch?v=lS-dWt26fHw" },
  { num: "45", title: "Course 45", url: "https://www.youtube.com/watch?v=_XKPiNG4ZkY" },
  { num: "46", title: "Course 46", url: "https://www.youtube.com/watch?v=jF6UbOpUQfY" },
  { num: "47", title: "Course 47", url: "https://www.youtube.com/watch?v=fbWU-8y_b5M" },
  { num: "48", title: "Course 48", url: "https://www.youtube.com/watch?v=D7D8IrtObMI" }
];

function buildEvangadiCourseObject() {
  return {
    id: "course-evangadi",
    name: "Evangadi",
    description: "48-part full-stack web development video curriculum with companion notes.",
    icon: "EVANGADI",
    color: "#1d624f",
    restricted: true,
    allowStudentSideMaterials: false,
    defaultYear: "Year 1",
    subcategories: ["Video Lectures", "Lecture Notes", "Slides & Presentations", "Assignments & Projects"],
    materials: EVANGADI_VIDEO_LINKS.map((item) => ({
      id: `m-evg-${item.num}`,
      lessonNumber: item.num,
      name: `${item.num} - ${item.title}`,
      type: "Video",
      size: "YouTube Video",
      url: item.url,
      year: "Year 1",
      subcategory: "Video Lectures",
      hidden: false,
      ratingAvg: 5.0,
      ratingCount: 30,
      sideMaterials: []
    }))
  };
}

// ==========================================================================
// Wollo University Colleges / Institutes / Schools — official program list.
// Each program expands into Year 1..N with First & Second Semester per year.
// ==========================================================================
const WOLLO_COLLEGES: { name: string; programs: [string, number][] }[] = [
  { name: "College of Informatics", programs: [["Computer Science", 4], ["Information Systems", 4], ["Information Technology", 4], ["Software Engineering", 5]] },
  { name: "College of Engineering", programs: [["Fashion Design", 4], ["Garment Engineering", 5], ["Textile Engineering", 5], ["Leather Engineering", 5], ["Mechanical Engineering", 5], ["Chemical Engineering", 5], ["Food Engineering", 5], ["Mechatronics Engineering", 5], ["Industrial Engineering", 5], ["Architecture", 5], ["Water Resource & Irrigation Engineering", 5], ["Hydraulic and Water Resource Engineering", 5], ["Civil Engineering", 5], ["Construction Technology and Management", 5], ["Electrical and Computer Engineering", 5], ["Biomedical Engineering", 5]] },
  { name: "College of Natural Science", programs: [["Biology", 4], ["Biotechnology", 4], ["Chemistry", 4], ["Geology", 4], ["Mathematics", 4], ["Physics", 4], ["Sport Science", 4], ["Statistics", 4]] },
  { name: "College of Medicine and Health Sciences", programs: [["Anesthesia", 5], ["Emergency and Critical Care Nursing", 4], ["Psychiatry Nursing", 4], ["Environmental Health Science", 4], ["Surgical Nursing", 4], ["Medicine", 6], ["Pharmacy", 5], ["Occupational Health and Safety", 4], ["Health Informatics", 4], ["Medical Laboratory Sciences", 4], ["Midwifery", 4], ["Comprehensive Nursing", 4], ["Pediatrics and Child Health Nursing", 4], ["Public Health", 4]] },
  { name: "College of Agriculture", programs: [["Agricultural Economics", 4], ["Agri-business and Value Chain Management", 4], ["Animal Science", 4], ["Forestry", 4], ["Natural Resources Management", 4], ["Plant Science", 4], ["Rural Development and Agricultural Extension", 4], ["Crop Science Extension", 4], ["Animal Production Extension", 4], ["Natural Resources Management Extension", 4]] },
  { name: "School of Veterinary Medicine", programs: [["Veterinary Laboratory Technology", 4], ["Veterinary Medicine", 6]] },
  { name: "College of Business and Economics", programs: [["Accounting and Finance", 4], ["Economics", 4], ["Management", 4], ["Cooperative Business Management & Accounting and Auditing", 4], ["Marketing Management", 4]] },
  { name: "College of Social Science and Humanities", programs: [["Ethiopian Language(s) & Literature - Amharic", 4], ["Arabic Language & Literature", 4], ["Geez Language and Literature", 4], ["English Language and Literature", 4], ["Afaan Oromoo and Literature", 4], ["Journalism and Communication", 4], ["Geography and Environmental Studies", 4], ["Tourism and Hotel Management", 4], ["Sociology", 4], ["Social Work", 4], ["History and Heritage Management", 4], ["Social Anthropology", 4], ["Civic and Ethical Studies", 4], ["Peace and Development Studies", 4], ["Political Science and International Relations", 4]] },
  { name: "School of Arts", programs: [["Theatre Arts", 4], ["Music", 4]] },
  { name: "Institute of Teachers' Education and Behavioral Science", programs: [["Early Childhood Care and Education", 4], ["Educational Planning and Management", 4], ["Psychology", 4], ["Special Needs and Inclusive Education", 4]] },
  { name: "School of Law", programs: [["Law", 4]] }
];

function slugifyProgramName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildProgramSemesterLabels(durationYears: number): string[] {
  const labels: string[] = [];
  for (let y = 1; y <= durationYears; y++) {
    labels.push(`Year ${y} · First Semester`);
    labels.push(`Year ${y} · Second Semester`);
  }
  return labels;
}

function buildProgramCourses(): any[] {
  const courses: any[] = [];
  WOLLO_COLLEGES.forEach((college) => {
    college.programs.forEach(([programName, durationYears]) => {
      const years: string[] = [];
      for (let y = 1; y <= durationYears; y++) years.push(`Year ${y}`);
      courses.push({
        id: "prog-" + slugifyProgramName(programName),
        name: programName,
        college: college.name,
        durationYears,
        years,
        semesters: buildProgramSemesterLabels(durationYears),
        description: `${programName} · ${college.name} — ${durationYears} years · ${durationYears * 2} semesters.`,
        icon: programName.split(/[\s&()\u2019-]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 6).toUpperCase(),
        color: "#1d624f",
        restricted: false,
        allowStudentSideMaterials: false,
        defaultYear: "Year 1",
        subcategories: [...DEFAULT_SUBCATEGORIES],
        materials: []
      });
    });
  });
  return courses;
}

const REGULAR_FRESHMAN_COURSES: Array<[string, string, number]> = [
  ["Mathematics for Natural Sciences", "Math1011", 1],
  ["Communicative English Language Skills I", "FLEn1011", 1],
  ["Geography of Ethiopia and the Horn", "GeES1011", 1],
  ["General Physics", "Phys1011", 1],
  ["General Psychology", "Psych1011", 1],
  ["Critical Thinking", "LoCT1011", 1],
  ["Physical Fitness", "SpSc1011", 1],
  ["Introduction to Emerging Technologies", "EmE1012", 2],
  ["Communicative English Language Skills II", "FLEn1012", 2],
  ["History of Ethiopia and the Horn", "HLst1012", 2],
  ["Computer Programming", "Ifec1052", 2],
  ["Applied Mathematics I", "Math1012", 2],
  ["Moral and Civic Education", "MCIE1012", 2],
  ["Social Anthropology", "Anth1012", 2]
];

function buildRegularFreshmanCourses(): any[] {
  return REGULAR_FRESHMAN_COURSES.map(([name, code, sem]) => ({
    id: "fresh-reg-" + String(code).toLowerCase(),
    name: `${name} (${code})`,
    description: `Year I Semester ${sem === 1 ? "I" : "II"} · Regular Program.`,
    icon: String(code).toUpperCase(),
    color: "#1d624f",
    restricted: false,
    allowStudentSideMaterials: false,
    defaultYear: "Year 1",
    college: "Common Freshman Courses",
    durationYears: 1,
    years: ["Year 1"],
    semesters: [`Year 1 · Semester ${sem === 1 ? "I" : "II"}`],
    subcategories: [...DEFAULT_SUBCATEGORIES],
    materials: []
  }));
}

// The starter pack published into an empty freshman course. Semester I is the natural
// sciences set; semester II is what pre-engineering, medicine and the other fields take.
const FRESHMAN_SEED_PACK: Array<{ suffix: string; subcategory: string; type: string; size: string }> = [
  { suffix: "Complete Lecture Notes", subcategory: "Lecture Notes", type: "PDF", size: "3.2 MB" },
  { suffix: "Class Slides", subcategory: "Slides & Presentations", type: "PPT", size: "6.8 MB" },
  { suffix: "Past Exam Collection", subcategory: "Past Exams & Quizzes", type: "PDF", size: "1.4 MB" },
  { suffix: "Assignment Solutions", subcategory: "Assignments & Projects", type: "DOC", size: "0.7 MB" }
];

function freshmanStreamForSemester(semester: string): string {
  return /II$/.test(String(semester || ""))
    ? "Pre-Engineering, Medicine & Other Fields"
    : "Natural Sciences";
}

const IT_CURRICULUM_COURSES: Array<[string, string, number, number]> = [
  ["Global Trends", "GlIn2015", 2, 1],
  ["Inclusiveness", "InCl2011", 2, 1],
  ["Introduction to Economics", "Econ2013", 2, 1],
  ["Computer Programming II", "ITec2041", 2, 1],
  ["Fundamentals of Database Systems", "ITec2071", 2, 1],
  ["Computer Organization and Architecture", "ITec2021", 2, 1],
  ["Fundamentals of Electricity and Electronics Device", "Ene2161", 2, 1],
  ["Operating Systems", "ITec2022", 2, 2],
  ["Introduction to Statistics", "Stat2171", 2, 2],
  ["Data Communication and Computer Networks", "ITec2102", 2, 2],
  ["Data Structure and Algorithms", "ITec2052", 2, 2],
  ["Discrete Mathematics and Combinatory", "Math2182", 2, 2],
  ["Internet Programming I", "ITec2092", 2, 2],
  ["System Analysis and Design", "ITec3061", 3, 1],
  ["Multimedia Systems", "ITec3121", 3, 1],
  ["Object Oriented Programming in Java", "ITec3051", 3, 1],
  ["Internet Programming II", "ITec3093", 3, 1],
  ["Advanced Database Systems", "ITec3071", 3, 1],
  ["Computer Maintenance and Technical Support", "ITec3031", 3, 1],
  ["Introduction to Distributed Systems", "ITec3102", 3, 2],
  ["Information Technology Project Management", "ITec3062", 3, 2],
  ["Event-Driven Programming", "ITec3054", 3, 2],
  ["Information Storage and Retrieval", "ITec3082", 3, 2],
  ["Advanced Programming", "ITec3058", 3, 2],
  ["Mobile Application Development", "ITec3056", 3, 2],
  ["Artificial Intelligence", "", 4, 1],
  ["Internship", "", 4, 1],
  ["Information Assurance and Security", "", 4, 1],
  ["Final Year Project I", "", 4, 1],
  ["GIS and Remote Sensing", "", 4, 1],
  ["Basic Research Method in IT", "", 4, 1],
  ["Network Design", "", 4, 1],
  ["Seminar on Current Trends in IT", "", 4, 1],
  ["Final Year Project II", "", 4, 2],
  ["System and Network Administration", "", 4, 2],
  ["Social and Professional Ethics in IT", "", 4, 2],
  ["Network Device and Configuration", "", 4, 2],
  ["Entrepreneurship and Business Development", "", 4, 2],
  ["Elective", "", 4, 2],
  ["Wireless Networking and Telecom Technologies", "", 4, 2]
];

function buildITCurriculumCourses(): any[] {
  return IT_CURRICULUM_COURSES.map(([title, code, year, sem]) => {
    const roman = sem === 1 ? "I" : "II";
    const slug = String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return {
      id: "itc-" + (code ? String(code).toLowerCase() : slug),
      name: code ? `${title} (${code})` : title,
      description: `Information Technology · Year ${year} Semester ${roman}.`,
      icon: code ? String(code).toUpperCase() : slug.slice(0, 8).toUpperCase(),
      color: "#1d624f",
      restricted: false,
      allowStudentSideMaterials: false,
      defaultYear: `Year ${year}`,
      college: "Information Technology",
      durationYears: 4,
      years: [`Year ${year}`],
      semesters: [`Year ${year} · Semester ${roman}`],
      subcategories: [...DEFAULT_SUBCATEGORIES],
      materials: []
    };
  });
}

const DEFAULT_COURSES = [
  buildEvangadiCourseObject(),
  ...buildProgramCourses(),
  ...buildRegularFreshmanCourses(),
  ...buildITCurriculumCourses()
];

const DEFAULT_USERS = [
  {
    id: "user-habib",
    name: "Habib Yesuf",
    email: "habibyesuf81@gmail.com",
    password: "enc$sha256$757365722d6861626962$b9d7ef8490a6e789bc83a17e04a5e378c520869389271830cf40212fbe9871ab",
    passwordHash: "enc$sha256$757365722d6861626962$b9d7ef8490a6e789bc83a17e04a5e378c520869389271830cf40212fbe9871ab",
    passwordVault: "enc$vault$a1b2c3d4e5f60718$4871b539fa74ef20$18a9cb42296eb4c0b490f199",
    encryptionAlg: "SHA-256+AES-VAULT",
    role: "admin",
    department: "Software Engineering & Computer Science",
    accountPlan: "paid_lifetime",
    paymentStatus: "paid",
    downloadOnlyAccount: false,
    amountPaidBirr: 100,
    category: "Super Admin · Lifetime VIP Access",
    sharedMaterialsCount: 8,
    downloadsCount: 42,
    lastActiveAt: "Active now",
    allowedCourseIds: [
      "course-evangadi",
      "course-se-capstone",
      "course-clinical-research",
      "course-calc-uni",
      "course-phys-uni",
      "course-comm-eng",
      "course-chem-bio"
    ],
    evangadiSynced: true,
    unpaidMigrationV3: true,
    unpaidPerDownloadMigrationV4: true,
    activityLog: [
      {
        id: "act-habib-1",
        type: "Super Admin Account Activated",
        detail: "Habib Yesuf registered with full Lifetime VIP & Super Admin privileges",
        timestamp: "2025-02-21 12:00"
      }
    ]
  },
  {
    id: "user-selam",
    name: "Selamawit Tadesse",
    email: "student@wolloshare.com",
    password: "enc$sha256$757365722d73656c616d$6fdb6cc990565c00edc624671e72fdc877c9308073852d92bae83c81037ecc3b",
    passwordHash: "enc$sha256$757365722d73656c616d$6fdb6cc990565c00edc624671e72fdc877c9308073852d92bae83c81037ecc3b",
    passwordVault: "enc$vault$a1b2c3d4e5f60718$5267e52f209eb964ff0c$abd41a6fa8e81f7a402e7f17",
    encryptionAlg: "SHA-256+AES-VAULT",
    role: "user",
    department: "Software Engineering",
    accountPlan: "paid_lifetime",
    paymentStatus: "paid",
    downloadOnlyAccount: false,
    amountPaidBirr: 100,
    category: "Paid 100 Birr · Lifetime VIP",
    sharedMaterialsCount: 3,
    downloadsCount: 18,
    lastActiveAt: "10 mins ago",
    allowedCourseIds: ["course-evangadi", "course-se-capstone", "course-clinical-research"],
    evangadiSynced: true,
    activityLog: [
      { id: "act-101", type: "Paid 100 Birr Lifetime", detail: "Activated 100 Birr Lifetime Free Access", timestamp: "2025-02-18 14:20" },
      { id: "act-102", type: "Shared Material", detail: "Shared 'Distributed_Systems_and_Microservices_Architecture.pdf'", timestamp: "2025-02-19 11:05" },
      { id: "act-103", type: "Downloaded Material", detail: "Downloaded 'Calculus_I_Limits_and_Derivatives_Complete_Notes.pdf'", timestamp: "2025-02-20 16:40" }
    ]
  },
  {
    id: "user-hanna-dl",
    name: "Hanna Kebede",
    email: "paid_download@wolloshare.com",
    password: "enc$sha256$757365722d68616e6e612d646c$b57deaa005f2805753fbefd4c9fca2c1d2671360d28e2aa56bae000cf3fdabe7",
    passwordHash: "enc$sha256$757365722d68616e6e612d646c$b57deaa005f2805753fbefd4c9fca2c1d2671360d28e2aa56bae000cf3fdabe7",
    passwordVault: "enc$vault$b2c3d4e5f6071829$46584ae41b6309$852e12e0f28a1bd414a234f2",
    encryptionAlg: "SHA-256+AES-VAULT",
    role: "user",
    department: "Electrical & Computer Engineering",
    accountPlan: "paid_download_only",
    paymentStatus: "paid",
    downloadOnlyAccount: true,
    amountPaidBirr: 100,
    category: "Paid 100 Birr · Download-Only",
    sharedMaterialsCount: 0,
    downloadsCount: 24,
    lastActiveAt: "25 mins ago",
    allowedCourseIds: ["course-evangadi", "course-se-capstone", "course-clinical-research"],
    evangadiSynced: true,
    activityLog: [
      { id: "act-201", type: "Account Activated", detail: "100 Birr Paid Download-Only Account", timestamp: "2025-02-19 10:00" },
      { id: "act-202", type: "Downloaded Material", detail: "Downloaded 'Data_Structures_and_Algorithms_in_C++_and_Python.pdf'", timestamp: "2025-02-20 15:30" }
    ]
  },
  {
    id: "user-dawit",
    name: "Dawit Mekonnen",
    email: "dawit@wolloshare.com",
    password: "enc$sha256$757365722d6461776974$271c3d630f71c81a204beb3e05f19a3143bc2946df60892ae3b4fd6b7060b212",
    passwordHash: "enc$sha256$757365722d6461776974$271c3d630f71c81a204beb3e05f19a3143bc2946df60892ae3b4fd6b7060b212",
    passwordVault: "enc$vault$c3d4e5f60718293a$249c18137f1c0319$ac904935b84ebc099f9a78d7",
    encryptionAlg: "SHA-256+AES-VAULT",
    role: "user",
    department: "Civil Engineering",
    accountPlan: "unpaid",
    paymentStatus: "unpaid",
    downloadOnlyAccount: false,
    amountPaidBirr: 0,
    category: "Unpaid · Pending 2 Uploads",
    sharedMaterialsCount: 0,
    unpaidCurrentUploadProgress: 0,
    downloadsCount: 0,
    lastActiveAt: "1 hour ago",
    allowedCourseIds: ["course-evangadi", "course-se-capstone"],
    evangadiSynced: true,
    unpaidMigrationV3: true,
    unpaidPerDownloadMigrationV4: true,
    activityLog: [
      { id: "act-301", type: "Signed In", detail: "Logged in as Unpaid Student", timestamp: "2025-02-21 08:00" }
    ]
  }
];

const DEFAULT_TEXTS = {
  siteTitle: "Wollo Share",
  siteSubtitle: "Course Library",
  telegramBtnLabel: "Telegram",
  welcomeTitle: "Course Materials Library",
  welcomeDesc: "Course notes, slides, past exams and lab manuals — by college, year & semester.",
  coursesHeading: "Courses & Study Materials",
  footerText: "Wollo Share · University Course Materials Library",
  premiumPayment: ""
};

const DEFAULT_APPEARANCE = {
  layout: "grid",
  primaryColor: "#1d624f",
  fontSize: "16px",
  fontStyle: "sans",
  logoUrl: ""
};

// What a student has to do to get a file. The administrator owns this on the
// Downloads page, so the library can be opened to everyone or closed to unpaid
// accounts without a code change.
type DownloadMode = "credits" | "free" | "premium";

interface DownloadPolicy {
  mode: DownloadMode;
  uploadsPerCredit: number;
  adSeconds: number;
}

const DEFAULT_DOWNLOAD_POLICY: DownloadPolicy = {
  mode: "credits",
  uploadsPerCredit: 2,
  adSeconds: 10
};

// Plans that buy unlimited downloads. `free_unlimited` is deliberately absent: it is
// an access grant, not a payment, so it never shows up in the paid statistics.
const PAID_PLANS = ["premium_monthly", "premium_annual", "paid_lifetime", "paid_download_only"];

// Every plan the administrator can hand out. Anything else is folded back to unpaid.
const STUDENT_PLANS = ["unpaid", "free_unlimited", ...PAID_PLANS];

const PLAN_CATEGORY_LABELS: Record<string, string> = {
  paid_download_only: "Paid 500 Birr · Download-Only",
  paid_lifetime: "Paid 500 Birr · Lifetime VIP",
  premium_annual: "Premium Annual · 250 Birr · 1 Year",
  premium_monthly: "Premium Monthly · 100 Birr",
  free_unlimited: "Free · unlimited downloads",
  unpaid: "Unpaid · Pending Uploads"
};

function planCategoryLabel(plan: string): string {
  return PLAN_CATEGORY_LABELS[plan] || PLAN_CATEGORY_LABELS.unpaid;
}

interface SideMaterial {
  id: string;
  name: string;
  type: string;
  size: string;
  url: string;
}

interface CourseMaterial {
  id: string;
  lessonNumber?: string;
  name: string;
  type: string;
  size: string;
  url: string;
  year: string;
  semester?: string;
  department?: string;
  sharedBy?: string;
  subcategory: string;
  hidden: boolean;
  // Set by the administrator on the Materials page: anyone, signed in or not, may take
  // this file without credits, a plan or the sponsor slot.
  free?: boolean;
  ratingAvg: number;
  ratingCount: number;
  ratingsByUser?: Record<string, number>;
  sideMaterials?: SideMaterial[];
}

interface Course {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  restricted: boolean;
  allowStudentSideMaterials?: boolean;
  college?: string;
  durationYears?: number;
  years?: string[];
  semesters?: string[];
  defaultYear: string;
  subcategories: string[];
  materials: CourseMaterial[];
}

interface ActivityLogItem {
  id: string;
  type: string;
  detail: string;
  timestamp: string;
}

interface UserAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  passwordHash?: string;
  passwordVault?: string;
  encryptionAlg?: string;
  role: string;
  department?: string;
  phone?: string;
  accountPlan?: string;
  paymentStatus?: string;
  downloadOnlyAccount?: boolean;
  amountPaidBirr?: number;
  subscriptionExpiry?: string | null;
  category?: string;
  sharedMaterialsCount?: number;
  unpaidCurrentUploadProgress?: number;
  downloadCredits?: number;
  downloadsCount?: number;
  lastActiveAt?: string;
  allowedCourseIds: string[];
  evangadiSynced?: boolean;
  activityLog?: ActivityLogItem[];
  videoProgress?: Record<string, { seconds: number; duration: number; percent: number; completed: boolean; updatedAt: string }>;
  // Accounts created before email verification existed have no flag at all and stay valid.
  emailVerified?: boolean;
  // Set when the code email could not be delivered and the account was opened anyway.
  emailUnconfirmed?: boolean;
  verificationCode?: string;
  verificationExpiresAt?: string;
  verificationSentAt?: string;
  verificationAttempts?: number;
  // The second sign-in step: emailed after the password matches, and thrown away as soon as
  // it is used. Kept apart from the signup code so neither can be spent on the other.
  signInCode?: string;
  signInCodeExpiresAt?: string;
  signInCodeAttempts?: number;
  signInCodeSentAt?: string;
  addedByAdmin?: boolean;
  // A small data URL the student uploads themselves; Google sign-in may bring a photo too.
  avatarUrl?: string;
}

// A complaint or problem a student left for the support team. Staff reply in-thread;
// the student sees the same thread on their own support screen.
interface SupportReply {
  id: string;
  text: string;
  authorName: string;
  by: "student" | "staff";
  createdAt: string;
}

interface SupportTicket {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  category: string;
  courseId?: string;
  message: string;
  status: "open" | "answered" | "closed";
  createdAt: string;
  updatedAt: string;
  replies: SupportReply[];
  // Set only when the student ordered a plan from the premium page.
  premiumPlan?: string;
  premiumPrice?: string;
  premiumReference?: string;
  premiumConfirmedAt?: string;
}

const SUPPORT_CATEGORIES = [
  "Broken or wrong material",
  "Download problem",
  "Missing course material",
  "Account or payment",
  "Something else"
];

// Mirrors PLANS in UpgradeGateModal.jsx — the server owns the price so a request can
// never ask for a plan (or an amount) the team does not sell.
const PREMIUM_PLANS: Record<string, { title: string; price: string; days: number | null; category: string }> = {
  premium_monthly: { title: "Premium monthly", price: "100 Birr / month", days: 30, category: "Premium Monthly · 100 Birr" },
  premium_annual: { title: "Premium annual", price: "250 Birr / year", days: 365, category: "Premium Annual · 250 Birr · 1 Year" },
  paid_lifetime: { title: "Lifetime access", price: "500 Birr one-time", days: null, category: "Paid 500 Birr · Lifetime VIP" }
};

interface DatabaseSchema {
  coursesData: Course[];
  usersData: UserAccount[];
  pageTexts: Record<string, string>;
  appearanceSettings: Record<string, string>;
  userRatings: Record<string, number>;
  customAdminPassword: string;
  passwordRecoveryRequests: PasswordRecoveryRequest[];
  qrLoginRequests: QrLoginRequest[];
  loginDevices: LoginDevice[];
  materialSubmissions: MaterialSubmission[];
  supportTickets: SupportTicket[];
  mailSettings?: MailSettings;
  downloadPolicy?: DownloadPolicy;
  updatedAt?: number;
  // Bumped only by admin wholesale state saves. `updatedAt` moves on every student
  // write too, so it cannot tell a stale admin editor from normal traffic.
  contentRevision?: number;
}

// relayApiKeyVault / smtpPassVault / brevoApiKeyVault / mailtrapTokenVault hold
// vault-encrypted secrets; plaintext never reaches the database.
interface MailSettings {
  preference?: "auto" | "relay" | "smtp" | "brevo" | "mailtrap" | "none";
  relayUrl?: string;
  relayFrom?: string;
  relayApiKeyVault?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpFrom?: string;
  smtpPassVault?: string;
  brevoFrom?: string;
  brevoApiKeyVault?: string;
  mailtrapFrom?: string;
  mailtrapTokenVault?: string;
  mailtrapTemplateUuid?: string;
}

interface PasswordRecoveryRequest {
  id: string;
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  status: "pending" | "code-issued" | "completed" | "closed";
  codeHash?: string;
  codeExpiresAt?: string;
  failedAttempts: number;
  notificationSent?: boolean;
  codeSentAt?: string;
  mailDelivered?: boolean;
  mailError?: string;
}

// One desktop screen waiting to be signed in. The id is the only secret the desk
// holds, so the phone that approves it is what mints the session.
interface QrLoginRequest {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: number;
  status: "pending" | "approved" | "consumed";
  account?: { id: string; email: string; name: string; role: string };
}

// One signed-in screen. Its id is written into the session token as a serial, so the
// moment this row is revoked that token stops working — even though its signature,
// which is what normally proves a session, is still mathematically valid.
interface LoginDevice {
  id: string;
  accountId: string;
  email: string;
  name: string;
  role: string;
  label: string;
  method: "password" | "qr" | "google" | "verification";
  createdAt: string;
  expiresAt: number;
  revokedAt?: string;
}

// A student contribution waiting in the admin review queue. Approving enough of them
// earns the contributor one download (see the uploads-per-credit policy).
interface MaterialSubmission {
  id: string;
  userId: string;
  userEmail: string;
  contributorName: string;
  courseId: string;
  courseName: string;
  name: string;
  type: string;
  size: string;
  url: string;
  year: string;
  semester: string;
  subcategory: string;
  department: string;
  fingerprint: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  reason?: string;
  duplicateOf?: string;
  materialId?: string;
}

const SUBMISSION_COOLDOWN_MS = 45_000;
const MAX_PENDING_PER_STUDENT = 3;

const PLAN_PRICE_BIRR: Record<string, number> = {
  premium_monthly: 100,
  premium_annual: 250,
  paid_lifetime: 500,
  paid_download_only: 500
};

function planPriceBirr(plan: string): number {
  return PLAN_PRICE_BIRR[plan] || 0;
}

function buildDefaultDatabase(): DatabaseSchema {
  return {
    coursesData: JSON.parse(JSON.stringify(DEFAULT_COURSES)),
    usersData: JSON.parse(JSON.stringify(DEFAULT_USERS)).map((u: any) => secureUserAccount(u)),
    pageTexts: { ...DEFAULT_TEXTS },
    appearanceSettings: { ...DEFAULT_APPEARANCE },
    userRatings: {},
    customAdminPassword: "",
    passwordRecoveryRequests: [],
    qrLoginRequests: [],
    loginDevices: [],
    materialSubmissions: [],
    supportTickets: [],
    mailSettings: {},
    downloadPolicy: { ...DEFAULT_DOWNLOAD_POLICY }
  };
}

function normalizeDatabase(raw: Partial<DatabaseSchema>): DatabaseSchema {
  const defaults = buildDefaultDatabase();
  const coursesData: Course[] = Array.isArray(raw.coursesData) && raw.coursesData.length > 0
    ? raw.coursesData
    : defaults.coursesData;

  coursesData.forEach((course) => {
    course.allowStudentSideMaterials = Boolean(course.allowStudentSideMaterials);
    if (!course.college) {
      const matchCollege = WOLLO_COLLEGES.find((col) => col.programs.some((p) => p[0] === course.name));
      course.college = matchCollege ? matchCollege.name : "Common Courses";
    }
    if (!Number(course.durationYears)) {
      course.durationYears = course.years && course.years.length ? course.years.length : 4;
    }
    if (!Array.isArray(course.years) || course.years.length === 0) {
      course.years = [];
      for (let y = 1; y <= Number(course.durationYears); y++) course.years.push(`Year ${y}`);
    }
    if (!Array.isArray(course.semesters) || course.semesters.length === 0) {
      course.semesters = buildProgramSemesterLabels(Number(course.durationYears));
    }
    // Freshman college: Natural stream = Natural First Semester + Programming (2nd sem); Social stream = Social First Semester
    if ((course as any).stream === "Natural" || (course as any).stream === "Social") {
      course.college = "Common Freshman Courses";
      course.durationYears = 1;
      course.years = ["Year 1"];
      course.semesters = (course as any).stream === "Social"
        ? ["Year 1 · Social First Semester"]
        : ["Year 1 · Natural First Semester", "Year 1 · Programming"];
    }
    if (!Array.isArray(course.subcategories) || course.subcategories.length === 0) {
      course.subcategories = [...DEFAULT_SUBCATEGORIES];
    }
    if (!Array.isArray(course.materials)) {
      course.materials = [];
    }
    course.materials.forEach((mat, idx) => {
      if (!Array.isArray(mat.sideMaterials)) {
        mat.sideMaterials = [];
      }
      if (!mat.semester) {
        mat.semester = idx % 2 === 0 ? "First Semester" : "Second Semester";
      }
      if (!mat.department) {
        mat.department = course.name || "General Department";
      }
    });
  });

  // Only a store with no users key at all (a first run) gets the sample accounts;
  // an empty list means the administrator removed them and must stay empty.
  const usersData: UserAccount[] = Array.isArray(raw.usersData) ? raw.usersData : defaults.usersData;

  usersData.forEach((u: any) => {
    secureUserAccount(u);
    if (!Array.isArray(u.allowedCourseIds)) u.allowedCourseIds = [];
    if (!u.evangadiSynced) {
      if (!u.allowedCourseIds.includes("course-evangadi")) {
        u.allowedCourseIds.unshift("course-evangadi");
      }
      u.evangadiSynced = true;
    }
    if (!u.department) u.department = "Computer Science";
    if (!u.unpaidMigrationV3) {
      if (u.id === "user-dawit" || (u.email && u.email.toLowerCase() === "dawit@wolloshare.com")) {
        u.accountPlan = "unpaid";
        u.paymentStatus = "unpaid";
        u.downloadOnlyAccount = false;
        u.category = "Unpaid · Pending 2 Uploads";
        u.sharedMaterialsCount = 0;
      } else if (u.id === "user-selam" || (u.email && u.email.toLowerCase() === "student@wolloshare.com")) {
        u.accountPlan = "paid_lifetime";
      } else if (u.id === "user-hanna-dl" || u.downloadOnlyAccount) {
        u.accountPlan = "paid_download_only";
      } else if (!u.accountPlan) {
        u.accountPlan = "unpaid";
      }
      u.unpaidMigrationV3 = true;
    }
    if (!u.accountPlan) {
      if (u.downloadOnlyAccount) u.accountPlan = "paid_download_only";
      else if (u.paymentStatus === "paid") u.accountPlan = "paid_lifetime";
      else u.accountPlan = "unpaid";
    }
    // Only the plans the administrator can pick exist. An old label such as "free",
    // which once quietly counted as paid, is folded back into the unpaid tier.
    if (!STUDENT_PLANS.includes(u.accountPlan)) u.accountPlan = "unpaid";
    // Expire premium subscriptions server-side too, so a lapsed plan cannot download
    // even while the browser still remembers it.
    if (u.accountPlan === "premium_annual" || u.accountPlan === "premium_monthly") {
      const expiry = u.subscriptionExpiry ? new Date(u.subscriptionExpiry) : null;
      if (!expiry || expiry <= new Date()) {
        u.accountPlan = "unpaid";
        u.paymentStatus = "unpaid";
        u.category = "Unpaid · Subscription Expired";
      }
    }
    u.paymentStatus = u.accountPlan === "unpaid" || u.accountPlan === "free_unlimited" ? "unpaid" : "paid";
    u.downloadOnlyAccount = u.accountPlan === "paid_download_only";
    u.amountPaidBirr = planPriceBirr(u.accountPlan);
    if (u.category === "Paid 100 Birr · Lifetime VIP") u.category = "Paid 500 Birr · Lifetime VIP";
    else if (u.category === "Paid 100 Birr · Download-Only") u.category = "Paid 500 Birr · Download-Only";
    if (!u.category) u.category = planCategoryLabel(u.accountPlan);
    if (typeof u.sharedMaterialsCount !== "number") u.sharedMaterialsCount = 0;
    if (!u.unpaidPerDownloadMigrationV4) {
      u.unpaidCurrentUploadProgress = 0;
      u.unpaidPerDownloadMigrationV4 = true;
    }
    if (typeof u.unpaidCurrentUploadProgress !== "number") u.unpaidCurrentUploadProgress = 0;
    if (typeof u.downloadCredits !== "number") u.downloadCredits = 0;
    if (typeof u.downloadsCount !== "number") u.downloadsCount = 0;
    if (!Array.isArray(u.activityLog)) u.activityLog = [];
    if (!u.lastActiveAt) u.lastActiveAt = "Recently";
  });

  const rawCustomAdminPw = typeof raw.customAdminPassword === "string" ? raw.customAdminPassword.trim() : "";
  const customAdminPassword = ensureAdminPasswordHash(rawCustomAdminPw);

  return {
    coursesData,
    usersData,
    pageTexts: { ...DEFAULT_TEXTS, ...(raw.pageTexts || {}) },
    appearanceSettings: { ...DEFAULT_APPEARANCE, ...(raw.appearanceSettings || {}) },
    userRatings: raw.userRatings && typeof raw.userRatings === "object" ? raw.userRatings : {},
    customAdminPassword,
    passwordRecoveryRequests: Array.isArray(raw.passwordRecoveryRequests)
      ? raw.passwordRecoveryRequests.filter((request): request is PasswordRecoveryRequest =>
          Boolean(request && typeof request.id === "string" && typeof request.userId === "string" &&
            typeof request.email === "string" && typeof request.name === "string" &&
            ["pending", "code-issued", "completed", "closed"].includes(request.status))
        ).map((request) => ({
          ...request,
          failedAttempts: Number.isInteger(request.failedAttempts) ? request.failedAttempts : 0
        }))
      : [],
    qrLoginRequests: Array.isArray(raw.qrLoginRequests)
      ? raw.qrLoginRequests.filter((request): request is QrLoginRequest =>
          Boolean(request && typeof request.id === "string" && typeof request.expiresAt === "number" &&
            ["pending", "approved", "consumed"].includes(request.status))
        )
      : [],
    // A device row is only useful while the session it names could still be live, so
    // anything past its own expiry is dropped instead of accumulating in the state row.
    loginDevices: Array.isArray(raw.loginDevices)
      ? raw.loginDevices.filter((device): device is LoginDevice =>
          Boolean(device && typeof device.id === "string" && typeof device.accountId === "string" &&
            typeof device.expiresAt === "number" && typeof device.label === "string" &&
            ["password", "qr", "google", "verification"].includes(device.method))
        )
      : [],
    materialSubmissions: Array.isArray(raw.materialSubmissions)
      ? raw.materialSubmissions.filter((s): s is MaterialSubmission =>
          Boolean(s && typeof s.id === "string" && typeof s.courseId === "string" && typeof s.name === "string")
        )
      : [],
    supportTickets: Array.isArray(raw.supportTickets)
      ? raw.supportTickets.filter((t): t is SupportTicket =>
          Boolean(t && typeof t.id === "string" && typeof t.userId === "string" && typeof t.message === "string")
        ).map((t) => ({
          ...t,
          category: String(t.category || "Something else"),
          status: ["open", "answered", "closed"].includes(t.status) ? t.status : "open",
          createdAt: t.createdAt || new Date().toISOString(),
          updatedAt: t.updatedAt || t.createdAt || new Date().toISOString(),
          replies: Array.isArray(t.replies) ? t.replies.filter((r) => Boolean(r && typeof r.text === "string")) : []
        }))
      : [],
    mailSettings: normalizeMailSettings(raw.mailSettings),
    downloadPolicy: normalizeDownloadPolicy(raw.downloadPolicy),
    updatedAt: Number(raw.updatedAt) || 0,
    contentRevision: Number(raw.contentRevision) || 0
  };
}

function normalizeMailSettings(raw: unknown): MailSettings {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const port = Number(source.smtpPort);
  const preference = String(source.preference || "auto");
  const allowedPreferences = ["auto", "relay", "smtp", "brevo", "mailtrap", "none"];
  return {
    preference: allowedPreferences.includes(preference)
      ? (preference as MailSettings["preference"])
      : "auto",
    relayUrl: typeof source.relayUrl === "string" ? source.relayUrl.trim() : "",
    relayFrom: typeof source.relayFrom === "string" ? source.relayFrom.trim() : "",
    relayApiKeyVault: typeof source.relayApiKeyVault === "string" ? source.relayApiKeyVault : "",
    smtpHost: typeof source.smtpHost === "string" ? source.smtpHost.trim() : "",
    smtpPort: Number.isInteger(port) && port > 0 ? port : 0,
    smtpSecure: typeof source.smtpSecure === "boolean" ? source.smtpSecure : false,
    smtpUser: typeof source.smtpUser === "string" ? source.smtpUser.trim() : "",
    smtpFrom: typeof source.smtpFrom === "string" ? source.smtpFrom.trim() : "",
    smtpPassVault: typeof source.smtpPassVault === "string" ? source.smtpPassVault : "",
    brevoFrom: typeof source.brevoFrom === "string" ? source.brevoFrom.trim() : "",
    brevoApiKeyVault: typeof source.brevoApiKeyVault === "string" ? source.brevoApiKeyVault : "",
    mailtrapFrom: typeof source.mailtrapFrom === "string" ? source.mailtrapFrom.trim() : "",
    mailtrapTokenVault: typeof source.mailtrapTokenVault === "string" ? source.mailtrapTokenVault : "",
    mailtrapTemplateUuid: typeof source.mailtrapTemplateUuid === "string" ? source.mailtrapTemplateUuid.trim() : ""
  };
}

function normalizeDownloadPolicy(raw: unknown): DownloadPolicy {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode = String(source.mode || DEFAULT_DOWNLOAD_POLICY.mode);
  const uploads = Math.round(Number(source.uploadsPerCredit));
  const ad = Math.round(Number(source.adSeconds));
  return {
    mode: (["credits", "free", "premium"].includes(mode) ? mode : DEFAULT_DOWNLOAD_POLICY.mode) as DownloadMode,
    uploadsPerCredit: Number.isFinite(uploads) ? Math.min(10, Math.max(1, uploads)) : DEFAULT_DOWNLOAD_POLICY.uploadsPerCredit,
    adSeconds: Number.isFinite(ad) ? Math.min(120, Math.max(0, ad)) : DEFAULT_DOWNLOAD_POLICY.adSeconds
  };
}

// Read the policy the administrator last saved. A store written before the setting
// existed falls back to the shipped behaviour rather than an empty object.
function downloadPolicy(): DownloadPolicy {
  return normalizeDownloadPolicy(dbState.downloadPolicy);
}

// A monthly or annual plan is only live while its expiry is in the future. normalizeDatabase
// folds a lapsed plan away when the row is read, but the in-memory copy still carries the old
// value between saves, so every access decision has to check the date itself.
function planIsLive(user: { accountPlan?: string; subscriptionExpiry?: string | null }): boolean {
  const plan = String(user.accountPlan || "unpaid");
  if (!PAID_PLANS.includes(plan)) return false;
  if (plan === "premium_monthly" || plan === "premium_annual") {
    const expiry = Date.parse(String(user.subscriptionExpiry || ""));
    return Number.isFinite(expiry) && expiry > Date.now();
  }
  return true;
}

// Evangadi sells its own course pack, so it is never part of a student's library.
function isEvangadiCourse(course: { id?: unknown; name?: unknown }): boolean {
  return String(course.id || "") === "course-evangadi" || /evangadi/i.test(String(course.name || ""));
}

// The team reaches students by phone, so an account without a usable one is incomplete. Returns "" when the number is acceptable.
function phoneProblem(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Your phone number is required — the library team uses it to reach you.";
  if (nationalPhoneDigits(raw).length !== 9) {
    return "Enter the 9 digits after +251, e.g. 912 345 678.";
  }
  return "";
}

function loadDatabase(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      const parsed = JSON.parse(content);
      const normalized = normalizeDatabase(parsed);
      // In Supabase mode this snapshot is only a placeholder until hydrateState()
      // replaces it. Saving here would push a possibly stale file over the live row.
      if (!remoteEnabled()) saveDatabase(normalized);
      return normalized;
    }
  } catch (err) {
    console.error("Failed to read database file, initializing default state:", err);
  }
  const initial = buildDefaultDatabase();
  // Same rule: with a remote store the seed catalog must never reach the row from the
  // boot path. On Vercel the data file is absent, so this is the common route there.
  if (!remoteEnabled()) saveDatabase(initial);
  return initial;
}

function saveDatabase(db: DatabaseSchema): void {
  try {
    db.usersData.forEach((u) => secureUserAccount(u));
    if (db.customAdminPassword) {
      db.customAdminPassword = ensureAdminPasswordHash(db.customAdminPassword);
    }
    db.updatedAt = Date.now();
    if (remoteEnabled()) {
      // Snapshot the document now: dbState keeps mutating after this call returns.
      queueRemoteSave(JSON.stringify(db));
      return;
    }
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save database file:", err);
  }
}

let dbState: DatabaseSchema = loadDatabase();

// With WOLLO_STATE_STORE=supabase the document lives in Postgres, so the file read above
// is only a starting point and every request must wait for the real state.
let hydrationLogged = false;
async function hydrateState(): Promise<void> {
  if (!remoteEnabled()) return;
  // A write queued by the request before this one may still be in flight; reading now
  // would hand back the older row and the next save would erase that write.
  await flushRemoteSaves();
  const doc = await loadRemoteState();
  if (doc) {
    dbState = normalizeDatabase(doc as Record<string, unknown>);
    // The vault-encrypted mail credentials live only inside the row, so the module-load
    // call to applyMailSettings() cannot see them; without this the serverless boot would
    // send recovery mail with no provider configured.
    applyMailSettings();
    if (!hydrationLogged) {
      hydrationLogged = true;
      console.log("state loaded from Supabase");
    }
    return;
  }
  saveDatabase(dbState);
  console.log("Supabase state row was empty, seeded it from the boot snapshot");
}

const MAIL_VAULT_CONTEXT = "wollo-mail-settings";

function applyMailSettings(): void {
  const settings = normalizeMailSettings(dbState.mailSettings);
  const rawSecure = (dbState.mailSettings as Record<string, unknown> | undefined)?.smtpSecure;
  const relay: Partial<MailConfig["relay"]> = {};
  if (settings.relayUrl) relay.url = settings.relayUrl;
  if (settings.relayFrom) relay.from = settings.relayFrom;
  if (settings.relayApiKeyVault) relay.apiKey = decryptVaultSecret(settings.relayApiKeyVault, MAIL_VAULT_CONTEXT);

  const smtp: Partial<MailConfig["smtp"]> = {};
  if (settings.smtpHost) smtp.host = settings.smtpHost;
  if (settings.smtpPort) smtp.port = settings.smtpPort;
  if (typeof rawSecure === "boolean") smtp.secure = rawSecure;
  else if (settings.smtpPort) smtp.secure = settings.smtpPort === 465;
  if (settings.smtpUser) smtp.user = settings.smtpUser;
  if (settings.smtpFrom) smtp.from = settings.smtpFrom;
  if (settings.smtpPassVault) smtp.pass = decryptVaultSecret(settings.smtpPassVault, MAIL_VAULT_CONTEXT);

  const brevo: Partial<MailConfig["brevo"]> = {};
  if (settings.brevoApiKeyVault) brevo.apiKey = decryptVaultSecret(settings.brevoApiKeyVault, MAIL_VAULT_CONTEXT);
  // The Brevo API needs a verified sender; it defaults to the SMTP "from" when not set separately.
  const brevoFrom = settings.brevoFrom || settings.smtpFrom;
  if (brevoFrom) brevo.from = brevoFrom;

  const mailtrap: Partial<MailConfig["mailtrap"]> = {};
  if (settings.mailtrapTokenVault) mailtrap.apiToken = decryptVaultSecret(settings.mailtrapTokenVault, MAIL_VAULT_CONTEXT);
  const mailtrapFrom = settings.mailtrapFrom || settings.smtpFrom;
  if (mailtrapFrom) mailtrap.from = mailtrapFrom;
  if (settings.mailtrapTemplateUuid) mailtrap.templateUuid = settings.mailtrapTemplateUuid;

  configureMail({ preference: settings.preference || "auto", relay, smtp, brevo, mailtrap });
}

applyMailSettings();

// Brute-force login attempt rate-limiters.
// The failure counter is keyed by screen *and* source address, never by the account alone:
// a key like that lets any visitor burn five wrong guesses and lock the real owner out of
// their own account for as long as they like.
const loginRateLimitMap = new Map<string, { failedCount: number; lockedUntil: number }>();
const ipFailureRateLimitMap = new Map<string, { count: number; windowStartedAt: number; lockedUntil: number }>();
const recoveryRequestRateLimitMap = new Map<string, { count: number; windowStartedAt: number }>();
const qrStartRateLimitMap = new Map<string, { count: number; windowStartedAt: number }>();
const signupRequestRateLimitMap = new Map<string, { count: number; windowStartedAt: number }>();
const codeRateLimitMap = new Map<string, { count: number; windowStartedAt: number }>();
// Wrong codes typed from one network, so guessing 100000..999999 costs the attacker a wait.
const twoFactorRateLimitMap = new Map<string, { failedCount: number; lockedUntil: number }>();

const LOGIN_IP_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_IP_MAX_FAILURES = 25;
const RATE_MAP_SOFT_LIMIT = 2000;

function requestClientIp(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

// Every limiter here is in-process memory, and an attacker can mint keys forever
// (one per guessed account name, one per fake email) unless old windows are dropped.
function pruneRateMap<T extends { count?: number; windowStartedAt?: number; lockedUntil?: number }>(
  map: Map<string, T>,
  windowMs: number
) {
  if (map.size < RATE_MAP_SOFT_LIMIT) return;
  const now = Date.now();
  for (const [key, entry] of map) {
    const idle = now - Number(entry.windowStartedAt || 0);
    if (Number(entry.lockedUntil || 0) <= now && (entry.windowStartedAt === undefined || idle >= windowMs)) {
      map.delete(key);
    }
  }
}

const RECOVERY_CODE_TTL_MS = 30 * 60 * 1000;
const VERIFICATION_CODE_TTL_MS = 30 * 60 * 1000;
const VERIFICATION_MAX_ATTEMPTS = 6;

// Six digits: easy to retype from a phone, and guessing is capped by
// VERIFICATION_MAX_ATTEMPTS before the code is thrown away.
function sixDigitCode(): string {
  return String(crypto.randomInt(100_000, 1_000_000));
}

// Accounts that predate email verification carry no flag at all, so only an
// explicit false is treated as unverified.
function isEmailVerified(user: UserAccount): boolean {
  return user.emailVerified !== false;
}

function issueSignupCode(user: UserAccount): { code: string; mailSent: boolean } {
  const code = sixDigitCode();
  user.emailVerified = false;
  user.verificationCode = hashPassword(code, `signup:${user.id}`);
  user.verificationExpiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS).toISOString();
  user.verificationAttempts = 0;
  return { code, mailSent: false };
}

// The mail provider can refuse the server's IP address, and a student must not lose their
// registration over that: the account opens as an ordinary student. It stays awaiting
// verification with its code alive, so "Resend" or the administrator can still finish the
// job — an address is never marked verified because a send failed.
function keepPendingAfterMailFailure(user: UserAccount) {
  user.emailVerified = false;
  user.emailUnconfirmed = true;
  user.verificationExpiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS).toISOString();
  user.activityLog = [
    ...(user.activityLog || []),
    {
      id: "act-" + Date.now(),
      type: "Awaiting verification",
      detail: "Opened as a normal student account — the verification email could not be delivered, so the code stays available for a resend.",
      timestamp: new Date().toISOString().slice(0, 16).replace("T", " ")
    }
  ];
}

// The mailbox is the unreliable part here, not the student. Someone who types the right
// password owns an account they created themselves, so sign-in completes it rather than
// parking them on a code they may never receive. The flag and the log entry keep the
// trail: the address was accepted by proof of password, never proven by email.
function verifyAccountAtSignIn(user: UserAccount): boolean {
  if (user.emailVerified !== false) return false;
  user.emailVerified = true;
  user.emailUnconfirmed = true;
  delete user.verificationCode;
  delete user.verificationExpiresAt;
  delete user.verificationAttempts;
  user.activityLog = [
    ...(user.activityLog || []).slice(-40),
    {
      id: "act-" + Date.now(),
      type: "Verified",
      detail: "Account verified at sign-in — the password matched, so no code was required.",
      timestamp: new Date().toISOString().slice(0, 16).replace("T", " ")
    }
  ];
  return true;
}

function signupCodeMatches(user: UserAccount, code: string): boolean {
  if (!user.verificationCode || !user.verificationExpiresAt) return false;
  if (Date.parse(user.verificationExpiresAt) < Date.now()) return false;
  return hashPassword(code, `signup:${user.id}`) === user.verificationCode;
}

async function sendSignupCode(user: UserAccount, code: string): Promise<{ ok: boolean; error?: string }> {
  const delivery = await sendMail({
    to: user.email,
    ...signupCodeEmail({
      name: user.name,
      email: user.email,
      code,
      minutesLeft: Math.round(VERIFICATION_CODE_TTL_MS / 60000)
    })
  });
  if (delivery.ok) user.verificationSentAt = new Date().toISOString();
  else console.error("Signup verification email failed:", delivery.error);
  return { ok: delivery.ok, error: delivery.error };
}

// The second sign-in step lives for ten minutes and dies after six wrong guesses, so a
// leaked code is a short-lived key rather than a permanent door.
const SIGNIN_CODE_TTL_MS = 10 * 60 * 1000;
const SIGNIN_CODE_MAX_ATTEMPTS = 6;
const SIGNIN_CODE_REUSE_MS = 4 * 60 * 1000;

function issueSignInCode(user: UserAccount): string {
  const code = sixDigitCode();
  user.signInCode = hashPassword(code, `signin:${user.id}`);
  user.signInCodeExpiresAt = new Date(Date.now() + SIGNIN_CODE_TTL_MS).toISOString();
  user.signInCodeAttempts = 0;
  return code;
}

function clearSignInCode(user: UserAccount) {
  delete user.signInCode;
  delete user.signInCodeExpiresAt;
  delete user.signInCodeAttempts;
  delete user.signInCodeSentAt;
}

function pendingSignInCode(user: UserAccount): boolean {
  return Boolean(user.signInCode && user.signInCodeExpiresAt && Date.parse(user.signInCodeExpiresAt) > Date.now());
}

function signInCodeMatches(user: UserAccount, code: string): boolean {
  if (!pendingSignInCode(user)) return false;
  return hashPassword(code, `signin:${user.id}`) === user.signInCode;
}

// Returns false when the provider refuses the mail. The caller then finishes the sign-in on
// the password alone: a mailbox that will not accept our IP must not lock a student out of
// their own account, and the administrator can see the attempt in the activity log.
async function emailSignInCode(user: UserAccount, force = false): Promise<boolean> {
  // A student who signs in twice in a row — a mistyped code, a page reload — must not get a
  // second message for the same step, so a code that has barely gone out is resent as is.
  // The "Resend code" button forces a fresh one because that click is the request itself.
  const sentAgo = Date.parse(String(user.signInCodeSentAt || ""));
  if (!force && pendingSignInCode(user) && Number.isFinite(sentAgo) && Date.now() - sentAgo < SIGNIN_CODE_REUSE_MS) {
    return true;
  }
  const code = issueSignInCode(user);
  const delivery = await sendMail({
    to: user.email,
    ...signInCodeEmail({
      name: user.name,
      email: user.email,
      code,
      minutesLeft: Math.round(SIGNIN_CODE_TTL_MS / 60000)
    })
  });
  if (!delivery.ok) {
    console.error("Sign-in code email failed:", delivery.error);
    clearSignInCode(user);
    return false;
  }
  user.signInCodeSentAt = new Date().toISOString();
  return true;
}

const MAIL_PROVIDER_LABEL: Record<string, string> = {
  relay: "Hyvor Relay",
  brevo: "Brevo HTTPS API",
  mailtrap: "Mailtrap HTTPS API",
  smtp: "SMTP",
  none: "Not configured"
};

function activeSenderAddress(): string {
  const config = effectiveMailConfig();
  switch (activeMailProvider()) {
    case "relay":
      return config.relay.from;
    case "brevo":
      return config.brevo.from;
    case "mailtrap":
      return config.mailtrap.from;
    case "smtp":
      return config.smtp.from;
    default:
      return "";
  }
}

function buildRecoveryCodeMessage(code: string, request: PasswordRecoveryRequest) {
  const minutesLeft = Math.max(1, Math.round((Date.parse(request.codeExpiresAt || "") - Date.now()) / 60000));
  const rendered = recoveryCodeEmail({
    name: request.name,
    email: request.email,
    code,
    minutesLeft
  });
  // A template hosted on Mailtrap replaces the local HTML when one is configured.
  const templateUuid = effectiveMailConfig().mailtrap.templateUuid;
  if (!templateUuid || activeMailProvider() !== "mailtrap") return { to: request.email, ...rendered };
  return {
    to: request.email,
    ...rendered,
    template: {
      uuid: templateUuid,
      variables: {
        name: request.name,
        email: request.email,
        code,
        minutes: String(minutesLeft)
      }
    }
  };
}

async function notifyAdminOfRecoveryRequest(request: PasswordRecoveryRequest): Promise<boolean> {
  const delivery = await sendMail({
    to: ADMIN_NOTIFICATION_EMAIL,
    ...recoveryRequestNoticeEmail({
      name: request.name,
      email: request.email,
      requestId: request.id,
      codeSent: Boolean(request.codeSentAt)
    })
  });
  if (!delivery.ok && delivery.error) console.error("Admin recovery notification failed:", delivery.error);
  return delivery.ok;
}

async function issueRecoveryCode(request: PasswordRecoveryRequest) {
  const code = sixDigitCode();
  request.status = "code-issued";
  request.codeHash = hashPassword(code, `password-recovery:${request.id}`);
  request.codeExpiresAt = new Date(Date.now() + RECOVERY_CODE_TTL_MS).toISOString();
  request.failedAttempts = 0;
  const delivery = await sendMail(buildRecoveryCodeMessage(code, request));
  request.mailDelivered = delivery.ok;
  if (delivery.ok) {
    request.codeSentAt = new Date().toISOString();
    delete request.mailError;
  } else {
    // Mail is often not configured yet, and a code that only ever lived in an inbox nobody
    // can reach leaves the owner locked out of their own site. The code stays valid and is
    // written to this server's log — which only the project owner can read — plus it can be
    // revealed from Admin → Recovery requests. The public response never repeats it.
    request.codeSentAt = undefined;
    request.mailError = delivery.error || "no mail provider configured";
    console.log(
      `RECOVERY CODE ${code} for ${request.email} (request ${request.id}) — email delivery failed: ${request.mailError}. ` +
      `Valid until ${request.codeExpiresAt}.`
    );
  }
  saveDatabase(dbState);
  return { ok: delivery.ok, provider: delivery.provider, error: delivery.error, code };
}

export async function createApp() {
  const app = express();
  // Behind Vercel every request arrives from one proxy address, so without this req.ip is
  // the same value for the whole planet and every per-network limit would be a global one.
  // The address is only ever an abuse signal — nothing authorizes on it — so a client that
  // forges X-Forwarded-For can at worst reset its own counters.
  app.set("trust proxy", true);
  // Materials and brand images ride along as data URLs, so the administrator's wholesale
  // save and a whole-library restore really do carry megabytes. Both are admin-gated;
  // every other route — the ones any signed-out visitor can hit — stays at 6mb.
  app.use("/api/admin/restore", express.json({ limit: "50mb" }));
  app.use("/api/state", express.json({ limit: "50mb" }));
  app.use(express.json({ limit: "6mb" }));

  // Security HTTP headers. The edge adds the same set for the HTML document and the
  // static bundle (vercel.json), so this middleware is what protects every /api response.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
      // Vite injects inline bootstrap scripts while developing, so a strict policy here
      // would only break the local server.
      res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    }
    next();
  });

  // Read the shared document on every request. A serverless instance stays warm for
  // hours and a local dev server for days, so a copy held in memory goes stale and the
  // next save would write it over everything other instances wrote since.
  app.use(async (_req, res, next) => {
    try {
      await hydrateState();
      next();
    } catch (err) {
      console.error("state hydrate failed:", err instanceof Error ? err.message : err);
      res.status(503).json({ ok: false, error: "The shared database could not be reached. Please try again in a moment." });
    }
  });

  // A response must not say "saved" before the row is written. Otherwise the next
  // request reads the older row and its save puts that older document back.
  app.use((_req, res, next) => {
    const end = res.end.bind(res);
    let finishing = false;
    res.end = ((...args: any[]) => {
      if (finishing) return end(...args);
      finishing = true;
      flushRemoteSaves().then(
        () => end(...args),
        () => end(...args)
      );
      return res;
    }) as typeof res.end;
    next();
  });

  // ============================================================================
  // FULL-STACK REST API ROUTES (/api/*)
  // ============================================================================

  // 1. Health & Full Application State
  app.get("/api/health", (_req, res) => {
    // Nothing about the credential or session scheme belongs in an unauthenticated reply.
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/download", (req, res) => {
    const rawName = String(req.query.name || "wollo-share-material.pdf").trim();
    const safeFileName = rawName.replace(/["\r\n\\/]+/g, "_") || "wollo-share-material.pdf";
    const courseName = String(req.query.course || "Course Library").trim();
    const matType = String(req.query.type || "PDF").trim();
    const matSize = String(req.query.size || "1.8 MB").trim();
    const matYear = String(req.query.year || "Year 1").trim();

    const content = [
      "Wollo Share Course Material",
      `File: ${safeFileName}`,
      `Course: ${courseName}`,
      `Academic Year: ${matYear}`,
      `Format: ${matType}`,
      `Size: ${matSize}`,
      "Downloaded from Wollo Share Resources."
    ].join("\n");

    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
    res.send(Buffer.from(content, "utf-8"));
  });

  app.get("/api/state", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const authorization = _req.get("authorization");
    const session = verifyRequestSession(_req);
    if (authorization && !session) {
      res.status(401).json({ ok: false, error: "Your session is invalid or expired. Please sign in again." });
      return;
    }
    const visibleUsers = session
      ? session.role === "admin"
        ? dbState.usersData.map(safeUserAccount)
        : dbState.usersData.filter((user) => user.id === session.id).map(safeUserAccount)
      : [];
    // The Evangadi pack is sold by that provider, so students never receive it. Keeping
    // it out of the payload also keeps its material links off their devices.
    const visibleCourses =
      session && session.role === "admin"
        ? dbState.coursesData
        : dbState.coursesData.filter((course) => !isEvangadiCourse(course));
    res.json({
      coursesData: visibleCourses,
      usersData: visibleUsers,
      pageTexts: dbState.pageTexts,
      appearanceSettings: dbState.appearanceSettings,
      // Every account needs the rules it is being gated by, or the library cannot
      // explain why a file is closed.
      downloadPolicy: downloadPolicy(),
      userRatings: dbState.userRatings,
      updatedAt: dbState.updatedAt || 0,
      contentRevision: dbState.contentRevision || 0
    });
  });

  // Every course page listed for search engines. Built from the live catalog so a new
  // program is indexed without touching a file, and the paid Evangadi pack stays out.
  app.get("/sitemap.xml", (_req, res) => {
    const origin = `${String(_req.headers["x-forwarded-proto"] || "https").split(",")[0]}://${String(_req.headers.host || "wollo-share.vercel.app")}`;
    const stamp = new Date().toISOString().slice(0, 10);
    const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const slug = (value: string) =>
      String(value || "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 70);
    const urls: Array<{ path: string; priority: string; changefreq: string }> = [
      { path: "/", priority: "1.0", changefreq: "daily" },
      { path: "/login", priority: "0.6", changefreq: "monthly" },
      { path: "/premium", priority: "0.9", changefreq: "weekly" },
      { path: "/support", priority: "0.5", changefreq: "monthly" }
    ];
    // The build-time prerender writes one page per program and deduplicates a repeated name by
    // suffixing the course id; the sitemap has to name the same files or it 404s on the second
    // "Physics" and leaves the real page uncrawled.
    const seenPaths = new Set<string>();
    const colleges = new Set<string>();
    for (const course of dbState.coursesData) {
      if (isEvangadiCourse(course)) continue;
      const college = slug(String(course.college || ""));
      if (college) colleges.add(college);
      const base = slug(course.name);
      if (!base) continue;
      let path = `/c/${encodeURIComponent(base)}`;
      if (seenPaths.has(path)) path = `/c/${encodeURIComponent(`${base}-${slug(course.id) || String(course.id)}`)}`;
      if (seenPaths.has(path)) continue;
      seenPaths.add(path);
      urls.push({ path, priority: "0.8", changefreq: "weekly" });
    }
    for (const college of colleges) {
      urls.push({ path: `/college/${encodeURIComponent(college)}`, priority: "0.7", changefreq: "weekly" });
    }
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.end(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map(
          (entry) =>
            `  <url><loc>${escape(origin + entry.path)}</loc><lastmod>${stamp}</lastmod><changefreq>${entry.changefreq}</changefreq><priority>${entry.priority}</priority></url>`
        )
        .join("\n")}\n</urlset>\n`
    );
  });

  app.put("/api/state", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const incoming = req.body || {};
    // One shared store means a tab holding an old copy can overwrite newer work, so a
    // save is only accepted when it is based on the revision the server last handed out.
    const serverRevision = Number(dbState.contentRevision) || 0;
    const baseRevision = Number(incoming.contentRevision);
    if (serverRevision > 0 && !(baseRevision >= serverRevision)) {
      res.status(409).json({
        ok: false,
        error: "Newer changes are already saved on the server. Reload the page before editing again.",
        contentRevision: serverRevision
      });
      return;
    }
    const incomingUsers: Partial<UserAccount>[] = Array.isArray(incoming.usersData) ? incoming.usersData : [];
    const mergedUsers: UserAccount[] = incomingUsers.flatMap((incomingUser): UserAccount[] => {
      const existing = dbState.usersData.find(
        (user) => user.id === incomingUser.id || user.email.toLowerCase() === String(incomingUser.email || "").toLowerCase()
      );
      if (!existing) return [];
      const { password: _password, passwordHash: _passwordHash, passwordVault: _passwordVault, ...safeUpdates } =
        incomingUser as UserAccount;
      return [{
        ...existing,
        ...safeUpdates,
        role: existing.role,
        // The download ledger belongs to the server: authorize and the credit endpoint
        // move it, and an admin tab holding a pre-spend copy must not write it back.
        downloadCredits: existing.downloadCredits,
        unpaidCurrentUploadProgress: existing.unpaidCurrentUploadProgress,
        sharedMaterialsCount: existing.sharedMaterialsCount,
        downloadsCount: existing.downloadsCount,
        password: existing.password,
        passwordHash: existing.passwordHash,
        passwordVault: existing.passwordVault
      }];
    });
    dbState = normalizeDatabase({
      coursesData: Array.isArray(incoming.coursesData) ? incoming.coursesData : dbState.coursesData,
      usersData: [...mergedUsers, ...dbState.usersData.filter((user) => !mergedUsers.some((updated) => updated.id === user.id))],
      pageTexts: incoming.pageTexts || dbState.pageTexts,
      appearanceSettings: incoming.appearanceSettings || dbState.appearanceSettings,
      downloadPolicy: incoming.downloadPolicy || dbState.downloadPolicy,
      userRatings: incoming.userRatings || dbState.userRatings,
      customAdminPassword: dbState.customAdminPassword,
      passwordRecoveryRequests: dbState.passwordRecoveryRequests,
      // Live sign-in codes and open sessions are the server's own business, not the admin
      // editor's, so a wholesale content save has to carry them over untouched.
      qrLoginRequests: dbState.qrLoginRequests,
      loginDevices: dbState.loginDevices,
      materialSubmissions: dbState.materialSubmissions,
      supportTickets: dbState.supportTickets,
      mailSettings: dbState.mailSettings,
      contentRevision: serverRevision + 1
    });
    saveDatabase(dbState);
    res.json({ ok: true, updatedAt: dbState.updatedAt, contentRevision: dbState.contentRevision });
  });

  // Admin-only account removal: PUT /api/state intentionally never deletes
  // accounts, so the workspace needs an explicit endpoint for it.
  app.delete("/api/users/:userId", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const userId = String(req.params.userId || "");
    const before = dbState.usersData;
    const remaining = before.filter((user) => user.id !== userId);
    if (remaining.length === before.length) {
      res.status(404).json({ ok: false, error: "That account is not in the library any more." });
      return;
    }
    dbState = normalizeDatabase({ ...dbState, usersData: remaining });
    saveDatabase(dbState);
    res.json({ ok: true, removed: before.length - remaining.length });
  });

  app.patch("/api/profile", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in to edit your profile." });
      return;
    }
    const user = dbState.usersData.find((candidate) => candidate.id === session.id);
    if (!user) {
      res.status(404).json({ ok: false, error: "No student profile is linked to this session." });
      return;
    }
    const name = String(req.body?.name ?? user.name).trim();
    const department = String(req.body?.department ?? user.department ?? "").trim();
    // A phone-only edit (a Google account saving its photo) must not be rejected over the
    // number it never had; the rule fires when the student actually submits one.
    const phoneSupplied = Object.prototype.hasOwnProperty.call(req.body || {}, "phone");
    const phone = String(req.body?.phone ?? user.phone ?? "").trim();
    if (name.length < 2) {
      res.status(400).json({ ok: false, error: "Enter your full name." });
      return;
    }
    const phoneError = phoneSupplied ? phoneProblem(phone) : "";
    if (phoneError) {
      res.status(400).json({ ok: false, error: phoneError });
      return;
    }
    // The browser sends a resized data URL, so the only real risk is a hand-crafted
    // megabyte being pasted into the one shared row that holds the whole library.
    const avatarProvided = Object.prototype.hasOwnProperty.call(req.body || {}, "avatarUrl");
    const avatarRaw =
      req.body?.avatarUrl === null || req.body?.avatarUrl === undefined ? "" : String(req.body.avatarUrl).trim();
    if (avatarProvided && avatarRaw) {
      if (!/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(avatarRaw)) {
        res.status(400).json({ ok: false, error: "Choose a PNG, JPEG or WebP photo." });
        return;
      }
      if (avatarRaw.length > 200_000) {
        res.status(413).json({ ok: false, error: "That photo is too large. Pick a smaller one." });
        return;
      }
    }
    user.name = name.slice(0, 80);
    user.department = department.slice(0, 80) || user.department;
    if (phoneSupplied) user.phone = phone.slice(0, 32);
    if (avatarProvided) {
      if (avatarRaw) user.avatarUrl = avatarRaw;
      else delete user.avatarUrl;
    }
    user.activityLog = [
      ...(user.activityLog || []).slice(-40),
      {
        id: "act-" + Date.now(),
        type: "Profile Updated",
        detail: `Student updated their profile — Name: ${user.name}, Dept: ${user.department || "not set"}${user.phone ? ", Phone: " + user.phone : ""}`,
        timestamp: new Date().toISOString().slice(0, 16).replace("T", " ")
      }
    ];
    saveDatabase(dbState);
    res.json({ ok: true, user: safeUserAccount(user), message: "Profile saved." });
  });

  // Every screen the account holder is signed in on. A token carries the id of its own
  // row, so marking that row revoked is what lets a phone kick a library laptop out.
  function liveDevices(accountId: string) {
    const now = Date.now();
    return dbState.loginDevices
      .filter((device) => device.accountId === accountId && !device.revokedAt && device.expiresAt > now)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  app.get("/api/account/devices", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in to see where your account is active." });
      return;
    }
    res.json({
      ok: true,
      devices: liveDevices(session.id).map((device) => ({
        id: device.id,
        label: device.label,
        method: device.method,
        createdAt: device.createdAt,
        expiresAt: device.expiresAt,
        current: device.id === session.deviceId
      }))
    });
  });

  app.post("/api/account/devices/revoke", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in to manage your devices." });
      return;
    }
    const deviceId = String(req.body?.deviceId || "");
    const device = dbState.loginDevices.find((entry) => entry.id === deviceId && entry.accountId === session.id);
    if (!device) {
      res.status(404).json({ ok: false, error: "That device is not signed in to your account." });
      return;
    }
    device.revokedAt = new Date().toISOString();
    const isCurrent = device.id === session.deviceId;
    saveDatabase(dbState);
    res.json({
      ok: true,
      current: isCurrent,
      message: isCurrent ? "This device is now signed out." : `${device.label} is signed out.`
    });
  });

  app.post("/api/account/devices/sign-out-all", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in to manage your devices." });
      return;
    }
    const stamp = new Date().toISOString();
    let revoked = 0;
    for (const device of dbState.loginDevices) {
      if (device.accountId !== session.id || device.revokedAt || device.id === session.deviceId) continue;
      device.revokedAt = stamp;
      revoked++;
    }
    saveDatabase(dbState);
    res.json({
      ok: true,
      revoked,
      message: revoked ? `Signed out of ${revoked} other device${revoked > 1 ? "s" : ""}.` : "No other device was signed in."
    });
  });

  app.get("/api/admin/verifications", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const pending = dbState.usersData
      .filter((user) => !isEmailVerified(user))
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        department: user.department,
        phone: user.phone,
        attempts: Number(user.verificationAttempts) || 0,
        expiresAt: user.verificationExpiresAt,
        mailSent: Boolean(user.verificationSentAt),
        registeredAt: (user.activityLog || []).find((entry) => entry.type === "Account Created")?.timestamp
      }));
    res.json({ ok: true, pending, mailConfigured: activeMailProvider() !== "none" });
  });

  // When the mail provider cannot send, the administrator reads the code here and
  // passes it to the student by phone or WhatsApp; the code still proves the
  // mailbox only as far as the administrator vouches for it, exactly like Approve.
  app.post("/api/admin/verifications/:userId/code", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const user = dbState.usersData.find((candidate) => candidate.id === String(req.params.userId || ""));
    if (!user) {
      res.status(404).json({ ok: false, error: "That account no longer exists." });
      return;
    }
    if (isEmailVerified(user)) {
      res.json({ ok: true, alreadyVerified: true, message: "That account is already verified." });
      return;
    }
    const { code } = issueSignupCode(user);
    delete user.verificationSentAt;
    user.activityLog = [
      ...(user.activityLog || []),
      {
        id: "act-" + Date.now(),
        type: "Code Shared",
        detail: "Administrator opened the signup code to send it to the student.",
        timestamp: new Date().toISOString().slice(0, 16).replace("T", " ")
      }
    ];
    saveDatabase(dbState);
    res.json({
      ok: true,
      code,
      expiresAt: user.verificationExpiresAt,
      message: `Send this code to ${user.email}.`
    });
  });

  app.post("/api/admin/verifications/:userId/approve", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const user = dbState.usersData.find((candidate) => candidate.id === String(req.params.userId || ""));
    if (!user) {
      res.status(404).json({ ok: false, error: "That account no longer exists." });
      return;
    }
    user.emailVerified = true;
    delete user.emailUnconfirmed;
    delete user.verificationCode;
    delete user.verificationExpiresAt;
    delete user.verificationAttempts;
    delete user.verificationSentAt;
    user.activityLog = [
      ...(user.activityLog || []),
      {
        id: "act-" + Date.now(),
        type: "Verified",
        detail: "Administrator confirmed this account from the admin panel.",
        timestamp: new Date().toISOString().slice(0, 16).replace("T", " ")
      }
    ];
    saveDatabase(dbState);
    res.json({ ok: true, user: safeUserAccount(user), message: `${user.name} can now sign in.` });
  });

  app.post("/api/admin/users", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (name.length < 2) {
      res.status(400).json({ ok: false, error: "Enter the student's full name." });
      return;
    }
    if (!email.includes("@")) {
      res.status(400).json({ ok: false, error: "Enter a valid email address." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ ok: false, error: "The starting password needs at least 8 characters." });
      return;
    }
    const phoneError = phoneProblem(req.body?.phone);
    if (phoneError) {
      res.status(400).json({ ok: false, error: phoneError });
      return;
    }
    if (dbState.usersData.some((user) => user.email.toLowerCase() === email)) {
      res.status(409).json({ ok: false, error: "An account already exists for this email." });
      return;
    }
    const requestedPlan = String(req.body?.accountPlan || "unpaid").trim();
    const plan = STUDENT_PLANS.includes(requestedPlan) ? requestedPlan : "unpaid";
    // A premium plan without an expiry date reads as lapsed on the next state load, so the
    // account the administrator just upgraded would silently fall back to unpaid.
    const premiumDays = plan === "premium_annual" ? 365 : plan === "premium_monthly" ? 30 : 0;
    const user = secureUserAccount({
      id: "user-" + Date.now(),
      name,
      email,
      password,
      role: "user",
      department: String(req.body?.department || "").trim() || undefined,
      phone: String(req.body?.phone || "").trim().slice(0, 32),
      accountPlan: plan,
      subscriptionExpiry: premiumDays ? new Date(Date.now() + premiumDays * 86400000).toISOString() : undefined,
      paymentStatus: plan === "unpaid" || plan === "free_unlimited" ? "unpaid" : "paid",
      downloadOnlyAccount: plan === "paid_download_only",
      amountPaidBirr: planPriceBirr(plan),
      category: planCategoryLabel(plan),
      sharedMaterialsCount: 0,
      downloadsCount: 0,
      lastActiveAt: "Never signed in",
      allowedCourseIds: ["course-evangadi", "course-se-capstone", "course-clinical-research", "course-calc-uni"],
      emailVerified: true,
      addedByAdmin: true,
      activityLog: [
        {
          id: "act-" + Date.now(),
          type: "Account Created",
          detail: `Added by the administrator — Name: ${name}, Email: ${email}`,
          timestamp: new Date().toISOString().slice(0, 16).replace("T", " ")
        }
      ]
    });
    dbState.usersData.unshift(user);
    saveDatabase(dbState);
    res.json({ ok: true, user: safeUserAccount(user), message: `${user.name} was added and can sign in with the password you set.` });
  });

  app.post("/api/reset", (_req, res) => {
    const session = verifyRequestSession(_req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    dbState = buildDefaultDatabase();
    saveDatabase(dbState);
    res.json({ ok: true });
  });

  // Backups are split so accounts and library move independently: an accounts file
  // never touches courses, a library file never touches sign-ins. Both carry credential
  // fields, so the files are admin-only and the administrator's to keep private.
  function accountsCounts() {
    const users = dbState.usersData;
    return {
      accounts: users.length,
      verified: users.filter((user) => isEmailVerified(user)).length,
      pending: users.filter((user) => !isEmailVerified(user)).length,
      paid: users.filter((user) => PAID_PLANS.includes(String(user.accountPlan || "unpaid"))).length
    };
  }

  function libraryCounts() {
    return {
      courses: dbState.coursesData.length,
      materials: dbState.coursesData.reduce((sum, course) => sum + (course.materials || []).length, 0),
      ratings: Object.keys(dbState.userRatings || {}).length,
      submissions: dbState.materialSubmissions.length
    };
  }

  function backupMeta(format: string, counts: Record<string, number>) {
    return {
      format,
      version: 1,
      exportedAt: new Date().toISOString(),
      storage: remoteEnabled() ? "supabase" : "local-file",
      counts
    };
  }

  function libraryState() {
    return {
      coursesData: dbState.coursesData,
      pageTexts: dbState.pageTexts,
      appearanceSettings: dbState.appearanceSettings,
      downloadPolicy: dbState.downloadPolicy,
      userRatings: dbState.userRatings,
      materialSubmissions: dbState.materialSubmissions
    };
  }

  function backupDocument(scope: string) {
    if (scope === "accounts") {
      return { ...backupMeta("wollo-share-accounts", accountsCounts()), state: { usersData: dbState.usersData } };
    }
    if (scope === "library") {
      return { ...backupMeta("wollo-share-library", libraryCounts()), state: libraryState() };
    }
    return {
      ...backupMeta("wollo-share-backup", { ...accountsCounts(), ...libraryCounts() }),
      state: {
        ...libraryState(),
        usersData: dbState.usersData,
        customAdminPassword: dbState.customAdminPassword,
        passwordRecoveryRequests: dbState.passwordRecoveryRequests,
        supportTickets: dbState.supportTickets,
        mailSettings: dbState.mailSettings,
        contentRevision: dbState.contentRevision || 0,
        updatedAt: dbState.updatedAt || 0
      }
    };
  }

  function csvCell(value: unknown): string {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  app.get("/api/admin/backup/accounts.csv", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const rows = [
      ["Name", "Email", "Phone", "Department", "Status", "Verified", "Joined", "Last active", "Downloads"],
      ...dbState.usersData.map((user) => [
        user.name,
        user.email,
        user.phone || "",
        user.department || "",
        user.category || user.accountPlan || "",
        isEmailVerified(user) ? "Yes" : "No",
        (user.activityLog || []).find((entry) => entry.type === "Account Created")?.timestamp || "",
        user.lastActiveAt || "",
        String(user.downloadsCount || 0)
      ])
    ];
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
    // The BOM keeps Excel from mangling the department names.
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="wollo-share-accounts-${stamp}.csv"`);
    res.send("\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"));
  });

  app.get("/api/admin/backup/submissions.csv", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const session = verifyRequestSession(req);
    if (!session || !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "A support staff or administrator session is required." });
      return;
    }
    const rows = [
      ["Sent on", "Student", "Email", "Course", "Document", "Format", "Size", "Year", "Semester", "Category", "Status", "Decided by", "Reason"],
      ...dbState.materialSubmissions.map((submission) => [
        (submission.createdAt || "").slice(0, 16).replace("T", " "),
        submission.contributorName || "",
        submission.userEmail || "",
        submission.courseName || "",
        submission.name,
        submission.type || "",
        submission.size || "",
        submission.year || "",
        submission.semester || "",
        submission.subcategory || "",
        submission.status,
        submission.decidedBy || "",
        submission.reason || ""
      ])
    ];
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="wollo-share-sent-materials-${stamp}.csv"`);
    res.send("\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"));
  });

  app.get("/api/admin/backup", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const scope = String(req.query.scope || "all");
    if (!["accounts", "library", "all"].includes(scope)) {
      res.status(400).json({ ok: false, error: "Unknown backup scope. Use accounts, library or all." });
      return;
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
    res.setHeader("Content-Disposition", `attachment; filename="wollo-share-${scope === "all" ? "backup" : scope}-${stamp}.json"`);
    res.json(backupDocument(scope));
  });

  app.get("/api/admin/backup/info", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const submissions = dbState.materialSubmissions;
    res.json({
      ok: true,
      storage: remoteEnabled() ? "supabase" : "local-file",
      accounts: accountsCounts(),
      library: libraryCounts(),
      sentMaterials: {
        total: submissions.length,
        pending: submissions.filter((s) => s.status === "pending").length,
        approved: submissions.filter((s) => s.status === "approved").length,
        rejected: submissions.filter((s) => s.status === "rejected").length,
        contributors: new Set(submissions.map((s) => s.userId)).size
      },
      complaints: {
        open: dbState.supportTickets.filter((t) => t.status === "open").length,
        answered: dbState.supportTickets.filter((t) => t.status === "answered").length,
        closed: dbState.supportTickets.filter((t) => t.status === "closed").length
      },
      updatedAt: dbState.updatedAt || 0,
      contentRevision: dbState.contentRevision || 0
    });
  });

  app.post("/api/admin/restore", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    // Accept the downloaded wrapper as-is, and a bare state document for older files.
    const incoming = body.state && typeof body.state === "object" ? body.state : body;
    const users = Array.isArray(incoming.usersData) ? incoming.usersData : null;
    const courses = Array.isArray(incoming.coursesData) ? incoming.coursesData : null;
    // What the file contains decides what it may replace, so restoring an accounts file
    // can never wipe the library and vice versa, whichever button the admin pressed.
    const scope = users && courses ? "all" : users ? "accounts" : courses ? "library" : "";
    if (!scope) {
      res.status(400).json({ ok: false, error: "That file is not a Wollo Share backup: it has no accounts or courses." });
      return;
    }
    if (users) {
      if (!users.length) {
        res.status(400).json({ ok: false, error: "That accounts backup is empty, so nothing was restored." });
        return;
      }
      const brokenAccount = users.find((user: UserAccount | null) => !user || typeof user.id !== "string" || typeof user.email !== "string");
      if (brokenAccount) {
        res.status(400).json({ ok: false, error: "One of the accounts in that backup is missing its id or email, so nothing was restored." });
        return;
      }
    }
    if (courses && !courses.length) {
      res.status(400).json({ ok: false, error: "That library backup is empty, so nothing was restored." });
      return;
    }

    const serverRevision = Number(dbState.contentRevision) || 0;
    if (scope === "accounts") {
      const restored = normalizeDatabase({ ...dbState, usersData: users as UserAccount[], contentRevision: serverRevision + 1 });
      // normalizeDatabase re-seeds the demo accounts when they are absent; a restore must
      // reproduce the backup exactly, so drop anything that was not in the file.
      const backupIds = new Set((users as UserAccount[]).map((user) => String(user.id)));
      restored.usersData = restored.usersData.filter((user) => backupIds.has(String(user.id)));
      dbState = restored;
    } else if (scope === "library") {
      dbState = normalizeDatabase({
        ...dbState,
        coursesData: courses as Course[],
        pageTexts: incoming.pageTexts ?? dbState.pageTexts,
        appearanceSettings: incoming.appearanceSettings ?? dbState.appearanceSettings,
        downloadPolicy: incoming.downloadPolicy ?? dbState.downloadPolicy,
        userRatings: incoming.userRatings ?? dbState.userRatings,
        materialSubmissions: incoming.materialSubmissions ?? dbState.materialSubmissions,
        contentRevision: serverRevision + 1
      });
    } else {
      const restored = normalizeDatabase({
        ...dbState,
        coursesData: courses as Course[],
        usersData: users as UserAccount[],
        pageTexts: incoming.pageTexts ?? dbState.pageTexts,
        appearanceSettings: incoming.appearanceSettings ?? dbState.appearanceSettings,
        downloadPolicy: incoming.downloadPolicy ?? dbState.downloadPolicy,
        userRatings: incoming.userRatings ?? dbState.userRatings,
        customAdminPassword: ensureAdminPasswordHash(incoming.customAdminPassword ?? dbState.customAdminPassword),
        passwordRecoveryRequests: incoming.passwordRecoveryRequests ?? dbState.passwordRecoveryRequests,
        materialSubmissions: incoming.materialSubmissions ?? dbState.materialSubmissions,
        supportTickets: incoming.supportTickets ?? dbState.supportTickets,
        mailSettings: incoming.mailSettings ?? dbState.mailSettings,
        contentRevision: serverRevision + 1
      });
      const backupIds = new Set((users as UserAccount[]).map((user) => String(user.id)));
      restored.usersData = restored.usersData.filter((user) => backupIds.has(String(user.id)));
      dbState = restored;
      applyMailSettings();
    }
    saveDatabase(dbState);
    res.json({
      ok: true,
      scope,
      storedIn: remoteEnabled() ? "supabase" : "local-file",
      restored: { accounts: accountsCounts(), library: libraryCounts() },
      contentRevision: dbState.contentRevision
    });
  });

  // 3. Authentication Endpoints
  app.post("/api/auth/password-recovery/request", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const now = Date.now();
    const clientKey = requestClientIp(req);
    pruneRateMap(recoveryRequestRateLimitMap, 15 * 60 * 1000);
    const rate = recoveryRequestRateLimitMap.get(clientKey);
    if (!rate || now - rate.windowStartedAt >= 15 * 60 * 1000) {
      recoveryRequestRateLimitMap.set(clientKey, { count: 1, windowStartedAt: now });
    } else if (rate.count >= 30) {
      res.status(429).json({ ok: false, error: "Too many recovery requests from this network. Please try again in a few minutes." });
      return;
    } else {
      rate.count++;
    }

    const identifier = String(req.body?.email || "").trim().toLowerCase();
    const account = dbState.usersData.find((user) => user.email.toLowerCase() === identifier);
    const target = identifier === ADMIN_EMAIL.toLowerCase()
      ? { userId: "admin-owner", email: ADMIN_EMAIL, name: "Administrator" }
      : account
      ? { userId: account.id, email: account.email, name: account.name }
      : null;

    if (target) {
      const existing = dbState.passwordRecoveryRequests.find(
        (request) => request.userId === target.userId &&
          (request.status === "pending" || request.status === "code-issued") &&
          now - Date.parse(request.createdAt) < 15 * 60 * 1000
      );
      if (!existing) {
        dbState.passwordRecoveryRequests = dbState.passwordRecoveryRequests.filter(
          (request) => request.status === "pending" || request.status === "code-issued" ||
            now - Date.parse(request.createdAt) < 90 * 24 * 60 * 60 * 1000
        ).slice(-499);
        const recoveryRequest: PasswordRecoveryRequest = {
          id: crypto.randomUUID(),
          ...target,
          createdAt: new Date(now).toISOString(),
          status: "pending",
          failedAttempts: 0
        };
        dbState.passwordRecoveryRequests.push(recoveryRequest);
        recoveryRequest.notificationSent = false;
        saveDatabase(dbState);
        // A serverless instance freezes as soon as the response is sent, so the code
        // has to leave before replying or the email never goes out.
        try {
          await issueRecoveryCode(recoveryRequest);
          recoveryRequest.notificationSent = await notifyAdminOfRecoveryRequest(recoveryRequest);
          saveDatabase(dbState);
        } catch (error) {
          console.error("Recovery request dispatch failed:", error);
        }
      } else {
        // Asking again must actually dispatch mail: reuse the open request, but replace the code
        // (and email it) unless a code went out less than a minute ago.
        const lastSent = existing.codeSentAt ? Date.parse(existing.codeSentAt) : 0;
        if (now - lastSent > 60_000) {
          try {
            await issueRecoveryCode(existing);
            saveDatabase(dbState);
          } catch (error) {
            console.error("Recovery code resend failed:", error);
          }
        }
      }
    }
    res.json({
      ok: true,
      mailDeliverable: mailStatus().provider !== "none",
      // One wording for every outcome: a per-account "the email bounced" reply would confirm
      // which addresses are registered.
      message: "If the account exists, a 6-digit code is on its way. It expires in 30 minutes."
    });
  });

  app.post("/api/auth/password-recovery/complete", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const identifier = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    if (newPassword.length < 8) {
      res.status(400).json({ ok: false, error: "Choose a password that is at least 8 characters long." });
      return;
    }
    const account = dbState.usersData.find((user) => user.email.toLowerCase() === identifier);
    const targetId = identifier === ADMIN_EMAIL.toLowerCase() ? "admin-owner" : account?.id || "";
    // A second recovery request must not be shadowed by an older, already-expired code.
    const openRequests = dbState.passwordRecoveryRequests.filter(
      (request) => request.userId === targetId && request.status === "code-issued"
    );
    let expiredAny = false;
    openRequests.forEach((request) => {
      if (!request.codeHash || !request.codeExpiresAt || Date.parse(request.codeExpiresAt) <= Date.now()) {
        request.status = "closed";
        delete request.codeHash;
        expiredAny = true;
      }
    });
    const candidate = openRequests
      .filter((request) => request.status === "code-issued")
      .sort((a, b) => Date.parse(String(b.codeExpiresAt)) - Date.parse(String(a.codeExpiresAt)))[0];
    if (!candidate || !candidate.codeHash || !candidate.codeExpiresAt) {
      if (expiredAny) saveDatabase(dbState);
      res.status(400).json({ ok: false, error: "The recovery code is invalid or expired. Request a new one from the administrator." });
      return;
    }
    const recoveryRequest = candidate;
    const activeCodeHash = String(recoveryRequest.codeHash);
    if (!verifyPasswordHash(code, activeCodeHash, `password-recovery:${recoveryRequest.id}`)) {
      recoveryRequest.failedAttempts++;
      if (recoveryRequest.failedAttempts >= 5) {
        recoveryRequest.status = "closed";
        delete recoveryRequest.codeHash;
      }
      saveDatabase(dbState);
      res.status(400).json({ ok: false, error: "The recovery code is invalid or expired. Request a new one from the administrator." });
      return;
    }

    if (targetId === "admin-owner") {
      dbState.customAdminPassword = ensureAdminPasswordHash(newPassword);
      if (account) {
        const updatedUser = secureUserAccount({ ...account, password: newPassword });
        dbState.usersData = dbState.usersData.map((user) => user.id === account.id ? updatedUser : user);
      }
    } else if (account) {
      const updatedUser = secureUserAccount({ ...account, password: newPassword });
      dbState.usersData = dbState.usersData.map((user) => user.id === account.id ? updatedUser : user);
    } else {
      res.status(400).json({ ok: false, error: "The account could not be found." });
      return;
    }
    recoveryRequest.status = "completed";
    delete recoveryRequest.codeHash;
    delete recoveryRequest.codeExpiresAt;
    saveDatabase(dbState);
    res.json({ ok: true, message: "Your password has been changed. You can now sign in." });
  });

  app.get("/api/admin/password-recovery-requests", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    const mail = mailStatus();
    res.json({
      ok: true,
      mailProvider: mail.provider,
      smtpConfigured: mail.provider !== "none",
      requests: dbState.passwordRecoveryRequests
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ codeHash: _codeHash, ...request }) => request)
    });
  });

  app.post("/api/admin/password-recovery-requests/:requestId/code", async (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const recoveryRequest = dbState.passwordRecoveryRequests.find(
      (request) => request.id === req.params.requestId &&
        (request.status === "pending" || request.status === "code-issued")
    );
    if (!recoveryRequest) {
      res.status(404).json({ ok: false, error: "This recovery request is no longer active." });
      return;
    }
    const delivery = await issueRecoveryCode(recoveryRequest);
    res.json({
      ok: true,
      sent: delivery.ok,
      provider: delivery.provider,
      mailDelivered: delivery.ok,
      // Same door the signup code has: when mail cannot leave the server, the administrator
      // reads the code here and passes it to the account owner by hand.
      code: delivery.code,
      expiresAt: recoveryRequest.codeExpiresAt,
      error: delivery.ok ? undefined : delivery.error,
      message: delivery.ok
        ? `A recovery code was emailed to ${recoveryRequest.email}.`
        : `Email delivery failed, so the code below is the only copy. Give it to ${recoveryRequest.email}.`
    });
  });

  app.post("/api/admin/password-recovery-requests/:requestId/close", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const recoveryRequest = dbState.passwordRecoveryRequests.find((request) => request.id === req.params.requestId);
    if (!recoveryRequest || recoveryRequest.status === "completed") {
      res.status(404).json({ ok: false, error: "This recovery request cannot be closed." });
      return;
    }
    recoveryRequest.status = "closed";
    delete recoveryRequest.codeHash;
    delete recoveryRequest.codeExpiresAt;
    delete recoveryRequest.codeSentAt;
    saveDatabase(dbState);
    res.json({ ok: true });
  });

  app.get("/api/admin/mail-status", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    res.json({ ok: true, ...mailStatus() });
  });

  app.get("/api/admin/mail-settings", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const settings = normalizeMailSettings(dbState.mailSettings);
    res.json({
      ok: true,
      settings: {
        preference: settings.preference,
        relayUrl: settings.relayUrl,
        relayFrom: settings.relayFrom,
        hasRelayKey: Boolean(settings.relayApiKeyVault),
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpSecure: settings.smtpSecure,
        smtpUser: settings.smtpUser,
        smtpFrom: settings.smtpFrom,
        hasSmtpPass: Boolean(settings.smtpPassVault),
        brevoFrom: settings.brevoFrom,
        hasBrevoKey: Boolean(settings.brevoApiKeyVault),
        mailtrapFrom: settings.mailtrapFrom,
        hasMailtrapToken: Boolean(settings.mailtrapTokenVault),
        mailtrapTemplateUuid: settings.mailtrapTemplateUuid
      },
      ...mailStatus()
    });
  });

  app.put("/api/admin/mail-settings", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const body = req.body || {};
    const current = normalizeMailSettings(dbState.mailSettings);
    const next: MailSettings = { ...current };

    const readText = (value: unknown) => (typeof value === "string" ? value.trim() : undefined);
    const preference = readText(body.preference);
    if (preference && ["auto", "relay", "smtp", "brevo", "mailtrap", "none"].includes(preference)) next.preference = preference as MailSettings["preference"];

    const relayUrl = readText(body.relayUrl);
    if (relayUrl !== undefined) next.relayUrl = relayUrl.replace(/\/+$/, "");
    const relayFrom = readText(body.relayFrom);
    if (relayFrom !== undefined) next.relayFrom = relayFrom;
    if (body.clearRelayKey === true) next.relayApiKeyVault = "";
    const relayApiKey = readText(body.relayApiKey);
    // A blank field means "keep the stored key"; only a real value replaces it.
    if (relayApiKey) next.relayApiKeyVault = encryptVaultSecret(normalizeMailSecret(relayApiKey), MAIL_VAULT_CONTEXT);

    const smtpHost = readText(body.smtpHost);
    if (smtpHost !== undefined) next.smtpHost = smtpHost;
    const smtpPort = Number(body.smtpPort);
    if (Number.isInteger(smtpPort) && smtpPort > 0) next.smtpPort = smtpPort;
    if (typeof body.smtpSecure === "boolean") next.smtpSecure = body.smtpSecure;
    const smtpUser = readText(body.smtpUser);
    if (smtpUser !== undefined) next.smtpUser = smtpUser;
    const smtpFrom = readText(body.smtpFrom);
    if (smtpFrom !== undefined) next.smtpFrom = smtpFrom;
    if (body.clearSmtpPass === true) next.smtpPassVault = "";
    const smtpPass = readText(body.smtpPass);
    if (smtpPass) next.smtpPassVault = encryptVaultSecret(smtpPass, MAIL_VAULT_CONTEXT);

    const brevoFrom = readText(body.brevoFrom);
    if (brevoFrom !== undefined) next.brevoFrom = brevoFrom;
    if (body.clearBrevoKey === true) next.brevoApiKeyVault = "";
    const brevoApiKey = readText(body.brevoApiKey);
    if (brevoApiKey) next.brevoApiKeyVault = encryptVaultSecret(normalizeMailSecret(brevoApiKey), MAIL_VAULT_CONTEXT);

    const mailtrapFrom = readText(body.mailtrapFrom);
    if (mailtrapFrom !== undefined) next.mailtrapFrom = mailtrapFrom;
    if (body.clearMailtrapToken === true) next.mailtrapTokenVault = "";
    const mailtrapToken = readText(body.mailtrapToken);
    if (mailtrapToken) next.mailtrapTokenVault = encryptVaultSecret(normalizeMailSecret(mailtrapToken), MAIL_VAULT_CONTEXT);
    const mailtrapTemplateUuid = readText(body.mailtrapTemplateUuid);
    if (mailtrapTemplateUuid !== undefined) next.mailtrapTemplateUuid = mailtrapTemplateUuid;

    dbState.mailSettings = next;
    saveDatabase(dbState);
    applyMailSettings();

    const status = mailStatus();
    res.json({
      ok: true,
      settings: {
        preference: next.preference || "auto",
        relayUrl: next.relayUrl || "",
        relayFrom: next.relayFrom || "",
        hasRelayKey: Boolean(next.relayApiKeyVault),
        smtpHost: next.smtpHost || "",
        smtpPort: next.smtpPort || 0,
        smtpSecure: Boolean(next.smtpSecure),
        smtpUser: next.smtpUser || "",
        smtpFrom: next.smtpFrom || "",
        hasSmtpPass: Boolean(next.smtpPassVault),
        brevoFrom: next.brevoFrom || "",
        hasBrevoKey: Boolean(next.brevoApiKeyVault),
        mailtrapFrom: next.mailtrapFrom || "",
        hasMailtrapToken: Boolean(next.mailtrapTokenVault),
        mailtrapTemplateUuid: next.mailtrapTemplateUuid || ""
      },
      ...status
    });
  });

  app.post("/api/admin/mail/test", async (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const to = String(req.body?.to || "").trim() || session.email;
    const provider = activeMailProvider();
    const delivery = await sendMail({
      to,
      ...testEmailMessage({
        providerLabel: MAIL_PROVIDER_LABEL[provider] || provider,
        sender: activeSenderAddress() || "not configured",
        recipient: to,
        sentAt: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC"
      })
    });
    res.json({ ok: delivery.ok, provider: delivery.provider, to, error: delivery.error });
  });

  app.post("/api/auth/register", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const name = String(req.body?.name || "").trim() || "Student Learner";
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    // New students are Year 1 until they say otherwise, matching the signup form's default.
    const department = String(req.body?.department || "Freshman (Year 1)").trim();
    const phone = String(req.body?.phone || "").trim();
    // Signup never hands out a paid plan: only the administrator's own routes may set one,
    // so a crafted register request cannot buy its way into unlimited downloads.
    const plan = "unpaid";
    const registeredAt = new Date().toISOString().slice(0, 16).replace("T", " ");

    // Accounts live in one shared document, so unbounded signup is an outage and a
    // phishing list, not just noise. Generous enough for a shared campus lab.
    const signupIp = requestClientIp(req);
    const signupWindow = signupRequestRateLimitMap.get(signupIp);
    const signupNow = Date.now();
    if (!signupWindow || signupNow - signupWindow.windowStartedAt >= 60 * 60 * 1000) {
      pruneRateMap(signupRequestRateLimitMap, 60 * 60 * 1000);
      signupRequestRateLimitMap.set(signupIp, { count: 1, windowStartedAt: signupNow });
    } else if (signupWindow.count >= 40) {
      res.status(429).json({
        ok: false,
        error: "Too many accounts were created from this network just now. Please try again later."
      });
      return;
    } else {
      signupWindow.count++;
    }

    if (!email || !email.includes("@")) {
      res.status(400).json({ ok: false, error: "Please enter a valid email address." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ ok: false, error: "Password must be at least 8 characters long." });
      return;
    }
    // A sign-in that matches now also verifies the account, so a password an attacker could
    // guess has to be worth more than six digits of a phone PIN.
    if (/^\d{6,12}$/.test(password) || /^(password|passwd|welcome|hello|student|qwerty|123456)[^\n]{0,6}$/i.test(password)) {
      res.status(400).json({ ok: false, error: "Choose something other than a PIN or a word like “password”." });
      return;
    }
    const phoneError = phoneProblem(phone);
    if (phoneError) {
      res.status(400).json({ ok: false, error: phoneError });
      return;
    }
    if (dbState.usersData.some((user) => user.email.toLowerCase() === email)) {
      res.status(409).json({ ok: false, error: "An account already exists for this email. Sign in instead." });
      return;
    }

    const user = secureUserAccount({
      id: "user-" + Date.now(),
      name,
      email,
      password,
      role: "user",
      department,
      phone: phone.slice(0, 32),
      accountPlan: plan,
      paymentStatus: "unpaid",
      downloadOnlyAccount: false,
      amountPaidBirr: planPriceBirr(plan),
      category: "Unpaid · Pending 2 Uploads",
      sharedMaterialsCount: 0,
      downloadsCount: 0,
      lastActiveAt: "Active now",
      allowedCourseIds: ["course-evangadi", "course-se-capstone", "course-clinical-research", "course-calc-uni"],
      evangadiSynced: true,
      unpaidMigrationV3: true,
      unpaidPerDownloadMigrationV4: true,
      activityLog: [
        {
          id: "act-" + Date.now(),
          type: "Account Created",
          detail: `Registered free account — Name: ${name}, Email: ${email}, Dept: ${department}${phone ? ", Phone: " + phone : ""}, Registered: ${registeredAt}`,
          timestamp: registeredAt
        }
      ]
    });

    dbState.usersData.unshift(user);
    const { code } = issueSignupCode(user);
    // Awaited: a serverless instance freezes as soon as the response is flushed.
    const delivery = await sendSignupCode(user, code);
    if (delivery.ok) {
      saveDatabase(dbState);
      res.json({
        ok: true,
        pendingVerification: true,
        mailSent: true,
        email: user.email,
        user: safeUserAccount(user),
        session: issueDeviceSession({ id: user.id, name: user.name, email: user.email, role: user.role }, req, "verification"),
        message: `We emailed a 6-digit code to ${user.email}. Enter it on the "Confirm your email" step to open the account.`
      });
      return;
    }
    // The provider can refuse the server's IP address, and a student must not lose their
    // registration over that. The account still opens as an ordinary student.
    keepPendingAfterMailFailure(user);
    saveDatabase(dbState);
    res.json({
      ok: true,
      pendingVerification: true,
      mailSent: false,
      email: user.email,
      user: safeUserAccount(user),
      session: issueDeviceSession({ id: user.id, name: user.name, email: user.email, role: user.role }, req, "verification"),
      message: `The code did not reach ${user.email}. Press "Resend" on the "Confirm your email" step, or sign in with your password.`
    });
  });
  app.post("/api/auth/verify-email", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").replace(/\D/g, "");
    if (req.body?.resend) {
      // One mailbox plus one source gets a few codes per window: a resent code is an email
      // the provider has to pay for, and an unchecked loop is a spam tool.
      const resendKey = `${requestClientIp(req)}|${email}`;
      const resendNow = Date.now();
      const resendWindow = codeRateLimitMap.get(resendKey);
      if (!resendWindow || resendNow - resendWindow.windowStartedAt >= 10 * 60 * 1000) {
        pruneRateMap(codeRateLimitMap, 10 * 60 * 1000);
        codeRateLimitMap.set(resendKey, { count: 1, windowStartedAt: resendNow });
      } else if (resendWindow.count >= 3) {
        res.status(429).json({ ok: false, error: "Too many codes requested for that address. Please wait a few minutes." });
        return;
      } else {
        resendWindow.count++;
      }
      const target = dbState.usersData.find((user) => user.email.toLowerCase() === email);
      // Whether the address has an account, and whether it is already verified, is not
      // something an unauthenticated caller gets to learn — the wording stays neutral.
      if (!target || isEmailVerified(target)) {
        res.json({
          ok: true,
          mailSent: false,
          message: "If that address has an unverified Wollo Share account, a fresh code is on its way. It expires in 30 minutes."
        });
        return;
      }
      const { code: fresh } = issueSignupCode(target);
      const delivery = await sendSignupCode(target, fresh);
      if (delivery.ok) {
        saveDatabase(dbState);
        res.json({ ok: true, mailSent: true, message: `A new 6-digit code was emailed to ${target.email}.` });
        return;
      }
      keepPendingAfterMailFailure(target);
      saveDatabase(dbState);
      res.json({
        ok: true,
        mailSent: false,
        user: safeUserAccount(target),
        message: `The email still could not be delivered, so ${target.email} stays unverified. Press "Resend" again later or ask the administrator to confirm it.`
      });
      return;
    }
    if (code.length !== 6) {
      res.status(400).json({ ok: false, error: "Enter the 6-digit code from your email." });
      return;
    }
    // Guessing is limited twice: this window stops one source working through the million
    // combinations, and VERIFICATION_MAX_ATTEMPTS throws the code away for that account.
    const attemptKey = `${requestClientIp(req)}|${email}`;
    const attemptNow = Date.now();
    const attemptWindow = codeRateLimitMap.get(attemptKey);
    if (!attemptWindow || attemptNow - attemptWindow.windowStartedAt >= 10 * 60 * 1000) {
      pruneRateMap(codeRateLimitMap, 10 * 60 * 1000);
      codeRateLimitMap.set(attemptKey, { count: 1, windowStartedAt: attemptNow });
    } else if (attemptWindow.count >= 10) {
      res.status(429).json({ ok: false, error: "Too many codes tried for that address. Please wait a few minutes." });
      return;
    } else {
      attemptWindow.count++;
    }

    const user = dbState.usersData.find((candidate) => candidate.email.toLowerCase() === email);
    // An unknown address, an already-verified account and a wrong code all get the same
    // answer, so this route cannot be used to ask whether an email has an account.
    if (!user || isEmailVerified(user)) {
      res.status(401).json({ ok: false, error: "That code does not match the address. Check both, or sign in with your password." });
      return;
    }
    user.verificationAttempts = Number(user.verificationAttempts || 0) + 1;
    if (user.verificationAttempts > VERIFICATION_MAX_ATTEMPTS) {
      delete user.verificationCode;
      delete user.verificationExpiresAt;
      saveDatabase(dbState);
      res.status(429).json({ ok: false, error: "Too many attempts. Ask the administrator to verify your account." });
      return;
    }
    if (!signupCodeMatches(user, code)) {
      saveDatabase(dbState);
      res.status(401).json({
        ok: false,
        error:
          Date.parse(String(user.verificationExpiresAt || "")) < Date.now()
            ? "That code has expired. Request a new one, or sign in with your password."
            : "That code does not match the address. Check both, or sign in with your password."
      });
      return;
    }
    user.emailVerified = true;
    // The mailbox just produced the code, so the earlier "never delivered" flag is stale.
    delete user.emailUnconfirmed;
    delete user.verificationCode;
    delete user.verificationExpiresAt;
    delete user.verificationAttempts;
    user.lastActiveAt = "Active now";
    saveDatabase(dbState);
    const session = issueDeviceSession({ id: user.id, name: user.name, email: user.email, role: user.role }, req, "verification");
    res.json({ ok: true, verified: true, user: safeUserAccount(user), session, message: "Email verified. Welcome to Wollo Share." });
  });
  app.post("/api/auth/google", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const uid = String(req.body?.uid || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim() || "Google Student";
    const photoURL = String(req.body?.photoURL || "").trim();
    const idToken = String(req.body?.idToken || "").trim();

    if (!email || !uid || !idToken || !FIREBASE_CONFIG.apiKey) {
      res.status(400).json({ ok: false, error: "A valid Firebase sign-in token is required." });
      return;
    }

    let verifiedAccount: { localId: string; email: string; emailVerified: boolean } | undefined;
    try {
      const verificationResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken })
        }
      );
      if (verificationResponse.ok) {
        const verificationData = await verificationResponse.json() as {
          users?: Array<{ localId: string; email: string; emailVerified: boolean }>;
        };
        verifiedAccount = verificationData.users?.[0];
      }
    } catch {
      res.status(503).json({ ok: false, error: "Unable to verify Google sign-in right now. Please try again." });
      return;
    }

    if (
      !verifiedAccount ||
      verifiedAccount.localId !== uid ||
      verifiedAccount.email.toLowerCase() !== email ||
      !verifiedAccount.emailVerified
    ) {
      res.status(401).json({ ok: false, error: "Google sign-in could not be verified." });
      return;
    }

    const existing = dbState.usersData.find((u) => u.email.toLowerCase() === email || u.id === uid);

    if (existing) {
      existing.name = name || existing.name;
      saveDatabase(dbState);
      const session = issueDeviceSession(
        {
          id: existing.id,
          name: existing.name,
          email: existing.email,
          role: existing.role
        },
        req,
        "google"
      );
      res.json({ ok: true, user: safeUserAccount(existing), session, message: "Signed in with Google successfully!" });
      return;
    }

    const newUser = secureUserAccount({
      id: uid,
      name,
      email,
      // Unguessable and never typed: this account signs in through Google, and password
      // recovery can still email a code to the verified address.
      password: crypto.randomBytes(24).toString("base64url"),
      role: "user",
      department: "General Studies & Science",
      accountPlan: "unpaid",
      paymentStatus: "unpaid",
      downloadOnlyAccount: false,
      amountPaidBirr: 0,
      category: "Google Verified Student",
      sharedMaterialsCount: 0,
      downloadsCount: 0,
      lastActiveAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      allowedCourseIds: ["course-evangadi", "course-se-capstone", "course-calc-uni"],
      evangadiSynced: true,
      unpaidMigrationV3: true,
      unpaidPerDownloadMigrationV4: true,
      activityLog: [
        {
          id: "act-" + Date.now(),
          type: "Google Auth Login",
          detail: `Onboarded with Google account (${email})`,
          timestamp: new Date().toISOString().slice(0, 16).replace("T", " ")
        }
      ]
    });

    dbState.usersData.unshift(newUser);
    saveDatabase(dbState);

    const session = issueDeviceSession(
      {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      },
      req,
      "google"
    );

    res.json({ ok: true, user: safeUserAccount(newUser), session, message: "Google onboarding completed successfully!" });
  });

  app.post("/api/auth/login", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const identifier = String(req.body?.identifier || "").trim();
    const password = String(req.body?.password || "");
    const lowerId = identifier.toLowerCase() || "anonymous";
    const clientIp = requestClientIp(req);
    const attemptKey = `${clientIp}|${lowerId}`;
    const now = Date.now();

    // Two budgets, checked before any credential is looked at: the first stops one source
    // hammering a single account, the second stops one source walking through many.
    const ipRecord = ipFailureRateLimitMap.get(clientIp);
    if (ipRecord && ipRecord.lockedUntil > now) {
      res.status(429).json({
        ok: false,
        error: `Too many failed sign-in attempts from your network. Try again in ${Math.ceil((ipRecord.lockedUntil - now) / 1000)}s.`
      });
      return;
    }
    const rateRecord = loginRateLimitMap.get(attemptKey);
    if (rateRecord && rateRecord.lockedUntil > now) {
      const waitSecs = Math.ceil((rateRecord.lockedUntil - now) / 1000);
      res.status(429).json({
        ok: false,
        error: `Too many failed login attempts. Please wait ${waitSecs}s before trying again.`
      });
      return;
    }
    pruneRateMap(loginRateLimitMap, 60 * 60 * 1000);
    pruneRateMap(ipFailureRateLimitMap, LOGIN_IP_WINDOW_MS);

    // Accounts onboarded with Google used to be given a password derived from their own
    // uid, which anyone holding that uid could rebuild. Answering that shape with a plain
    // rejection closes the door on the accounts that still carry it.
    if (/^google_oauth_protected_/i.test(password.trim())) {
      res.status(401).json({ ok: false, error: "Invalid username/email or password." });
      return;
    }

    // The administrator credential is checked first so an admin identifier that
    // also belongs to a user account still yields an administrator session.
    const isAdminId =
      lowerId === ADMIN_USERNAME.toLowerCase() ||
      lowerId === ADMIN_EMAIL.toLowerCase() ||
      lowerId === OWNER_ALT_EMAIL.toLowerCase() ||
      lowerId === "habib" ||
      lowerId === "habibyesuf81";

    // A live recovery code means the password reset is still open. Signing in with the
    // old password would leave it half-done, so send them back to the code step instead.
    const resetAccount = findAccountByIdentifier(identifier);
    const resetUserId = isAdminId ? "admin-owner" : resetAccount?.id || "";
    const openReset = resetUserId
      ? dbState.passwordRecoveryRequests.find(
          (request) =>
            request.userId === resetUserId &&
            request.status === "code-issued" &&
            Boolean(request.codeHash && request.codeExpiresAt) &&
            Date.parse(String(request.codeExpiresAt)) > Date.now()
        )
      : undefined;
    if (openReset) {
      res.status(403).json({
        ok: false,
        needsRecovery: true,
        email: openReset.email,
        error: "You have a password reset in progress. Enter your 6-digit recovery code to finish it."
      });
      return;
    }

    // The administrator is not sent a code: their account has no row of its own to hold it,
    // and a refused mailbox would lock the owner out of the panel they use to fix the mail.
    if (isAdminId && verifyAdminAccountPassword(password, dbState.customAdminPassword)) {
      loginRateLimitMap.delete(attemptKey);
      // A password stored in the old repeated-hash shape is put back to a single hash, so
      // the next sign-in reads it the normal way.
      const repairedHash = ensureAdminPasswordHash(password);
      if (dbState.customAdminPassword && dbState.customAdminPassword !== repairedHash) {
        dbState.customAdminPassword = repairedHash;
        saveDatabase(dbState);
      }
      const signedSession = issueDeviceSession(
        {
          id: "admin-owner",
          name: "Habib Yesuf",
          email: ADMIN_EMAIL,
          role: "admin"
        },
        req,
        "password"
      );
      res.json({ ok: true, session: signedSession });
      return;
    }

    // Check registered student/user accounts next
    const matchedUser = (() => {
      const account = findAccountByIdentifier(identifier);
      return account && verifyUserAccountPassword(password, account) ? account : undefined;
    })();

    if (matchedUser) {
      // A student who registered minutes ago already has a live confirmation code in their
      // inbox and the "Confirm your email" bar is waiting for it inside the library, so this
      // sign-in sends no second email and spends no code that has not been used yet.
      const awaitingSignupCode =
        matchedUser.emailVerified === false &&
        Boolean(matchedUser.verificationCode) &&
        Date.parse(String(matchedUser.verificationExpiresAt || "")) > Date.now();
      const verifiedNow = awaitingSignupCode ? false : verifyAccountAtSignIn(matchedUser);
      loginRateLimitMap.delete(attemptKey);

      // The password proves they hold the credential; the code proves they can read the
      // mailbox. Both are required before this screen hands out a session.
      if (!awaitingSignupCode && (await emailSignInCode(matchedUser))) {
        saveDatabase(dbState);
        res.json({
          ok: true,
          twoFactor: true,
          email: matchedUser.email,
          minutesLeft: Math.round(SIGNIN_CODE_TTL_MS / 60000),
          message: `We emailed a 6-digit code to ${matchedUser.email}. Enter it to finish signing in.`
        });
        return;
      }

      const signedSession = issueDeviceSession(
        {
          id: matchedUser.id,
          name: matchedUser.name,
          email: matchedUser.email,
          role: matchedUser.role || "user"
        },
        req,
        "password"
      );
      res.json({
        ok: true,
        session: signedSession,
        verifiedNow,
        codeSkipped: true,
        message: awaitingSignupCode
          ? 'Signed in. Enter the code we already emailed in the "Confirm your email" bar to finish verifying.'
          : verifiedNow
          ? "Your account is verified — you are signed in."
          : ""
      });
      return;
    }

    const prevFailed = (rateRecord?.failedCount || 0) + 1;
    loginRateLimitMap.set(attemptKey, {
      failedCount: prevFailed,
      lockedUntil: prevFailed >= 5 ? Date.now() + 30 * 1000 : 0
    });

    const ipWindow =
      ipRecord && now - ipRecord.windowStartedAt < LOGIN_IP_WINDOW_MS
        ? { count: ipRecord.count + 1, windowStartedAt: ipRecord.windowStartedAt, lockedUntil: ipRecord.lockedUntil }
        : { count: 1, windowStartedAt: now, lockedUntil: 0 };
    // A source that fails this often is walking through a list of accounts, not mistyping.
    ipWindow.lockedUntil =
      ipWindow.count >= LOGIN_IP_MAX_FAILURES ? now + Math.min(60 * 60 * 1000, ipWindow.count * 60 * 1000) : 0;
    ipFailureRateLimitMap.set(clientIp, ipWindow);

    res.status(401).json({ ok: false, error: "Invalid username/email or password." });
  });

  // The second half of a password sign-in. There is no session yet, so the identifier comes
  // back with the code and the only thing that unlocks a session is the digits matching.
  app.post("/api/auth/two-factor/verify", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const identifier = String(req.body?.identifier || "").trim().toLowerCase() || "anonymous";
    const code = String(req.body?.code || "").replace(/\D/g, "");
    const clientIp = requestClientIp(req);
    const attemptKey = `${clientIp}|${identifier}`;
    const now = Date.now();

    const blocked = twoFactorRateLimitMap.get(attemptKey);
    if (blocked && blocked.lockedUntil > now) {
      res.status(429).json({
        ok: false,
        error: `Too many wrong codes from your network. Wait ${Math.ceil((blocked.lockedUntil - now) / 1000)}s or sign in again.`
      });
      return;
    }
    pruneRateMap(twoFactorRateLimitMap, 60 * 60 * 1000);

    const user = findAccountByIdentifier(identifier);
    if (!user || !pendingSignInCode(user)) {
      res.status(401).json({
        ok: false,
        expired: true,
        error: "That sign-in code is finished. Sign in with your password and we will send a fresh one."
      });
      return;
    }
    if (code.length !== 6) {
      res.status(401).json({ ok: false, error: "Enter the six digits we emailed you." });
      return;
    }

    user.signInCodeAttempts = Number(user.signInCodeAttempts || 0) + 1;
    const prevFailed = (blocked?.failedCount || 0) + 1;
    if (!signInCodeMatches(user, code)) {
      twoFactorRateLimitMap.set(attemptKey, {
        failedCount: prevFailed,
        lockedUntil: prevFailed >= 8 ? now + 5 * 60 * 1000 : 0
      });
      if (user.signInCodeAttempts >= SIGNIN_CODE_MAX_ATTEMPTS) {
        clearSignInCode(user);
        saveDatabase(dbState);
        res.status(429).json({
          ok: false,
          expired: true,
          error: "Too many wrong codes, so this one was thrown away. Sign in with your password for a new code."
        });
        return;
      }
      saveDatabase(dbState);
      res.status(401).json({
        ok: false,
        error: `That code does not match. ${SIGNIN_CODE_MAX_ATTEMPTS - user.signInCodeAttempts} tries left before it is discarded.`
      });
      return;
    }

    clearSignInCode(user);
    twoFactorRateLimitMap.delete(attemptKey);
    // Reading the mailbox is the proof that was missing, so the address counts as confirmed.
    const mailboxWasUnconfirmed = user.emailVerified === false || user.emailUnconfirmed === true;
    user.emailVerified = true;
    user.emailUnconfirmed = false;
    user.activityLog = [
      ...(user.activityLog || []).slice(-40),
      {
        id: "act-" + Date.now(),
        type: "Signed in",
        detail: mailboxWasUnconfirmed
          ? "Signed in with password and an emailed code — the address is now confirmed."
          : "Signed in with password and an emailed code.",
        timestamp: new Date().toISOString().slice(0, 16).replace("T", " ")
      }
    ];
    const session = issueDeviceSession(
      { id: user.id, name: user.name, email: user.email, role: user.role || "user" },
      req,
      "verification"
    );
    saveDatabase(dbState);
    res.json({ ok: true, session, message: "Welcome back — that code confirmed your email." });
  });

  app.post("/api/auth/two-factor/resend", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const identifier = String(req.body?.identifier || "").trim().toLowerCase() || "anonymous";
    const clientIp = requestClientIp(req);
    const resendKey = `${clientIp}|${identifier}`;
    const now = Date.now();
    pruneRateMap(codeRateLimitMap, 10 * 60 * 1000);
    const window = codeRateLimitMap.get(resendKey);
    if (!window || now - window.windowStartedAt >= 10 * 60 * 1000) {
      codeRateLimitMap.set(resendKey, { count: 1, windowStartedAt: now });
    } else if (window.count >= 3) {
      res.status(429).json({ ok: false, error: "Too many codes requested. Please wait a few minutes." });
      return;
    } else {
      window.count++;
    }

    const user = findAccountByIdentifier(identifier);
    // Same answer whether the sign-in is still open or long gone: this route is reachable
    // without a session, so it must not become a way to test which addresses exist.
    if (!user || !pendingSignInCode(user)) {
      res.json({
        ok: true,
        mailSent: false,
        message: "If that sign-in is still open, a fresh code is on its way. Otherwise sign in with your password again."
      });
      return;
    }
    const delivered = await emailSignInCode(user, true);
    saveDatabase(dbState);
    res.json({
      ok: true,
      mailSent: delivered,
      codeInvalidated: !delivered,
      message: delivered
        ? `A fresh 6-digit code is on its way to ${user.email}.`
        : "The email service refused the message, so that code was dropped. Sign in with your password again."
    });
  });

  // Sign in on a second screen: the desk asks for a code, prints it as a QR and polls,
  // and only a phone that is already signed in can turn that code into a session.
  const QR_LOGIN_TTL_MS = 2 * 60 * 1000;

  app.post("/api/qr-login/start", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const now = Date.now();
    const clientKey = requestClientIp(req);
    pruneRateMap(qrStartRateLimitMap, 15 * 60 * 1000);
    const rate = qrStartRateLimitMap.get(clientKey);
    if (!rate || now - rate.windowStartedAt >= 15 * 60 * 1000) {
      qrStartRateLimitMap.set(clientKey, { count: 1, windowStartedAt: now });
    } else if (rate.count >= 60) {
      res.status(429).json({ ok: false, error: "Too many sign-in codes requested from this network. Try again in a few minutes." });
      return;
    } else {
      rate.count++;
    }

    // Only the newest codes are worth keeping; a handout lives for two minutes.
    dbState.qrLoginRequests = dbState.qrLoginRequests.filter((request) => request.expiresAt > now).slice(-59);
    const qrRequest: QrLoginRequest = {
      id: crypto.randomBytes(16).toString("base64url"),
      label: String(req.body?.label || "").replace(/\s+/g, " ").trim().slice(0, 80),
      createdAt: new Date(now).toISOString(),
      expiresAt: now + QR_LOGIN_TTL_MS,
      status: "pending"
    };
    dbState.qrLoginRequests.push(qrRequest);
    saveDatabase(dbState);
    res.json({ ok: true, id: qrRequest.id, expiresAt: qrRequest.expiresAt });
  });

  // The code id is 128 random bits and is only ever rendered inside the QR on the screen
  // that asked for it, so possession of it is the proof — and it hands out one session.
  app.get("/api/qr-login/status", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const now = Date.now();
    const request = dbState.qrLoginRequests.find((entry) => entry.id === String(req.query?.id || ""));
    if (!request || request.status === "consumed") {
      res.json({ ok: true, status: "consumed" });
      return;
    }
    if (request.expiresAt <= now) {
      res.json({ ok: true, status: "expired" });
      return;
    }
    if (request.status === "pending") {
      res.json({ ok: true, status: "pending" });
      return;
    }
    const account = request.account;
    request.status = "consumed";
    saveDatabase(dbState);
    if (!account) {
      res.json({ ok: true, status: "consumed" });
      return;
    }
    // The desk named itself when it asked for the code, so that is the label the account
    // holder revokes later — not the phone that happened to tap confirm.
    res.json({
      ok: true,
      status: "approved",
      name: account.name,
      session: issueDeviceSession(account, req, "qr", request.label)
    });
  });

  // The phone reads the code before it approves it: the device label only, never the
  // handout, so opening the link can't steal the session meant for the other screen.
  app.get("/api/qr-login/preview", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in on this device first." });
      return;
    }
    const request = dbState.qrLoginRequests.find((entry) => entry.id === String(req.query?.id || ""));
    if (!request) {
      res.json({ ok: true, status: "consumed", expired: false, label: "" });
      return;
    }
    res.json({
      ok: true,
      status: request.status,
      expired: request.expiresAt <= Date.now(),
      label: request.label,
      expiresAt: request.expiresAt
    });
  });

  app.post("/api/qr-login/approve", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in on this phone first, then scan the code again." });
      return;
    }

    const request = dbState.qrLoginRequests.find((entry) => entry.id === String(req.body?.id || ""));
    if (!request) {
      res.status(404).json({ ok: false, error: "That sign-in code is gone. Ask the other screen to show a new one." });
      return;
    }
    if (request.status === "approved") {
      res.status(409).json({ ok: false, error: "That code is already waiting for the other screen to pick it up." });
      return;
    }
    if (request.status === "consumed") {
      res.status(409).json({ ok: false, error: "That code already signed a device in. Show a new one." });
      return;
    }
    if (request.expiresAt <= Date.now()) {
      res.status(410).json({ ok: false, error: "That sign-in code expired. Ask the other screen to show a new one." });
      return;
    }

    let account: QrLoginRequest["account"];
    if (session.id === "admin-owner") {
      account = { id: "admin-owner", email: ADMIN_EMAIL, name: "Habib Yesuf", role: "admin" };
    } else {
      const user = dbState.usersData.find((entry) => entry.id === session.id);
      if (!user) {
        res.status(403).json({ ok: false, error: "That account no longer exists, so it cannot sign another device in." });
        return;
      }
      if (!isEmailVerified(user)) {
        res.status(403).json({ ok: false, error: "Confirm this account with its 6-digit code before it signs another device in." });
        return;
      }
      account = { id: user.id, email: user.email, name: user.name, role: user.role || "user" };
    }

    request.status = "approved";
    request.account = account;
    saveDatabase(dbState);
    res.json({ ok: true, accountName: account.name, label: request.label });
  });

  // 3. Dedicated Course, Material & Side-Material REST Endpoints (Admin-protected)
  app.post("/api/courses/:courseId/materials/:materialId/side-materials", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "Only the support team can add or edit reference materials." });
      return;
    }

    const { courseId, materialId } = req.params;
    const { editId, name, type, size, url } = req.body || {};

    const course = dbState.coursesData.find((c) => c.id === courseId);
    if (!course) {
      res.status(404).json({ ok: false, error: "Course not found." });
      return;
    }
    const mat = (course.materials || []).find((m) => m.id === materialId);
    if (!mat) {
      res.status(404).json({ ok: false, error: "Course video material not found." });
      return;
    }
    if (!Array.isArray(mat.sideMaterials)) mat.sideMaterials = [];

    if (editId) {
      const idx = mat.sideMaterials.findIndex((sm) => sm.id === editId);
      if (idx === -1) {
        res.status(404).json({ ok: false, error: "Side material not found in this video context." });
        return;
      }
      mat.sideMaterials[idx] = {
        ...mat.sideMaterials[idx],
        name: String(name || mat.sideMaterials[idx].name),
        type: String(type || mat.sideMaterials[idx].type || "PDF"),
        size: String(size || mat.sideMaterials[idx].size || "1.4 MB"),
        url: String(url || mat.sideMaterials[idx].url || "#sample-file")
      };
    } else {
      mat.sideMaterials.push({
        id: "sidemat-" + Date.now() + "-" + crypto.randomInt(100, 999),
        name: String(name || "Companion_Notes.pdf"),
        type: String(type || "PDF"),
        size: String(size || "1.4 MB"),
        url: String(url || "#sample-file")
      });
    }

    saveDatabase(dbState);
    res.json({ ok: true, sideMaterials: mat.sideMaterials, course });
  });

  app.delete("/api/courses/:courseId/materials/:materialId/side-materials/:sideMatId", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "Only the support team can delete reference materials." });
      return;
    }

    const { courseId, materialId, sideMatId } = req.params;
    const course = dbState.coursesData.find((c) => c.id === courseId);
    if (!course) {
      res.status(404).json({ ok: false, error: "Course not found." });
      return;
    }
    const mat = (course.materials || []).find((m) => m.id === materialId);
    if (!mat || !Array.isArray(mat.sideMaterials)) {
      res.status(404).json({ ok: false, error: "Course video material not found." });
      return;
    }

    mat.sideMaterials = mat.sideMaterials.filter((sm) => sm.id !== sideMatId);
    saveDatabase(dbState);
    res.json({ ok: true, sideMaterials: mat.sideMaterials, course });
  });

  // 4. Logged-In Student 5-Star Material Rating Endpoint
  app.post("/api/courses/:courseId/materials/:materialId/rate", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Please sign in as a student to rate study materials." });
      return;
    }
    const { courseId, materialId } = req.params;
    const rawUserKey = session.id.toLowerCase();
    const numericStars = Math.max(1, Math.min(5, Math.round(Number(req.body?.stars) || 0)));

    const course = dbState.coursesData.find((c) => c.id === courseId);
    if (!course) {
      res.status(404).json({ ok: false, error: "Course not found." });
      return;
    }

    const mat = (course.materials || []).find((m) => m.id === materialId);
    if (!mat) {
      res.status(404).json({ ok: false, error: "Study material not found." });
      return;
    }

    if (!mat.ratingsByUser || typeof mat.ratingsByUser !== "object") {
      mat.ratingsByUser = {};
    }
    if (!dbState.userRatings || typeof dbState.userRatings !== "object") {
      dbState.userRatings = {};
    }

    const compositeKey = `${rawUserKey}::${materialId}`;
    const previousUserRating =
      typeof mat.ratingsByUser[rawUserKey] === "number"
        ? mat.ratingsByUser[rawUserKey]
        : typeof dbState.userRatings[compositeKey] === "number"
        ? dbState.userRatings[compositeKey]
        : 0;

    const currentAvg = typeof mat.ratingAvg === "number" && mat.ratingAvg > 0 ? mat.ratingAvg : 0;
    const currentCount = typeof mat.ratingCount === "number" && mat.ratingCount >= 0 ? mat.ratingCount : 0;

    if (previousUserRating > 0 && currentCount > 0) {
      const totalScore = Math.max(0, currentAvg * currentCount - previousUserRating + numericStars);
      mat.ratingAvg = Number((totalScore / currentCount).toFixed(2));
    } else {
      const newCount = currentCount + 1;
      const totalScore = currentAvg * currentCount + numericStars;
      mat.ratingCount = newCount;
      mat.ratingAvg = Number((totalScore / newCount).toFixed(2));
    }

    mat.ratingsByUser[rawUserKey] = numericStars;
    dbState.userRatings[compositeKey] = numericStars;

    saveDatabase(dbState);
    res.json({
      ok: true,
      ratingAvg: mat.ratingAvg,
      ratingCount: mat.ratingCount,
      myRating: numericStars
    });
  });

  // ============================================================================
  // STUDENT CONTRIBUTIONS → ADMIN REVIEW QUEUE → EARNED DOWNLOADS
  // ============================================================================

  function slugifyMaterialName(value: string): string {
    return String(value || "")
      .toLowerCase()
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .replace(/[^a-z0-9\u0800-\u08ff]+/g, " ")
      .trim();
  }

  function submissionFingerprint(courseId: string, year: string, semester: string, name: string): string {
    return sha256Hex([courseId, year, semester, slugifyMaterialName(name)].join("::"));
  }

  // A contribution only counts toward a credit if it is genuinely new: the same
  // student may not re-submit a document that is already queued or published, and
  // neither may two students queue the exact same file.
  function findSubmissionConflict(
    userId: string,
    courseId: string,
    year: string,
    semester: string,
    name: string
  ): { code: number; error: string; duplicateOf?: string } | null {
    const fingerprint = submissionFingerprint(courseId, year, semester, name);
    const clash = dbState.materialSubmissions.find((s) => s.fingerprint === fingerprint && s.status !== "rejected");
    if (clash) {
      return {
        code: 409,
        error:
          clash.userId === userId
            ? `You already sent “${clash.name}” for this course, year and semester — it is still ${clash.status === "pending" ? "awaiting review" : "published"}. Duplicate uploads do not earn download credits.`
            : `“${clash.name}” was already shared by another student and is ${clash.status === "pending" ? "in the review queue" : "in the library"}. Pick a different document.`,
        duplicateOf: clash.id
      };
    }

    const course = dbState.coursesData.find((c) => c.id === courseId);
    const slug = slugifyMaterialName(name);
    const inLibrary = course
      ? (course.materials || []).find((m) => slugifyMaterialName(m.name) === slug && (m.year || "") === year)
      : null;
    if (inLibrary) {
      return {
        code: 409,
        error: `“${inLibrary.name}” is already published in ${course?.name || "this course"}. Send a different document to earn a credit.`,
        duplicateOf: inLibrary.id
      };
    }
    return null;
  }

  function submissionCreditState(user: UserAccount) {
    const policy = downloadPolicy();
    return {
      sharedMaterialsCount: Number(user.sharedMaterialsCount) || 0,
      unpaidCurrentUploadProgress: Number(user.unpaidCurrentUploadProgress) || 0,
      downloadCredits: Number(user.downloadCredits) || 0,
      downloadsCount: Number(user.downloadsCount) || 0,
      uploadsPerCredit: policy.uploadsPerCredit,
      downloadMode: policy.mode,
      adSeconds: policy.adSeconds
    };
  }

  function findSubmissionUser(userId: string): UserAccount {
    return dbState.usersData.find((account) => account.id === userId) || ({ sharedMaterialsCount: 0 } as UserAccount);
  }

  app.post("/api/materials/submissions", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in with a student account to share a material." });
      return;
    }
    const user = dbState.usersData.find((account) => account.id === session.id);
    if (!user) {
      res.status(401).json({ ok: false, error: "Your account could not be found. Please sign in again." });
      return;
    }

    const body = req.body || {};
    const name = String(body.name || "").trim().slice(0, 180);
    const courseId = String(body.courseId || "").trim();
    const course = dbState.coursesData.find((c) => c.id === courseId);
    if (!course) {
      res.status(400).json({ ok: false, error: "Choose the course this document belongs to." });
      return;
    }
    if (!name) {
      res.status(400).json({ ok: false, error: "Give the document a title." });
      return;
    }

    const year = String(body.year || course.defaultYear || "Year 1").trim();
    const semester = String(body.semester || "First Semester").trim();

    const mine = dbState.materialSubmissions.filter((s) => s.userId === user.id);
    const conflict = findSubmissionConflict(user.id, courseId, year, semester, name);
    if (conflict) {
      dbState.materialSubmissions.push({
        id: "sub-blk-" + Date.now() + "-" + crypto.randomInt(100, 999),
        userId: user.id,
        userEmail: user.email,
        contributorName: String(body.contributorName || user.name || "Student"),
        courseId,
        courseName: course.name,
        name,
        type: String(body.type || "PDF"),
        size: String(body.size || "1.0 MB"),
        url: "",
        year,
        semester,
        subcategory: String(body.subcategory || "Lecture Notes"),
        department: String(body.department || user.department || course.name),
        fingerprint: submissionFingerprint(courseId, year, semester, name),
        status: "rejected",
        createdAt: new Date().toISOString(),
        decidedAt: new Date().toISOString(),
        decidedBy: "automatic-duplicate-guard",
        reason: conflict.error,
        duplicateOf: conflict.duplicateOf
      });
      saveDatabase(dbState);
      res.status(conflict.code).json({ ok: false, error: conflict.error, duplicateOf: conflict.duplicateOf });
      return;
    }

    const pending = mine.filter((s) => s.status === "pending");
    if (pending.length >= MAX_PENDING_PER_STUDENT) {
      res.status(429).json({
        ok: false,
        error: `You already have ${pending.length} documents waiting for review. Wait for the administrator to decide on them first.`
      });
      return;
    }
    const last = mine.map((s) => Date.parse(s.createdAt || "") || 0).sort((a, b) => b - a)[0];
    if (last && Date.now() - last < SUBMISSION_COOLDOWN_MS) {
      const wait = Math.ceil((SUBMISSION_COOLDOWN_MS - (Date.now() - last)) / 1000);
      res.status(429).json({ ok: false, error: `Please wait ${wait}s before sending another document.` });
      return;
    }

    const submission: MaterialSubmission = {
      id: "sub-" + Date.now() + "-" + crypto.randomInt(100, 999),
      userId: user.id,
      userEmail: user.email,
      contributorName: String(body.contributorName || user.name || "Student"),
      courseId,
      courseName: course.name,
      name,
      type: String(body.type || "PDF"),
      size: String(body.size || "1.0 MB"),
      url: String(body.url || "#sample-file"),
      year,
      semester,
      subcategory: String(body.subcategory || "Lecture Notes"),
      department: String(body.department || user.department || course.name),
      fingerprint: submissionFingerprint(courseId, year, semester, name),
      status: "pending",
      createdAt: new Date().toISOString()
    };
    dbState.materialSubmissions.push(submission);
    user.activityLog = [
      { id: "act-" + Date.now(), type: "Submitted Material", detail: `Sent “${name}” for admin review`, timestamp: new Date().toISOString() },
      ...(user.activityLog || [])
    ].slice(0, 60);
    saveDatabase(dbState);
    res.json({ ok: true, submission, notified: false, ...submissionCreditState(user) });
  });

  app.get("/api/materials/submissions/mine", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in to see your submissions." });
      return;
    }
    const user = dbState.usersData.find((account) => account.id === session.id);
    res.json({
      ok: true,
      submissions: dbState.materialSubmissions.filter((s) => s.userId === session.id).reverse(),
      ...(user ? submissionCreditState(user) : {})
    });
  });

  app.get("/api/admin/material-submissions", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "A support staff or administrator session is required." });
      return;
    }
    res.json({ ok: true, submissions: [...dbState.materialSubmissions].reverse() });
  });

  app.patch("/api/admin/material-submissions/:submissionId", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "A support staff or administrator session is required." });
      return;
    }
    const submission = dbState.materialSubmissions.find((s) => s.id === req.params.submissionId);
    if (!submission) {
      res.status(404).json({ ok: false, error: "Submission not found." });
      return;
    }
    const body = req.body || {};
    if (typeof body.name === "string" && body.name.trim()) submission.name = body.name.trim().slice(0, 180);
    if (typeof body.year === "string" && body.year.trim()) submission.year = body.year.trim();
    if (typeof body.semester === "string" && body.semester.trim()) submission.semester = body.semester.trim();
    if (typeof body.subcategory === "string" && body.subcategory.trim()) submission.subcategory = body.subcategory.trim();
    if (typeof body.type === "string" && body.type.trim()) submission.type = body.type.trim();
    if (typeof body.size === "string" && body.size.trim()) submission.size = body.size.trim();
    if (typeof body.url === "string" && body.url.trim()) submission.url = body.url.trim();
    if (typeof body.courseId === "string" && dbState.coursesData.some((c) => c.id === body.courseId)) {
      submission.courseId = body.courseId;
      submission.courseName = dbState.coursesData.find((c) => c.id === body.courseId)!.name;
    }
    submission.fingerprint = submissionFingerprint(submission.courseId, submission.year, submission.semester, submission.name);
    saveDatabase(dbState);
    res.json({ ok: true, submission });
  });

  app.post("/api/admin/material-submissions/:submissionId/approve", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "A support staff or administrator session is required." });
      return;
    }
    const submission = dbState.materialSubmissions.find((s) => s.id === req.params.submissionId);
    if (!submission) {
      res.status(404).json({ ok: false, error: "Submission not found." });
      return;
    }
    if (submission.status === "approved") {
      res.json({ ok: true, alreadyApproved: true, ...submissionCreditState(findSubmissionUser(submission.userId)) });
      return;
    }
    const course = dbState.coursesData.find((c) => c.id === submission.courseId);
    if (!course) {
      res.status(400).json({ ok: false, error: "The course this was submitted to no longer exists." });
      return;
    }

    const material: CourseMaterial = {
      id: "mat-" + Date.now() + "-" + crypto.randomInt(100, 999),
      name: submission.name,
      type: submission.type || "PDF",
      size: submission.size || "1.0 MB",
      url: submission.url || "#sample-file",
      year: submission.year,
      semester: submission.semester,
      department: submission.department,
      subcategory: submission.subcategory,
      sharedBy: submission.contributorName,
      hidden: false,
      ratingAvg: 0,
      ratingCount: 0,
      sideMaterials: []
    };
    course.materials = [...(course.materials || []), material];

    let credited = false;
    const user = dbState.usersData.find((account) => account.id === submission.userId);
    if (user) {
      const needed = downloadPolicy().uploadsPerCredit;
      user.sharedMaterialsCount = (Number(user.sharedMaterialsCount) || 0) + 1;
      user.unpaidCurrentUploadProgress = (Number(user.unpaidCurrentUploadProgress) || 0) + 1;
      if (user.unpaidCurrentUploadProgress >= needed) {
        user.unpaidCurrentUploadProgress -= needed;
        user.downloadCredits = (Number(user.downloadCredits) || 0) + 1;
        credited = true;
      }
      user.activityLog = [
        {
          id: "act-" + Date.now(),
          type: "Material Approved",
          detail: credited
            ? `“${submission.name}” published — you earned a download`
            : `“${submission.name}” published (${user.unpaidCurrentUploadProgress}/${needed} toward your next download)`,
          timestamp: new Date().toISOString()
        },
        ...(user.activityLog || [])
      ].slice(0, 60);
    }

    submission.status = "approved";
    submission.decidedAt = new Date().toISOString();
    submission.decidedBy = session.email;
    submission.materialId = material.id;
    submission.reason = "";
    saveDatabase(dbState);
    res.json({ ok: true, material, credited, ...submissionCreditState(user || ({} as UserAccount)) });
  });

  app.post("/api/admin/material-submissions/:submissionId/reject", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "A support staff or administrator session is required." });
      return;
    }
    const submission = dbState.materialSubmissions.find((s) => s.id === req.params.submissionId);
    if (!submission) {
      res.status(404).json({ ok: false, error: "Submission not found." });
      return;
    }
    submission.status = "rejected";
    submission.decidedAt = new Date().toISOString();
    submission.decidedBy = session.email;
    submission.reason = String(req.body?.reason || "The review team could not verify this document.").slice(0, 300);
    saveDatabase(dbState);
    res.json({ ok: true, submission });
  });

  // ============================================================================
  // SUPPORT TEAM: staff roles, complaints inbox, library writes
  // ============================================================================

  // The administrator hands out the support role; students cannot grant it to themselves,
  // and it is never granted to the owner account.
  app.post("/api/admin/users/:userId/role", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const userId = String(req.params.userId || "");
    const target = dbState.usersData.find((user) => user.id === userId);
    if (!target) {
      res.status(404).json({ ok: false, error: "That account is not in the library any more." });
      return;
    }
    if (target.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      res.status(400).json({ ok: false, error: "The owner account always keeps administrator access." });
      return;
    }
    const role = String(req.body?.role || "").trim();
    if (!["user", "support"].includes(role)) {
      res.status(400).json({ ok: false, error: "Choose either a student or a support staff account." });
      return;
    }
    target.role = role;
    target.activityLog = [
      {
        id: "act-" + Date.now(),
        type: role === "support" ? "Became Support Staff" : "Left Support Team",
        detail: role === "support" ? "The administrator added you to the support team." : "The administrator moved you back to a student account.",
        timestamp: new Date().toISOString().slice(0, 16).replace("T", " ")
      },
      ...(target.activityLog || [])
    ].slice(0, 60);
    saveDatabase(dbState);
    res.json({ ok: true, user: safeUserAccount(target) });
  });

  // The administrator's direct hand on a student's download balance: hand out access
  // for a contribution that arrived late, or take it back.
  app.post("/api/admin/users/:userId/credits", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const target = dbState.usersData.find((user) => user.id === String(req.params.userId || ""));
    if (!target) {
      res.status(404).json({ ok: false, error: "That account is not in the library any more." });
      return;
    }
    const delta = Math.round(Number(req.body?.delta));
    if (!Number.isFinite(delta) || delta === 0) {
      res.status(400).json({ ok: false, error: "Say how many downloads to add or remove." });
      return;
    }
    const before = Number(target.downloadCredits) || 0;
    target.downloadCredits = Math.max(0, Math.min(999, before + delta));
    const given = target.downloadCredits - before;
    if (given !== 0) {
      target.activityLog = [
        {
          id: "act-" + Date.now(),
          type: "Download Credit",
          detail: given > 0
            ? `The administrator gave you ${given} download${given === 1 ? "" : "s"}.`
            : `The administrator removed ${Math.abs(given)} download${Math.abs(given) === 1 ? "" : "s"} from your account.`,
          timestamp: new Date().toISOString().slice(0, 16).replace("T", " ")
        },
        ...(target.activityLog || [])
      ].slice(0, 60);
    }
    saveDatabase(dbState);
    res.json({ ok: true, given, user: safeUserAccount(target), ...submissionCreditState(target) });
  });

  app.post("/api/support/tickets", (req, res) => {
    const session = verifyRequestSession(req);
    const user = session ? dbState.usersData.find((account) => account.id === session.id) : null;
    if (!session || !user) {
      res.status(401).json({ ok: false, error: "Sign in so the support team can reply to you." });
      return;
    }
    const message = String(req.body?.message || "").trim().slice(0, 2000);
    if (message.length < 10) {
      res.status(400).json({ ok: false, error: "Tell the support team a little more (at least 10 characters)." });
      return;
    }
    const rawCategory = String(req.body?.category || "Something else").trim();
    const category = SUPPORT_CATEGORIES.includes(rawCategory) ? rawCategory : "Something else";
    const open = dbState.supportTickets.filter((t) => t.userId === user.id && t.status !== "closed");
    if (open.length >= 5) {
      res.status(429).json({ ok: false, error: "You already have 5 complaints open. The support team is working on them." });
      return;
    }
    const now = new Date().toISOString();
    const ticket: SupportTicket = {
      id: "trk-" + Date.now() + "-" + crypto.randomInt(100, 999),
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      category,
      courseId: String(req.body?.courseId || "").trim() || undefined,
      message,
      status: "open",
      createdAt: now,
      updatedAt: now,
      replies: []
    };
    dbState.supportTickets.push(ticket);
    user.activityLog = [
      { id: "act-" + Date.now(), type: "Complaint Sent", detail: `${category} — sent to the support team`, timestamp: now.slice(0, 16).replace("T", " ") },
      ...(user.activityLog || [])
    ].slice(0, 60);
    saveDatabase(dbState);
    res.json({ ok: true, ticket });
  });

  app.get("/api/support/tickets/mine", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in to see your complaints." });
      return;
    }
    res.json({
      ok: true,
      tickets: [...dbState.supportTickets].filter((t) => t.userId === session.id).reverse()
    });
  });

  app.get("/api/support/tickets", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "A support staff or administrator session is required." });
      return;
    }
    res.json({ ok: true, tickets: [...dbState.supportTickets].reverse() });
  });

  // Both sides post in the same thread: staff answers, the student can add detail.
  app.post("/api/support/tickets/:ticketId/reply", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in to reply." });
      return;
    }
    const ticket = dbState.supportTickets.find((t) => t.id === req.params.ticketId);
    if (!ticket) {
      res.status(404).json({ ok: false, error: "That complaint is no longer in the inbox." });
      return;
    }
    const isOwner = ticket.userId === session.id;
    if (!isOwner && !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "Only the support team or the student who filed this can reply." });
      return;
    }
    if (ticket.status === "closed") {
      res.status(409).json({ ok: false, error: "This complaint is closed. Send a new one if the problem came back." });
      return;
    }
    const text = String(req.body?.text || "").trim().slice(0, 2000);
    if (!text) {
      res.status(400).json({ ok: false, error: "Write a message before sending it." });
      return;
    }
    const staff = isStaffSession(session) && !isOwner;
    ticket.replies = [
      ...(ticket.replies || []),
      {
        id: "rpy-" + Date.now() + "-" + crypto.randomInt(100, 999),
        text,
        authorName: staff ? "Support team" : "You",
        by: staff ? "staff" : "student",
        createdAt: new Date().toISOString()
      }
    ];
    ticket.status = staff ? "answered" : "open";
    ticket.updatedAt = new Date().toISOString();
    saveDatabase(dbState);
    res.json({ ok: true, ticket });
  });

  app.post("/api/support/tickets/:ticketId/close", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in to close a complaint." });
      return;
    }
    const ticket = dbState.supportTickets.find((t) => t.id === req.params.ticketId);
    if (!ticket) {
      res.status(404).json({ ok: false, error: "That complaint is no longer in the inbox." });
      return;
    }
    if (ticket.userId !== session.id && !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "Only the support team or the student who filed this can close it." });
      return;
    }
    ticket.status = "closed";
    ticket.updatedAt = new Date().toISOString();
    saveDatabase(dbState);
    res.json({ ok: true, ticket });
  });

  // A premium order is a support ticket carrying the plan, so the team reads it in the
  // same inbox while the administrator gets a dedicated orders queue.
  app.post("/api/premium/requests", (req, res) => {
    const session = verifyRequestSession(req);
    const user = session ? dbState.usersData.find((account) => account.id === session.id) : null;
    if (!session || !user) {
      res.status(401).json({ ok: false, error: "Sign in so the team knows which account to switch." });
      return;
    }
    const planKey = String(req.body?.plan || "").trim();
    const plan = PREMIUM_PLANS[planKey];
    if (!plan) {
      res.status(400).json({ ok: false, error: "Choose one of the plans first." });
      return;
    }
    const reference = String(req.body?.reference || "").trim().slice(0, 80);
    const now = new Date().toISOString();
    const existing = dbState.supportTickets.find(
      (t) => t.userId === user.id && t.premiumPlan === planKey && !t.premiumConfirmedAt && t.status !== "closed"
    );
    if (existing) {
      if (reference) existing.premiumReference = reference;
      existing.updatedAt = now;
      saveDatabase(dbState);
      res.json({ ok: true, ticket: existing, alreadySent: true });
      return;
    }
    const open = dbState.supportTickets.filter((t) => t.userId === user.id && t.status !== "closed");
    if (open.length >= 5) {
      res.status(429).json({ ok: false, error: "You already have 5 open threads. The team is working through them." });
      return;
    }
    const ticket: SupportTicket = {
      id: "trk-" + Date.now() + "-" + crypto.randomInt(100, 999),
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      category: "Account or payment",
      message: `Plan request: ${plan.title} (${plan.price}). Account: ${user.email}.${reference ? ` Payment reference: ${reference}.` : ""}`,
      status: "open",
      createdAt: now,
      updatedAt: now,
      replies: [],
      premiumPlan: planKey,
      premiumPrice: plan.price,
      premiumReference: reference || undefined
    };
    dbState.supportTickets.push(ticket);
    user.activityLog = [
      { id: "act-" + Date.now(), type: "Premium Requested", detail: `${plan.title} — ${plan.price}`, timestamp: now.slice(0, 16).replace("T", " ") },
      ...(user.activityLog || [])
    ].slice(0, 60);
    saveDatabase(dbState);
    res.json({ ok: true, ticket });
  });

  // The administrator confirms the money arrived and the plan switches in one step.
  app.post("/api/premium/requests/:ticketId/approve", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const ticket = dbState.supportTickets.find((t) => t.id === req.params.ticketId);
    if (!ticket || !ticket.premiumPlan) {
      res.status(404).json({ ok: false, error: "That premium order is no longer in the queue." });
      return;
    }
    const plan = PREMIUM_PLANS[ticket.premiumPlan];
    const user = dbState.usersData.find((account) => account.id === ticket.userId);
    if (!plan || !user) {
      res.status(404).json({ ok: false, error: "That student account is no longer in the library." });
      return;
    }
    const now = new Date().toISOString();
    user.accountPlan = ticket.premiumPlan;
    user.paymentStatus = "paid";
    user.downloadOnlyAccount = false;
    user.category = plan.category;
    if (plan.days) user.subscriptionExpiry = new Date(Date.now() + plan.days * 86400000).toISOString();
    user.activityLog = [
      { id: "act-" + Date.now(), type: "Premium Activated", detail: `${plan.title} — ${plan.price} confirmed`, timestamp: now.slice(0, 16).replace("T", " ") },
      ...(user.activityLog || [])
    ].slice(0, 60);
    ticket.premiumConfirmedAt = now;
    ticket.status = "answered";
    ticket.updatedAt = now;
    ticket.replies = [
      ...(ticket.replies || []),
      {
        id: "rpy-" + Date.now() + "-" + crypto.randomInt(100, 999),
        text: `Payment confirmed — ${plan.title} is active on your account.`,
        authorName: "Support team",
        by: "staff",
        createdAt: now
      }
    ];
    saveDatabase(dbState);
    res.json({ ok: true, ticket, user: safeUserAccount(user) });
  });

  // Staff cannot use the administrator's wholesale state save, so the library writes
  // they need go through their own endpoints.
  app.post("/api/courses/:courseId/materials", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "A support staff or administrator session is required." });
      return;
    }
    const course = dbState.coursesData.find((c) => c.id === req.params.courseId);
    if (!course) {
      res.status(404).json({ ok: false, error: "Choose the course this material belongs to." });
      return;
    }
    const name = String(req.body?.name || "").trim().slice(0, 180);
    if (!name) {
      res.status(400).json({ ok: false, error: "Give the document a title." });
      return;
    }
    const semesters = Array.isArray(course.semesters) && course.semesters.length ? course.semesters : [];
    const semesterEntry = semesters.find((label) => label === req.body?.semesterLabel) || semesters[0] || "";
    const match = /^Year (\d+) · (.+)$/.exec(String(semesterEntry));
    const material: CourseMaterial = {
      id: "mat-" + Date.now() + "-" + crypto.randomInt(100, 999),
      name,
      type: String(req.body?.type || "PDF").slice(0, 12),
      size: String(req.body?.size || "1.0 MB").slice(0, 16),
      url: String(req.body?.url || "#sample-file").slice(0, 500),
      year: String(req.body?.year || course.defaultYear || "Year 1").slice(0, 24),
      semester: match ? match[2] : String(req.body?.semester || "First Semester").slice(0, 40),
      department: String(req.body?.department || course.name || "").slice(0, 120),
      subcategory: String(req.body?.subcategory || "Lecture Notes").slice(0, 60),
      sharedBy: session.role === "support" ? "Support team" : "Administrator",
      hidden: Boolean(req.body?.hidden),
      ratingAvg: 0,
      ratingCount: 0,
      sideMaterials: []
    };
    course.materials = [...(course.materials || []), material];
    saveDatabase(dbState);
    res.json({ ok: true, material, course });
  });

  // A college exists in this library as soon as a program is filed under it, so the
  // support team creates both in one step instead of needing a separate college table.
  app.post("/api/staff/courses", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "A support staff or administrator session is required." });
      return;
    }
    const name = String(req.body?.name || "").trim().slice(0, 120);
    const college = String(req.body?.college || "").trim().slice(0, 120);
    if (!name) {
      res.status(400).json({ ok: false, error: "Give the program a name." });
      return;
    }
    if (!college) {
      res.status(400).json({ ok: false, error: "Name the college this program belongs to." });
      return;
    }
    const duplicate = dbState.coursesData.find(
      (course) =>
        String(course.name).toLowerCase() === name.toLowerCase() &&
        String(course.college || "").toLowerCase() === college.toLowerCase()
    );
    if (duplicate) {
      res.status(409).json({ ok: false, error: `“${name}” is already listed under ${college}.`, course: duplicate });
      return;
    }
    const collegeExisted = dbState.coursesData.some(
      (course) => String(course.college || "").toLowerCase() === college.toLowerCase()
    );
    const durationYears = Math.max(1, Math.min(7, Number(req.body?.durationYears) || 4));
    const years = Array.from({ length: durationYears }, (_, index) => `Year ${index + 1}`);
    const course: Course = {
      id: "course-" + Date.now() + "-" + crypto.randomInt(1000, 9999),
      name,
      description:
        String(req.body?.description || "").trim().slice(0, 400) ||
        `${name} study materials for Wollo University students.`,
      college,
      icon: String(req.body?.icon || "").trim().slice(0, 6).toUpperCase() || name.slice(0, 4).toUpperCase(),
      color: /^#[a-f\d]{6}$/i.test(String(req.body?.color || "")) ? String(req.body.color) : "#1d624f",
      restricted: Boolean(req.body?.restricted),
      allowStudentSideMaterials: true,
      durationYears,
      years,
      semesters: buildProgramSemesterLabels(durationYears),
      defaultYear: years[0],
      subcategories: [...DEFAULT_SUBCATEGORIES],
      materials: []
    };
    dbState.coursesData.push(course);
    saveDatabase(dbState);
    res.json({ ok: true, course, collegeExisted });
  });

  // Importing a library export must not wipe what is live: courses are matched by id or
  // by name and college, and a file is only added when nothing with that title is there.
  app.post("/api/staff/library/import", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "A support staff or administrator session is required." });
      return;
    }
    const body = req.body || {};
    const source = body.state && typeof body.state === "object" ? body.state : body;
    const incomingCourses: Partial<Course>[] = Array.isArray(source.coursesData) ? source.coursesData : [];
    if (!incomingCourses.length) {
      res.status(400).json({ ok: false, error: "That file has no courses in it." });
      return;
    }
    let addedCourses = 0;
    let addedMaterials = 0;
    let matchedCourses = 0;
    let skippedMaterials = 0;
    for (const incoming of incomingCourses.slice(0, 600)) {
      const name = String(incoming.name || "").trim().slice(0, 120);
      if (!name) continue;
      const college = String(incoming.college || "").trim().slice(0, 120);
      const incomingMaterials = Array.isArray(incoming.materials) ? incoming.materials.slice(0, 300) : [];
      let target = dbState.coursesData.find(
        (course) =>
          (incoming.id && course.id === incoming.id) ||
          (String(course.name).toLowerCase() === name.toLowerCase() &&
            String(course.college || "").toLowerCase() === college.toLowerCase())
      );
      if (!target) {
        const declaredYears = Array.isArray(incoming.years) ? incoming.years.filter(Boolean).map(String) : [];
        const durationYears = Math.max(
          1,
          Math.min(7, Number(incoming.durationYears) || declaredYears.length || 4)
        );
        const years = declaredYears.length
          ? declaredYears
          : Array.from({ length: durationYears }, (_, index) => `Year ${index + 1}`);
        target = {
          id: "course-" + Date.now() + "-" + crypto.randomInt(1000, 9999),
          name,
          description:
            String(incoming.description || "").trim().slice(0, 400) ||
            `${name} study materials for Wollo University students.`,
          college: college || "Common Courses",
          icon: String(incoming.icon || "").trim().slice(0, 6).toUpperCase() || name.slice(0, 4).toUpperCase(),
          color: /^#[a-f\d]{6}$/i.test(String(incoming.color || "")) ? String(incoming.color) : "#1d624f",
          restricted: Boolean(incoming.restricted),
          allowStudentSideMaterials: Boolean(incoming.allowStudentSideMaterials),
          durationYears: years.length,
          years,
          semesters:
            Array.isArray(incoming.semesters) && incoming.semesters.length
              ? incoming.semesters.map(String).slice(0, 20)
              : buildProgramSemesterLabels(years.length),
          defaultYear: years.includes(String(incoming.defaultYear || "")) ? String(incoming.defaultYear) : years[0],
          subcategories:
            Array.isArray(incoming.subcategories) && incoming.subcategories.length
              ? incoming.subcategories.map(String).slice(0, 12)
              : [...DEFAULT_SUBCATEGORIES],
          materials: []
        };
        dbState.coursesData.push(target);
        addedCourses += 1;
      } else {
        matchedCourses += 1;
      }
      for (const mat of incomingMaterials) {
        const title = String(mat.name || "").trim().slice(0, 180);
        if (!title) continue;
        if ((target.materials || []).some((existing) => String(existing.name).toLowerCase() === title.toLowerCase())) {
          skippedMaterials += 1;
          continue;
        }
        target.materials.push({
          id: "mat-" + Date.now() + "-" + crypto.randomInt(10000, 99999),
          name: title,
          type: String(mat.type || "PDF").slice(0, 12),
          size: String(mat.size || "1.0 MB").slice(0, 24),
          url: String(mat.url || "#sample-file").slice(0, 500),
          year: String(mat.year || target.defaultYear || "Year 1").slice(0, 24),
          semester: String(mat.semester || (target.semesters || [])[0] || "First Semester").slice(0, 40),
          department: String(mat.department || target.name || "").slice(0, 120),
          subcategory: String(mat.subcategory || "Lecture Notes").slice(0, 60),
          sharedBy: String(mat.sharedBy || (session.role === "support" ? "Support team" : "Administrator")).slice(0, 60),
          hidden: Boolean(mat.hidden),
          free: Boolean(mat.free),
          ratingAvg: 0,
          ratingCount: 0,
          sideMaterials: []
        });
        addedMaterials += 1;
      }
    }
    saveDatabase(dbState);
    res.json({ ok: true, addedCourses, addedMaterials, matchedCourses, skippedMaterials });
  });

  // Freshman courses arrive empty, so the support team publishes the starter pack for
  // every Year 1 course. Always previewed first: nothing is written until dryRun is false.
  app.post("/api/support/freshman/seed", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || !isStaffSession(session)) {
      res.status(403).json({ ok: false, error: "A support staff or administrator session is required." });
      return;
    }
    const dryRun = req.body?.dryRun !== false;
    const targets = dbState.coursesData.filter((course) => course.college === "Common Freshman Courses");
    type Planned = { course: Course; name: string; year: string; semester: string; department: string; pack: (typeof FRESHMAN_SEED_PACK)[number] };
    const planned: Planned[] = [];
    for (const course of targets) {
      const label = (course.semesters || [])[0] || "Year 1 · Semester I";
      const match = /^Year (\d+) · (.+)$/.exec(label);
      const year = match ? `Year ${match[1]}` : course.defaultYear || "Year 1";
      const semester = match ? match[2] : "First Semester";
      const shortName = String(course.name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
      const department = freshmanStreamForSemester(semester);
      for (const pack of FRESHMAN_SEED_PACK) {
        const name = `${shortName} — ${pack.suffix}`;
        if ((course.materials || []).some((m) => m.name === name)) continue;
        planned.push({ course, name, year, semester, department, pack });
      }
    }
    if (dryRun) {
      // One row per course so staff can see both semester streams in the preview
      // instead of a file-level slice that only shows whichever course came first.
      const byCourse = new Map();
      for (const p of planned) {
        const row = byCourse.get(p.course.id) || { course: p.course.name, semester: p.semester, department: p.department, count: 0 };
        row.count += 1;
        byCourse.set(p.course.id, row);
      }
      res.json({
        ok: true,
        dryRun: true,
        courses: targets.length,
        wouldAdd: planned.length,
        sample: [...byCourse.values()]
      });
      return;
    }
    let added = 0;
    for (const item of planned) {
      item.course.materials = [
        ...(item.course.materials || []),
        {
          id: "mat-" + Date.now() + "-" + crypto.randomInt(10000, 99999),
          name: item.name,
          type: item.pack.type,
          size: item.pack.size,
          url: "#sample-file",
          year: item.year,
          semester: item.semester,
          department: item.department,
          subcategory: item.pack.subcategory,
          sharedBy: session.role === "support" ? "Support team" : "Administrator",
          hidden: false,
          ratingAvg: 0,
          ratingCount: 0,
          sideMaterials: []
        } as CourseMaterial
      ];
      added += 1;
    }
    saveDatabase(dbState);
    res.json({ ok: true, dryRun: false, courses: targets.length, added });
  });

  // Resume markers for lecture videos, stored on the account so they follow the
  // student to any other device signing in.
  app.post("/api/progress/video", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in to save your watching progress." });
      return;
    }
    const user = dbState.usersData.find((account) => account.id === session.id);
    const courseId = String(req.body?.courseId || "");
    const materialId = String(req.body?.materialId || "");
    if (!user) {
      res.status(401).json({ ok: false, error: "Your account could not be found." });
      return;
    }
    if (!courseId || !materialId) {
      res.status(400).json({ ok: false, error: "A course and material id are required." });
      return;
    }
    const duration = Math.max(0, Math.round(Number(req.body?.duration) || 0));
    const seconds = Math.max(0, Math.round(Number(req.body?.seconds) || 0));
    const percent = duration > 0
      ? Math.min(100, Math.round((seconds / duration) * 100))
      : Math.max(0, Math.min(100, Math.round(Number(req.body?.percent) || 0)));
    user.videoProgress = {
      ...(user.videoProgress || {}),
      [`${courseId}::${materialId}`]: { seconds, duration, percent, completed: percent >= 90, updatedAt: new Date().toISOString() }
    };
    saveDatabase(dbState);
    res.json({ ok: true, progress: user.videoProgress[`${courseId}::${materialId}`] });
  });

  // The download decision lives here rather than in the browser, so what the
  // administrator set on the Downloads page is what actually happens. A credit is
  // spent at the moment access is granted, so a refresh cannot hand it out twice.
  app.post("/api/downloads/authorize", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, allowed: false, reason: "register", error: "Sign in to download this material." });
      return;
    }
    const user = dbState.usersData.find((account) => account.id === session.id);
    if (!user) {
      res.status(401).json({ ok: false, allowed: false, reason: "register", error: "Your account could not be found." });
      return;
    }
    const course = dbState.coursesData.find((candidate) => candidate.id === String(req.body?.courseId || ""));
    const material = course ? (course.materials || []).find((m) => m.id === String(req.body?.materialId || "")) : null;
    const policy = downloadPolicy();
    const plan = String(user.accountPlan || "unpaid");
    const premium = planIsLive(user);

    let allowed = premium;
    let reason = "";
    if (!allowed) {
      // A file the administrator marked free is open to every account, in any mode.
      if (material && material.free === true) allowed = true;
      // Support staff have to open files to review them.
      else if (isStaffSession(session)) allowed = true;
      else if (plan === "free_unlimited" || policy.mode === "free") allowed = true;
      else if (policy.mode === "credits" && (Number(user.downloadCredits) || 0) > 0) allowed = true;
      else if (policy.mode === "premium") reason = "The administrator has the library open to Premium accounts only.";
      else reason = "You have no downloads left — share a material or pick a plan.";
    }
    if (!allowed) {
      // A refusal is a refusal, not a successful answer: the status keeps a client that
      // reached this endpoint through any other path from treating it as a pass.
      res.status(403).json({ ok: false, allowed: false, reason, ...submissionCreditState(user) });
      return;
    }

    // A material the administrator flagged free, or one that left the catalog mid-read,
    // costs nothing; staff never pay for a file they published.
    const costsACredit = material ? material.free !== true : false;
    const spend =
      !premium && !isStaffSession(session) && plan !== "free_unlimited" && policy.mode === "credits" && costsACredit;
    if (spend) user.downloadCredits = Math.max(0, (Number(user.downloadCredits) || 0) - 1);
    user.downloadsCount = (Number(user.downloadsCount) || 0) + 1;
    saveDatabase(dbState);
    res.json({ ok: true, allowed: true, spent: spend, ...submissionCreditState(user) });
  });

  // ============================================================================
  // STATE BACKEND
  // ============================================================================

  return app;
}
