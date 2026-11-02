// pdf.js reads its character maps, standard fonts and decoders from files, not from the JS
// bundle. They are copied out of node_modules into public/ so the built site — and the APK,
// which is the same build — carries them and a saved PDF opens with the radio off.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules", "pdfjs-dist");
const out = path.join(root, "public", "pdfjs");

const NEEDED = ["cmaps", "standard_fonts", "wasm"];

for (const folder of NEEDED) {
  const from = path.join(src, folder);
  if (!fs.existsSync(from)) throw new Error(`pdfjs-dist/${folder} is missing — run npm install first.`);
  fs.cpSync(from, path.join(out, folder), { recursive: true });
}

const bytes = [...fs.readdirSync(out)].reduce((sum, folder) => sum + sizeOf(path.join(out, folder)), 0);
console.log(`public/pdfjs ready · ${NEEDED.join(", ")} (${Math.round(bytes / 1024)} KB)`);

function sizeOf(target) {
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.size;
  return fs.readdirSync(target).reduce((sum, item) => sum + sizeOf(path.join(target, item)), 0);
}
