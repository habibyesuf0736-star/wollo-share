# Hyvor Relay — sending verification codes with your own mail server

[Hyvor Relay](https://github.com/hyvor/relay) is a self-hosted email API. Wollo Share posts its one-time password-recovery
codes to Relay's `POST /api/console/sends` endpoint, so codes leave your infrastructure through your own verified domain
instead of a third-party sending quota.

Wollo Share talks to Relay through `mail.ts`, imported by `server.ts`. Relay is preferred when configured; otherwise the
server falls back to SMTP, and otherwise it still stores the code for manual delivery. Provider details can be saved live
from the admin panel (encrypted in the database) or supplied as environment variables.

## 1. Run Relay

Relay ships as Docker Compose (PHP/Symfony API, Go workers, Postgres). You need a Linux host with Docker, a domain you can
point DNS at, and an outbound SMTP relay or direct MX access for the workers.

```bash
git clone https://github.com/hyvor/relay.git
cd relay
cp compose.yaml compose.override.yaml   # set your hostname, DB passwords and the SMTP transport
docker compose up -d
```

Then, in the Relay admin ("sudo") dashboard: create a **project** (set it to *transactional* — recovery codes must not queue
behind newsletters), verify a **domain** (SPF/DKIM records; Relay can host the DNS zone for you), and create an **API key**
with the `sends:send` scope. Sender addresses must belong to that verified domain, or Relay rejects the send with
`Domain … is not registered for this project`.

The full self-hosting guide lives at <https://relay.hyvor.com/hosting>.

## 2. Point Wollo Share at it

**Recommended — from the admin panel (no restart).** Open **Admin → Students & accounts → Email delivery**, choose
*Provider: Relay*, paste the Relay URL, the project API key and the verified sender, then press **Save settings**. The values
are stored vault-encrypted in `data/wollo-db.json` (`mailSettings.relayApiKeyVault`) and applied to `mail.ts` immediately —
the running server starts sending codes without a restart. Blank secret fields keep the stored secret; **Remove key** clears
it. `GET`/`PUT /api/admin/mail-settings` back this form and never return the key.

**Alternative — environment variables.** Copy `.env.example` to `.env` in the Wollo Share project and fill in:

```text
RELAY_API_URL=https://relay.yourdomain.example
RELAY_API_KEY=relay_proje…_key
RELAY_FROM=Wollo Share <no-reply@yourdomain.example>
```

`RELAY_API_URL` accepts either the origin or the full `…/api/console/sends` endpoint — trailing slashes and the path suffix
are normalised. `RELAY_FROM` must be a sender on the verified domain. `RELAY_TIMEOUT_MS` defaults to 15000.
Anything saved in the admin panel overrides the environment for the fields it provides.

Never expose these through `VITE_`/`NEXT_PUBLIC_` variables or put them in the browser bundle; the API key is a bearer secret
that can send mail as your domain.

## 3. What gets sent

| Event | Recipient | Behaviour |
| --- | --- | --- |
| Student requests a password reset | the student | An 8-digit code, hashed at rest, single-use, expires after 30 minutes. |
| Same event | the administrator | Notification email that a request arrived and whether the code was delivered. |
| Admin clicks **Re-send code by email** | the student | A fresh code replaces the previous one. |
| Admin clicks **Send test email** | the address you type | Delivery test that reports the provider and Relay's exact error text. |

When delivery fails, the code is still recorded, and the admin endpoint returns the plaintext code once so it can be handed
over through another channel. When no provider is configured at all, the sign-in page keeps telling students to contact the
administrator instead of promising an email.

## 4. Verify it

In the same **Email delivery** card the badge should read `Hyvor Relay` with the endpoint and sender shown; press
**Send test email** with a real inbox, then request a recovery code from the sign-in page and complete the reset with the code
that arrives. Relay's own console shows the send log and the SMTP conversation if a message is stuck.

This development machine has no Docker or WSL, so Relay itself cannot be run here. The transport was verified against a mock
`POST /api/console/sends` endpoint — a rejected key returns 401, an unverified sender returns the `Domain … is not registered
for this project` text, which the card surfaces verbatim.

## 5. SMTP instead of Relay

The card also speaks SMTP (Nodemailer): host, port, SSL checkbox, login, password and from address, saved encrypted the same
way. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` in `.env` work as the fallback — see
[`brevo-smtp.md`](./brevo-smtp.md). Only one provider is active at a time, and *Provider: automatic* prefers Relay when both
are configured. Gmail works on `smtp.gmail.com:465` with SSL and an app password (plain account passwords are rejected).

## 6. When nothing is configured

The badge reads `Not configured`, students are told to contact the administrator rather than promised an email, and issuing a
code from the recovery list returns it once in the response so it can be handed over manually.
