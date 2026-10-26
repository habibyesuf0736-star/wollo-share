import "dotenv/config";
import { encryptVaultSecret, hashPassword } from "./auth-crypto.ts";
import { configureMail, mailStatus, sendMail, activeMailProvider, effectiveMailConfig, normalizeMailSecret, type MailConfig } from "./mail.ts";
import { recoveryCodeEmail, recoveryRequestNoticeEmail, testEmailMessage } from "./emailTemplates.ts";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { remoteEnabled, loadRemoteState, queueRemoteSave } from "./stateStore.ts";

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

function createSignedSessionToken(session: { id: string; name: string; email: string; role: string }) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + 24 * 60 * 60 * 1000;
  const payloadStr = `${session.id}|${session.email}|${session.role}|${issuedAt}|${expiresAt}`;
  const payloadHex = utf8ToHex(payloadStr);
  const sig = crypto.createHmac("sha256", SESSION_HMAC_SECRET).update(payloadHex).digest("hex").slice(0, 32);
  return {
    ...session,
    issuedAt,
    expiresAt,
    authToken: `wstok.${payloadHex}.${sig}`
  };
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

  const [id, email, role, issuedAtValue, expiresAtValue] = Buffer.from(payloadHex, "hex").toString("utf8").split("|");
  const issuedAt = Number(issuedAtValue);
  const expiresAt = Number(expiresAtValue);
  if (!id || !email || !role || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
  if (issuedAt > Date.now() + 60_000 || expiresAt <= Date.now() || expiresAt - issuedAt > 24 * 60 * 60 * 1000) return null;

  if (id === "admin-owner") {
    return email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && role === "admin"
      ? { id, email, role }
      : null;
  }
  const user = dbState.usersData.find((account) => account.id === id && account.email.toLowerCase() === email.toLowerCase());
  if (!user || role !== (user.role || "user")) return null;
  return { id, email, role };
}

function safeUserAccount(user: UserAccount) {
  const {
    password: _password,
    passwordHash: _passwordHash,
    passwordVault: _passwordVault,
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

function verifyAdminAccountPassword(candidatePassword: string, customAdminHash: string): boolean {
  if (!candidatePassword) return false;
  if (customAdminHash) return verifyPasswordHash(candidatePassword, customAdminHash, "admin-owner");
  if (verifyPasswordHash(candidatePassword, ADMIN_PASSWORD_HASH, "admin-owner")) return true;
  if (verifyPasswordHash(candidatePassword, SECONDARY_ADMIN_PASSWORD_HASH, "admin-owner")) return true;
  return false;
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
  footerText: "Wollo Share · University Course Materials Library"
};

const DEFAULT_APPEARANCE = {
  layout: "grid",
  primaryColor: "#1d624f",
  fontSize: "16px",
  fontStyle: "sans",
  logoUrl: ""
};

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
}

interface DatabaseSchema {
  coursesData: Course[];
  usersData: UserAccount[];
  pageTexts: Record<string, string>;
  appearanceSettings: Record<string, string>;
  userRatings: Record<string, number>;
  customAdminPassword: string;
  passwordRecoveryRequests: PasswordRecoveryRequest[];
  materialSubmissions: MaterialSubmission[];
  mailSettings?: MailSettings;
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
}

// A student contribution waiting in the admin review queue. Approving two of them
// earns the contributor one premium download (see UPLOADS_PER_CREDIT).
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

const UPLOADS_PER_CREDIT = 2;
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
    materialSubmissions: [],
    mailSettings: {}
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

  const usersData: UserAccount[] = Array.isArray(raw.usersData) && raw.usersData.length > 0
    ? raw.usersData
    : defaults.usersData;

  DEFAULT_USERS.forEach((defU) => {
    if (!usersData.some((u) => u.email.toLowerCase() === defU.email.toLowerCase())) {
      usersData.push(JSON.parse(JSON.stringify(defU)));
    }
  });

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
    // Expire premium_annual subscriptions server-side too
    if (u.accountPlan === "premium_annual") {
      const expiry = u.subscriptionExpiry ? new Date(u.subscriptionExpiry) : null;
      if (!expiry || expiry <= new Date()) {
        u.accountPlan = "unpaid";
        u.paymentStatus = "unpaid";
        u.category = "Unpaid · Subscription Expired";
      }
    }
    u.paymentStatus = u.accountPlan === "unpaid" ? "unpaid" : "paid";
    u.downloadOnlyAccount = u.accountPlan === "paid_download_only";
    u.amountPaidBirr = planPriceBirr(u.accountPlan);
    if (u.category === "Paid 100 Birr · Lifetime VIP") u.category = "Paid 500 Birr · Lifetime VIP";
    else if (u.category === "Paid 100 Birr · Download-Only") u.category = "Paid 500 Birr · Download-Only";
    if (!u.category) {
      u.category =
        u.accountPlan === "paid_download_only"
          ? "Paid 500 Birr · Download-Only"
          : u.accountPlan === "paid_lifetime"
          ? "Paid 500 Birr · Lifetime VIP"
          : u.accountPlan === "premium_annual"
          ? "Premium Annual · 250 Birr · 1 Year"
          : u.accountPlan === "premium_monthly"
          ? "Premium Monthly · 100 Birr"
          : "Unpaid · Pending 2 Uploads";
    }
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
  const customAdminPassword = rawCustomAdminPw
    ? hashPassword(rawCustomAdminPw, "admin-owner")
    : "";

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
    materialSubmissions: Array.isArray(raw.materialSubmissions)
      ? raw.materialSubmissions.filter((s): s is MaterialSubmission =>
          Boolean(s && typeof s.id === "string" && typeof s.courseId === "string" && typeof s.name === "string")
        )
      : [],
    mailSettings: normalizeMailSettings(raw.mailSettings),
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

function loadDatabase(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      const parsed = JSON.parse(content);
      const normalized = normalizeDatabase(parsed);
      saveDatabase(normalized);
      return normalized;
    }
  } catch (err) {
    console.error("Failed to read database file, initializing default state:", err);
  }
  const initial = buildDefaultDatabase();
  saveDatabase(initial);
  return initial;
}

function saveDatabase(db: DatabaseSchema): void {
  try {
    db.usersData.forEach((u) => secureUserAccount(u));
    if (db.customAdminPassword) {
      db.customAdminPassword = hashPassword(db.customAdminPassword, "admin-owner");
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
async function hydrateState(): Promise<void> {
  if (!remoteEnabled()) return;
  try {
    const doc = await loadRemoteState();
    if (doc) {
      dbState = normalizeDatabase(doc as Record<string, unknown>);
      console.log("state loaded from Supabase");
    } else {
      saveDatabase(dbState);
      console.log("Supabase state table was empty, seeded it from the local snapshot");
    }
  } catch (err) {
    console.error("Failed to load state from Supabase:", (err as Error).message);
  }
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

// Brute-force login attempt rate-limiter
const loginRateLimitMap = new Map<string, { failedCount: number; lockedUntil: number }>();
const recoveryRequestRateLimitMap = new Map<string, { count: number; windowStartedAt: number }>();

const RECOVERY_CODE_TTL_MS = 30 * 60 * 1000;

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
  const code = String(crypto.randomInt(10_000_000, 100_000_000));
  request.status = "code-issued";
  request.codeHash = hashPassword(code, `password-recovery:${request.id}`);
  request.codeExpiresAt = new Date(Date.now() + RECOVERY_CODE_TTL_MS).toISOString();
  request.failedAttempts = 0;
  const delivery = await sendMail(buildRecoveryCodeMessage(code, request));
  if (delivery.ok) {
    request.codeSentAt = new Date().toISOString();
  } else {
    // The code only exists in the recipient's inbox. If the mail did not leave,
    // drop it rather than leaving a live code nobody can receive or see.
    request.status = "pending";
    delete request.codeHash;
    delete request.codeExpiresAt;
    delete request.codeSentAt;
    console.error("Recovery code email failed:", delivery.error);
  }
  saveDatabase(dbState);
  return { ok: delivery.ok, provider: delivery.provider, error: delivery.error };
}

export async function createApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));

  // Security HTTP headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // ============================================================================
  // FULL-STACK REST API ROUTES (/api/*)
  // ============================================================================

  // 1. Health & Full Application State
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      security: "SHA-256+AES-VAULT+HMAC-SESSION",
      timestamp: new Date().toISOString()
    });
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
    res.json({
      coursesData: dbState.coursesData,
      usersData: visibleUsers,
      pageTexts: dbState.pageTexts,
      appearanceSettings: dbState.appearanceSettings,
      userRatings: dbState.userRatings,
      updatedAt: dbState.updatedAt || 0,
      contentRevision: dbState.contentRevision || 0
    });
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
      userRatings: incoming.userRatings || dbState.userRatings,
      customAdminPassword: dbState.customAdminPassword,
      passwordRecoveryRequests: dbState.passwordRecoveryRequests,
      materialSubmissions: dbState.materialSubmissions,
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
    const before = dbState.usersData.length;
    dbState = normalizeDatabase({
      ...dbState,
      usersData: dbState.usersData.filter((user) => user.id !== userId)
    });
    saveDatabase(dbState);
    res.json({ ok: true, removed: before - dbState.usersData.length });
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

  // 3. Authentication Endpoints
  app.post("/api/auth/password-recovery/request", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const now = Date.now();
    const clientKey = req.ip || req.socket.remoteAddress || "unknown";
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
      message:
        mailStatus().provider === "none"
          ? "If this account exists, the administrator has been notified."
          : "If this account exists, a recovery code was emailed to it. The code expires in 30 minutes."
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
      dbState.customAdminPassword = hashPassword(newPassword, "admin-owner");
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
      expiresAt: recoveryRequest.codeSentAt ? recoveryRequest.codeExpiresAt : undefined,
      error: delivery.ok ? undefined : delivery.error
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

  app.post("/api/auth/register", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const name = String(req.body?.name || "").trim() || "Student Learner";
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "").trim();
    const department = String(req.body?.department || "Software Engineering").trim();
    const phone = String(req.body?.phone || "").trim();
    const plan = String(req.body?.accountPlan || "unpaid").trim();
    const registeredAt = new Date().toISOString().slice(0, 16).replace("T", " ");

    if (!email || !email.includes("@")) {
      res.status(400).json({ ok: false, error: "Please enter a valid email address." });
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ ok: false, error: "Password must be at least 4 characters long." });
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
      phone: phone || undefined,
      accountPlan: plan,
      paymentStatus: plan === "unpaid" ? "unpaid" : "paid",
      downloadOnlyAccount: false,
      amountPaidBirr: planPriceBirr(plan),
      category:
        plan === "paid_lifetime"
          ? "Paid 500 Birr · Lifetime VIP"
          : plan === "premium_annual"
          ? "Premium Annual · 250 Birr · 1 Year"
          : plan === "premium_monthly"
          ? "Premium Monthly · 100 Birr"
          : "Unpaid · Pending 2 Uploads",
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
    saveDatabase(dbState);
    const session = createSignedSessionToken({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    });
    res.json({ ok: true, user: safeUserAccount(user), session, message: "Account created and signed in." });
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
      const session = createSignedSessionToken({
        id: existing.id,
        name: existing.name,
        email: existing.email,
        role: existing.role
      });
      res.json({ ok: true, user: safeUserAccount(existing), session, message: "Signed in with Google successfully!" });
      return;
    }

    const newUser = secureUserAccount({
      id: uid,
      name,
      email,
      password: "google_oauth_protected_" + uid.slice(0, 8),
      role: "user",
      department: "General Studies & Science",
      accountPlan: "free",
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

    const session = createSignedSessionToken({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role
    });

    res.json({ ok: true, user: safeUserAccount(newUser), session, message: "Google onboarding completed successfully!" });
  });

  app.post("/api/auth/login", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const identifier = String(req.body?.identifier || "").trim();
    const password = String(req.body?.password || "");
    const lowerId = identifier.toLowerCase() || "anonymous";

    const rateRecord = loginRateLimitMap.get(lowerId);
    if (rateRecord && rateRecord.lockedUntil > Date.now()) {
      const waitSecs = Math.ceil((rateRecord.lockedUntil - Date.now()) / 1000);
      res.status(429).json({
        ok: false,
        error: `Too many failed login attempts. Please wait ${waitSecs}s before trying again.`
      });
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
    if (isAdminId && verifyAdminAccountPassword(password, dbState.customAdminPassword)) {
      loginRateLimitMap.delete(lowerId);
      const signedSession = createSignedSessionToken({
        id: "admin-owner",
        name: "Habib Yesuf",
        email: ADMIN_EMAIL,
        role: "admin"
      });
      res.json({ ok: true, session: signedSession });
      return;
    }

    // Check registered student/user accounts next
    const matchedUser = dbState.usersData.find(
      (u) =>
        (u.email.toLowerCase() === lowerId || u.name.toLowerCase() === lowerId) &&
        verifyUserAccountPassword(password, u)
    );

    if (matchedUser) {
      loginRateLimitMap.delete(lowerId);
      const signedSession = createSignedSessionToken({
        id: matchedUser.id,
        name: matchedUser.name,
        email: matchedUser.email,
        role: matchedUser.role || "user"
      });
      res.json({ ok: true, session: signedSession });
      return;
    }

    const prevFailed = (rateRecord?.failedCount || 0) + 1;
    loginRateLimitMap.set(lowerId, {
      failedCount: prevFailed,
      lockedUntil: prevFailed >= 5 ? Date.now() + 30 * 1000 : 0
    });

    res.status(401).json({ ok: false, error: "Invalid username/email or password." });
  });

  // 3. Dedicated Course, Material & Side-Material REST Endpoints (Admin-protected)
  app.post("/api/courses/:courseId/materials/:materialId/side-materials", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "Only the Administrator can add or edit side materials." });
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
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "Only the Administrator can delete side materials." });
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
    return {
      sharedMaterialsCount: Number(user.sharedMaterialsCount) || 0,
      unpaidCurrentUploadProgress: Number(user.unpaidCurrentUploadProgress) || 0,
      downloadCredits: Number(user.downloadCredits) || 0,
      uploadsPerCredit: UPLOADS_PER_CREDIT
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
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    res.json({ ok: true, submissions: [...dbState.materialSubmissions].reverse() });
  });

  app.patch("/api/admin/material-submissions/:submissionId", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
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
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
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
      user.sharedMaterialsCount = (Number(user.sharedMaterialsCount) || 0) + 1;
      user.unpaidCurrentUploadProgress = (Number(user.unpaidCurrentUploadProgress) || 0) + 1;
      if (user.unpaidCurrentUploadProgress >= UPLOADS_PER_CREDIT) {
        user.unpaidCurrentUploadProgress -= UPLOADS_PER_CREDIT;
        user.downloadCredits = (Number(user.downloadCredits) || 0) + 1;
        credited = true;
      }
      user.activityLog = [
        {
          id: "act-" + Date.now(),
          type: "Material Approved",
          detail: credited
            ? `“${submission.name}” published — you earned a free premium download`
            : `“${submission.name}” published (${user.unpaidCurrentUploadProgress}/${UPLOADS_PER_CREDIT} toward your next download)`,
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
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
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
    submission.reason = String(req.body?.reason || "The administrator could not verify this document.").slice(0, 300);
    saveDatabase(dbState);
    res.json({ ok: true, submission });
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

  // Spend one earned credit right before the student's download starts, so a
  // refresh can never hand out the same credit twice.
  app.post("/api/downloads/consume-credit", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session) {
      res.status(401).json({ ok: false, error: "Sign in to download this material." });
      return;
    }
    const user = dbState.usersData.find((account) => account.id === session.id);
    if (!user) {
      res.status(401).json({ ok: false, error: "Your account could not be found." });
      return;
    }
    if (Number(user.downloadCredits) > 0) {
      user.downloadCredits = Number(user.downloadCredits) - 1;
      user.downloadsCount = (Number(user.downloadsCount) || 0) + 1;
      saveDatabase(dbState);
      res.json({ ok: true, spent: true, ...submissionCreditState(user) });
      return;
    }
    user.downloadsCount = (Number(user.downloadsCount) || 0) + 1;
    saveDatabase(dbState);
    res.json({ ok: true, spent: false, ...submissionCreditState(user) });
  });

  // ============================================================================
  // STATE BACKEND
  // ============================================================================
  await hydrateState();

  return app;
}
