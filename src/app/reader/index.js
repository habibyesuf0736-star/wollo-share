import { openPdf } from "./pdf.js";
import { openDocx } from "./docx.js";
import { openPptx } from "./pptx.js";

/* Plain text and the small HTML notes the library also carries need no library at all. */
async function openText(bytes) {
  const body = new TextDecoder().decode(bytes);
  let host = null;
  return {
    kind: "flow",
    format: "text",
    count: 1,
    canRotate: false,
    canSearch: true,
    canThumb: false,
    async renderAll(container) {
      host = container;
      const pre = document.createElement("pre");
      pre.className = "r-pre";
      pre.textContent = body;
      container.replaceChildren(pre);
      return { nodes: 1 };
    },
    text() {
      return body;
    },
    host() {
      return host;
    },
    destroy() {
      host = null;
    }
  };
}

// What the reader can actually draw. Everything else is answered with a clear refusal.
export const READABLE = ["pdf", "docx", "pptx", "text", "html"];

export function readable(kind) {
  return READABLE.includes(kind);
}

export async function openDocument(kind, bytes) {
  if (kind === "pdf") return openPdf(bytes);
  if (kind === "docx") return openDocx(bytes);
  if (kind === "pptx") return openPptx(bytes);
  if (kind === "text" || kind === "html") return openText(bytes);
  throw new Error(`unsupported:${kind}`);
}
