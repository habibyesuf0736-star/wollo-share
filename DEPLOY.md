# Running Wollo Share on Vercel + Supabase

This file is the checklist for getting the app live, and for making the **verification /
recovery code** emails work in production. Everything here matches the code as of
commit `c24ab7c`.

---

## 1. What runs where

| Piece | Where it runs | Notes |
| --- | --- | --- |
| React app (`dist/`) | Vercel static CDN | Built by `npm run build` (Vite) |
| Every `/api/...` request | Vercel Serverless Function `api/index.ts` | One Express app, cold-started per region |
| All app data (courses, users, ads, mail settings, recovery requests) | Supabase table `public.wollo_state`, **row id = 1**, one JSONB document | Read on boot, written on every save |
| Recovery-code email | Brevo / Mailtrap / Hyvor Relay / SMTP, chosen at runtime | Credentials live encrypted **inside the row** |

`vercel.json` rewrites `/api/(.*)` to the function and everything else to `index.html`,
so `/login` and the hash routes both work after a refresh.

---

## 2. Supabase (already done once — verify, don't redo)

1. Project → **Connect → Connection string → URI (non-pooling)** — that is
   `POSTGRES_URL_NON_POOLING` in `.env`.
2. Create the table (idempotent, it refuses to overwrite an existing row):

   ```bash
   npm run db:init
   ```

3. Keep the row and the local file in step:

   ```bash
   npm run db:status   # compare updatedAt + a canonical digest of both sides
   npm run db:push     # local file -> row
   npm run db:pull     # row -> local file (writes a timestamped backup first)
   ```

### Which keys the app actually needs

The REST path used by `stateStore.ts` only accepts the **legacy** JWT keys:

| Variable | Value | Where |
| --- | --- | --- |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` | Project → Settings → Data API |
| `SUPABASE_ANON_KEY` | legacy `anon` JWT (starts `eyJ…`) | Settings → API → *Project API keys* (legacy) |
| `SUPABASE_SERVICE_ROLE_KEY` | legacy `service_role` JWT | same page |

The new `sb_publishable_…` / `sb_secret_…` keys are **rejected** by this project's
`/rest/v1` endpoint — do not swap them in. If the row reads come back empty with a
`401`, that key format is the first thing to check.

---

## 3. Vercel

1. Import the GitHub repo (`habibyesuf0736-star/wollo-share`), framework preset **Vite**,
   build command `npm run build`, output `dist`.
2. Add these **Environment Variables** (Production + Preview), then redeploy:

   | Variable | Value | Required |
   | --- | --- | --- |
   | `WOLLO_STATE_STORE` | `supabase` | yes — without it the app falls back to a read-only local file that does not exist on Vercel |
   | `SUPABASE_URL` | see above | yes |
   | `SUPABASE_ANON_KEY` | legacy anon JWT | yes |
   | `SUPABASE_SERVICE_ROLE_KEY` | legacy service_role JWT | yes |
   | `SESSION_SECRET` | any long random string, **stable across deploys** | yes — `createApp()` throws in production without it, and every signed session is invalidated when it changes |
   | `ADMIN_NOTIFICATION_EMAIL` | defaults to `habibyesuf81@gmail.com` | optional |
   | `WOLLO_SECURITY_PEPPER` | **leave unset** | see below |
   | `WOLLO_VAULT_MASTER_KEY` | **leave unset** | see below |

   > **Do not set the pepper or the vault key.** Every stored password hash and every
   > encrypted mail credential in the row were produced with the built-in defaults in
   > `auth-crypto.ts`. Setting either variable makes admin login, all 7 student logins
   > and Brevo delivery fail at once, with no error message that points at the cause.
   > If they were ever set, `SESSION_SECRET` alone will not fix it — they must be removed
   > and the site redeployed.

3. Settings → Functions: raise the timeout to **30 s** (recovery requests now wait for
   the email before replying — see §5).
4. Deploy, then run the smoke test in §6.

Local development already points at the same row (`.env` has `WOLLO_STATE_STORE=supabase`),
so an edit made locally appears on Vercel immediately — same single source of truth.
Run the local server with `npm run dev` and restart it after any `server.ts` change; a
stale instance holding port 3000 is the usual reason a server edit "did nothing".

---

## 4. Mail provider: two ways to configure it

`mail.ts` merges settings in this order: **values saved in the admin panel (decrypted
from the row) win over environment variables**, which win over nothing.

**A. Saved in the app (recommended — travels with the row, no redeploy):**
Admin → Users → **Email delivery** → fill the provider → Save. The API key is stored
AES-CTR + HMAC-encrypted (`*_vault` fields), which is why the vault key must stay default.

**B. Environment only** (use if you prefer not to keep it in the database):

```
BREVO_API_KEY=...            # or MAILTRAP_API_TOKEN=... / RELAY_API_URL+RELAY_API_KEY
BREVO_FROM="Wollo Share <no-reply@yourdomain.et>"
SMTP_FROM="Wollo Share <no-reply@yourdomain.et>"   # fallback used by Brevo/Mailtrap
SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS            # plain SMTP instead of an API
```

---

## 5. Making the verification (recovery) code work

Flow: `POST /api/auth/password-recovery/request` → 7-digit code, hashed with
`password-recovery:<requestId>`, TTL **30 minutes** → email to the account → the user
submits it with a new password (min 8 chars) to
`POST /api/auth/password-recovery/complete`. Repeated requests reuse the open ticket but
re-issue the code if the last one went out more than 60 seconds ago. Rate limit: 30
requests per IP per 15 minutes.

Three conditions, each of which alone is enough to break it:

1. **A provider must be configured** (§4). With none, the response says "the
   administrator has been notified" and no code is emailed. Check the live state:

   ```bash
   curl -s https://<your-site>.vercel.app/api/health   # {"status":"ok",...} = function is alive
   ```

   The active provider is only visible to an admin session: `GET /api/admin/mail-status`,
   or simply Admin → Users → Email delivery, which shows the provider name, then press
   *Send test email*.

2. **The sender address must be verified in that provider.** The row currently stores
   `wollo-share<habibyesuf0736@gmail.com>` — Brevo refuses to send from an unverified
   sender, and the missing space before `<` can also be rejected by a strict parser. In
   Brevo → **Senders & Domains**, verify the address (a domain is best), then retype the
   From field in Admin → Email delivery as `Wollo Share <verified@address>`.
   If the test email fails with `sender address is not validated`, this is the cause.

3. **The email has to leave before the function stops.** Vercel freezes a function once
   the response is flushed, so fire-and-forget work can be silently dropped. The recovery
   endpoint now `await`s `issueRecoveryCode()` and the admin notification inside the
   request (see [server.ts:1343](file:///C:/Users/habib/Desktop/New%20folder/wollo-share/server.ts#L1343))
   instead of using `setImmediate`. A mail failure is caught, logged and never leaves a
   live code that nobody can receive.

**Fallback that always works:** recovery tickets appear in Admin → Students →
*Password recovery requests*, and an admin can issue a code there (`.../code`) that is
shown in the panel instead of emailed — use it when a student's provider rejects mail.

---

## 6. Post-deploy smoke test

```bash
SITE=https://<your-site>.vercel.app
curl -s $SITE/api/health                      # {"ok":true,...} + mail provider name
curl -s $SITE/api/state | head -c 120         # coursesData begins => Supabase row is readable
curl -s -X POST $SITE/api/progress/video      # 401 "Sign in to save your watching progress."
curl -s $SITE/login | grep -c "<div id=\"root\""  # 1 => SPA fallback works, /login is not a 404
```

Then in the browser:

1. Open `/login`, sign in with a student account (proves the stored hashes match the
   built-in pepper), watch a video and reload — the "Resume …%" button proves progress saving.
2. Sign in as admin, change one course title, wait a second, reload in an incognito
   window and confirm the change (proves the row write + the `contentRevision` guard).
   A "Newer changes are already saved on the server" toast means two tabs edited the same
   library — reload the losing tab.
3. Request a password reset for that student, watch the inbox (and spam) within ~10 s,
   complete the flow with the 7-digit code.

If step 3 produces no email, run Admin → Email delivery → Send test email and read the
error string: `not validated` → §5.2, `auth failed` → key/user, `timeout` → provider region.

---

## 7. If the live site shows "Request failed (500)"

That string comes from the SPA when `/api/...` answers 500, so the page is fine and the
**function** is failing. Two causes covered this deployment:

1. **`firebase-applet-config.json` was not inside the function bundle.** `server.ts` used
   to read it with an un-caught `fs.readFileSync` at import time, so a missing file made
   *every* API call throw before Express was even built. The read now tries three
   locations and degrades to `{}`; `vercel.json` also ships the file with
   `functions["api/index.ts"].includeFiles`.
2. **A required environment variable was missing**, which used to throw an opaque error.
   The function entry now answers misconfiguration as JSON instead of crashing:

   ```json
   { "ok": false, "error": "The API is not configured correctly on this deployment.",
     "hint": "Check the Vercel environment variables and redeploy." }
   ```

   Signed in as admin, the same response adds `hint` with the real reason and `missing`
   with the variable **names** only.

To read the actual reason without signing in: **Vercel dashboard → your project →
Deployments → the latest one → Logs** (or Observability → Logs → Runtime). Then check,
in this order:

| Symptom in the log | Cause |
| --- | --- |
| `SESSION_SECRET is not set, so signed sessions cannot be verified.` | add `SESSION_SECRET` to **Production**, redeploy |
| `WOLLO_STATE_STORE=supabase but SUPABASE_URL / … are not all set.` | the Supabase vars are missing or scoped to Preview only |
| `state read failed (401)` | the API keys are the new `sb_…` form — swap in the legacy JWTs (§2) |
| `Failed to load state from Supabase: …` and the site then shows the seeded 4-course catalog | the row is unreachable, so the app fell back to defaults; the library you see is **not** your data |
| `Function timed out after 30 seconds` | mail provider is unreachable; raise `maxDuration` or fix the sender |

Two deployment gotchas that are easy to miss:

- Vercel env vars are scoped per environment. Set them for **Production** as well as
  Preview, and a change only applies after a **new deploy** (Redeploy → Use Latest
  Configuration and Build Output is not enough for code, but is enough for env vars).
- `NODE_ENV` is `production` on Vercel. The app refuses to start there without
  `SESSION_SECRET`, on purpose — sessions are signed with it.

Google sign-in specifically: if the config file still isn't readable in the bundle, set
`FIREBASE_WEB_API_KEY` (and optionally `FIREBASE_PROJECT_ID`) as env vars — they take
precedence over the file at [server.ts:14](file:///C:/Users/habib/Desktop/New%20folder/wollo-share/server.ts#L14).
Everything else keeps working; only `/api/auth/google` returns its "not configured" error.

---

## 8. Known limits of the serverless shape

- **A cold start never writes to the row.** `loadDatabase()` used to call `saveDatabase()`
  while booting, and in Supabase mode that pushed the boot snapshot — on Vercel the seed
  catalog, since the bundle has no `data/wollo-db.json` — over the live row before
  hydration read it back. Boot is read-only now; only a request that changes something
  writes. Proof: restarting the server leaves the row's `updatedAt` untouched, and a stub
  store sees a single `GET` and no `POST` during boot.
- `npm run db:status` now prints a content digest as well as both timestamps, so "is the
  file and the row the same document?" has a direct answer. `db:push` refuses when the row
  is newer, `db:pull` refuses when the file is newer; `--force` overrides either.

- Login and recovery rate-limiters live in process memory, so each cold start resets
  them. Fine for a university library; move to the row if you ever need real enforcement.
- `data/wollo-db.json` is never written on Vercel (the store is remote); the file stays
  in git as a seed/backup, and it contains account emails and salted hashes — the repo is
  public, which you already accepted.
- Free Vercel bandwidth is shared with the 441 KB JS bundle; the one-time `public/legacy.html`
  (594 KB) has been removed, and materials are links, not hosted files.
