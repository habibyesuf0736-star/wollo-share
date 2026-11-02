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

create table if not exists public.chat_messages (
  id            text primary key,
  author_id     text not null,
  author_name   text not null,
  body          text not null,
  image         text,
  reply_to      text,
  reply_to_name text,
  pinned        boolean not null default false,
  deleted       boolean not null default false,
  deleted_by    text,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at desc, id desc);
create index if not exists chat_messages_author_idx  on public.chat_messages (author_id, created_at desc);
create index if not exists chat_messages_open_idx    on public.chat_messages (created_at desc) where deleted = false;

create table if not exists public.chat_reports (
  id          text primary key,
  message_id  text not null references public.chat_messages (id) on delete cascade,
  reporter_id text not null,
  reason      text not null default '',
  status      text not null default 'open',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
create index if not exists chat_reports_status_idx on public.chat_reports (status, created_at desc);

create table if not exists public.chat_actions (
  id         text primary key,
  user_id    text not null,
  kind       text not null,
  reason     text not null default '',
  issued_by  text not null,
  "until"    timestamptz,
  lifted_at  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chat_actions_user_idx on public.chat_actions (user_id, created_at desc);

alter table public.chat_messages enable row level security;
alter table public.chat_reports  enable row level security;
alter table public.chat_actions  enable row level security;
revoke all on public.chat_messages, public.chat_reports, public.chat_actions from anon, authenticated;
grant select on public.chat_messages, public.chat_reports, public.chat_actions to service_role;
grant insert, update, delete on public.chat_messages, public.chat_reports, public.chat_actions to service_role;

-- Practice & examination engine. Lives outside the single wollo_state row because every
-- answered question is a write, and so the answers/explanations stay on the server: a student
-- never receives either until they submit, and the catalog queries strip both out.
create table if not exists public.practice_questions (
  id            text primary key,
  course_id     text,
  college       text not null default '',
  department    text not null default '',
  program       text not null default '',
  academic_year text not null default '',
  semester      text not null default '',
  chapter       text not null default '',
  category      text not null default '',
  kind          text not null default 'mcq',
  body          text not null default '',
  image         text,
  options       jsonb,
  correct_answer text not null default '',
  explanation   text not null default '',
  points        integer not null default 1,
  status        text not null default 'draft',
  author_id     text not null default '',
  author_name   text not null default '',
  usage_count   integer not null default 0,
  correct_count integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists practice_questions_status_idx   on public.practice_questions (status, created_at desc);
create index if not exists practice_questions_course_idx   on public.practice_questions (course_id, created_at desc);
create index if not exists practice_questions_chapter_idx   on public.practice_questions (chapter, created_at desc);
create index if not exists practice_questions_category_idx  on public.practice_questions (category, created_at desc);

create table if not exists public.practice_exams (
  id               text primary key,
  title            text not null default '',
  description      text not null default '',
  course_id        text,
  college          text not null default '',
  department       text not null default '',
  program          text not null default '',
  academic_year    text not null default '',
  semester         text not null default '',
  chapter          text not null default '',
  category         text not null default '',
  question_ids     text[] not null default '{}',
  question_count   integer not null default 0,
  duration_minutes integer not null default 0,
  shuffle          boolean not null default false,
  show_answers     text not null default 'after_submit',
  status           text not null default 'draft',
  author_id        text not null default '',
  author_name      text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists practice_exams_status_idx on public.practice_exams (status, created_at desc);

create table if not exists public.practice_attempts (
  id              text primary key,
  user_id         text not null,
  user_name       text not null default '',
  user_department text not null default '',
  exam_id         text,
  title           text not null default '',
  mode            text not null default 'practice',
  question_ids    text[] not null default '{}',
  answers         jsonb not null default '{}',
  score           integer not null default 0,
  max_score       integer not null default 0,
  percent         integer not null default 0,
  correct_count   integer not null default 0,
  total_count     integer not null default 0,
  duration_seconds integer not null default 0,
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz not null default now()
);
create index if not exists practice_attempts_user_idx     on public.practice_attempts (user_id, submitted_at desc);
create index if not exists practice_attempts_submitted_idx on public.practice_attempts (submitted_at desc);

create table if not exists public.practice_favorites (
  user_id     text not null,
  question_id text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table public.practice_questions enable row level security;
alter table public.practice_exams     enable row level security;
alter table public.practice_attempts   enable row level security;
alter table public.practice_favorites enable row level security;
revoke all on public.practice_questions, public.practice_exams, public.practice_attempts, public.practice_favorites from anon, authenticated;
grant select on public.practice_questions, public.practice_exams, public.practice_attempts, public.practice_favorites to service_role;
grant insert, update, delete on public.practice_questions, public.practice_exams, public.practice_attempts, public.practice_favorites to service_role;
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
  console.log("schema ready: wollo_state + chat_messages/chat_reports/chat_actions (RLS enabled, service_role only)");

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
