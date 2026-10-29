import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import { createApp } from "./app.ts";
import { remoteEnabled } from "./state-store.ts";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 3000);

const app = await createApp();

if (process.env.NODE_ENV !== "production") {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(PACKAGE_ROOT, "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Wollo Share full-stack server running on http://0.0.0.0:${PORT} (state store: ${remoteEnabled() ? "supabase" : "local file"})`
  );
});
