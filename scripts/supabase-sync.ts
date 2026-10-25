// Move the whole app document between data/wollo-db.json and the Supabase row.
//   npm run db:status  - compare both sides
//   npm run db:push    - publish the local file to Supabase
//   npm run db:pull    - save the Supabase row into the local file (backs up the file first)
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
    `ratings ${(doc.userRatings as unknown[] | undefined)?.length ?? 0}`,
    `ads ${(doc.pageTexts as Record<string, unknown> | undefined)?.__ads ? "yes" : "no"}`
  ].join(", ");
  console.log(`${label}: updatedAt ${doc.updatedAt ?? 0} · ${counts} · ${JSON.stringify(doc).length} bytes`);
}

function writeLocal(doc: Doc) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, `${DB_FILE}.backup-${stamp}.json`);
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(doc, null, 2), "utf-8");
}

const local: Doc = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, "utf-8")) : {};
const remote = (await loadRemoteState()) as Doc | null;

console.log("local file: " + DB_FILE);
describe("supabase row", remote);
describe("local file ", local);

const localNewer = Number(local.updatedAt || 0) >= Number(remote?.updatedAt || 0);

if (command === "push") {
  if (remote && !localNewer && !force) {
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
  if (!localNewer && !force) {
    console.error("Refusing to pull: the local file is newer. Use npm run db:push first, or add --force.");
    process.exit(1);
  }
  writeLocal(remote);
  console.log("pulled into data/wollo-db.json (previous file backed up)");
} else if (command !== "status") {
  console.error(`Unknown command "${command}". Use status, push or pull.`);
  process.exit(1);
}

process.exit(0);
