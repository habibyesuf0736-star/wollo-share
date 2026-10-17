# Admin-managed password recovery

Users can submit a recovery request from the sign-in page. The server returns the same response whether or not the account exists. Requests for existing accounts appear in the administrator's **Paid Accounts & Username/Password Generator** section.

The administrator can generate a single-use, eight-digit reset code. The code is displayed only once in the current admin page and expires after 30 minutes. Use **Email code to user** to open the configured desktop mail application, review the message, and send the code. The user enters that code and chooses a new password on the recovery page. Codes are stored as hashes and are limited to five failed attempts.

To email the administrator when a real request arrives, copy `.env.example` to `.env` and configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` with credentials from your mail provider. `SMTP_FROM` must be a sender address verified with that provider. `ADMIN_NOTIFICATION_EMAIL` defaults to the administrator email configured by the server. Keep `.env` private and never commit real credentials. Without SMTP configured, requests are still saved and visible in the admin dashboard, but email notifications cannot be delivered.

## Recovering the only administrator account locally

If the only administrator is locked out, stop the running app and open a terminal in the project folder. Run `npm run admin:reset-password`; enter and confirm a new password of at least 12 characters when prompted. Input is masked and is not passed as a command-line argument or written to logs. The command refuses to edit the database while a server is listening on the configured `PORT`, updates the admin-owner and matching admin user credentials, and closes pending recovery requests for that admin. Restart the app and sign in with the new password. Run this only on a trusted machine with access to the project data.
