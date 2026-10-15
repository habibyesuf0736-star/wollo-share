# Brevo SMTP setup

The Express backend sends password-reset verification codes through Nodemailer and Brevo SMTP. It reads these server-only environment variables:

```text
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_brevo_smtp_login
SMTP_PASS=your_rotated_brevo_smtp_key
SMTP_FROM=Your verified sender <you@your-verified-domain.example>
SESSION_SECRET=generate-a-long-random-server-only-secret
```

Use the SMTP login and SMTP key shown in Brevo's SMTP/API settings; the SMTP login is not necessarily your Brevo account email. Verify the sender in Brevo first. Do not put these values in frontend variables, source control, or browser requests. If an SMTP key has been shared publicly, revoke it and create a replacement.

`SESSION_SECRET` is an additional server-only setting required to sign and validate authentication sessions in production. Generate a unique random secret and keep it stable for that environment; changing it invalidates existing sessions.

## Vercel and the current deployment

The current [`vercel.json`](../vercel.json) builds and serves only the static Vite `dist` directory. The Express server in `server.ts` is not configured as a Vercel Function, so adding SMTP variables to Vercel alone will not make this deployment send mail. The custom Express registration now verifies email with a one-time code, and password reset sends a one-time code, but those endpoints are only available when the Express server is running. The Express API stores account data in a local JSON file and verification codes in memory, which is not durable or reliable across serverless function invocations. The existing API/auth backend must be migrated to a supported server runtime and durable store before these flows can work on Vercel.

If the backend is eventually deployed as Vercel Functions, add the five `SMTP_*` variables and `SESSION_SECRET` under **Vercel → Project → Settings → Environment Variables** and select **Production**, **Preview**, and **Development** as appropriate. If the Express backend runs on a separate Node host, set these values in that host's server environment instead; Vercel also needs a configured API origin/proxy to reach it. In either case, redeploy/restart the backend after changing variables. Keep SMTP variables unprefixed (never `VITE_` or `NEXT_PUBLIC_`). Vercel variables are not automatically passed to Supabase or any other external authentication provider.

## Supabase Auth emails

`src/App.jsx` contains an alternate Supabase Auth UI with email-confirmation and resend calls. The Vercel build currently uses the root `index.html` instead, so this alternate UI is not the active production entry point. If/when this Supabase Auth UI is used, configure SMTP in the Supabase project separately:

1. Open the Supabase project dashboard and go to **Authentication → SMTP Settings** (or the SMTP section under **Authentication → Settings**).
2. Enable custom SMTP and enter host `smtp-relay.brevo.com`, port `587`, the Brevo SMTP login, the rotated SMTP key, and the verified sender email/name.
3. Under **Authentication → URL Configuration**, set the Site URL to the deployed application origin and allow the exact deployed origins used by Production and Preview. The app's confirmation redirect is the current page URL with `verify=1` and the signup email query parameter.
4. Save and test signup confirmation and resend from the Supabase Auth flow.

These provider credentials belong in Supabase's secure dashboard settings; setting them only in Vercel will not configure Supabase. Supabase confirmation email behavior applies only when the Supabase Auth UI is active. The current static Vercel deployment does not expose the custom Express signup or recovery APIs.
