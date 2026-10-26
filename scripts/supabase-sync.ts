// Move the whole app document between data/wollo-db.json and the Supabase row.
//   npm run db:status  - compare both sides
//   npm run db:push    - publish the local file to Supabase
//   npm run db:pull    - save the Supabase row into the local file (backs up the file first)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

process.env.WOLLO_STATE_STORE = "supabase";

const { remoteEnabled, loadRemoteState, queueRemoteSave, flushRemoteSaves } = await import("../stateStore.ts");

const DB_FILE = path.resolve(process.cwd(), "data/wollo-db.json");
const command = process.argv[2] || "status";
const force = process.argv.includes("--force");

if (!remoteEnabled()) {
  console.error("Supabase is not configured. Check SUPABASE_URL and the keys in .env.");
  process.exit(1);
}

type Doc = { updatedAt?: number; [key: string]: unknown };

function describe(label: string, doc: Doc | null) {
  if (!doc) {
    console.log(`${label}: empty`);
    return;
  }
  const counts = [
    `courses ${(doc.coursesData as unknown[] | undefined)?.length ?? 0}`,
    `users ${(doc.usersData as unknown[] | undefined)?.length ?? 0}`,
    `submissions ${(doc.materialSubmissions as unknown[] | undefined)?.length ?? 0}`,
    `ratings ${Object.keys((doc.userRatings as Record<string, unknown> | undefined) || {}).length}`,
    `ads ${(doc.pageTexts as Record<string, unknown> | undefined)?.__ads ? "yes" : "no"}`
  ].join(", ");
  console.log(`${label}: updatedAt ${doc.updatedAt ?? 0} · ${counts} · ${JSON.stringify(doc).length} bytes`);
}

// Bookkeeping fields move on every write; comparing the rest answers "is the actual data
// the same?" without being fooled by a timestamp or the save revision.
function digest(doc: Doc | null): string {
  if (!doc) return "";
  const { updatedAt: _updatedAt, contentRevision: _contentRevision, ...content } = doc;
  const sorted = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sorted)
      : value && typeof value === "object"
        ? Object.keys(value as object).sort().reduce((acc: Record<string, unknown>, key) => {
            acc[key] = sorted((value as Record<string, unknown>)[key]);
            return acc;
          }, {})
        : value;
  return crypto.createHash("sha256").update(JSON.stringify(sorted(content))).digest("hex");
}

function writeLocal(doc: Doc) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, `${DB_FILE}.backup-${stamp}.json`);
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(doc, null, 2), "utf-8");
}

const local: Doc = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf-8")) : {};
const remote = (await loadRemoteState()) as Doc | null;

const localStamp = Number(local.updatedAt || 0);
const remoteStamp = Number(remote?.updatedAt || 0);
const sameContent = digest(local) === digest(remote);

console.log("local file: " + DB_FILE);
describe("supabase row", remote);
describe("local file ", local);
console.log("content digest match: " + (sameContent ? "yes" : "no (the two sides hold different data)"));
console.log(
  "in step: " +
    (sameContent && localStamp === remoteStamp
      ? "yes, the file and the row are the same document"
      : `no, ${localStamp === remoteStamp ? "the data differs" : `the ${localStamp > remoteStamp ? "local file" : "Supabase row"} is newer by ${Math.round(Math.abs(localStamp - remoteStamp) / 1000)}s`}`)
);

// Each direction may only overwrite the *older* side, so the two guards are mirrors.
const localIsNewer = localStamp > remoteStamp;
const remoteIsNewer = remoteStamp > localStamp;

if (command === "push") {
  if (remote && remoteIsNewer && !force) {
    console.error("Refusing to push: the Supabase row is newer. Use npm run db:pull first, or add --force.");
    process.exit(1);
  }
  await queueRemoteSave(JSON.stringify(local));
  await flushRemoteSaves();
  describe("supabase row", (await loadRemoteState()) as Doc | null);
  console.log("pushed");
} else if (command === "pull") {
  if (!remote) {
    console.error("Nothing to pull: the row is empty. Run node scripts/supabase-init.mjs to seed it.");
    process.exit(1);
  }
  if (localIsNewer && !force) {
    console.error("Refusing to pull: the local file has newer changes that are not in Supabase. Use npm run db:push first, or add --force.");
    process.exit(1);
  }
  writeLocal(remote);
  console.log("pulled into data/wollo-db.json (previous file backed up)");
} else if (command !== "status") {
  console.error(`Unknown command "${command}". Use status, push or pull.`);
  process.exit(1);
}

process.exit(0);
