import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import "dotenv/config";

// The chatroom lives in its own Postgres tables instead of the single wollo_state row:
// a busy room writes a message every few seconds, and each of those writes would otherwise
// rewrite the whole document — every account, course and file — over the network.
//
//   chat_messages  the room itself, append-only, with a soft `deleted` flag
//   chat_reports   what students flagged and how staff closed it out
//   chat_actions   mutes, suspensions and bans, so a sentence can be lifted cleanly

const MESSAGES = "chat_messages";
const REPORTS = "chat_reports";
const ACTIONS = "chat_actions";

const POST = "POST";
const PATCH = "PATCH";

// The room keeps a rolling window of history; older lines fall out of the table the same
// way they fall out of the scroll.
const MAX_MESSAGES = 2000;

const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
const apiKey = String(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();

export function chatRemoteEnabled(): boolean {
  return process.env.WOLLO_STATE_STORE === "supabase" && Boolean(url && serviceKey && apiKey);
}

function headers() {
  return { apikey: apiKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHAT_FILE = process.env.WOLLO_CHAT_FILE
  ? path.resolve(process.env.WOLLO_CHAT_FILE)
  : path.join(ROOT, "data", "wollo-chat.json");

export interface ChatMessage {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  image: string | null;
  reply_to: string | null;
  reply_to_name: string | null;
  pinned: boolean;
  created_at: string;
  deleted: boolean;
  deleted_by: string | null;
  deleted_at?: string | null;
  updated_at?: string | null;
}

export interface ChatReport {
  id: string;
  message_id: string;
  reporter_id: string;
  reason: string;
  status: "open" | "reviewed";
  created_at: string;
  resolved_at: string | null;
  resolved_by?: string | null;
}

export interface ChatAction {
  id: string;
  user_id: string;
  kind: "mute" | "suspend" | "ban";
  reason: string;
  issued_by: string;
  until: string | null;
  lifted_at: string | null;
  created_at: string;
}

interface LocalStore {
  messages: ChatMessage[];
  reports: ChatReport[];
  actions: ChatAction[];
}

function emptyLocal(): LocalStore {
  return { messages: [], reports: [], actions: [] };
}

function readLocal(): LocalStore {
  try {
    if (!fs.existsSync(CHAT_FILE)) return emptyLocal();
    const parsed = JSON.parse(fs.readFileSync(CHAT_FILE, "utf-8"));
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions : []
    };
  } catch {
    return emptyLocal();
  }
}

function writeLocal(store: LocalStore): void {
  try {
    const dir = path.dirname(CHAT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CHAT_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("chat file write failed:", err instanceof Error ? err.message : err);
  }
}

// --------------------------------------------------------------------------- change signal
// Long polling waits on this instead of hammering the database. Every write bumps it and
// wakes the waiters; a fresh serverless instance simply starts from the current clock.
let revision = Date.now();
const waiters = new Set<() => void>();

function signal() {
  revision = Date.now();
  waiters.forEach((wake) => wake());
  waiters.clear();
}

export function chatRevision(): number {
  return revision;
}

export function waitForChatChange(after: number, timeoutMs: number): Promise<boolean> {
  if (revision > after) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      waiters.delete(wake);
      clearTimeout(timer);
      resolve(value);
    };
    const wake = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    waiters.add(wake);
  });
}

// ---------------------------------------------------------------------------------- rows
function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomInt(100000, 999999).toString(36)}`;
}

async function postgrest<T>(table: string, query: string, options: { method?: string; body?: unknown } = {}): Promise<T[]> {
  const res = await fetch(`${url}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: { ...headers(), ...(options.method ? { prefer: "return=representation" } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  if (!res.ok) throw new Error(`chat read failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
  const text = await res.text();
  return text ? (JSON.parse(text) as T[]) : [];
}

/** Newest `limit` messages, returned oldest first. `before` pages backwards through history. */
export async function listMessages(limit = 60, before = ""): Promise<ChatMessage[]> {
  if (chatRemoteEnabled()) {
    const filter = before ? `&created_at=lt.${encodeURIComponent(before)}` : "";
    const rows = await postgrest<ChatMessage>(MESSAGES, `?select=*&order=created_at.desc,id.desc&limit=${limit}${filter}`);
    return rows.reverse();
  }
  const all = readLocal().messages;
  const cut = before ? all.findIndex((m) => m.created_at >= before) : -1;
  const window = before ? (cut < 0 ? all : all.slice(0, cut)) : all;
  return window.slice(-limit);
}

export async function getPinnedMessages(): Promise<ChatMessage[]> {
  if (chatRemoteEnabled()) {
    return postgrest<ChatMessage>(MESSAGES, `?pinned=eq.true&order=created_at.desc&limit=5`);
  }
  return readLocal()
    .messages.filter((m) => m.pinned && !m.deleted)
    .slice(-5)
    .reverse();
}

/** The most recent `limit` messages from one author, used on profiles and in moderation. */
export async function listUserMessages(userId: string, limit = 20): Promise<ChatMessage[]> {
  if (chatRemoteEnabled()) {
    return postgrest<ChatMessage>(
      MESSAGES,
      `?select=*&author_id=eq.${encodeURIComponent(userId)}&deleted=eq.false&order=created_at.desc&limit=${limit}`
    );
  }
  return readLocal()
    .messages.filter((m) => m.author_id === userId && !m.deleted)
    .slice(-limit)
    .reverse();
}

/** Case-insensitive body search, newest first. Runs in the file store on purpose: the */
export async function searchMessages(term: string, limit = 40): Promise<ChatMessage[]> {
  const needle = String(term || "").trim().toLowerCase();
  if (!needle) return [];
  if (chatRemoteEnabled()) {
    return postgrest<ChatMessage>(
      MESSAGES,
      `?select=*&deleted=eq.false&or=(body.ilike.*${encodeURIComponent(needle)}*,author_name.ilike.*${encodeURIComponent(needle)}*)&order=created_at.desc&limit=${limit}`
    );
  }
  return readLocal()
    .messages.filter((m) => !m.deleted && (m.body.toLowerCase().includes(needle) || m.author_name.toLowerCase().includes(needle)))
    .slice(-limit)
    .reverse();
}

export async function getMessage(messageId: string): Promise<ChatMessage | null> {
  if (chatRemoteEnabled()) {
    const rows = await postgrest<ChatMessage>(MESSAGES, `?id=eq.${encodeURIComponent(messageId)}&limit=1`);
    return rows[0] || null;
  }
  return readLocal().messages.find((m) => m.id === messageId) || null;
}

export interface NewMessage {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  image: string | null;
  reply_to: string | null;
  reply_to_name: string | null;
  created_at: string;
}

export async function insertMessage(input: NewMessage): Promise<ChatMessage> {
  const row: ChatMessage = {
    id: input.id,
    author_id: input.author_id,
    author_name: input.author_name,
    body: input.body,
    image: input.image,
    reply_to: input.reply_to,
    reply_to_name: input.reply_to_name,
    pinned: false,
    created_at: input.created_at,
    deleted: false,
    deleted_by: null,
    deleted_at: null,
    updated_at: null
  };
  if (chatRemoteEnabled()) {
    await postgrest(MESSAGES, "", { method: POST, body: row });
  } else {
    const store = readLocal();
    store.messages.push(row);
    // The file store has no vacuum job, so it trims itself the way the table would.
    if (store.messages.length > MAX_MESSAGES) store.messages = store.messages.slice(-MAX_MESSAGES);
    writeLocal(store);
  }
  signal();
  return row;
}

/** Soft delete keeps the id so replies and reports still resolve to something. */
export async function softDeleteMessage(messageId: string, staffId: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (chatRemoteEnabled()) {
    const rows = await postgrest<ChatMessage>(
      MESSAGES,
      `?id=eq.${encodeURIComponent(messageId)}`,
      { method: PATCH, body: { deleted: true, deleted_by: staffId, deleted_at: now, image: null } }
    );
    if (!rows.length) return false;
  } else {
    const store = readLocal();
    const row = store.messages.find((m) => m.id === messageId);
    if (!row) return false;
    row.deleted = true;
    row.deleted_by = staffId;
    row.deleted_at = now;
    row.image = null;
    writeLocal(store);
  }
  signal();
  return true;
}

export async function setMessagePinned(messageId: string, pinned: boolean): Promise<boolean> {
  const now = new Date().toISOString();
  if (chatRemoteEnabled()) {
    const rows = await postgrest<ChatMessage>(MESSAGES, `?id=eq.${encodeURIComponent(messageId)}`, {
      method: PATCH,
      body: { pinned, updated_at: now }
    });
    if (!rows.length) return false;
  } else {
    const store = readLocal();
    const row = store.messages.find((m) => m.id === messageId);
    if (!row) return false;
    row.pinned = pinned;
    row.updated_at = now;
    writeLocal(store);
  }
  signal();
  return true;
}

/** Ids deleted or unpinned since `since` — long polling uses this to correct open rooms. */
export async function changedSince(since: string): Promise<{ removed: string[]; unpinned: string[] }> {
  const stamp = encodeURIComponent(since);
  if (chatRemoteEnabled()) {
    const [gone, unpinned] = await Promise.all([
      postgrest<{ id: string }>(MESSAGES, `?deleted=eq.true&deleted_at=gt.${stamp}&select=id&limit=200`).catch(() => []),
      postgrest<{ id: string }>(MESSAGES, `?pinned=eq.false&updated_at=gt.${stamp}&select=id&limit=200`).catch(() => [])
    ]);
    return { removed: gone.map((r) => r.id), unpinned: unpinned.map((r) => r.id) };
  }
  const cut = Date.parse(since) || 0;
  const store = readLocal();
  return {
    removed: store.messages.filter((m) => m.deleted && Date.parse(m.deleted_at || m.created_at) > cut).map((m) => m.id),
    unpinned: store.messages.filter((m) => !m.pinned && Date.parse(m.updated_at || m.created_at) > cut).map((m) => m.id)
  };
}

// ------------------------------------------------------------------------------- reports
export async function insertReport(input: { message_id: string; reporter_id: string; reason: string }): Promise<ChatReport> {
  const row: ChatReport = {
    id: newId("rep"),
    message_id: input.message_id,
    reporter_id: input.reporter_id,
    reason: input.reason,
    status: "open",
    created_at: new Date().toISOString(),
    resolved_at: null
  };
  if (chatRemoteEnabled()) {
    await postgrest(REPORTS, "", { method: POST, body: row });
  } else {
    const store = readLocal();
    store.reports.push(row);
    writeLocal(store);
  }
  return row;
}

export async function listReports(includeReviewed = false): Promise<(ChatReport & { message: ChatMessage | null })[]> {
  let reports: ChatReport[];
  if (chatRemoteEnabled()) {
    const filter = includeReviewed ? "" : "&status=eq.open";
    reports = await postgrest<ChatReport>(REPORTS, `?select=*${filter}&order=created_at.desc&limit=200`);
  } else {
    reports = readLocal()
      .reports.filter((r) => includeReviewed || r.status === "open")
      .slice(-200)
      .reverse();
  }
  const ids = Array.from(new Set(reports.map((r) => r.message_id)));
  const messages = ids.length ? await listMessagesByIds(ids) : [];
  const byId = new Map(messages.map((m) => [m.id, m]));
  return reports.map((r) => ({ ...r, message: byId.get(r.message_id) || null }));
}

async function listMessagesByIds(ids: string[]): Promise<ChatMessage[]> {
  if (chatRemoteEnabled()) {
    return postgrest<ChatMessage>(MESSAGES, `?id=in.(${ids.map((i) => encodeURIComponent(i)).join(",")})&select=*`);
  }
  const set = new Set(ids);
  return readLocal().messages.filter((m) => set.has(m.id));
}

export async function resolveReport(reportId: string, staffId: string): Promise<boolean> {
  if (chatRemoteEnabled()) {
    const rows = await postgrest<ChatReport>(REPORTS, `?id=eq.${encodeURIComponent(reportId)}`, {
      method: PATCH,
      body: { status: "reviewed", resolved_at: new Date().toISOString(), resolved_by: staffId }
    });
    return rows.length > 0;
  }
  const store = readLocal();
  const row = store.reports.find((r) => r.id === reportId);
  if (!row) return false;
  row.status = "reviewed";
  row.resolved_at = new Date().toISOString();
  writeLocal(store);
  return true;
}

// ------------------------------------------------------------------- mutes, suspends, bans
export async function insertAction(input: { user_id: string; kind: ChatAction["kind"]; reason: string; issued_by: string; until: string | null }): Promise<ChatAction> {
  const row: ChatAction = {
    id: newId("act"),
    user_id: input.user_id,
    kind: input.kind,
    reason: input.reason,
    issued_by: input.issued_by,
    until: input.until,
    lifted_at: null,
    created_at: new Date().toISOString()
  };
  if (chatRemoteEnabled()) {
    await postgrest(ACTIONS, "", { method: POST, body: row });
  } else {
    const store = readLocal();
    store.actions.push(row);
    writeLocal(store);
  }
  signal();
  return row;
}

export async function liftAction(actionId: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (chatRemoteEnabled()) {
    const rows = await postgrest<ChatAction>(ACTIONS, `?id=eq.${encodeURIComponent(actionId)}`, {
      method: PATCH,
      body: { lifted_at: now, until: now }
    });
    return rows.length > 0;
  }
  const store = readLocal();
  const row = store.actions.find((a) => a.id === actionId);
  if (!row) return false;
  row.lifted_at = now;
  row.until = now;
  writeLocal(store);
  signal();
  return true;
}

/** Everything currently in force for one account, newest first. */
export async function activeActionsFor(userId: string): Promise<ChatAction[]> {
  const now = Date.now();
  const all = chatRemoteEnabled()
    ? await postgrest<ChatAction>(ACTIONS, `?user_id=eq.${encodeURIComponent(userId)}&select=*&order=created_at.desc&limit=50`)
    : readLocal()
        .actions.filter((a) => a.user_id === userId)
        .slice(-50)
        .reverse();
  return all.filter((a) => !a.lifted_at && (!a.until || Date.parse(a.until) > now));
}

export async function listActions(limit = 200): Promise<ChatAction[]> {
  if (chatRemoteEnabled()) {
    return postgrest<ChatAction>(ACTIONS, `?select=*&order=created_at.desc&limit=${limit}`);
  }
  return readLocal().actions.slice(-limit).reverse();
}

/** Counts for the admin overview and the room header, cheap enough to call per request. */
export async function chatStats(): Promise<{ messages: number; today: number; openReports: number }> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  if (chatRemoteEnabled()) {
    const [messages, today, reports] = await Promise.all([
      countRows(MESSAGES, "?deleted=eq.false"),
      countRows(MESSAGES, `?deleted=eq.false&created_at=gte.${dayStart.toISOString()}`),
      countRows(REPORTS, "?status=eq.open")
    ]);
    return { messages, today, openReports: reports };
  }
  const store = readLocal();
  return {
    messages: store.messages.filter((m) => !m.deleted).length,
    today: store.messages.filter((m) => !m.deleted && Date.parse(m.created_at) >= dayStart.getTime()).length,
    openReports: store.reports.filter((r) => r.status === "open").length
  };
}

async function countRows(table: string, query: string): Promise<number> {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&${query.replace(/^\?/, "")}`, {
    headers: { ...headers(), prefer: "count=exact", range: "0/0", "range-unit": "items" }
  });
  if (!res.ok) return 0;
  const contentRange = res.headers.get("content-range") || "";
  const match = contentRange.match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}
