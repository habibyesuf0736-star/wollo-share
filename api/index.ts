import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "../server.ts";
import { flushRemoteSaves } from "../stateStore.ts";

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

let appPromise: Promise<RequestHandler> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!appPromise) {
    appPromise = createApp() as unknown as Promise<RequestHandler>;
  }
  const app = await appPromise;

  const responseFinished = new Promise<void>((resolve) => res.on("finish", resolve));
  app(req, res);
  await responseFinished;

  // Vercel may freeze the instance as soon as this export settles, so any queued
  // Supabase write has to complete here rather than in the background.
  await flushRemoteSaves();
}
