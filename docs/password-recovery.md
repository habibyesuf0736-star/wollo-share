# Admin-managed password recovery

Users can submit a recovery request from the sign-in page. The server returns the same response whether or not the account exists. When an email provider is configured, the server immediately emails the student a single-use code and logs the request in the administrator's **Students & accounts** tab; without a provider, the request is still saved and the administrator issues the code from there.

The server generates an eight-digit code that is shown to nobody but the recipient and expires after 30 minutes. **Re-send code by email** replaces it with a fresh code; if delivery fails the response reveals the code once so it can be handed over another way. The user enters that code and chooses a new password on the recovery page. Codes are stored as hashes and are limited to five failed attempts.

Email is delivered by [Hyvor Relay](./hyvor-relay.md) when `RELAY_API_URL`, `RELAY_API_KEY` and `RELAY_FROM` are set, by the Brevo HTTPS API when a `BREVO_API_KEY` (and verified `BREVO_FROM`) is present, by the Mailtrap HTTPS API when `MAILTRAP_API_TOKEN` (and verified `MAILTRAP_FROM`) is present, otherwise by the SMTP settings below. The same choice can be made without a restart in Admin → Students & accounts → Email delivery, where every secret is stored AES-vault encrypted.

The recovery code, admin notification and test emails share one branded HTML design — see
[email-templates.md](./email-templates.md) for the template source and the Mailtrap hosted-template
UUID option.

To email the administrator when a real request arrives, copy `.env.example` to `.env` and configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` with credentials from your mail provider. `SMTP_FROM` must be a sender address verified with that provider. `ADMIN_NOTIFICATION_EMAIL` defaults to the administrator email configured by the server. Keep `.env` private and never commit real credentials. Without SMTP configured, requests are still saved and visible in the admin dashboard, but email notifications cannot be delivered.

## Recovering the only administrator account locally

If the only administrator is locked out, stop the running app and open a terminal in the project folder. Run `npm run admin:reset-password`; enter and confirm a new password of at least 12 characters when prompted. Input is masked and is not passed as a command-line argument or written to logs. The command refuses to edit the database while a server is listening on the configured `PORT`, updates the admin-owner and matching admin user credentials, and closes pending recovery requests for that admin. Restart the app and sign in with the new password. Run this only on a trusted machine with access to the project data.
