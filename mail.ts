import nodemailer from "nodemailer";

export type MailProvider = "relay" | "smtp" | "brevo" | "mailtrap" | "none";
export type MailPreference = "auto" | "relay" | "smtp" | "brevo" | "mailtrap" | "none";

export interface RelayConfig {
  url: string;
  apiKey: string;
  from: string;
  timeoutMs: number;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface BrevoConfig {
  apiKey: string;
  from: string;
  timeoutMs: number;
}

export interface MailtrapConfig {
  apiToken: string;
  from: string;
  templateUuid: string;
  timeoutMs: number;
}

export interface MailConfig {
  preference: MailPreference;
  relay: RelayConfig;
  smtp: SmtpConfig;
  brevo: BrevoConfig;
  mailtrap: MailtrapConfig;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  // Rendered by a template hosted on the provider (Mailtrap) instead of the local HTML.
  template?: { uuid: string; variables: Record<string, string> };
}

export interface MailResult {
  ok: boolean;
  provider: MailProvider;
  error?: string;
}

export type ConfigSource = "saved" | "environment" | "none";

function trimSlash(value: string): string {
  return String(value || "").trim().replace(/\/+$/, "");
}

// Credentials are sometimes pasted as the whole provider response
// ({"api_key":"…"} or its base64 form). Unwrap those so the raw key is sent.
export function normalizeMailSecret(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  const unwrap = (json: unknown): string => {
    if (!json || typeof json !== "object") return "";
    const record = json as Record<string, unknown>;
    for (const key of ["api_key", "apiKey", "token", "key", "value"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
    return "";
  };
  if (value.startsWith("{")) {
    try {
      const found = unwrap(JSON.parse(value));
      if (found) return found;
    } catch {
      /* not JSON, keep as-is */
    }
  }
  if (/^[A-Za-z0-9+/]{40,}={0,2}$/.test(value)) {
    try {
      const decoded = Buffer.from(value, "base64").toString("utf8").trim();
      if (decoded.startsWith("{")) {
        const found = unwrap(JSON.parse(decoded));
        if (found) return found;
      }
    } catch {
      /* not base64 JSON, keep as-is */
    }
  }
  return value;
}

function environmentConfig(): MailConfig {
  const smtpPort = Number(process.env.SMTP_PORT || 587);
  return {
    preference: "auto",
    relay: {
      url: trimSlash(process.env.RELAY_API_URL || ""),
      apiKey: String(process.env.RELAY_API_KEY || "").trim(),
      from: String(process.env.RELAY_FROM || "").trim(),
      timeoutMs: Number(process.env.RELAY_TIMEOUT_MS || 15000)
    },
    smtp: {
      host: String(process.env.SMTP_HOST || "").trim(),
      port: Number.isInteger(smtpPort) && smtpPort > 0 ? smtpPort : 587,
      secure: process.env.SMTP_SECURE === "true" || smtpPort === 465,
      user: String(process.env.SMTP_USER || "").trim(),
      pass: String(process.env.SMTP_PASS || "").trim(),
      from: String(process.env.SMTP_FROM || "").trim()
    },
    brevo: {
      apiKey: String(process.env.BREVO_API_KEY || "").trim(),
      from: String(process.env.BREVO_FROM || process.env.SMTP_FROM || "").trim(),
      timeoutMs: Number(process.env.BREVO_TIMEOUT_MS || 15000)
    },
    mailtrap: {
      apiToken: String(process.env.MAILTRAP_API_TOKEN || "").trim(),
      from: String(process.env.MAILTRAP_FROM || process.env.SMTP_FROM || "").trim(),
      templateUuid: String(process.env.MAILTRAP_TEMPLATE_UUID || "").trim(),
      timeoutMs: Number(process.env.MAILTRAP_TIMEOUT_MS || 15000)
    }
  };
}

export type MailConfigPatch = {
  preference?: MailPreference;
  relay?: Partial<RelayConfig>;
  smtp?: Partial<SmtpConfig>;
  brevo?: Partial<BrevoConfig>;
  mailtrap?: Partial<MailtrapConfig>;
};

const ENV_CONFIG = environmentConfig();

// Credentials saved from the admin panel (kept encrypted in the database) win over the
// environment so delivery can be changed without restarting the server.
let savedConfig: MailConfigPatch | null = null;

export function configureMail(next: MailConfigPatch | null): void {
  savedConfig = next;
}

function pickString(saved: string | undefined, fallback: string): { value: string; source: ConfigSource } {
  const savedValue = String(saved || "").trim();
  if (savedValue) return { value: savedValue, source: "saved" };
  const fallbackValue = String(fallback || "").trim();
  return { value: fallbackValue, source: fallbackValue ? "environment" : "none" };
}

export function effectiveMailConfig(): Required<MailConfig> & { source: { relay: Record<string, ConfigSource>; smtp: Record<string, ConfigSource>; brevo: Record<string, ConfigSource>; mailtrap: Record<string, ConfigSource>; preference: ConfigSource } } {
  const saved = savedConfig || {};
  const relayUrl = pickString(saved.relay?.url, ENV_CONFIG.relay.url);
  const relayKey = pickString(saved.relay?.apiKey, ENV_CONFIG.relay.apiKey);
  const relayFrom = pickString(saved.relay?.from, ENV_CONFIG.relay.from);
  const smtpHost = pickString(saved.smtp?.host, ENV_CONFIG.smtp.host);
  const smtpUser = pickString(saved.smtp?.user, ENV_CONFIG.smtp.user);
  const smtpPass = pickString(saved.smtp?.pass, ENV_CONFIG.smtp.pass);
  const smtpFrom = pickString(saved.smtp?.from, ENV_CONFIG.smtp.from);
  const brevoKey = pickString(saved.brevo?.apiKey, ENV_CONFIG.brevo.apiKey);
  const brevoFrom = pickString(saved.brevo?.from, ENV_CONFIG.brevo.from);
  const mailtrapToken = pickString(saved.mailtrap?.apiToken, ENV_CONFIG.mailtrap.apiToken);
  const mailtrapFrom = pickString(saved.mailtrap?.from, ENV_CONFIG.mailtrap.from);
  const mailtrapTemplate = pickString(saved.mailtrap?.templateUuid, ENV_CONFIG.mailtrap.templateUuid);

  const savedPort = Number(saved.smtp?.port || 0);
  const smtpPort = Number.isInteger(savedPort) && savedPort > 0 ? savedPort : ENV_CONFIG.smtp.port;
  const smtpSecure = typeof saved.smtp?.secure === "boolean" ? saved.smtp.secure : ENV_CONFIG.smtp.secure;
  const relayTimeout = Number(saved.relay?.timeoutMs || 0) > 0 ? Number(saved.relay?.timeoutMs) : ENV_CONFIG.relay.timeoutMs;
  const brevoTimeout = Number(saved.brevo?.timeoutMs || 0) > 0 ? Number(saved.brevo?.timeoutMs) : ENV_CONFIG.brevo.timeoutMs;
  const mailtrapTimeout = Number(saved.mailtrap?.timeoutMs || 0) > 0 ? Number(saved.mailtrap?.timeoutMs) : ENV_CONFIG.mailtrap.timeoutMs;
  const preference = (["auto", "relay", "smtp", "brevo", "mailtrap", "none"] as MailPreference[]).includes(saved.preference as MailPreference)
    ? (saved.preference as MailPreference)
    : "auto";

  return {
    preference,
    relay: { url: relayUrl.value, apiKey: normalizeMailSecret(relayKey.value), from: relayFrom.value, timeoutMs: relayTimeout },
    smtp: {
      host: smtpHost.value,
      port: smtpPort,
      secure: smtpSecure,
      user: smtpUser.value,
      pass: smtpPass.value,
      from: smtpFrom.value
    },
    brevo: { apiKey: normalizeMailSecret(brevoKey.value), from: brevoFrom.value, timeoutMs: brevoTimeout },
    mailtrap: { apiToken: normalizeMailSecret(mailtrapToken.value), from: mailtrapFrom.value, templateUuid: mailtrapTemplate.value, timeoutMs: mailtrapTimeout },
    source: {
      preference: saved.preference ? "saved" : "none",
      relay: { url: relayUrl.source, apiKey: relayKey.source, from: relayFrom.source },
      smtp: { host: smtpHost.source, user: smtpUser.source, pass: smtpPass.source, from: smtpFrom.source },
      brevo: { apiKey: brevoKey.source, from: brevoFrom.source },
      mailtrap: { apiToken: mailtrapToken.source, from: mailtrapFrom.source, templateUuid: mailtrapTemplate.source }
    }
  };
}

export function relayEndpoint(): string {
  const url = effectiveMailConfig().relay.url;
  if (!url) return "";
  return /\/api\/console\/sends$/.test(url) ? url : `${url}/api/console/sends`;
}

export function hasRelayConfiguration(): boolean {
  const { relay } = effectiveMailConfig();
  return Boolean(relay.url && relay.apiKey && relay.from);
}

export function hasSmtpConfiguration(): boolean {
  const { smtp } = effectiveMailConfig();
  return Boolean(smtp.host && smtp.port > 0 && smtp.user && smtp.pass && smtp.from);
}

export function hasBrevoConfiguration(): boolean {
  const { brevo } = effectiveMailConfig();
  return Boolean(brevo.apiKey && brevo.from);
}

export function hasMailtrapConfiguration(): boolean {
  const { mailtrap } = effectiveMailConfig();
  return Boolean(mailtrap.apiToken && mailtrap.from);
}

// Every provider that has enough configuration to attempt a send, in the order the
// administrator's preference says to try them.
export function mailProviderCandidates(): MailProvider[] {
  const { preference } = effectiveMailConfig();
  if (preference === "none") return [];
  const ready: Record<MailProvider, boolean> = {
    none: false,
    relay: hasRelayConfiguration(),
    smtp: hasSmtpConfiguration(),
    brevo: hasBrevoConfiguration(),
    mailtrap: hasMailtrapConfiguration()
  };
  // HTTPS APIs come before SMTP: they need no open port, and providers that gate on a
  // fixed source IP cannot be satisfied from a serverless host anyway.
  const order: MailProvider[] =
    preference === "relay"
      ? ["relay", "brevo", "mailtrap", "smtp"]
      : preference === "smtp"
      ? ["smtp", "brevo", "mailtrap", "relay"]
      : preference === "brevo"
      ? ["brevo", "mailtrap", "smtp", "relay"]
      : preference === "mailtrap"
      ? ["mailtrap", "smtp", "relay", "brevo"]
      : ["relay", "brevo", "mailtrap", "smtp"];
  return order.filter((provider) => ready[provider]);
}

export function activeMailProvider(): MailProvider {
  return mailProviderCandidates()[0] || "none";
}

export function mailStatus() {
  const config = effectiveMailConfig();
  const provider = activeMailProvider();
  return {
    provider,
    preference: config.preference,
    relay: {
      configured: Boolean(config.relay.url && config.relay.apiKey && config.relay.from),
      endpoint: relayEndpoint(),
      from: config.relay.from,
      keyConfigured: Boolean(config.relay.apiKey),
      urlSource: config.source.relay.url,
      keySource: config.source.relay.apiKey,
      fromSource: config.source.relay.from
    },
    smtp: {
      configured: Boolean(config.smtp.host && config.smtp.port > 0 && config.smtp.user && config.smtp.pass && config.smtp.from),
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      user: config.smtp.user,
      from: config.smtp.from,
      hostSource: config.source.smtp.host,
      userSource: config.source.smtp.user,
      passSource: config.source.smtp.pass,
      fromSource: config.source.smtp.from
    },
    brevo: {
      configured: Boolean(config.brevo.apiKey && config.brevo.from),
      from: config.brevo.from,
      keyConfigured: Boolean(config.brevo.apiKey),
      keySource: config.source.brevo.apiKey,
      fromSource: config.source.brevo.from
    },
    mailtrap: {
      configured: Boolean(config.mailtrap.apiToken && config.mailtrap.from),
      from: config.mailtrap.from,
      templateUuid: config.mailtrap.templateUuid,
      tokenConfigured: Boolean(config.mailtrap.apiToken),
      tokenSource: config.source.mailtrap.apiToken,
      fromSource: config.source.mailtrap.from
    }
  };
}

async function readErrorDetail(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).slice(0, 300);
  try {
    const parsed = JSON.parse(text);
    const errors = Array.isArray(parsed.errors) ? parsed.errors.join("; ") : "";
    return String(parsed.detail || parsed.title || parsed.message || parsed.error || errors || text || "unknown error");
  } catch {
    return text.replace(/<[^>]*>/g, " ").trim().slice(0, 200) || "unknown error";
  }
}

async function sendViaRelay(message: MailMessage): Promise<MailResult> {
  const { relay } = effectiveMailConfig();
  const body: Record<string, unknown> = {
    from: relay.from,
    to: message.to,
    subject: message.subject,
    body_text: message.text
  };
  if (message.html) body.body_html = message.html;

  try {
    const res = await fetch(relayEndpoint(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${relay.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(relay.timeoutMs)
    });
    if (res.ok) return { ok: true, provider: "relay" };
    return { ok: false, provider: "relay", error: `Relay responded ${res.status}: ${await readErrorDetail(res)}` };
  } catch (error) {
    return { ok: false, provider: "relay", error: `Relay request failed: ${(error as Error).message}` };
  }
}

// A mailbox shows the sender's display name, and the address only when the reader opens it.
// A configured From of just `someone@gmail.com` therefore prints a personal address as the
// sender on every student's phone, so the site name is always filled in.
const DEFAULT_SENDER_NAME = "Wollo Share";

function parseSender(from: string): { name?: string; email: string } {
  const match = /^\s*(.*?)\s*<\s*([^<>]+)\s*>\s*$/.exec(from || "");
  if (match) {
    const email = match[2].trim();
    return { name: match[1].trim() || DEFAULT_SENDER_NAME, email };
  }
  return { name: DEFAULT_SENDER_NAME, email: String(from || "").trim() };
}

async function sendViaBrevo(message: MailMessage): Promise<MailResult> {
  const { brevo } = effectiveMailConfig();
  const sender = parseSender(brevo.from);
  const body: Record<string, unknown> = {
    sender,
    to: [{ email: message.to }],
    subject: message.subject,
    textContent: message.text
  };
  if (message.html) body.htmlContent = message.html;

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevo.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(brevo.timeoutMs)
    });
    if (res.ok) return { ok: true, provider: "brevo" };
    return { ok: false, provider: "brevo", error: `Brevo API responded ${res.status}: ${await readErrorDetail(res)}` };
  } catch (error) {
    return { ok: false, provider: "brevo", error: `Brevo API request failed: ${(error as Error).message}` };
  }
}

async function sendViaMailtrap(message: MailMessage): Promise<MailResult> {
  const { mailtrap } = effectiveMailConfig();
  const sender = parseSender(mailtrap.from);
  const templateUuid = message.template?.uuid || mailtrap.templateUuid;
  const body: Record<string, unknown> = {
    from: sender,
    to: [{ email: message.to }],
    subject: message.subject,
    category: "Wollo Share"
  };
  if (templateUuid) {
    body.template_uuid = templateUuid;
    body.template_variables = message.template?.variables || {};
  } else {
    body.text = message.text;
    if (message.html) body.html = message.html;
  }

  try {
    // Mailtrap's production sending endpoint (their sandbox endpoint silently
    // captures mail instead of delivering it, which would hide codes).
    const res = await fetch("https://send.api.mailtrap.io/api/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mailtrap.apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(mailtrap.timeoutMs)
    });
    if (res.ok) return { ok: true, provider: "mailtrap" };
    return { ok: false, provider: "mailtrap", error: `Mailtrap responded ${res.status}: ${await readErrorDetail(res)}` };
  } catch (error) {
    return { ok: false, provider: "mailtrap", error: `Mailtrap request failed: ${(error as Error).message}` };
  }
}

async function sendViaSmtp(message: MailMessage): Promise<MailResult> {
  const { smtp } = effectiveMailConfig();
  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    });
    await transporter.sendMail({
      from: parseSender(smtp.from),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
    return { ok: true, provider: "smtp" };
  } catch (error) {
    return { ok: false, provider: "smtp", error: `SMTP send failed: ${(error as Error).message}` };
  }
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (!String(message.to || "").trim()) {
    return { ok: false, provider: activeMailProvider(), error: "A recipient email address is required." };
  }
  const candidates = mailProviderCandidates();
  if (!candidates.length) {
    const preference = effectiveMailConfig().preference;
    const missing =
      preference === "smtp"
        ? "the SMTP password (Gmail needs an app password, Brevo needs its SMTP key)"
        : preference === "brevo"
        ? "the Brevo API key and a verified sender"
        : preference === "mailtrap"
        ? "the Mailtrap API token and a verified sender"
        : preference === "relay"
        ? "the Relay URL, project API key and verified sender"
        : "a Relay URL + project API key, a Brevo API key, a Mailtrap API token (each with a verified sender), or SMTP host + login + password + verified sender";
    return {
      ok: false,
      provider: "none",
      error: `Email delivery is not set up yet — add ${missing} in Admin → Users → Email delivery and press Save.`
    };
  }
  // One provider refusing (a bad key, an IP allowlist, a closed port) should not strand a
  // student when another one is configured and working, so keep trying in order.
  const failures: string[] = [];
  let last: MailResult | null = null;
  for (const provider of candidates) {
    const result =
      provider === "relay"
        ? await sendViaRelay(message)
        : provider === "brevo"
        ? await sendViaBrevo(message)
        : provider === "mailtrap"
        ? await sendViaMailtrap(message)
        : await sendViaSmtp(message);
    if (result.ok) return result;
    last = result;
    failures.push(`${provider}: ${result.error || "refused"}`);
  }
  const error = failures.length === 1 ? failures[0] : `${failures.length} mail providers failed — ${failures.join(" · ")}`;
  return { ok: false, provider: last ? last.provider : candidates[0], error };
}

