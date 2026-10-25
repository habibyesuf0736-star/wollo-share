import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import pg from "pg";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const SQL = `
create table if not exists public.wollo_state (
  id         integer primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.wollo_state enable row level security;
revoke all on public.wollo_state from anon, authenticated;
grant select on public.wollo_state to service_role;
grant insert, update, delete on public.wollo_state to service_role;
`;

async function main() {
  const conn = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!conn) throw new Error("POSTGRES_URL_NON_POOLING is not set in .env");

  const u = new URL(conn);
  const client = new pg.Client({
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log("connected to Postgres at", u.hostname);

  for (const statement of SQL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await client.query(statement);
  }
  console.log("schema ready: public.wollo_state (RLS enabled, service_role only)");

  const existing = await client.query("select data from public.wollo_state where id = 1");
  if (existing.rowCount > 0) {
    console.log("row already present, leaving it untouched");
  } else {
    const db = JSON.parse(fs.readFileSync(path.join(root, "data", "wollo-db.json"), "utf-8"));
    await client.query("insert into public.wollo_state (id, data) values (1, $1)", [JSON.stringify(db)]);
    console.log(
      `seeded from data/wollo-db.json: ${db.coursesData.length} courses, ${db.usersData.length} users, ${db.updatedAt}`
    );
  }

  const check = await client.query("select count(*)::int as n, max(updated_at) as at from public.wollo_state");
  console.log("rows:", JSON.stringify(check.rows[0]));
  await client.end();
}

main().catch((err) => {
  console.error("migration failed:", err.message);
  process.exit(1);
});
