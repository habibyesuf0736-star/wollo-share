# Email templates

Wollo Share sends three transactional emails. All three are rendered from
[`emailTemplates.ts`](../emailTemplates.ts), so every provider (Relay, Brevo, Mailtrap, SMTP)
delivers the same branded design. The design uses tables and inline styles only — no images,
no external CSS — so it renders the same in Gmail, Outlook and mobile clients.

| Function | Used for | Subject |
| --- | --- | --- |
| `recoveryCodeEmail` | Password reset code (`/api/auth/password-recovery/request`, admin resend) | `12345678 is your Wollo Share recovery code` |
| `recoveryRequestNoticeEmail` | Admin notification when a student asks for a reset | `Wollo Share password recovery request` |
| `testEmailMessage` | "Send test email" in Admin → Students → Email delivery | `Wollo Share · email delivery test` |

Each renderer returns `{ subject, text, html }`; the plain-text part is sent as
`textContent`/`text` alongside the HTML so clients that block HTML still show the code.

## Customising

Edit the helper functions in `emailTemplates.ts`:

- `layout()` — header monogram, card, footer, mobile media query. Brand colours live in the
  `BRAND` object (`primary` is the site's `#1d624f`).
- `codeBlock()` — the large monospaced code box (34px desktop, 28px under 620px).
- `row()` inside the two notice templates — label/value rows for the details table.

Frontend changes hot-reload; `emailTemplates.ts` is imported by `server.ts`, so restart the
server (`npx tsx server.ts`) after editing it.

## Mailtrap-hosted templates (reference via API)

Mailtrap's **Email Templates** feature can host the HTML and render it inside their API.
To use it:

1. In Mailtrap → Email Templates, create a template and paste the recovery-code HTML
   (run `recoveryCodeEmail()` with sample data, or rebuild it from the layout helpers).
2. Give the template these variables — the server sends exactly these keys under
   `template_variables`:

   | Variable | Example | Notes |
   | --- | --- | --- |
   | `name` | `Selamawit Tadesse` | Plain text from the account record |
   | `email` | `student@wolloshare.com` | Account address |
   | `code` | `48201937` | 8 digits, single use |
   | `minutes` | `30` | Remaining validity in minutes |

   The variables are sent as raw strings, so use Mailtrap's escaped output when placing them in
   HTML (for example `{{ params.name }}` with auto-escaping enabled).

3. Copy the template UUID and paste it into **Admin → Students → Email delivery →
   Mailtrap HTTPS API → Hosted template UUID**, then press Save. (`MAILTRAP_TEMPLATE_UUID`
   works as an environment fallback.)

When a UUID is saved **and Mailtrap is the active provider**, password-reset emails are sent as
`{ template_uuid, template_variables }` and the local HTML is skipped for that message. Admin
notifications and test emails keep using the built-in templates so a broken hosted template
cannot hide a delivery failure.

> Use a **production/sending** Mailtrap token, not a sandbox token, and a verified sender —
> the sandbox endpoint captures mail instead of delivering it, which would hide codes.
