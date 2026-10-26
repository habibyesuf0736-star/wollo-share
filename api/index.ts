import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "http";
import crypto from "crypto";

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;
type BundledApp = { app: RequestHandler; flush: () => Promise<void> };

let appPromise: Promise<BundledApp> | null = null;

const REQUIRED_ENV = ["SESSION_SECRET", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
// Naming these would tell a visitor which secrets are unset, so only the caller of the
// admin-only diagnostic may see them.
function missingEnv() {
  return REQUIRED_ENV.filter((name) => !String(process.env[name] || "").trim());
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

async function boot(): Promise<BundledApp> {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is not set, so signed sessions cannot be verified.");
  }
  if (process.env.WOLLO_STATE_STORE === "supabase" && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_ANON_KEY)) {
    throw new Error("WOLLO_STATE_STORE=supabase but SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are not all set.");
  }
  // Imported only after the checks pass, because a bad module load throws at import time.
  const { createApp } = (await import("../server.ts")) as { createApp: () => Promise<unknown> };
  const { flushRemoteSaves } = (await import("../stateStore.ts")) as { flushRemoteSaves: () => Promise<void> };
  const app = (await createApp()) as RequestHandler;
  return { app, flush: flushRemoteSaves };
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!appPromise) {
    appPromise = boot().catch((err) => {
      appPromise = null; // let the next request retry after he fixes the config
      throw err;
    });
  }

  try {
    const { app, flush } = await appPromise;
    const responseFinished = new Promise<void>((resolve) => res.on("finish", resolve));
    app(req, res);
    await responseFinished;
    // Vercel freezes the instance once this export settles, so a queued Supabase write
    // has to complete here rather than in the background.
    await flush();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("API failed to start:", detail);
    // A signed admin can ask for the precise diagnosis; everyone else gets the fact
    // that the deployment is misconfigured, never which variables.
    const token = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
    const isAdmin = isSignedAdmin(token);
    json(res, 500, {
      ok: false,
      error: "The API is not configured correctly on this deployment.",
      hint: isAdmin ? detail : "Check the Vercel environment variables and redeploy.",
      missing: isAdmin ? missingEnv() : undefined
    });
  }
}

function isSignedAdmin(token: string): boolean {
  const secret = String(process.env.SESSION_SECRET || "");
  const parts = token.split(".");
  if (!secret || parts.length !== 3 || parts[0] !== "wstok" || !/^[a-f\d]+$/i.test(parts[1])) return false;
  const expected = crypto.createHmac("sha256", secret).update(parts[1]).digest("hex").slice(0, 32);
  if (!/^[a-f\d]{32}$/i.test(parts[2])) return false;
  if (!crypto.timingSafeEqual(Buffer.from(parts[2], "hex"), Buffer.from(expected, "hex"))) return false;
  const [id, email, role, , expiresAt] = Buffer.from(parts[1], "hex").toString("utf8").split("|");
  return id === "admin-owner" && role === "admin" && email.toLowerCase() === "habibyesuf81@gmail.com" && Number(expiresAt) > Date.now();
}
