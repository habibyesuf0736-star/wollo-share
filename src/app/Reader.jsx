import React, { useCallback, useEffect, useRef, useState } from "react";
import { docUri, dropDoc, sniffKind, takeDoc } from "./docs.js";
import { openDocument } from "./reader/index.js";
import "./reader.css";

/* One reader for every format the phone can draw on its own. It works from the bytes the
   offline store already holds, so a saved file opens with the radio off, and it never sends a
   document anywhere: the only thing that leaves the device is a share the student starts. */

const POS = (key) => `wollo_reader_pos_${key}`;
const MARKS = (key) => `wollo_reader_marks_${key}`;

function readJson(store, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(store));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(store, value) {
  try {
    localStorage.setItem(store, JSON.stringify(value));
  } catch {
    /* a full storage simply forgets the place */
  }
}

const lower = (value) => String(value || "").toLowerCase();

function countIn(text, needle) {
  const hay = lower(text);
  let at = 0;
  let n = 0;
  while ((at = hay.indexOf(needle, at)) >= 0) {
    n += 1;
    at += needle.length || 1;
  }
  return n;
}

// Light the matching chunks of an already drawn page — the text layer of a PDF or the words of
// a slide — without pulling the glyphs the student is reading out of place.
function markSheet(el, needle) {
  if (!el) return null;
  let first = null;
  for (const span of el.querySelectorAll("span, p, div")) {
    if (span.childElementCount && span.localName !== "img") continue;
    const hit = Boolean(needle) && lower(span.textContent).includes(needle);
    span.classList.toggle("r-hit", hit);
    span.classList.remove("r-now");
    if (hit && !first) first = span;
  }
  if (first) first.classList.add("r-now");
  return first;
}

// Same idea for a reflowed document, where the matches are real text nodes and get wrapped.
function markDom(host, needle) {
  if (!host) return [];
  for (const old of host.querySelectorAll("mark.r-hit")) {
    const parent = old.parentNode;
    parent.replaceChild(document.createTextNode(old.textContent), old);
    parent.normalize();
  }
  if (!needle) return [];
  const found = [];
  const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walk.nextNode()) nodes.push(walk.currentNode);
  for (const node of nodes) {
    const text = node.nodeValue;
    const hay = lower(text);
    if (!hay.includes(needle)) continue;
    const frag = document.createDocumentFragment();
    let at = 0;
    let from = 0;
    while ((at = hay.indexOf(needle, from)) >= 0) {
      if (at > from) frag.append(document.createTextNode(text.slice(from, at)));
      const mark = document.createElement("mark");
      mark.className = "r-hit";
      mark.textContent = text.slice(at, at + needle.length);
      frag.append(mark);
      found.push(mark);
      from = at + needle.length;
    }
    if (from < text.length) frag.append(document.createTextNode(text.slice(from)));
    node.parentNode.replaceChild(frag, node);
  }
  found[0]?.classList.add("r-now");
  return found;
}

function mimeOf(name) {
  const ext = lower(name).split(".").pop();
  return (
    {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      txt: "text/plain",
      html: "text/html"
    }[ext] || "application/octet-stream"
  );
}

export default function Reader({ t, entry, keep, onClose }) {
  const [phase, setPhase] = useState("load");
  const [error, setError] = useState("");
  const [engine, setEngine] = useState(null);
  const [format, setFormat] = useState(extOf(entry.name) || entry.type || "PDF");
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [flow, setFlow] = useState(false);
  const [page, setPage] = useState(0);
  const [night, setNight] = useState(() => localStorage.getItem("wollo_reader_night") === "1");
  const [open, setOpen] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [searching, setSearching] = useState(false);
  const [marks, setMarks] = useState(() => readJson(MARKS(entry.key), []));
  const [resume, setResume] = useState(null);
  const [present, setPresent] = useState(false);
  const [grid, setGrid] = useState(false);
  const [stored, setStored] = useState(false);

  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const flowRef = useRef(null);
  const sheetRef = useRef(null);
  const bytesRef = useRef(null);
  const shells = useRef([]);
  const painted = useRef(new Map());
  const search = useRef(0);
  const cells = useRef([]);
  const keepRef = useRef(keep);
  keepRef.current = keep;

  const reflow = Boolean(engine) && engine.kind === "flow";
  const paged = Boolean(engine) && engine.kind === "paged";
  const slides = engine?.format === "pptx";
  const count = engine ? engine.count : 0;

  /* ------------------------------------------------------------------- opening */

  const adopt = useCallback(
    async (bytes, kind) => {
      setError("");
      setPhase("load");
      try {
        const doc = await openDocument(kind, bytes);
        bytesRef.current = bytes;
        setFormat(kind.toUpperCase());
        painted.current = new Map();
        shells.current = [];
        cells.current = [];
        setEngine(doc);
        setPhase("ready");
        const saved = readJson(POS(entry.key), null);
        if (doc.kind === "paged" && saved?.page > 1 && saved.page < doc.count) setResume(saved.page - 1);
        return true;
      } catch {
        setError(DRAWABLE.includes(kind) ? t.readerCorrupt : t.readerUnsupported);
        setPhase("error");
        return false;
      }
    },
    [entry.key, t.readerCorrupt, t.readerUnsupported]
  );

  const fromStore = useCallback(async () => {
    const found = await takeDoc(entry.key);
    if (!found) return false;
    setStored(true);
    const kind = found.meta?.kind && found.meta.kind !== "zip" ? found.meta.kind : await sniffKind(found.bytes);
    return adopt(found.bytes, kind);
  }, [adopt, entry.key]);

  // Opening a file is one tap: the copy on the phone is read straight away, and a file that
  // is not there yet is pulled without being kept. Keeping a copy is the store's decision,
  // not the reader's — the server has to allow the file before a single byte is pulled.
  const fetchIt = async (store) => {
    setPhase("load");
    setError("");
    const got = await keepRef.current?.({ store });
    if (!got || got.error) {
      if (got?.error === "auth") {
        onClose();
        return false;
      }
      // Nothing arrived: the phone may simply be offline, so offer the copy again instead
      // of an error the student cannot act on. A file the reader cannot draw is different —
      // saying so is the only honest answer.
      if (got?.error === "unsupported") {
        setError(t.readerUnsupported);
        setPhase("error");
        return false;
      }
      setError("");
      setPhase("save");
      return false;
    }
    const ok = await adopt(got.bytes, got.kind);
    if (ok && store) setStored(true);
    return ok;
  };

  useEffect(() => {
    let live = true;
    (async () => {
      const ok = await fromStore();
      if (live && !ok) await fetchIt(false);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromStore]);

  useEffect(() => {
    if (!engine) return undefined;
    return () => engine.destroy();
  }, [engine]);

  /* --------------------------------------------------------------- page painting */

  const metrics = useCallback(() => {
    const host = scrollRef.current;
    if (!engine || !host) return { scale: 1, width: 0 };
    const box = engine.box(0);
    const turned = rotate % 180 !== 0;
    const natural = turned ? box.h : box.w;
    const fit = Math.max((host.clientWidth - 24) / natural, 0.08);
    return { scale: fit * zoom, width: natural * fit * zoom };
  }, [engine, rotate, zoom]);

  const paint = useCallback(
    async (index) => {
      if (!engine || engine.kind !== "paged") return;
      const shell = shells.current[index];
      if (!shell) return;
      const { scale } = metrics();
      const token = `${scale}|${rotate}|${flow}|${index}`;
      if (painted.current.get(index) === token) return;
      painted.current.set(index, token);
      if (painted.current.size > 14) {
        const oldest = painted.current.keys().next().value;
        painted.current.delete(oldest);
        const gone = shells.current[oldest];
        if (gone?.firstElementChild) gone.firstElementChild.replaceChildren();
      }
      const sheet = shell.firstElementChild;
      try {
        await engine.render(sheet, index, { scale, rotate, flow });
        if (query) markSheet(sheet, lower(query.trim()));
      } catch {
        /* one page that will not draw leaves its neighbours untouched */
      }
    },
    [engine, flow, metrics, query, rotate]
  );

  // Every sheet gets its own size before it is drawn, so the scrollbar and the page counter
  // are honest about a document that has not been painted yet.
  useEffect(() => {
    if (!engine) return;
    if (reflow) {
      const host = engine.host?.();
      if (host) host.style.zoom = String(zoom);
      return;
    }
    const { scale } = metrics();
    painted.current = new Map();
    for (const shell of shells.current) {
      if (!shell) continue;
      const box = engine.box(Number(shell.dataset.page));
      const turned = (rotate + (box.rot || 0)) % 180 !== 0;
      shell.style.width = `${(turned ? box.h : box.w) * scale}px`;
      shell.style.height = flow ? "auto" : `${(turned ? box.w : box.h) * scale}px`;
    }
    // A page that never leaves the screen does not cross the observer's border again, so
    // zooming or turning it would leave the old drawing inside a new-sized frame. What is
    // visible now is redrawn here rather than waiting for a scroll that may never come.
    const host = scrollRef.current;
    if (!host) return;
    const from = host.scrollTop - 60;
    const to = from + host.clientHeight + 660;
    for (const shell of shells.current) {
      if (!shell) continue;
      if (shell.offsetTop + shell.offsetHeight < from || shell.offsetTop > to) continue;
      paint(Number(shell.dataset.page));
    }
  }, [engine, flow, metrics, paint, reflow, rotate, zoom]);

  useEffect(() => {
    if (!engine || engine.kind !== "paged") return undefined;
    const io = new IntersectionObserver(
      (found) => {
        for (const item of found) if (item.isIntersecting) paint(Number(item.target.dataset.page));
      },
      { root: scrollRef.current, rootMargin: "600px 0px" }
    );
    for (const shell of shells.current) if (shell) io.observe(shell);
    return () => io.disconnect();
  }, [engine, paint]);

  useEffect(() => {
    if (engine && reflow) engine.renderAll?.(flowRef.current).catch?.(() => null);
  }, [engine, reflow]);

  /* ------------------------------------------------------------- position memory */

  const scrollTo = useCallback((index) => {
    const host = scrollRef.current;
    const shell = shells.current[index];
    if (host && shell) host.scrollTop = Math.max(shell.offsetTop - 10, 0);
  }, []);

  const track = useCallback(() => {
    if (!engine || engine.kind !== "paged") return;
    const host = scrollRef.current;
    if (!host) return;
    const mid = host.clientHeight / 2;
    let best = 0;
    for (let index = 0; index < shells.current.length; index += 1) {
      const shell = shells.current[index];
      if (shell && shell.offsetTop - host.scrollTop <= mid) best = index;
    }
    if (best !== page) setPage(best);
  }, [engine, page]);

  useEffect(() => {
    if (engine && paged) writeJson(POS(entry.key), { page: page + 1 });
  }, [engine, entry.key, page, paged]);

  /* --------------------------------------------------------------------- search */

  const runSearch = async (value) => {
    setQuery(value);
    const needle = lower(value).trim();
    const token = search.current + 1;
    search.current = token;
    if (!engine) return;
    if (!needle) {
      setHits([]);
      setCursor(0);
      if (reflow) markDom(engine.host?.(), "");
      else {
        for (const shell of shells.current) markSheet(shell?.firstElementChild, "");
      }
      return;
    }
    if (reflow) {
      const found = markDom(engine.host?.(), needle);
      setHits(found);
      setCursor(0);
      found[0]?.scrollIntoView({ block: "center" });
      return;
    }
    for (const shell of shells.current) markSheet(shell?.firstElementChild, needle);
    setSearching(true);
    const out = [];
    for (let index = 0; index < engine.count; index += 1) {
      const text = await engine.text(index).catch(() => "");
      if (search.current !== token) return;
      const times = countIn(text, needle);
      if (times) out.push({ page: index, times });
    }
    if (search.current !== token) return;
    setSearching(false);
    setHits(out);
    setCursor(0);
    if (out.length) scrollTo(out[0].page);
  };

  const step = (direction) => {
    if (!hits.length) return;
    const next = (cursor + direction + hits.length) % hits.length;
    setCursor(next);
    const hit = hits[next];
    if (reflow) hit?.scrollIntoView?.({ block: "center" });
    else {
      const target = typeof hit === "number" ? hit : hit.page;
      scrollTo(target);
      const sheet = shells.current[target]?.firstElementChild;
      if (sheet) markSheet(sheet, lower(query.trim()));
    }
  };

  /* ------------------------------------------------------------------ bookmarks */

  const writeMarks = (list) => {
    setMarks(list);
    writeJson(MARKS(entry.key), list);
  };

  const toggleMark = () => {
    if (!paged) return;
    writeMarks(marks.includes(page) ? marks.filter((item) => item !== page) : [...marks, page].sort((a, b) => a - b));
  };

  /* ---------------------------------------------------------------- page thumbs */

  useEffect(() => {
    if (!grid || !paged || !engine) return undefined;
    let live = true;
    (async () => {
      // Drawn one at a time: a forty-page burst of simultaneous renders would starve the page
      // the student is actually reading.
      for (let index = 0; index < cells.current.length; index += 1) {
        const cell = cells.current[index];
        if (!cell || cell.dataset.drawn === "1") continue;
        cell.dataset.drawn = "1";
        try {
          await engine.thumb(cell, index, 104);
        } catch {
          cell.remove();
        }
        if (!live) return;
      }
    })();
    return () => {
      live = false;
    };
  }, [engine, grid, paged]);

  /* ---------------------------------------------------------------- presentation */

  useEffect(() => {
    if (!present || !engine || !paged) return undefined;
    const host = sheetRef.current;
    if (!host) return undefined;
    const box = engine.box(page);
    const scale = Math.max(Math.min((window.innerWidth - 16) / box.w, (window.innerHeight - 130) / box.h), 0.1);
    engine.render(host, page, { scale }).catch(() => null);
    const key = (event) => {
      if (event.key === "ArrowRight" || event.key === " ") setPage((value) => Math.min(value + 1, engine.count - 1));
      if (event.key === "ArrowLeft") setPage((value) => Math.max(value - 1, 0));
      if (event.key === "Escape") setPresent(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [engine, page, paged, present]);

  /* ----------------------------------------------------------------- share/save */

  const blobOf = () => new Blob([bytesRef.current || new Uint8Array()], { type: mimeOf(entry.name) });

  const save = () => {
    const url = URL.createObjectURL(blobOf());
    const link = document.createElement("a");
    link.href = url;
    link.download = namedOf(entry.name, format);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const share = async () => {
    const uri = await docUri(entry.key);
    if (uri) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: entry.name, files: [uri], dialogTitle: t.readerShare }).catch(() => null);
      return;
    }
    const file = new File([blobOf()], namedOf(entry.name, format), { type: blobOf().type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: entry.name }).catch(() => null);
      return;
    }
    save();
  };

  const full = () => {
    const host = rootRef.current;
    if (!host) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => null);
    else host.requestFullscreen?.().catch(() => null);
  };

  const forget = async () => {
    await dropDoc(entry.key);
    onClose();
  };

  /* ----------------------------------------------------------------------- view */

  if (phase !== "ready") {
    return (
      <div className="rd" ref={rootRef}>
        <Bar t={t} name={entry.name} format={format} onClose={onClose} />
        {phase === "save" ? (
          <div className="rd-blank">
            <p className="a-title rd-ask">{t.readerOffline}</p>
            <p className="a-quiet">{entry.url ? t.readerKeep : t.readerMissing}</p>
            {error ? <p className="a-err">{error}</p> : null}
            <button type="button" className="a-btn primary" onClick={() => fetchIt(true)} disabled={!entry.url}>
              {t.readerKeep}
            </button>
          </div>
        ) : null}
        {phase === "error" ? (
          <div className="rd-blank">
            <p className="a-err">{error}</p>
            <button type="button" className="a-btn quiet" onClick={() => fetchIt(true)} disabled={!entry.url}>
              {t.readerRetry}
            </button>
            {entry.url ? (
              <button type="button" className="a-btn line" onClick={forget}>
                {t.cancel}
              </button>
            ) : null}
          </div>
        ) : null}
        {phase === "load" ? (
          <div className="rd-blank">
            <p className="a-quiet">{t.readerLoading}</p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`rd${night ? " rd-night" : ""}`} ref={rootRef}>
      <Bar
        t={t}
        name={entry.name}
        format={format}
        onClose={onClose}
        night={night}
        onNight={() => {
          localStorage.setItem("wollo_reader_night", night ? "0" : "1");
          setNight(!night);
        }}
        onFull={full}
      />

      <div className="rd-tools">
        <div className="rd-zoom">
          <button type="button" onClick={() => setZoom((v) => Math.max(0.5, Number((v - 0.2).toFixed(2))))}>
            A<span className="rd-dim">−</span>
          </button>
          <button type="button" className="rd-fit" onClick={() => { setZoom(1); setRotate(0); }}>
            {t.readerFit}
          </button>
          <button type="button" onClick={() => setZoom((v) => Math.min(4, Number((v + 0.2).toFixed(2))))}>
            A<span className="rd-dim">+</span>
          </button>
        </div>
        <button type="button" className={`rd-tool${open === "find" ? " on" : ""}`} onClick={() => setOpen(open === "find" ? "" : "find")}>
          <Find />
          {t.readerSearch}
        </button>
        {engine.canRotate ? (
          <button type="button" className="rd-tool" onClick={() => setRotate((value) => (value + 90) % 360)}>
            <Turn />
            {t.readerRotate}
          </button>
        ) : null}
        {slides ? (
          <button type="button" className="rd-tool" onClick={() => setFlow(!flow)}>
            {flow ? t.readerLayout : t.readerFlow}
          </button>
        ) : null}
        {paged && engine.canThumb ? (
          <button type="button" className={`rd-tool${grid ? " on" : ""}`} onClick={() => setGrid(!grid)}>
            {t.readerGrid}
          </button>
        ) : null}
        {engine.canPresent ? (
          <button type="button" className="rd-tool" onClick={() => setPresent(true)}>
            {t.readerSlides}
          </button>
        ) : null}
      </div>

      {open === "find" ? (
        <div className="rd-find">
          <input value={query} onChange={(event) => runSearch(event.target.value)} placeholder={t.readerSearch} aria-label={t.readerSearch} />
          <span>{searching ? t.readerLoading : hits.length ? `${cursor + 1}/${hits.length}` : query.trim().length > 1 ? t.readerNone : ""}</span>
          <button type="button" onClick={() => step(-1)} disabled={!hits.length} aria-label={t.back}>
            ‹
          </button>
          <button type="button" onClick={() => step(1)} disabled={!hits.length} aria-label={t.next}>
            ›
          </button>
        </div>
      ) : null}

      {grid && paged ? (
        <div className="rd-grid">
          {Array.from({ length: Math.min(count, 60) }, (_, index) => (
            <button
              type="button"
              key={index}
              className={index === page ? "on" : ""}
              onClick={() => {
                scrollTo(index);
                setGrid(false);
              }}
              aria-label={`${t.readerPage} ${index + 1}`}
            >
              <span
                ref={(el) => {
                  cells.current[index] = el;
                }}
              />
              <em>{index + 1}</em>
            </button>
          ))}
        </div>
      ) : null}

      {slides && !flow ? <p className="rd-note">{t.readerPptNote}</p> : null}

      {present ? (
        <div className="rd-present" onClick={() => setPage((value) => Math.min(value + 1, engine.count - 1))}>
          <div className="rd-sheet" ref={sheetRef} />
          <div className="rd-hud">
            <button type="button" onClick={(event) => { event.stopPropagation(); setPage((value) => Math.max(value - 1, 0)); }}>
              {t.back}
            </button>
            <span>
              {page + 1} / {engine.count}
            </span>
            <button type="button" onClick={(event) => { event.stopPropagation(); setPresent(false); }}>
              {t.readerExit}
            </button>
          </div>
        </div>
      ) : (
        <div className="rd-scroll" ref={scrollRef} onScroll={track}>
          {paged ? (
            <div className="rd-pages">
              {Array.from({ length: count }, (_, index) => (
                <div
                  key={index}
                  className="rd-page"
                  data-page={index}
                  ref={(el) => {
                    shells.current[index] = el;
                  }}
                >
                  <div className="rd-sheet" />
                </div>
              ))}
            </div>
          ) : (
            <div className="rd-flow" ref={flowRef} />
          )}
        </div>
      )}

      {resume !== null ? (
        <div className="rd-chip">
          <button
            type="button"
            onClick={() => {
              scrollTo(resume);
              setPage(resume);
              setResume(null);
            }}
          >
            {t.readerResume} · {t.readerPage} {resume + 1}
          </button>
          <button type="button" onClick={() => setResume(null)} aria-label={t.cancel}>
            ×
          </button>
        </div>
      ) : null}

      <footer className="rd-foot">
        {paged ? (
          <>
            <button type="button" onClick={() => scrollTo(Math.max(page - 1, 0))} aria-label={t.back}>
              ‹
            </button>
            <span>
              {t.readerPage} {page + 1} {t.readerOf} {count}
            </span>
            <button type="button" onClick={() => scrollTo(Math.min(page + 1, count - 1))} aria-label={t.next}>
              ›
            </button>
            <button type="button" className={marks.includes(page) ? "on" : ""} onClick={toggleMark}>
              <Book />
              {t.readerMark}
            </button>
          </>
        ) : null}
        <button type="button" onClick={share}>
          <Send />
          {t.readerShare}
        </button>
        {stored ? (
          <button type="button" onClick={forget}>
            {t.remove}
          </button>
        ) : (
          <button type="button" onClick={() => fetchIt(true)} disabled={!entry.url}>
            {t.readerKeep}
          </button>
        )}
        {typeof window !== "undefined" && !window.Capacitor?.isNativePlatform?.() ? (
          <button type="button" onClick={save}>
            {t.download}
          </button>
        ) : null}
        <button type="button" onClick={onClose}>
          {t.back}
        </button>
      </footer>

      {marks.length && paged ? (
        <div className="rd-marks">
          <p className="a-label">{t.readerMarks}</p>
          {marks.map((item) => (
            <button type="button" key={item} onClick={() => scrollTo(item)}>
              {t.readerPage} {item + 1}
              <span
                role="button"
                aria-label={t.remove}
                onClick={(event) => {
                  event.stopPropagation();
                  writeMarks(marks.filter((value) => value !== item));
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------------- chrome */

function Bar({ t, name, format, onClose, night, onNight, onFull }) {
  return (
    <header className="rd-bar">
      <button type="button" className="rd-x" onClick={onClose} aria-label={t.back}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M15 5.5 8 12l7 6.5" />
        </svg>
      </button>
      <div className="rd-name">
        <strong>{name}</strong>
        <em>{format}</em>
      </div>
      {onNight ? (
        <button type="button" className={`rd-x${night ? " on" : ""}`} onClick={onNight} aria-pressed={night} aria-label={t.theme}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.6 8.6 0 1 0 10.4 10.4Z" />
          </svg>
        </button>
      ) : null}
      {onFull ? (
        <button type="button" className="rd-x" onClick={onFull} aria-label={t.readerFull}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M9 4.5H4.5V9M15 4.5h4.5V9M9 19.5H4.5V15M15 19.5h4.5V15" />
          </svg>
        </button>
      ) : null}
    </header>
  );
}

const Find = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.2" />
    <path d="M15.4 15.4 20 20" />
  </svg>
);

const Turn = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M19 12a7 7 0 1 1-2.6-5.4M19.5 4v4.2h-4.2" />
  </svg>
);

const Book = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M6.5 3h11v18l-5.5-3.7L6.5 21z" />
  </svg>
);

const Send = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 16V4.5m0 0L8.4 8.1M12 4.5l3.6 3.6M5 14v5.5h14V14" />
  </svg>
);

function extOf(name) {
  const ext = lower(name).split(".").pop();
  return ["pdf", "docx", "pptx", "txt", "html"].includes(ext) ? ext.toUpperCase() : "";
}

function namedOf(name, format) {
  return /\.(pdf|docx|pptx|txt|html)$/i.test(name) ? name : `${name || "document"}.${String(format).toLowerCase()}`;
}

// What the reader can draw. A file outside this list is refused in words, never half-read.
const DRAWABLE = ["pdf", "docx", "pptx", "text", "html"];
