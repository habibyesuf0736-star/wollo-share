import "dotenv/config";
import { encryptVaultSecret, hashPassword } from "./auth-crypto.ts";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIREBASE_CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8")
) as { apiKey?: string; projectId?: string };

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.WOLLO_DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "wollo-db.json");

const ADMIN_USERNAME = "admin";
const ADMIN_EMAIL = "habibyesuf81@gmail.com";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === "true" || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "";
const ADMIN_NOTIFICATION_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || ADMIN_EMAIL;

// Salted multi-round SHA-256 hashes of primary & secondary admin passwords (never stored in plaintext)
const VAULT_MASTER_KEY = "WOLLO_SHARE_AES_CTR_HMAC_VAULT_KEY_2026_V1";
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

const DEFAULT_COURSES = [
  buildEvangadiCourseObject(),
  {
    id: "course-math",
    name: "Mathematics",
    description: "Applied Calculus I & II, Linear Algebra, and Differential Equations.",
    icon: "MATH",
    color: "#1d624f",
    restricted: false,
    allowStudentSideMaterials: false,
    defaultYear: "Year 1",
    subcategories: [...DEFAULT_SUBCATEGORIES],
    materials: [
      { id: "m-math-1", name: "Calculus_I_Limits_and_Derivatives_Complete_Notes.pdf", type: "PDF", size: "3.4 MB", url: "#sample-pdf", year: "Year 1", subcategory: "Lecture Notes", hidden: false, ratingAvg: 4.9, ratingCount: 28, sideMaterials: [] },
      { id: "m-math-2", name: "Linear_Algebra_Matrix_Operations_Lecture_Slides.pptx", type: "PPT", size: "5.1 MB", url: "#sample-ppt", year: "Year 1", subcategory: "Slides & Presentations", hidden: false, ratingAvg: 4.7, ratingCount: 19, sideMaterials: [] },
      { id: "m-math-3", name: "Differential_Equations_Practice_Problem_Set.docx", type: "DOC", size: "1.2 MB", url: "#sample-doc", year: "Year 2", subcategory: "Assignments & Projects", hidden: false, ratingAvg: 4.8, ratingCount: 15, sideMaterials: [] },
      { id: "m-math-4", name: "Numerical_Methods_Formula_Lookup_Sheet.xlsx", type: "XLS", size: "840 KB", url: "#sample-xls", year: "Year 2", subcategory: "Lab Manuals", hidden: false, ratingAvg: 4.6, ratingCount: 12, sideMaterials: [] },
      { id: "m-math-5", name: "Multivariable_Integration_Solved_Final_Exams.pdf", type: "PDF", size: "4.0 MB", url: "#sample-pdf", year: "Year 2", subcategory: "Past Exams & Quizzes", hidden: false, ratingAvg: 4.9, ratingCount: 22, sideMaterials: [] }
    ]
  },
  {
    id: "course-phys",
    name: "Physics",
    description: "Classical Mechanics, Electromagnetism, Thermodynamics, and Wave Optics.",
    icon: "PHYS",
    color: "#1d624f",
    restricted: false,
    allowStudentSideMaterials: false,
    defaultYear: "Year 1",
    subcategories: [...DEFAULT_SUBCATEGORIES],
    materials: [
      { id: "m-phys-1", name: "University_Physics_Mechanics_and_Kinematics.pdf", type: "PDF", size: "4.8 MB", url: "#sample-pdf", year: "Year 1", subcategory: "Lecture Notes", hidden: false, ratingAvg: 4.8, ratingCount: 31, sideMaterials: [] },
      { id: "m-phys-2", name: "Electromagnetism_Maxwells_Equations_Slides.pptx", type: "PPT", size: "6.2 MB", url: "#sample-ppt", year: "Year 2", subcategory: "Slides & Presentations", hidden: false, ratingAvg: 4.7, ratingCount: 16, sideMaterials: [] },
      { id: "m-phys-3", name: "Physics_Lab_Report_Template_and_Error_Analysis.docx", type: "DOC", size: "960 KB", url: "#sample-doc", year: "Year 1", subcategory: "Lab Manuals", hidden: false, ratingAvg: 4.9, ratingCount: 24, sideMaterials: [] },
      { id: "m-phys-4", name: "Harmonic_Oscillations_and_Wave_Motion_Video_Lecture.mp4", type: "Video", size: "18.5 MB", url: "#sample-video", year: "Year 2", subcategory: "Lecture Notes", hidden: false, ratingAvg: 4.8, ratingCount: 20, sideMaterials: [] },
      { id: "m-phys-5", name: "Thermodynamics_Solved_Past_Exam_Questions.pdf", type: "PDF", size: "2.9 MB", url: "#sample-pdf", year: "Year 2", subcategory: "Past Exams & Quizzes", hidden: false, ratingAvg: 4.9, ratingCount: 27, sideMaterials: [] }
    ]
  },
  {
    id: "course-cs",
    name: "Computer Science",
    description: "Data Structures, Algorithms, Object-Oriented Programming, and Databases.",
    icon: "CS",
    color: "#1d624f",
    restricted: false,
    allowStudentSideMaterials: false,
    defaultYear: "Year 2",
    subcategories: [...DEFAULT_SUBCATEGORIES],
    materials: [
      { id: "m-cs-1", name: "Data_Structures_and_Algorithms_in_C++_and_Python.pdf", type: "PDF", size: "5.6 MB", url: "#sample-pdf", year: "Year 2", subcategory: "Lecture Notes", hidden: false, ratingAvg: 5.0, ratingCount: 42, sideMaterials: [] },
      { id: "m-cs-2", name: "Relational_Database_Design_and_SQL_Mastery.pptx", type: "PPT", size: "4.3 MB", url: "#sample-ppt", year: "Year 2", subcategory: "Slides & Presentations", hidden: false, ratingAvg: 4.8, ratingCount: 25, sideMaterials: [] },
      { id: "m-cs-3", name: "Software_Engineering_SRS_Project_Specification.docx", type: "DOC", size: "1.5 MB", url: "#sample-doc", year: "Year 3", subcategory: "Assignments & Projects", hidden: false, ratingAvg: 4.7, ratingCount: 18, sideMaterials: [] },
      { id: "m-cs-4", name: "Operating_Systems_Process_Scheduling_Simulations.zip", type: "Other", size: "3.1 MB", url: "#sample-other", year: "Year 3", subcategory: "Lab Manuals", hidden: false, ratingAvg: 4.6, ratingCount: 14, sideMaterials: [] },
      { id: "m-cs-5", name: "Full_Stack_Web_Development_Crash_Course_Recording.mp4", type: "Video", size: "24.0 MB", url: "#sample-video", year: "Year 3", subcategory: "Lecture Notes", hidden: false, ratingAvg: 4.9, ratingCount: 35, sideMaterials: [] }
    ]
  },
  {
    id: "course-eng",
    name: "English",
    description: "Academic Research Writing, Communicative Grammar, and Presentation Skills.",
    icon: "ENG",
    color: "#1d624f",
    restricted: false,
    allowStudentSideMaterials: false,
    defaultYear: "Year 1",
    subcategories: [...DEFAULT_SUBCATEGORIES],
    materials: [
      { id: "m-eng-1", name: "Communicative_English_Grammar_and_Academic_Style.pdf", type: "PDF", size: "2.7 MB", url: "#sample-pdf", year: "Year 1", subcategory: "Lecture Notes", hidden: false, ratingAvg: 4.8, ratingCount: 29, sideMaterials: [] },
      { id: "m-eng-2", name: "Public_Speaking_and_Research_Defense_Slides.pptx", type: "PPT", size: "3.8 MB", url: "#sample-ppt", year: "Year 1", subcategory: "Slides & Presentations", hidden: false, ratingAvg: 4.7, ratingCount: 17, sideMaterials: [] },
      { id: "m-eng-3", name: "APA_7th_Edition_Thesis_and_Essay_Template.docx", type: "DOC", size: "1.1 MB", url: "#sample-doc", year: "Year 2", subcategory: "Assignments & Projects", hidden: false, ratingAvg: 4.9, ratingCount: 33, sideMaterials: [] },
      { id: "m-eng-4", name: "Freshman_English_Final_Exam_Compilation.pdf", type: "PDF", size: "1.9 MB", url: "#sample-pdf", year: "Year 1", subcategory: "Past Exams & Quizzes", hidden: false, ratingAvg: 4.8, ratingCount: 21, sideMaterials: [] }
    ]
  },
  {
    id: "course-chem",
    name: "Chemistry",
    description: "General & Physical Chemistry, Organic Mechanisms, and Chemical Equilibrium.",
    icon: "CHEM",
    color: "#1d624f",
    restricted: false,
    allowStudentSideMaterials: false,
    defaultYear: "Year 1",
    subcategories: [...DEFAULT_SUBCATEGORIES],
    materials: [
      { id: "m-chem-1", name: "Organic_Chemistry_Functional_Groups_and_Mechanisms.pdf", type: "PDF", size: "4.5 MB", url: "#sample-pdf", year: "Year 2", subcategory: "Lecture Notes", hidden: false, ratingAvg: 4.9, ratingCount: 26, sideMaterials: [] },
      { id: "m-chem-2", name: "Chemical_Kinetics_and_Electrochemistry_Slides.pptx", type: "PPT", size: "5.0 MB", url: "#sample-ppt", year: "Year 2", subcategory: "Slides & Presentations", hidden: false, ratingAvg: 4.7, ratingCount: 15, sideMaterials: [] },
      { id: "m-chem-3", name: "Quantitative_Titration_Lab_Safety_and_Procedure.docx", type: "DOC", size: "890 KB", url: "#sample-doc", year: "Year 1", subcategory: "Lab Manuals", hidden: false, ratingAvg: 4.8, ratingCount: 19, sideMaterials: [] },
      { id: "m-chem-4", name: "Periodic_Table_Thermodynamic_Constants_Dataset.xlsx", type: "XLS", size: "720 KB", url: "#sample-xls", year: "Year 1", subcategory: "Lab Manuals", hidden: false, ratingAvg: 4.8, ratingCount: 14, sideMaterials: [] }
    ]
  },
  {
    id: "course-bio",
    name: "Biology",
    description: "Cell & Molecular Biology, Human Physiology, Genetics, and Plant Ecology.",
    icon: "BIO",
    color: "#1d624f",
    restricted: false,
    allowStudentSideMaterials: false,
    defaultYear: "Year 1",
    subcategories: [...DEFAULT_SUBCATEGORIES],
    materials: [
      { id: "m-bio-1", name: "Cell_Structure_DNA_Replication_and_Genetics.pdf", type: "PDF", size: "6.1 MB", url: "#sample-pdf", year: "Year 1", subcategory: "Lecture Notes", hidden: false, ratingAvg: 4.9, ratingCount: 30, sideMaterials: [] },
      { id: "m-bio-2", name: "Human_Anatomy_and_Physiology_Visual_Atlas.pptx", type: "PPT", size: "7.4 MB", url: "#sample-ppt", year: "Year 2", subcategory: "Slides & Presentations", hidden: false, ratingAvg: 4.8, ratingCount: 22, sideMaterials: [] },
      { id: "m-bio-3", name: "Microbiology_Staining_and_Culture_Lab_Guide.docx", type: "DOC", size: "1.3 MB", url: "#sample-doc", year: "Year 2", subcategory: "Lab Manuals", hidden: false, ratingAvg: 4.7, ratingCount: 16, sideMaterials: [] },
      { id: "m-bio-4", name: "Plant_Vascular_Transport_and_Photosynthesis_Notes.pdf", type: "PDF", size: "3.7 MB", url: "#sample-pdf", year: "Year 1", subcategory: "Lecture Notes", hidden: false, ratingAvg: 4.9, ratingCount: 25, sideMaterials: [] }
    ]
  },
  {
    id: "course-se-capstone",
    name: "Software Engineering & System Architecture",
    description: "Distributed Systems, Cloud Deployment, Microservices, and Exit Exam Prep.",
    icon: "SE-400",
    color: "#1d624f",
    restricted: true,
    allowStudentSideMaterials: false,
    defaultYear: "Year 4",
    subcategories: [...DEFAULT_SUBCATEGORIES],
    materials: [
      { id: "m-se-1", name: "Distributed_Systems_and_Microservices_Architecture.pdf", type: "PDF", size: "6.4 MB", url: "#sample-pdf", year: "Year 4", subcategory: "Lecture Notes", hidden: false, ratingAvg: 5.0, ratingCount: 19, sideMaterials: [] },
      { id: "m-se-2", name: "Final_Year_Capstone_Defense_Rubric_and_Guide.docx", type: "DOC", size: "1.4 MB", url: "#sample-doc", year: "Year 4", subcategory: "Assignments & Projects", hidden: false, ratingAvg: 4.9, ratingCount: 14, sideMaterials: [] },
      { id: "m-se-3", name: "System_Design_Past_Exit_Exam_Questions_With_Answers.pdf", type: "PDF", size: "3.8 MB", url: "#sample-pdf", year: "Year 4", subcategory: "Past Exams & Quizzes", hidden: false, ratingAvg: 5.0, ratingCount: 23, sideMaterials: [] }
    ]
  },
  {
    id: "course-clinical-research",
    name: "Clinical & Biomedical Research Seminar",
    description: "Biostatistics, Epidemiology, Clinical Trials, and Research Thesis Defense.",
    icon: "MED-400",
    color: "#1d624f",
    restricted: true,
    allowStudentSideMaterials: false,
    defaultYear: "Year 4",
    subcategories: [...DEFAULT_SUBCATEGORIES],
    materials: [
      { id: "m-clin-1", name: "Biostatistics_and_Epidemiology_Complete_Handbook.pdf", type: "PDF", size: "5.2 MB", url: "#sample-pdf", year: "Year 3", subcategory: "Lecture Notes", hidden: false, ratingAvg: 4.9, ratingCount: 17, sideMaterials: [] },
      { id: "m-clin-2", name: "Clinical_Research_Protocol_SPSS_Dataset.xlsx", type: "XLS", size: "1.9 MB", url: "#sample-xls", year: "Year 4", subcategory: "Lab Manuals", hidden: false, ratingAvg: 4.8, ratingCount: 11, sideMaterials: [] }
    ]
  }
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
  welcomeDesc: "University lecture notes, past exams, lab manuals, and video courses.",
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
  downloadsCount?: number;
  lastActiveAt?: string;
  allowedCourseIds: string[];
  evangadiSynced?: boolean;
  activityLog?: ActivityLogItem[];
}

interface DatabaseSchema {
  coursesData: Course[];
  usersData: UserAccount[];
  pageTexts: Record<string, string>;
  appearanceSettings: Record<string, string>;
  userRatings: Record<string, number>;
  customAdminPassword: string;
  passwordRecoveryRequests: PasswordRecoveryRequest[];
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
}

function buildDefaultDatabase(): DatabaseSchema {
  return {
    coursesData: JSON.parse(JSON.stringify(DEFAULT_COURSES)),
    usersData: JSON.parse(JSON.stringify(DEFAULT_USERS)).map((u: any) => secureUserAccount(u)),
    pageTexts: { ...DEFAULT_TEXTS },
    appearanceSettings: { ...DEFAULT_APPEARANCE },
    userRatings: {},
    customAdminPassword: "",
    passwordRecoveryRequests: []
  };
}

function normalizeDatabase(raw: Partial<DatabaseSchema>): DatabaseSchema {
  const defaults = buildDefaultDatabase();
  const coursesData: Course[] = Array.isArray(raw.coursesData) && raw.coursesData.length > 0
    ? raw.coursesData
    : defaults.coursesData;

  const existingEvangadi = coursesData.find(
    (c) => c.id === "course-evangadi" || (c.name && c.name.toLowerCase() === "evangadi")
  );
  if (!existingEvangadi) {
    coursesData.unshift(buildEvangadiCourseObject());
  } else {
    existingEvangadi.id = "course-evangadi";
    existingEvangadi.restricted = typeof existingEvangadi.restricted === "boolean" ? existingEvangadi.restricted : true;
    existingEvangadi.allowStudentSideMaterials = false;
    const existingMats = Array.isArray(existingEvangadi.materials) ? existingEvangadi.materials : [];
    if (existingMats.length < 48) {
      const defaultEvgMats = buildEvangadiCourseObject().materials;
      defaultEvgMats.forEach((defMat) => {
        const found = existingMats.find((m) => m.id === defMat.id || m.url === defMat.url);
        if (!found) {
          existingMats.push(defMat);
        }
      });
      existingEvangadi.materials = existingMats;
    }
  }

  coursesData.forEach((course) => {
    course.allowStudentSideMaterials = false;
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
    u.amountPaidBirr = u.paymentStatus === "paid" ? 100 : 0;
    if (!u.category) {
      u.category =
        u.accountPlan === "paid_download_only"
          ? "Paid 100 Birr · Download-Only"
          : u.accountPlan === "paid_lifetime"
          ? "Paid 100 Birr · Lifetime VIP"
          : "Unpaid · Pending 2 Uploads";
    }
    if (typeof u.sharedMaterialsCount !== "number") u.sharedMaterialsCount = 0;
    if (!u.unpaidPerDownloadMigrationV4) {
      u.unpaidCurrentUploadProgress = 0;
      u.unpaidPerDownloadMigrationV4 = true;
    }
    if (typeof u.unpaidCurrentUploadProgress !== "number") u.unpaidCurrentUploadProgress = 0;
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
      : []
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
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db.usersData.forEach((u) => secureUserAccount(u));
    if (db.customAdminPassword) {
      db.customAdminPassword = hashPassword(db.customAdminPassword, "admin-owner");
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save database file:", err);
  }
}

let dbState: DatabaseSchema = loadDatabase();

// Brute-force login attempt rate-limiter
const loginRateLimitMap = new Map<string, { failedCount: number; lockedUntil: number }>();
const recoveryRequestRateLimitMap = new Map<string, { count: number; windowStartedAt: number }>();

function hasSmtpConfiguration(): boolean {
  return Boolean(SMTP_HOST && Number.isInteger(SMTP_PORT) && SMTP_PORT > 0 && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

async function notifyAdminOfRecoveryRequest(request: PasswordRecoveryRequest): Promise<boolean> {
  if (!hasSmtpConfiguration()) return false;
  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
    await transporter.sendMail({
      from: SMTP_FROM,
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: "Wollo Share password recovery request",
      text: [
        "A password recovery request was submitted.",
        `Account: ${request.name} (${request.email})`,
        `Request ID: ${request.id}`,
        "Review and issue a reset code from the administrator dashboard."
      ].join("\n")
    });
    return true;
  } catch (error) {
    console.error("Password recovery notification email failed.", error);
    return false;
  }
}

async function startServer() {
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
      userRatings: dbState.userRatings
    });
  });

  app.put("/api/state", (req, res) => {
    const session = verifyRequestSession(req);
    if (!session || session.role !== "admin") {
      res.status(403).json({ ok: false, error: "An authenticated administrator session is required." });
      return;
    }
    const incoming = req.body || {};
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
      passwordRecoveryRequests: dbState.passwordRecoveryRequests
    });
    saveDatabase(dbState);
    res.json({ ok: true });
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
  app.post("/api/auth/password-recovery/request", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const now = Date.now();
    const clientKey = req.ip || req.socket.remoteAddress || "unknown";
    const rate = recoveryRequestRateLimitMap.get(clientKey);
    if (!rate || now - rate.windowStartedAt >= 15 * 60 * 1000) {
      recoveryRequestRateLimitMap.set(clientKey, { count: 1, windowStartedAt: now });
    } else if (rate.count >= 5) {
      res.json({ ok: true, message: "If this account exists, the administrator has been notified." });
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
        setImmediate(() => {
          void notifyAdminOfRecoveryRequest(recoveryRequest).then((sent) => {
            recoveryRequest.notificationSent = sent;
            saveDatabase(dbState);
          });
        });
      }
    }
    res.json({ ok: true, message: "If this account exists, the administrator has been notified." });
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
    const recoveryRequest = dbState.passwordRecoveryRequests.find(
      (request) => request.userId === targetId && request.status === "code-issued"
    );
    if (!recoveryRequest || !recoveryRequest.codeHash || !recoveryRequest.codeExpiresAt ||
      Date.parse(recoveryRequest.codeExpiresAt) <= Date.now()) {
      if (recoveryRequest) {
        recoveryRequest.status = "closed";
        delete recoveryRequest.codeHash;
        saveDatabase(dbState);
      }
      res.status(400).json({ ok: false, error: "The recovery code is invalid or expired. Request a new one from the administrator." });
      return;
    }
    if (!verifyPasswordHash(code, recoveryRequest.codeHash, `password-recovery:${recoveryRequest.id}`)) {
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
    res.json({
      ok: true,
      smtpConfigured: hasSmtpConfiguration(),
      requests: dbState.passwordRecoveryRequests
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ codeHash: _codeHash, ...request }) => request)
    });
  });

  app.post("/api/admin/password-recovery-requests/:requestId/code", (req, res) => {
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
    const code = String(crypto.randomInt(10_000_000, 100_000_000));
    recoveryRequest.status = "code-issued";
    recoveryRequest.codeHash = hashPassword(code, `password-recovery:${recoveryRequest.id}`);
    recoveryRequest.codeExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    recoveryRequest.failedAttempts = 0;
    saveDatabase(dbState);
    res.json({ ok: true, code, expiresAt: recoveryRequest.codeExpiresAt });
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
    saveDatabase(dbState);
    res.json({ ok: true });
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
      paymentStatus: plan === "paid_lifetime" ? "paid" : "unpaid",
      downloadOnlyAccount: false,
      amountPaidBirr: plan === "paid_lifetime" ? 100 : 0,
      category: plan === "paid_lifetime"
        ? "Paid 100 Birr · Lifetime VIP"
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

    // Check registered student/user accounts first when identifier matches
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

    // Check Admin credentials using salted SHA-256 verification (requires matching admin identifier)
    const isAdminId =
      lowerId === ADMIN_USERNAME.toLowerCase() ||
      lowerId === ADMIN_EMAIL.toLowerCase() ||
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
  // VITE DEV MIDDLEWARE / PRODUCTION STATIC ASSETS
  // ============================================================================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Wollo Share full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
