export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const BRAND = {
  primary: "#1d624f",
  ink: "#14231d",
  body: "#43544c",
  muted: "#75867e",
  line: "#e2ebe6",
  surface: "#f3f8f5",
  canvas: "#eef3f0",
  white: "#ffffff"
};

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace`;

export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string);
}

function layout(input: { preheader: string; title: string; bodyHtml: string; footerNote?: string }): string {
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(input.title)}</title>
<style type="text/css">
  @media only screen and (max-width: 620px) {
    .ws-shell { width: 100% !important; }
    .ws-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .ws-title { font-size: 21px !important; }
    .ws-code { font-size: 28px !important; letter-spacing: 6px !important; }
    .ws-row-label, .ws-row-value { display: block !important; width: 100% !important; padding: 0 0 4px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};-webkit-font-smoothing:antialiased;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(input.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.canvas};">
  <tr>
    <td align="center" style="padding:30px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="ws-shell" style="width:600px;max-width:600px;">

        <tr>
          <td style="padding:0 4px 18px 4px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td width="40" height="40" align="center" valign="middle" style="width:40px;height:40px;background:${BRAND.primary};border-radius:12px;color:${BRAND.white};font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:0.04em;">WS</td>
                <td style="padding-left:12px;font-family:${FONT};">
                  <div style="font-size:17px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.01em;">Wollo Share</div>
                  <div style="font-size:12px;color:${BRAND.muted};padding-top:2px;">Wollo University &middot; Course Library</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="ws-pad" style="background:${BRAND.white};border:1px solid ${BRAND.line};border-radius:16px;padding:36px 40px;font-family:${FONT};">
            <h1 class="ws-title" style="margin:0 0 14px 0;font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.ink};letter-spacing:-0.015em;">${escapeHtml(input.title)}</h1>
            <div style="font-size:15px;line-height:24px;color:${BRAND.body};">${input.bodyHtml}</div>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 6px 0 6px;font-family:${FONT};font-size:12px;line-height:19px;color:${BRAND.muted};">
            <div style="font-weight:600;color:${BRAND.body};">Wollo Share &middot; Wollo University course materials library</div>
            ${input.footerNote ? `<div style="padding-top:6px;">${input.footerNote}</div>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function codeBlock(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0 18px 0;">
  <tr>
    <td align="center" class="ws-code" style="background:${BRAND.surface};border:1px solid #dbe8e1;border-radius:12px;padding:20px 12px;font-family:${MONO};font-size:34px;font-weight:700;letter-spacing:9px;color:${BRAND.ink};">${escapeHtml(code)}</td>
  </tr>
</table>`;
}

function label(text: string): string {
  return `<div style="font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${BRAND.muted};padding-bottom:2px;">${escapeHtml(text)}</div>`;
}

function divider(): string {
  return `<div style="height:1px;background:${BRAND.line};margin:24px 0 18px 0;line-height:1px;font-size:0;">&nbsp;</div>`;
}

export function recoveryCodeEmail(input: {
  name: string;
  email: string;
  code: string;
  minutesLeft: number;
}): RenderedEmail {
  const name = input.name || "there";
  const subject = `${input.code} is your Wollo Share recovery code`;
  const text = [
    `Hi ${name},`,
    "",
    `Your Wollo Share password recovery code is ${input.code}.`,
    `It expires in ${input.minutesLeft} minutes and works only once.`,
    "If you did not request a reset, ignore this email — your password stays unchanged.",
    "",
    "Wollo Share · Wollo University course materials library"
  ].join("\n");

  const bodyHtml = [
    `<p style="margin:0 0 16px 0;">Hi ${escapeHtml(name)},</p>`,
    `<p style="margin:0 0 4px 0;">Use this code to finish resetting the password on your <strong style="color:${BRAND.ink};">Wollo Share</strong> account.</p>`,
    codeBlock(input.code),
    `<p style="margin:0 0 6px 0;font-size:14px;color:${BRAND.muted};">Expires in ${input.minutesLeft} minutes &middot; single use</p>`,
    divider(),
    `<p style="margin:0;font-size:13px;line-height:21px;color:${BRAND.body};">Didn&rsquo;t ask for this? You can ignore this email &mdash; your password stays the same.</p>`
  ].join("");

  return {
    subject,
    text,
    html: layout({
      preheader: `Your Wollo Share recovery code expires in ${input.minutesLeft} minutes.`,
      title: "Reset your password",
      bodyHtml,
      footerNote: "Sent because a password reset was requested for this account."
    })
  };
}

export function signupCodeEmail(input: {
  name: string;
  email: string;
  code: string;
  minutesLeft: number;
}): RenderedEmail {
  const name = input.name || "there";
  const subject = `${input.code} is your Wollo Share verification code`;
  const text = [
    `Hi ${name},`,
    "",
    `Your Wollo Share verification code is ${input.code}.`,
    `Enter it on the "Confirm your email" step to open your Wollo Share account.`,
    `It expires in ${input.minutesLeft} minutes.`,
    "If you did not create this account, ignore this email.",
    "",
    "Wollo Share · Wollo University course materials library"
  ].join("\n");

  const bodyHtml = [
    `<p style="margin:0 0 16px 0;">Hi ${escapeHtml(name)},</p>`,
    `<p style="margin:0 0 4px 0;">Enter this code to finish creating your <strong style="color:${BRAND.ink};">Wollo Share</strong> account.</p>`,
    codeBlock(input.code),
    `<p style="margin:0 0 6px 0;font-size:14px;color:${BRAND.muted};">Expires in ${input.minutesLeft} minutes</p>`,
    divider(),
    `<p style="margin:0;font-size:13px;line-height:21px;color:${BRAND.body};">If no verification code arrived, the site administrator can confirm your account from the admin panel.</p>`
  ].join("");

  return {
    subject,
    text,
    html: layout({
      preheader: `Your Wollo Share verification code expires in ${input.minutesLeft} minutes.`,
      title: "Verify your account",
      bodyHtml,
      footerNote: "Sent because a new Wollo Share account was created with this address."
    })
  };
}

export function signInCodeEmail(input: {
  name: string;
  email: string;
  code: string;
  minutesLeft: number;
}): RenderedEmail {
  const name = input.name || "there";
  const subject = `${input.code} is your Wollo Share sign-in code`;
  const text = [
    `Hi ${name},`,
    "",
    `Your Wollo Share sign-in code is ${input.code}.`,
    "Enter it on the sign-in page to finish signing in.",
    `It expires in ${input.minutesLeft} minutes.`,
    "If you did not try to sign in, your password still works — change it and ignore this email.",
    "",
    "Wollo Share · Wollo University course materials library"
  ].join("\n");

  const bodyHtml = [
    `<p style="margin:0 0 16px 0;">Hi ${escapeHtml(name)},</p>`,
    `<p style="margin:0 0 4px 0;">Enter this code to finish signing in to your <strong style="color:${BRAND.ink};">Wollo Share</strong> account.</p>`,
    codeBlock(input.code),
    `<p style="margin:0 0 6px 0;font-size:14px;color:${BRAND.muted};">Expires in ${input.minutesLeft} minutes</p>`,
    divider(),
    `<p style="margin:0;font-size:13px;line-height:21px;color:${BRAND.body};">Nobody at Wollo Share will ever ask you for this code. If you did not sign in yourself, change your password.</p>`
  ].join("");

  return {
    subject,
    text,
    html: layout({
      preheader: `Your Wollo Share sign-in code expires in ${input.minutesLeft} minutes.`,
      title: "Finish signing in",
      bodyHtml,
      footerNote: "Sent because someone signed in with this address and the correct password."
    })
  };
}

export function recoveryRequestNoticeEmail(input: {
  name: string;
  email: string;
  requestId: string;
  codeSent: boolean;
}): RenderedEmail {
  const subject = "Wollo Share password recovery request";
  const statusText = input.codeSent ? "Recovery code emailed to the student" : "No code emailed — issue one from the dashboard";
  const text = [
    "A password recovery request was submitted.",
    `Account: ${input.name} (${input.email})`,
    `Request ID: ${input.requestId}`,
    statusText
  ].join("\n");

  const row = (rowLabel: string, rowValue: string) =>
    `<tr>
      <td class="ws-row-label" width="120" valign="top" style="padding:9px 0;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.muted};width:120px;">${escapeHtml(rowLabel)}</td>
      <td class="ws-row-value" valign="top" style="padding:9px 0;font-family:${FONT};font-size:14px;line-height:21px;color:${BRAND.ink};">${rowValue}</td>
    </tr>`;

  const pill = input.codeSent
    ? `<span style="display:inline-block;background:#e7f2ec;color:${BRAND.primary};border-radius:999px;padding:4px 11px;font-size:12px;font-weight:600;">Code emailed</span>`
    : `<span style="display:inline-block;background:#fbeee8;color:#a5502f;border-radius:999px;padding:4px 11px;font-size:12px;font-weight:600;">Needs a manual code</span>`;

  const bodyHtml = [
    `<p style="margin:0 0 18px 0;">A student asked to reset their Wollo Share password. Review the request in the admin dashboard.</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${BRAND.line};border-bottom:1px solid ${BRAND.line};">`,
    row("Account", escapeHtml(input.name)),
    row("Email", `<a href="mailto:${escapeHtml(input.email)}" style="color:${BRAND.primary};text-decoration:none;">${escapeHtml(input.email)}</a>`),
    row("Request ID", `<span style="font-family:${MONO};font-size:13px;color:${BRAND.body};">${escapeHtml(input.requestId)}</span>`),
    row("Code status", pill),
    `</table>`
  ].join("");

  return {
    subject,
    text,
    html: layout({
      preheader: `${input.name} requested a password reset.`,
      title: "Password recovery request",
      bodyHtml,
      footerNote: "You receive this because you are the Wollo Share administrator."
    })
  };
}

export function testEmailMessage(input: {
  providerLabel: string;
  sender: string;
  recipient: string;
  sentAt: string;
}): RenderedEmail {
  const subject = "Wollo Share · email delivery test";
  const text = [
    "This is a delivery test from the Wollo Share administrator dashboard.",
    "If you received it, verification codes reach students' inboxes.",
    `Provider: ${input.providerLabel}`,
    `Sender: ${input.sender}`,
    `Sent at ${input.sentAt}`
  ].join("\n");

  const row = (rowLabel: string, rowValue: string) =>
    `<tr>
      <td class="ws-row-label" width="120" valign="top" style="padding:9px 0;font-family:${FONT};font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND.muted};width:120px;">${escapeHtml(rowLabel)}</td>
      <td class="ws-row-value" valign="top" style="padding:9px 0;font-family:${FONT};font-size:14px;line-height:21px;color:${BRAND.ink};">${escapeHtml(rowValue)}</td>
    </tr>`;

  const bodyHtml = [
    `<p style="margin:0 0 18px 0;">Delivery is working. Verification codes will reach students&rsquo; inboxes through this sender.</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${BRAND.line};border-bottom:1px solid ${BRAND.line};">`,
    row("Provider", input.providerLabel),
    row("Sender", input.sender),
    row("Recipient", input.recipient),
    row("Sent", input.sentAt),
    `</table>`,
    `<p style="margin:18px 0 0 0;font-size:13px;line-height:21px;color:${BRAND.muted};">No action needed &mdash; this message only confirms that outbound email is configured correctly.</p>`
  ].join("");

  return {
    subject,
    text,
    html: layout({
      preheader: "Outbound email is configured and delivering.",
      title: "Email delivery is working",
      bodyHtml,
      footerNote: "Sent from the Wollo Share administrator dashboard."
    })
  };
}
