/* PDF.js, loaded from the bundle. The worker, the cmaps, the standard fonts and the decoders
   are all read from the app's own origin, so a saved PDF opens with the radio off. */

import { bundleRoot, bundleUrl } from "./bundle.js";

let lib = null;
let workerPath = null;
let port = null;

// Closing a document also releases its worker port, so every open gets a clean one instead of
// handing pdf.js a port it has already let go of.
async function pdfjs() {
  if (!lib) {
    const [core, path] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url").then((mod) => mod.default)
    ]);
    lib = core;
    workerPath = path;
  }
  port?.terminate?.();
  port = new Worker(bundleUrl(workerPath), { type: "module" });
  lib.GlobalWorkerOptions.workerPort = port;
  return lib;
}

const PIXELS = Math.min(typeof window === "undefined" ? 1 : window.devicePixelRatio || 1, 2);

export async function openPdf(bytes) {
  const core = await pdfjs();
  const root = bundleRoot();
  // pdf.js hands its buffer to the worker, so it gets a copy and the stored file stays intact.
  // The document itself is closed through the loading task — that is what owns the worker port.
  const source = core.getDocument({
    data: bytes.slice(0),
    cMapUrl: `${root}pdfjs/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${root}pdfjs/standard_fonts/`,
    wasmUrl: `${root}pdfjs/wasm/`,
    isEvalSupported: false
  });
  const doc = await source.promise;

  const dims = [];
  const shown = Math.min(doc.numPages, 240);
  for (let index = 1; index <= shown; index += 1) {
    const page = await doc.getPage(index);
    const box = page.getViewport({ scale: 1 });
    dims.push({ w: box.width, h: box.height, rot: page.rotate });
    page.cleanup();
  }
  const tail = dims[0] || { w: 595, h: 842, rot: 0 };
  while (dims.length < doc.numPages) dims.push(tail);

  const texts = new Map();
  const live = new Map();

  return {
    kind: "paged",
    format: "pdf",
    count: doc.numPages,
    canRotate: true,
    canSearch: true,
    canThumb: true,
    box(index) {
      return dims[index] || tail;
    },
    async render(el, index, { scale, rotate, background = "#ffffff" }) {
      const previous = live.get(index);
      if (previous) previous.cancel();
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale, rotation: (((page.rotate || 0) + rotate) % 360 + 360) % 360 });
      const canvas = document.createElement("canvas");
      canvas.className = "r-canvas";
      canvas.width = Math.floor(viewport.width * PIXELS);
      canvas.height = Math.floor(viewport.height * PIXELS);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const layer = document.createElement("div");
      layer.className = "r-text";
      // The text layer sizes itself from this one number: it is the CSS scale, and pdf.js
      // divides its own device-pixel measurements by it when it writes --scale-x per span.
      layer.style.setProperty("--total-scale-factor", String(scale));
      el.replaceChildren(canvas, layer);

      const context = canvas.getContext("2d", { alpha: false });
      const task = page.render({
        canvasContext: context,
        viewport,
        transform: PIXELS === 1 ? null : [PIXELS, 0, 0, PIXELS, 0, 0],
        background
      });
      live.set(index, task);
      try {
        await task.promise;
      } finally {
        live.delete(index);
      }
      try {
        await new core.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport }).render();
      } catch {
        layer.replaceChildren();
      }
      page.cleanup();
      return { width: viewport.width, height: viewport.height };
    },
    async text(index) {
      if (texts.has(index)) return texts.get(index);
      const page = await doc.getPage(index + 1);
      const content = await page.getTextContent();
      const value = content.items.map((item) => item.str).join(" ");
      texts.set(index, value);
      page.cleanup();
      return value;
    },
    async thumb(el, index, width) {
      const page = await doc.getPage(index + 1);
      const base = dims[index] || tail;
      const scale = Math.max(width / base.w, 0.05);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * PIXELS);
      canvas.height = Math.floor(viewport.height * PIXELS);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      el.replaceChildren(canvas);
      await page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport, background: "#ffffff" }).promise;
      page.cleanup();
    },
    destroy() {
      for (const task of live.values()) task.cancel();
      live.clear();
      texts.clear();
      source.destroy();
    }
  };
}
