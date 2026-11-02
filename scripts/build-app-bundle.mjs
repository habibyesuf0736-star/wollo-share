// Assembles the bundled Android surface: the app entry becomes the WebView's index.html and
// the shared chunks it imports come with it. Material files and API data stay on the server.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const out = path.join(root, "mobile-app", "app-dist");

const entry = path.join(dist, "app.html");
if (!fs.existsSync(entry)) throw new Error("dist/app.html is missing — run npm run build first.");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(entry, path.join(out, "index.html"));
fs.cpSync(path.join(dist, "assets"), path.join(out, "assets"), { recursive: true });

// The reader's engines come with the bundle: the worker, the character maps, the standard
// fonts and the decoders all have to be on the device for a saved file to open offline.
// The material files themselves stay on the server — a student downloads what they read.
const offline = ["pdfjs"];
for (const folder of offline) {
  const from = path.join(dist, folder);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(out, folder), { recursive: true });
}

const bytes = [...fs.readdirSync(path.join(out, "assets"))].reduce((sum, f) => sum + fs.statSync(path.join(out, "assets", f)).size, 0);
console.log(`app-dist ready · index.html + ${fs.readdirSync(path.join(out, "assets")).length} assets (${Math.round(bytes / 1024)} KB)`);
