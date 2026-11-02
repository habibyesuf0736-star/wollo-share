/* A .pptx slide deck read straight from its own XML.

   There is no maintained, freely licensed OOXML slide renderer to bundle, so the deck is
   drawn here: every shape is placed where the file says it sits, at the size the file says
   it is, and the pictures inside the deck are shown as the pictures they are. Shape fills,
   gradients, SmartArt and charts are not drawn — the reader says so rather than pretending. */

const EMU_PER_PX = 9525;
const DEFAULT_SIZE = { w: 12192000 / EMU_PER_PX, h: 6858000 / EMU_PER_PX };

const kids = (node, name) => [...node.children].filter((child) => name === "*" || child.localName === name);
const first = (node, name) => kids(node, name)[0] || null;
const num = (value) => Number(value) || 0;

function frame(node) {
  const spPr = first(node, "spPr");
  const xfrm = spPr && first(spPr, "xfrm");
  const off = xfrm && first(xfrm, "off");
  const ext = xfrm && first(xfrm, "ext");
  if (!off || !ext) return null;
  return { x: num(off.getAttribute("x")), y: num(off.getAttribute("y")), w: num(ext.getAttribute("cx")), h: num(ext.getAttribute("cy")) };
}

// A run written in white on a slide drawn as paper would simply disappear, so anything too
// light to see is pulled back to ink. Dark decks are still legible; their colours are not.
function readable(hex) {
  if (!hex) return "";
  const raw = hex.replace("#", "");
  if (raw.length !== 6) return "";
  const rgb = [0, 2, 4].map((at) => parseInt(raw.slice(at, at + 2), 16) / 255);
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.072 * rgb[2];
  return lum > 0.72 ? "" : `#${raw}`;
}

function styleOf(run, autofit) {
  const pr = first(run, "rPr") || first(run, "defRPr");
  if (!pr) return { size: 1800 * autofit, bold: false, italic: false, color: "" };
  const solid = first(pr, "solidFill");
  const srgb = solid && first(solid, "srgbClr");
  return {
    size: (num(pr.getAttribute("sz")) || 1800) * autofit,
    bold: pr.getAttribute("b") === "1",
    italic: pr.getAttribute("i") === "1",
    color: readable(srgb ? `#${srgb.getAttribute("val")}` : "")
  };
}

function paragraphs(body) {
  const tx = first(body, "txBody");
  if (!tx) return [];
  const box = first(tx, "bodyPr");
  const fit = box && first(box, "normAutofit");
  const autofit = fit ? num(fit.getAttribute("fontScale")) / 100000 || 1 : 1;
  const out = [];
  for (const p of kids(tx, "p")) {
    const runs = [];
    for (const run of p.children) {
      if (run.localName !== "r" && run.localName !== "fld") continue;
      const t = first(run, "t");
      if (!t || !t.textContent) continue;
      runs.push({ text: t.textContent, ...styleOf(run, autofit) });
    }
    if (!runs.length) continue;
    const pr = first(p, "pPr");
    out.push({ runs, align: (pr && pr.getAttribute("algn")) || "" });
  }
  return out;
}

function textOf(node) {
  return node ? [...node.getElementsByTagName("*")].filter((el) => el.localName === "t").map((el) => el.textContent).join(" ") : "";
}

export async function openPptx(bytes) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);

  const order = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => num(a.replace(/\D+/g, "")) - num(b.replace(/\D+/g, "")));
  if (!order.length) throw new Error("no slides");

  let base = DEFAULT_SIZE;
  const pres = zip.file("ppt/presentation.xml");
  if (pres) {
    const xml = new DOMParser().parseFromString(await pres.async("string"), "application/xml");
    const size = first(xml.documentElement, "sldSz");
    if (size) base = { w: num(size.getAttribute("cx")) / EMU_PER_PX, h: num(size.getAttribute("cy")) / EMU_PER_PX };
  }

  const parsed = new Map();
  const media = new Map();

  async function relation(index, embed) {
    const file = zip.file(`ppt/slides/_rels/slide${index}.xml.rels`);
    if (!file || !embed) return null;
    const xml = new DOMParser().parseFromString(await file.async("string"), "application/xml");
    const hit = [...xml.getElementsByTagName("*")].find((el) => el.getAttribute("Id") === embed);
    const target = hit && hit.getAttribute("Target");
    if (!target) return null;
    return target.startsWith("../") ? `ppt/${target.slice(3)}` : target.replace(/^\//, "");
  }

  async function dataUrl(path) {
    if (media.has(path)) return media.get(path);
    const file = zip.file(path);
    if (!file) return null;
    const ext = String(path).split(".").pop().toLowerCase();
    const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", emf: "", wmf: "" }[ext] || "image/png";
    if (!mime) return null; // vector metafiles are not drawn here
    const url = `data:${mime};base64,${await file.async("base64")}`;
    media.set(path, url);
    return url;
  }

  async function slide(index) {
    if (parsed.has(index)) return parsed.get(index);
    const xml = new DOMParser().parseFromString(await zip.file(order[index]).async("string"), "application/xml");
    const tree = first(xml.documentElement, "cSld");
    const shapes = [];
    for (const node of tree ? kids(first(tree, "spTree") || tree, "*") : []) {
      const where = frame(node);
      if (node.localName === "sp" || node.localName === "grpSp") {
        const paras = paragraphs(node);
        if (paras.length) shapes.push({ kind: "text", where, paras });
      } else if (node.localName === "pic") {
        const blip = [...node.getElementsByTagName("*")].find((el) => el.localName === "blip");
        const path = blip && (await relation(index + 1, blip.getAttribute("r:embed") || blip.getAttribute("embed")));
        if (path) shapes.push({ kind: "image", where, path });
      } else if (node.localName === "graphicFrame") {
        const value = textOf(node);
        if (value.trim()) shapes.push({ kind: "text", where, paras: [{ runs: [{ text: value, size: 1400 }], align: "" }] });
      }
    }
    parsed.set(index, shapes);
    return shapes;
  }

  function block(paras, scale) {
    return paras.map((para) => {
      const p = document.createElement("p");
      p.className = "r-sline";
      if (para.align === "ctr") p.style.textAlign = "center";
      if (para.align === "r") p.style.textAlign = "right";
      for (const run of para.runs) {
        const span = document.createElement("span");
        span.textContent = run.text;
        span.style.fontSize = `${((run.size || 1800) / 100) * 1.3333 * scale}px`;
        span.style.fontWeight = run.bold ? "700" : "400";
        span.style.fontStyle = run.italic ? "italic" : "normal";
        if (run.color) span.style.color = run.color;
        p.append(span);
      }
      return p;
    });
  }

  async function paint(el, index, { scale, flow = false }) {
    const shapes = await slide(index);
    const width = base.w * scale;
    const height = base.h * scale;
    el.style.width = `${width}px`;
    el.style.height = flow ? "auto" : `${height}px`;
    el.classList.toggle("r-flow", flow);
    el.replaceChildren();
    for (const shape of shapes) {
      if (shape.kind === "image") {
        const url = await dataUrl(shape.path);
        if (!url) continue;
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        if (!flow && shape.where) {
          img.className = "r-abs";
          img.style.left = `${(shape.where.x / base.w) * 100}%`;
          img.style.top = `${(shape.where.y / base.h) * 100}%`;
          img.style.width = `${(shape.where.w / base.w) * 100}%`;
          img.style.height = `${(shape.where.h / base.h) * 100}%`;
        } else {
          img.className = "r-img";
        }
        el.append(img);
        continue;
      }
      const box = document.createElement("div");
      box.className = flow ? "r-blk" : "r-abs r-txt";
      if (!flow && shape.where) {
        box.style.left = `${(shape.where.x / base.w) * 100}%`;
        box.style.top = `${(shape.where.y / base.h) * 100}%`;
        box.style.width = `${(shape.where.w / base.w) * 100}%`;
        box.style.height = `${(shape.where.h / base.h) * 100}%`;
      }
      box.append(...block(shape.paras, scale));
      el.append(box);
    }
    return { width, height: flow ? el.offsetHeight : height };
  }

  return {
    kind: "paged",
    format: "pptx",
    count: order.length,
    canRotate: false,
    canSearch: true,
    canThumb: true,
    canPresent: true,
    box() {
      return { w: base.w, h: base.h, rot: 0 };
    },
    render: paint,
    async text(index) {
      const shapes = await slide(index);
      return shapes.filter((shape) => shape.kind === "text").flatMap((shape) => shape.paras.map((p) => p.runs.map((r) => r.text).join(""))).join("\n");
    },
    async thumb(el, index, width) {
      await paint(el, index, { scale: Math.max(width / base.w, 0.02) });
    },
    destroy() {
      parsed.clear();
      media.clear();
    }
  };
}
