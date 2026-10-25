import "dotenv/config";

const TABLE = "wollo_state";
const ROW_ID = 1;

const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
const apiKey = String(process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();

export function remoteEnabled(): boolean {
  return process.env.WOLLO_STATE_STORE === "supabase" && Boolean(url && serviceKey && apiKey);
}

function headers() {
  return { apikey: apiKey, authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
}

export async function loadRemoteState(): Promise<unknown | null> {
  const res = await fetch(`${url}/rest/v1/${TABLE}?select=data&id=eq.${ROW_ID}`, { headers: headers() });
  if (!res.ok) throw new Error(`state read failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
  const rows = (await res.json()) as Array<{ data: unknown }>;
  return rows.length ? rows[0].data : null;
}

const pending: Promise<void>[] = [];

export function queueRemoteSave(serializedDoc: string): Promise<void> {
  const write = (async () => {
    const res = await fetch(`${url}/rest/v1/${TABLE}?on_conflict=id`, {
      method: "POST",
      headers: { ...headers(), prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: ROW_ID, data: JSON.parse(serializedDoc) })
    });
    if (!res.ok) console.error("state write failed:", res.status, (await res.text()).slice(0, 200));
  })().catch((err) => console.error("state write error:", err?.message || err));

  pending.push(write);
  return write;
}

export async function flushRemoteSaves(): Promise<void> {
  await Promise.allSettled(pending.splice(0, pending.length));
}
