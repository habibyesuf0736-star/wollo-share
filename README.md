# Evangadi Learning

A course-resource library built with React, Vite, and Supabase. The production app is a static Vite site hosted on Vercel; Supabase provides authentication, learner profiles, access control, and progress storage.

## Local development

Requirements: Node.js 22 or later and npm.

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable key.
3. Run the database setup in [`supabase.sql`](./supabase.sql) in the Supabase SQL Editor.
4. Start the development server with `npm run dev`.

Local development without Supabase uses browser-local demo data. That mode is for development only and is not suitable for a public deployment.

## Deploy to Vercel

1. Import this repository into Vercel with the project root set to the repository root.
2. Add these environment variables for **Production**, **Preview**, and **Development**:
   - `VITE_DATA_MODE` = `supabase`
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = your Supabase publishable (or legacy anon) key
3. Deploy. Vercel uses `npm run build` and publishes `dist`. Production builds fail if the Supabase configuration is missing or the project URL is not HTTPS.
4. In Supabase Authentication settings, add the Vercel production URL and any preview URLs to the allowed redirect URLs. Configure email confirmation and delivery for your project.

Never put a Supabase secret/service-role key in a `VITE_` variable or in this frontend. The browser uses only the publishable/anon key; row-level security in `supabase.sql` protects user data.

## Supabase setup and administration

Run [`supabase.sql`](./supabase.sql) before deploying. It creates the tables, row-level security policies, invite-code verification function, and user-profile provisioning trigger. Configure the invite code in the SQL Editor using a unique value:

```sql
insert into private.app_invite_config (singleton, invite_code)
values (true, 'replace-with-a-long-random-invite-code')
on conflict (singleton)
do update set invite_code = excluded.invite_code;
```

Email confirmation must remain enabled in Supabase Auth. Create the administrator account using the address configured as `ADMIN_EMAIL` in `src/lib/localDatabase.js` (`habibyesuf81@gmail.com` by default). New profiles are learners by default; promote the confirmed administrator account explicitly from the Supabase SQL Editor:

```sql
update public.profiles
set role = 'admin', access_granted = true
where email = lower('your-admin-email@example.com');
```

The administrator must also verify the configured invite code in the app. Grant learner access from the Admin panel. Never promote an account based only on a client-provided email address.

## Checks

- `npm run lint` runs the TypeScript check.
- `npm run build` makes a production build and requires Supabase configuration.
- The GitHub Actions workflow runs lint and a build with placeholder Supabase values on pushes and pull requests. Vercel performs the production deployment.
