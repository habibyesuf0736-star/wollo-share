import React, { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { PLANS } from "../lib/plans.js";
import { FRESHMAN_DEPARTMENT, buildDepartmentGroups, matchDepartmentPrograms } from "../lib/departments.js";
import { phoneFromLocal, phoneLocalDigits, phoneProblem, triggerBrowserDownload } from "../lib/utils.js";
import { requestPremiumPlan, requestRecovery, resendVerificationCode } from "../lib/api.js";
import { addToRecent, clearRecent, fileKey, listRecent, listShelf, loadLibrary, removeFromShelf, saveLibrary, toggleShelf, when } from "../mobile/local.js";
import { COPY } from "./strings.js";
import { APP_VERSION } from "./version.js";

/* ---------------------------------------------------------------------- icons */

const PATHS = {
  home: "M3 10.6 12 4l9 6.6V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  search: "M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm4.7 11.8L20 20.6",
  shelf: "M5 4.5h5.5v15L7.75 16.6 5.5 19.5Zm9 0h5.5v15l-2.75-2.9-2.75 2.9Z",
  saved: "M6.5 3h11v18l-5.5-3.7L6.5 21z",
  account: "M12 4.5a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6ZM4.8 20.4c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6",
  chevron: "M6 9.5 12 15l6-5.5",
  next: "M9.5 5.5 16 12l-6.5 6.5",
  close: "M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5",
  back: "M15 5.5 8 12l7 6.5",
  down: "M12 4v10.5m0 0-3.8-3.8m3.8 3.8 3.8-3.8M5 19.5h14",
  open: "M7 17 17.2 6.8M8.4 6.8h8.8v8.8",
  star: "M12 3.6l2.6 5.5 5.9.8-4.3 4.2 1 6-5.2-2.8-5.2 2.8 1-6L3.5 9.9l5.9-.8z",
  note: "M4.5 6.5h15v10h-9l-4 3.5v-3.5h-2z",
  refresh: "M19 12a7 7 0 1 1-2.6-5.4M19.5 4v4.2h-4.2",
  clock: "M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15Zm0 3.6V12l3.2 2",
  lock: "M7.5 10.5h9v8h-9zM9.7 10.5V8a2.3 2.3 0 0 1 4.6 0v2.5",
  crown: "M4 17.5h16M4.5 7l3.5 3 4-5.5 4 5.5 3.5-3-1.4 8H5.9z",
  wifi: "M4.5 9.8a11 11 0 0 1 15 0M7.6 13.2a6.6 6.6 0 0 1 8.8 0M12 17.4h.01"
};

function Icon({ name, size = 20, fill = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

function Face({ src }) {
  return (
    <span className="a-face" aria-hidden="true">
      {src ? <img src={src} alt="" onError={(event) => (event.currentTarget.style.display = "none")} /> : <Icon name="account" size={20} />}
    </span>
  );
}

/* ------------------------------------------------------------------- version */

function outdated(current, minimum) {
  const want = String(minimum || "").split(".").map((part) => Number(part) || 0);
  const have = String(current).split(".").map((part) => Number(part) || 0);
  for (let i = 0; i < Math.max(want.length, have.length); i += 1) {
    const a = have[i] || 0;
    const b = want[i] || 0;
    if (a !== b) return a < b;
  }
  return false;
}

/* --------------------------------------------------------------------- shell */

export default function AppShell() {
  const { booting, appSettings, appearanceSettings, gate, closeGate, toast, toasts } = useApp();
  const [lang, setLang] = useState(() => localStorage.getItem("wollo_app_lang") || "en");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("wollo_app_theme") || appSettings.theme || "auto"
  );
  const [tab, setTab] = useState("home");

  useEffect(() => {
    localStorage.setItem("wollo_app_lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
  }, [lang]);

  // The administrator's default appearance steers a phone until its owner picks one.
  useEffect(() => {
    if (localStorage.getItem("wollo_app_theme")) return;
    setTheme(appSettings.theme || "auto");
  }, [appSettings.theme]);

  const chooseTheme = (next) => {
    localStorage.setItem("wollo_app_theme", next);
    setTheme(next);
  };

  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.aTheme = theme === "dark" || (theme === "auto" && prefersDark.matches) ? "dark" : "light";
    };
    apply();
    if (theme !== "auto") return undefined;
    prefersDark.addEventListener("change", apply);
    return () => prefersDark.removeEventListener("change", apply);
  }, [theme]);

  // The app wears its own colour when the administrator picks one, and the site's accent
  // otherwise — the surface stays legible before the state document has even arrived.
  useEffect(() => {
    const accent = appSettings.accent || appearanceSettings.primaryColor || "#1d624f";
    const rgb = rgbOf(accent);
    if (!rgb) return;
    paintAccent(accent, rgb);
  }, [appSettings.accent, appearanceSettings.primaryColor]);

  // A download that stopped at the door continues the moment the student is signed in.
  useEffect(() => {
    if (gate && gate.type === "register") {
      setTab("account");
      closeGate();
    }
  }, [closeGate, gate]);

  const t = COPY[lang] || COPY.en;

  if (appSettings.enabled === false) return <OffScreen t={t} />;
  if (outdated(APP_VERSION, appSettings.minimumVersion)) return <UpdateScreen t={t} url={appSettings.updateUrl} />;
  if (booting) return <Loading t={t} />;

  return (
    <>
      {tab === "home" ? <Home t={t} go={setTab} /> : null}
      {tab === "browse" ? <Browse t={t} /> : null}
      {tab === "saved" ? <Saved t={t} /> : null}
      {tab === "account" ? <Account t={t} lang={lang} onLang={setLang} theme={theme} onTheme={chooseTheme} go={setTab} /> : null}

      <nav className="a-dock" aria-label={t.brand}>
        {[
          ["home", t.home, "home"],
          ["browse", t.browse, "search"],
          ["saved", t.saved, "shelf"],
          ["account", t.account, "account"]
        ].map(([key, label, icon]) => (
          <button key={key} type="button" className={tab === key ? "on" : ""} onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined}>
            <Icon name={icon} size={19} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {gate && gate.type === "ad" ? <AdSheet t={t} /> : null}
      {gate && gate.type === "upgrade" ? <UpgradeSheet t={t} onPlans={() => setTab("account")} /> : null}

      <div aria-live="polite">
        {(toasts || []).map((item) => (
          <p className="a-toast" key={item.id}>
            {item.message}
          </p>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- accent paint */

function rgbOf(hex) {
  const raw = String(hex || "").replace("#", "");
  if (raw.length !== 6) return null;
  return [0, 2, 4].map((at) => parseInt(raw.slice(at, at + 2), 16));
}

// White or ink on the administrator's colour, decided by its own relative luminance — and a
// matching amount of the same colour pulled back for text, because a pale accent written on
// paper is unreadable and a dark one on a dark screen is worse.
function paintAccent(accent, rgb) {
  const lin = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  const clamp = (n) => Math.max(30, Math.min(100, Math.round(n)));
  const style = document.documentElement.style;
  style.setProperty("--a-accent", accent);
  style.setProperty("--a-on-accent", lum > 0.45 ? "#14171a" : "#ffffff");
  style.setProperty("--a-keep-on-paper", `${clamp((0.2 / Math.max(lum, 0.02)) * 100)}%`);
  style.setProperty("--a-keep-on-night", `${clamp(100 - (0.35 - lum) * 160)}%`);
}

function Loading({ t }) {
  return (
    <main className="a">
      <header className="a-head">
        <div>
          <p className="a-eyebrow">{t.brand}</p>
          <h1 className="a-title">{t.loading}</h1>
        </div>
        <span className="a-mark" aria-hidden="true">W</span>
      </header>
      {[0, 1, 2, 3].map((row) => (
        <div className="a-skeleton" key={row} />
      ))}
    </main>
  );
}

function OffScreen({ t }) {
  return (
    <div className="a-stand">
      <p className="a-eyebrow">{t.brand}</p>
      <h1 className="a-title" style={{ marginTop: 8 }}>
        {t.off}
      </h1>
      <p className="a-lede">{t.offBody}</p>
      <button className="a-btn primary" style={{ marginTop: 26 }} onClick={() => window.open("https://wollo-share.vercel.app", "_blank")}>
        {t.offBtn}
        <Icon name="open" size={16} />
      </button>
    </div>
  );
}

function UpdateScreen({ t, url }) {
  return (
    <div className="a-stand">
      <p className="a-eyebrow">{t.brand}</p>
      <h1 className="a-title" style={{ marginTop: 8 }}>
        {t.updateTitle}
      </h1>
      <p className="a-lede">{t.updateBody}</p>
      <button className="a-btn primary" style={{ marginTop: 26 }} onClick={() => window.open(url || "https://wollo-share.vercel.app", "_blank")}>
        {t.updateBtn}
        <Icon name="open" size={16} />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- home */

function Home({ t, go }) {
  const { session, activeUser, coursesData, canSeeCourse, appSettings, downloadPolicy, downloadStatus } = useApp();
  const [shelf] = useState(() => listShelf());
  const [recent] = useState(() => listRecent());
  const department = String(activeUser?.department || "").trim();
  const live = useMemo(() => coursesData.filter((c) => canSeeCourse(c)), [canSeeCourse, coursesData]);
  const mine = useMemo(() => matchDepartmentPrograms(live, department), [department, live]);
  const files = useMemo(() => live.reduce((total, course) => total + (course.materials || []).filter((m) => !m.hidden).length, 0), [live]);

  const first = String(session?.name || activeUser?.name || "").trim().split(" ")[0];
  const total = shelf.length + recent.length;
  const notice = String(appSettings.message || "").trim();

  return (
    <main className="a">
      <header className="a-head">
        <div>
          <p className="a-eyebrow">{first ? t.hi : t.brand}</p>
          <h1 className="a-title">{first || t.brand}</h1>
        </div>
        <Face src={activeUser?.photoUrl || session?.photoUrl} />
      </header>

      <p className="a-lede">{appSettings.welcome}</p>

      <div className="a-actions">
        <button className="a-btn primary" onClick={() => go("browse")}>
          <Icon name="search" size={17} />
          {t.browse}
        </button>
        <button className="a-btn quiet" onClick={() => go("saved")}>
          <Icon name="shelf" size={17} />
          {t.saved}
          <em>{total}</em>
        </button>
      </div>

      {notice ? (
        <div className="a-notice">
          <Icon name="note" size={17} />
          <p>{notice}</p>
        </div>
      ) : null}

      <p className="a-stats">
        <span>
          <b>{live.length}</b> {t.courses}
        </span>
        <span>
          <b>{files}</b> {t.files}
        </span>
        <span className={downloadStatus.premium ? "on" : ""}>
          <b>{downloadStatus.premium ? t.premium : t.free}</b>
          {!downloadStatus.premium && downloadStatus.credits !== undefined ? ` · ${downloadStatus.credits} ${t.credits}` : ""}
        </span>
      </p>

      {!session ? (
        <button className="a-btn line" onClick={() => go("account")}>
          {t.signin}
          <Icon name="next" size={16} />
        </button>
      ) : null}

      {mine.length ? (
        <>
          <h2 className="a-label">{t.myCourses}</h2>
          <div className="a-strip">
            {mine.slice(0, 8).map((course) => (
              <button className="a-card" key={course.id} onClick={() => go("browse")}>
                <span className="a-badge">{short(course.name)}</span>
                <strong>{course.name}</strong>
                <em>
                  {filesOf(course).length} {t.files}
                </em>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {recent.length ? (
        <>
          <h2 className="a-label">{t.recent}</h2>
          <div className="a-panel">
            {recent.slice(0, 4).map((entry) => (
              <button className="a-item" key={entry.key} onClick={() => openSaved(entry)}>
                <span className="a-badge">{ext(entry.type)}</span>
                <span className="a-main">
                  <strong>{entry.name}</strong>
                  <em>{entry.course}</em>
                </span>
                <span className="a-side">{when(entry.at)}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}

/* -------------------------------------------------------------------- browse */

function Browse({ t }) {
  const { session, activeUser, coursesData, canSeeCourse, requestDownload } = useApp();
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState("mine");
  const [open, setOpen] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [shelf, setShelf] = useState(() => listShelf());
  const [recent, setRecent] = useState(() => listRecent());
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [saved, setSaved] = useState(() => loadLibrary());
  const department = String(activeUser?.department || "").trim();

  const live = useMemo(() => coursesData.filter((c) => canSeeCourse(c)), [canSeeCourse, coursesData]);
  const visible = online ? live : saved?.list || live;

  useEffect(() => {
    window.__WS_ON_DOWNLOAD__ = (file) => {
      addToRecent({ ...file, key: fileKey(file.courseId, file.materialId, file.sideMaterialId || "") });
      setRecent(listRecent());
    };
    return () => delete window.__WS_ON_DOWNLOAD__;
  }, []);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    if (!online || !live.length) return;
    const at = saveLibrary(live);
    if (at) setSaved({ at, list: live });
  }, [online, live]);

  const shelfKeys = useMemo(() => new Set(shelf.map((item) => item.key)), [shelf]);
  const recentKeys = useMemo(() => new Set(recent.map((item) => item.key)), [recent]);
  const mineIds = useMemo(() => new Set(matchDepartmentPrograms(visible, department).map((c) => c.id)), [department, visible]);
  const needle = query.trim().toLowerCase();

  const shown = useMemo(
    () =>
      visible.filter((course) => {
        if (only === "mine" && department && !mineIds.has(course.id)) return false;
        if (!needle) return true;
        return (
          String(course.name || "").toLowerCase().includes(needle) ||
          (course.materials || []).some((mat) => String(mat.name || "").toLowerCase().includes(needle))
        );
      }),
    [department, mineIds, needle, only, visible]
  );

  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const star = (course, mat, side) => {
    const file = side || mat;
    toggleShelf({
      key: fileKey(course.id, mat.id, side ? side.id : ""),
      name: file.name,
      course: course.name,
      courseId: course.id,
      materialId: mat.id,
      sideMaterialId: side ? side.id : "",
      type: file.type,
      size: file.size,
      url: file.url && !String(file.url).startsWith("#sample") ? file.url : ""
    });
    setShelf(listShelf());
  };

  return (
    <main className="a">
      <header className="a-head">
        <div>
          <p className="a-eyebrow">{t.brand}</p>
          <h1 className="a-title">{t.browse}</h1>
        </div>
        <Face src={activeUser?.photoUrl || session?.photoUrl} />
      </header>

      {!online ? (
        <p className="a-flag">
          <Icon name="wifi" size={15} /> {t.offline}
        </p>
      ) : null}

      <div className="a-search">
        <Icon name="search" size={17} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.find} aria-label={t.find} />
        {query ? (
          <button type="button" className="a-clear" onClick={() => setQuery("")} aria-label={t.clear}>
            <Icon name="close" size={15} />
          </button>
        ) : null}
      </div>

      {department ? (
        <div className="a-chips" role="tablist">
          <button className={`a-chip${only === "mine" ? " on" : ""}`} onClick={() => setOnly("mine")}>
            {t.myCourses}
          </button>
          <button className={`a-chip${only === "all" ? " on" : ""}`} onClick={() => setOnly("all")}>
            {t.otherCourses}
          </button>
        </div>
      ) : null}

      <p className="a-count-line">
        {shown.length} {t.courses}
      </p>

      <div className="a-panel">
        {shown.map((course) => {
          const expanded = open.has(course.id);
          const mats = filesOf(course);
          return (
            <div key={course.id} className={expanded ? "a-open" : ""}>
              <button className="a-item" onClick={() => toggle(course.id)} aria-expanded={expanded}>
                <span className="a-badge">{short(course.name)}</span>
                <span className="a-main">
                  <strong>{course.name}</strong>
                  <em>
                    {mats.length} {t.files} · {course.college || department || t.brand}
                  </em>
                </span>
                <span className="a-side">
                  <Icon name="chevron" size={17} />
                </span>
              </button>
              {expanded ? (
                <div className="a-files">
                  {mats.map((mat) => (
                    <FileRow
                      t={t}
                      key={mat.id}
                      course={course}
                      mat={mat}
                      shelfKeys={shelfKeys}
                      recentKeys={recentKeys}
                      onOpen={() => setDetail({ course, mat })}
                      onTake={() => requestDownload(course.id, mat.id, "")}
                      onStar={() => star(course, mat)}
                    />
                  ))}
                  {mats.flatMap((mat) =>
                    (mat.sideMaterials || [])
                      .filter((side) => !side.hidden)
                      .map((side) => (
                        <FileRow
                          t={t}
                          key={`${mat.id}-${side.id}`}
                          course={course}
                          mat={mat}
                          side={side}
                          shelfKeys={shelfKeys}
                          recentKeys={recentKeys}
                          onOpen={() => setDetail({ course, mat, side })}
                          onTake={() => requestDownload(course.id, mat.id, side.id)}
                          onStar={() => star(course, mat, side)}
                        />
                      ))
                  )}
                  {!mats.length ? <p className="a-quiet">{t.none}</p> : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {!shown.length ? <p className="a-quiet">{t.none}</p> : null}
      </div>

      {detail ? (
        <FileSheet
          t={t}
          course={detail.course}
          mat={detail.mat}
          side={detail.side}
          starred={shelfKeys.has(fileKey(detail.course.id, detail.mat.id, detail.side ? detail.side.id : ""))}
          onClose={() => setDetail(null)}
          onTake={() => {
            requestDownload(detail.course.id, detail.mat.id, detail.side ? detail.side.id : "");
            setDetail(null);
          }}
          onStar={() => {
            star(detail.course, detail.mat, detail.side);
            setDetail(null);
          }}
        />
      ) : null}
    </main>
  );
}

function FileRow({ t, course, mat, side, shelfKeys, recentKeys, onOpen, onTake, onStar }) {
  const file = side || mat;
  const key = fileKey(course.id, mat.id, side ? side.id : "");
  const meta = side ? mat.name : [mat.type, mat.size].filter(Boolean).join(" · ");
  const taken = recentKeys.has(key);
  const kept = shelfKeys.has(key);
  return (
    <div className="a-item">
      <button className="a-main" onClick={onOpen} style={{ textAlign: "left" }}>
        <strong>{file.name}</strong>
        <em>{meta}</em>
      </button>
      <button className={`a-act${kept ? " on" : ""}`} onClick={onStar} aria-label={kept ? t.remove : t.keep} aria-pressed={kept} type="button">
        <Icon name="saved" size={16} fill={kept} />
      </button>
      <button className="a-btn row" onClick={onTake}>
        {taken || opensFile(file) ? t.open : t.download}
        <Icon name={taken || opensFile(file) ? "open" : "down"} size={15} />
      </button>
    </div>
  );
}

function Sheet({ t, eyebrow, title, onClose, children }) {
  // A sheet is the only thing on screen while it is open, so the page behind it stops moving.
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, []);

  return (
    <div className="a-scrim" onClick={onClose} role="presentation">
      <section className="a-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <span className="a-handle" aria-hidden="true" />
        <div className="a-shead">
          <div>
            {eyebrow ? <p className="a-eyebrow">{eyebrow}</p> : null}
            <h2 className="a-stitle">{title}</h2>
          </div>
          <button className="a-close" onClick={onClose} aria-label={t.cancel} type="button">
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function FileSheet({ t, course, mat, side, starred, onClose, onTake, onStar }) {
  const { rateMaterial, myRatingFor, appSettings } = useApp();
  const file = side || mat;
  const mine = myRatingFor(mat.id) || 0;
  const [stars, setStars] = useState(mine);
  const avg = Number(mat.ratingAvg || 0).toFixed(1);
  return (
    <Sheet t={t} eyebrow={course.name} title={file.name} onClose={onClose}>
      <p className="a-quiet" style={{ marginTop: 0 }}>
        {[file.type, file.size].filter(Boolean).join(" · ")}
        {mat.ratingCount ? ` · ${avg}★ ${mat.ratingCount}` : ""}
      </p>
      <button className="a-btn primary" onClick={onTake}>
        {opensFile(file) ? t.open : t.download}
        <Icon name={opensFile(file) ? "open" : "down"} size={17} />
      </button>
      <button className="a-btn quiet" onClick={onStar}>
        <Icon name="saved" size={16} fill={starred} />
        {starred ? t.remove : t.keep}
      </button>
      {appSettings.showRatings === false ? null : (
        <>
          <h2 className="a-label" style={{ marginTop: 24 }}>
            {t.rate}
          </h2>
          <div className="a-stars">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                type="button"
                key={value}
                className={value <= stars ? "on" : ""}
                onClick={() => {
                  setStars(value);
                  rateMaterial(course.id, mat.id, value);
                }}
                aria-label={`${value}`}
                aria-pressed={value <= stars}
              >
                <Icon name="star" size={22} fill={value <= stars} />
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

/* --------------------------------------------------------------------- saved */

function Saved({ t }) {
  const { refreshFromServer } = useApp();
  const [shelf, setShelf] = useState(() => listShelf());
  const [recent, setRecent] = useState(() => listRecent());
  const [saved, setSaved] = useState(() => loadLibrary());
  const [online, setOnline] = useState(() => navigator.onLine !== false);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  return (
    <main className="a">
      <header className="a-head">
        <div>
          <p className="a-eyebrow">{online ? (saved?.at ? `${t.savedAt} · ${when(saved.at)}` : t.brand) : t.offline}</p>
          <h1 className="a-title">{t.saved}</h1>
        </div>
        <button className="a-close" onClick={() => refreshFromServer()} aria-label={t.refresh} type="button">
          <Icon name="refresh" size={16} />
        </button>
      </header>

      <h2 className="a-label">{t.starred}</h2>
      <div className="a-panel">
        {shelf.map((entry) => (
          <div className="a-item" key={entry.key}>
            <button className="a-main" onClick={() => openSaved(entry)} style={{ textAlign: "left" }}>
              <strong>{entry.name}</strong>
              <em>{entry.course}</em>
            </button>
            <span className="a-side">{when(entry.savedAt)}</span>
            <button
              className="a-act"
              onClick={() => {
                removeFromShelf(entry.key);
                setShelf(listShelf());
              }}
              aria-label={t.remove}
              type="button"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
        {!shelf.length ? <p className="a-quiet">{t.noneStarred}</p> : null}
      </div>

      <h2 className="a-label">{t.downloads}</h2>
      <div className="a-panel">
        {recent.map((entry) => (
          <div className="a-item" key={entry.key}>
            <button className="a-main" onClick={() => openSaved(entry)} style={{ textAlign: "left" }}>
              <strong>{entry.name}</strong>
              <em>{entry.course}</em>
            </button>
            <span className="a-side">{when(entry.at)}</span>
            <button className="a-act" onClick={() => openSaved(entry)} aria-label={t.open} type="button">
              <Icon name="open" size={16} />
            </button>
          </div>
        ))}
        {!recent.length ? <p className="a-quiet">{t.noneRecent}</p> : null}
      </div>
      {recent.length ? (
        <button
          className="a-btn line"
          onClick={() => {
            clearRecent();
            setRecent([]);
          }}
        >
          {t.clear}
        </button>
      ) : null}
    </main>
  );
}

/* ------------------------------------------------------------------- account */

function Prefs({ t, lang, onLang, theme, onTheme }) {
  return (
    <>
      <h2 className="a-label">{t.lang}</h2>
      <div className="a-seg" role="group">
        {[
          ["en", "EN"],
          ["am", "አማ"]
        ].map(([key, label]) => (
          <button key={key} className={`a-segbtn${lang === key ? " on" : ""}`} onClick={() => onLang(key)} aria-pressed={lang === key} type="button">
            {label}
          </button>
        ))}
      </div>

      <h2 className="a-label">{t.theme}</h2>
      <div className="a-seg" role="group">
        {[
          ["auto", t.auto],
          ["light", t.light],
          ["dark", t.dark]
        ].map(([key, label]) => (
          <button key={key} className={`a-segbtn${theme === key ? " on" : ""}`} onClick={() => onTheme(key)} aria-pressed={theme === key} type="button">
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

function Account({ t, lang, onLang, theme, onTheme, go }) {
  const { session, activeUser, downloadStatus, downloadPolicy, logout, isStaff, appSettings, toast } = useApp();
  const [premium, setPremium] = useState(false);
  if (!session) return <Auth t={t} lang={lang} onLang={onLang} theme={theme} onTheme={onTheme} />;

  const department = String(activeUser?.department || "").trim();
  const name = String(activeUser?.name || session.name || t.brand).trim();
  const rows = [
    [t.email, activeUser?.email || session.email],
    department ? [t.department, department] : null,
    [t.plan, downloadStatus.badgeText || (downloadStatus.premium ? t.premium : t.free)],
    !downloadStatus.premium && downloadPolicy.mode === "credits" ? [t.credits, downloadStatus.credits] : null
  ].filter(Boolean);

  return (
    <main className="a">
      <header className="a-head">
        <div>
          <p className="a-eyebrow">{t.hi}</p>
          <h1 className="a-title">{name.split(" ")[0]}</h1>
        </div>
        <Face src={activeUser?.photoUrl || session.photoUrl} />
      </header>

      <div className="a-panel">
        {rows.map(([label, value]) => (
          <div className="a-kv" key={label}>
            <span>{label}</span>
            <b>{String(value ?? "")}</b>
          </div>
        ))}
      </div>

      <Prefs t={t} lang={lang} onLang={onLang} theme={theme} onTheme={onTheme} />

      {appSettings.hidePremium ? null : (
        <button className="a-btn primary" onClick={() => setPremium(true)}>
          <Icon name="crown" size={17} />
          {t.choose}
        </button>
      )}

      {isStaff ? (
        <button
          className="a-btn quiet"
          onClick={() => {
            toast(t.staffNote);
            window.open("https://wollo-share.vercel.app/admin", "_blank");
          }}
        >
          {t.openAdmin}
          <Icon name="open" size={16} />
        </button>
      ) : null}

      <button className="a-btn quiet" onClick={() => go("saved")}>
        <Icon name="shelf" size={16} />
        {t.saved}
      </button>

      <button
        className="a-btn line"
        onClick={() => {
          logout();
          go("home");
        }}
      >
        {t.signout}
      </button>

      {premium ? <PremiumSheet t={t} onClose={() => setPremium(false)} /> : null}
    </main>
  );
}

function PremiumSheet({ t, onClose }) {
  const { session, pageTexts, toast } = useApp();
  const [plan, setPlan] = useState(PLANS[0].key);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pay = String(pageTexts.premiumPayment || "").trim();

  const send = async () => {
    setError("");
    setBusy(true);
    const res = await requestPremiumPlan(plan, reference.trim(), session.authToken);
    setBusy(false);
    if (!res || res.ok !== true) return setError((res && res.error) || t.fail);
    toast(t.sentref);
    onClose();
  };

  return (
    <Sheet t={t} eyebrow={t.brand} title={t.choose} onClose={onClose}>
      <div className="a-panel">
        {PLANS.map((item) => (
          <button className={`a-item pick${plan === item.key ? " on" : ""}`} key={item.key} onClick={() => setPlan(item.key)} aria-pressed={plan === item.key} type="button">
            <span className="a-main">
              <strong>{item.title}</strong>
              <em>{item.detail}</em>
            </span>
            <span className="a-side">{item.price}</span>
          </button>
        ))}
      </div>
      {pay ? (
        <>
          <h2 className="a-label">{t.pay}</h2>
          <p className="a-quiet" style={{ marginTop: 6, whiteSpace: "pre-line" }}>
            {pay}
          </p>
        </>
      ) : null}
      <label className="a-field">
        <span>{t.reference}</span>
        <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Telebirr · 123456" />
      </label>
      {error ? <p className="a-err">{error}</p> : null}
      <button className="a-btn primary" onClick={send} disabled={busy || !reference.trim()}>
        {t.sendref}
      </button>
      <p className="a-quiet">{t.note}</p>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- gate sheet */

function AdSheet({ t }) {
  const { downloadPolicy, downloadStatus, gate, setGate, closeGate, completeAdGate, appSettings } = useApp();
  const seconds = downloadPolicy.adSeconds;
  const [left, setLeft] = useState(seconds);
  const finish = useRef(completeAdGate);
  finish.current = completeAdGate;
  const file = `${gate.courseId || ""}::${gate.materialId || ""}::${gate.sideMaterialId || ""}`;

  useEffect(() => {
    setLeft(seconds);
    const started = Date.now();
    const timer = setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(timer);
        finish.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [seconds, file]);

  return (
    <Sheet t={t} eyebrow={t.brand} title={left > 0 ? t.spot : t.ready} onClose={closeGate}>
      <div className="a-wait">
        <p className="a-count">{left}</p>
        <div className="a-meter">
          <i style={{ width: `${((seconds - left) / (seconds || 1)) * 100}%` }} />
        </div>
      </div>
      <p className="a-quiet" style={{ marginTop: 0 }}>
        {downloadStatus.premium ? t.premium : downloadPolicy.mode === "credits" ? `${t.credits}: ${Math.max(0, downloadStatus.credits - 1)}` : t.free}
      </p>
      {appSettings.hidePremium ? null : (
        <button className="a-btn line" onClick={() => setGate({ ...gate, type: "upgrade" })}>
          {t.plans}
        </button>
      )}
    </Sheet>
  );
}

function UpgradeSheet({ t, onPlans }) {
  const { gate, closeGate } = useApp();
  return (
    <Sheet t={t} eyebrow={t.brand} title={gate.title} onClose={closeGate}>
      <p className="a-quiet" style={{ marginTop: 0 }}>
        <Icon name="lock" size={15} /> {t.locked}
      </p>
      <div className="a-panel">
        {PLANS.map((plan) => (
          <div className="a-item" key={plan.key}>
            <span className="a-main">
              <strong>{plan.title}</strong>
              <em>{plan.detail}</em>
            </span>
            <span className="a-side">{plan.price}</span>
          </div>
        ))}
      </div>
      <button className="a-btn primary" onClick={onPlans}>
        {t.plans}
      </button>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------- auth */

function Auth({ t, lang, onLang, theme, onTheme }) {
  const { login, register, verifySignup, signInWithCode, resendSignInCode, finishRecovery, coursesData, appSettings, toast } = useApp();
  const [mode, setMode] = useState("signin");
  const [signin, setSignin] = useState({ identifier: "", password: "" });
  const [signup, setSignup] = useState({ name: "", email: "", phone: "", password: "", department: FRESHMAN_DEPARTMENT });
  const [pending, setPending] = useState("");
  const [code, setCode] = useState("");
  const [reset, setReset] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const groups = useMemo(() => buildDepartmentGroups(coursesData), [coursesData]);

  const fail = (message) => {
    setBusy(false);
    setError(message);
  };

  const signIn = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!signin.identifier.trim() || !signin.password) return fail(t.needboth);
    setBusy(true);
    const res = await login({ identifier: signin.identifier.trim(), password: signin.password });
    setBusy(false);
    if (res.ok) return toast(`${t.hi}, ${(res.session.name || res.session.email || "").split(" ")[0]}`);
    if (res.twoFactor) {
      setPending(res.identifier);
      setCode("");
      setMode("twofactor");
      return setNotice(res.message || t.codesent);
    }
    if (res.needsRecovery) {
      setReset({ email: res.email || signin.identifier.trim(), password: "" });
      setCode("");
      return setMode("reset");
    }
    setError(res.error || t.fail);
  };

  const twoFactor = async (event) => {
    event.preventDefault();
    setError("");
    if (code.length !== 6) return fail(t.needcode);
    setBusy(true);
    const res = await signInWithCode({ identifier: pending, code });
    setBusy(false);
    if (!res.ok) return setError(res.error || t.fail);
    toast(`${t.hi}, ${(res.session.name || res.session.email || "").split(" ")[0]}`);
  };

  const signUp = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!signup.email.trim() || signup.password.length < 8) return fail(t.needboth);
    if (phoneProblem(signup.phone)) return fail(t.needphone);
    setBusy(true);
    const res = await register({
      name: signup.name.trim() || "Wollo Student",
      email: signup.email.trim(),
      phone: signup.phone.trim(),
      password: signup.password,
      department: signup.department
    });
    setBusy(false);
    if (!res.ok) return setError(res.error || t.fail);
    setPending(res.email);
    setCode("");
    setMode("verify");
    setNotice(res.message || t.codesent);
  };

  const confirmCode = async (event) => {
    event.preventDefault();
    setError("");
    if (code.length !== 6) return fail(t.needcode);
    setBusy(true);
    const res = await verifySignup(pending, code);
    setBusy(false);
    if (!res.ok) return setError(res.error || t.fail);
    if (!res.session) {
      setMode("signin");
      return setNotice(res.message || t.codesent);
    }
    toast(`${t.hi}, ${(res.session.name || res.session.email || "").split(" ")[0]}`);
  };

  const askReset = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const res = await requestRecovery(reset.email.trim() || signin.identifier.trim());
    setBusy(false);
    if (!res || res.ok !== true) return setError((res && res.error) || t.fail);
    setCode("");
    setMode("resetcode");
    setNotice(t.codesent);
  };

  const finishReset = async (event) => {
    event.preventDefault();
    setError("");
    if (code.length !== 6 || reset.password.length < 8) return fail(t.needcode);
    setBusy(true);
    const res = await finishRecovery({ email: reset.email.trim() || signin.identifier.trim(), code, newPassword: reset.password });
    setBusy(false);
    if (!res.ok) return setError(res.error || t.fail);
    if (!res.signedIn) {
      setMode("signin");
      return setNotice(res.message || t.codesent);
    }
    toast(`${t.hi}, ${(res.session.name || res.session.email || "").split(" ")[0]}`);
  };

  const again = async () => {
    if (mode === "verify") {
      const res = await resendVerificationCode(pending);
      if (res && res.ok === true) setNotice(t.codesent);
      return;
    }
    const res = await resendSignInCode(pending);
    if (res && res.ok === true) setNotice(t.codesent);
  };

  const shell = (title, body, actions) => (
    <main className="a">
      <header className="a-head">
        <div>
          <p className="a-eyebrow">{t.brand}</p>
          <h1 className="a-title">{title}</h1>
        </div>
        <span className="a-mark" aria-hidden="true">W</span>
      </header>
      {body}
      {error ? <p className="a-err">{error}</p> : null}
      {notice ? <p className="a-flag">{notice}</p> : null}
      {actions}
      <Prefs t={t} lang={lang} onLang={onLang} theme={theme} onTheme={onTheme} />
    </main>
  );

  if (mode === "verify" || mode === "twofactor" || mode === "resetcode") {
    return shell(
      t.code,
      <>
        <label className="a-field">
          <span>{t.code}</span>
          <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" />
        </label>
        {mode === "resetcode" ? (
          <label className="a-field">
            <span>{t.newpass}</span>
            <input type="password" value={reset.password} onChange={(event) => setReset((old) => ({ ...old, password: event.target.value }))} autoComplete="new-password" />
          </label>
        ) : null}
      </>,
      <>
        <button className="a-btn primary" onClick={mode === "verify" ? confirmCode : mode === "twofactor" ? twoFactor : finishReset} disabled={busy}>
          {t.confirm}
        </button>
        <button className="a-btn line" onClick={again}>
          {t.resend}
        </button>
      </>
    );
  }

  if (mode === "reset") {
    return shell(
      t.reset,
      <label className="a-field">
        <span>{t.email}</span>
        <input value={reset.email} onChange={(event) => setReset((old) => ({ ...old, email: event.target.value }))} autoComplete="email" />
      </label>,
      <>
        <button className="a-btn primary" onClick={askReset} disabled={busy}>
          {t.send}
        </button>
        <button className="a-btn line" onClick={() => setMode("signin")}>
          {t.back}
        </button>
      </>
    );
  }

  if (mode === "signup") {
    return shell(
      t.signup,
      <>
        <label className="a-field">
          <span>{t.name}</span>
          <input value={signup.name} onChange={(event) => setSignup((old) => ({ ...old, name: event.target.value }))} autoComplete="name" />
        </label>
        <label className="a-field">
          <span>{t.email}</span>
          <input value={signup.email} onChange={(event) => setSignup((old) => ({ ...old, email: event.target.value }))} autoComplete="email" inputMode="email" />
        </label>
        <label className="a-field">
          <span>{t.phone} · +251</span>
          <input
            value={phoneLocalDigits(signup.phone)}
            onChange={(event) => setSignup((old) => ({ ...old, phone: phoneFromLocal(event.target.value) }))}
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="912345678"
          />
        </label>
        <label className="a-field">
          <span>{t.password}</span>
          <input type="password" value={signup.password} onChange={(event) => setSignup((old) => ({ ...old, password: event.target.value }))} autoComplete="new-password" />
        </label>
        <label className="a-field">
          <span>{t.department}</span>
          <select value={signup.department} onChange={(event) => setSignup((old) => ({ ...old, department: event.target.value }))}>
            <optgroup label="Common Freshman Courses">
              <option value={FRESHMAN_DEPARTMENT}>{FRESHMAN_DEPARTMENT}</option>
            </optgroup>
            {groups
              .filter((group) => group.college !== "Common Freshman Courses")
              .map((group) => (
                <optgroup key={group.college} label={group.college}>
                  {group.programs.map((program) => (
                    <option key={`${group.college}-${program}`} value={program}>
                      {program}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </label>
      </>,
      <>
        <button className="a-btn primary" onClick={signUp} disabled={busy}>
          {t.signup}
        </button>
        <button className="a-btn line" onClick={() => setMode("signin")}>
          {t.toSignin}
        </button>
      </>
    );
  }

  return shell(
    t.signin,
    <>
      <label className="a-field">
        <span>{t.identifier}</span>
        <input value={signin.identifier} onChange={(event) => setSignin((old) => ({ ...old, identifier: event.target.value }))} autoComplete="username" />
      </label>
      <label className="a-field">
        <span>{t.password}</span>
        <input type="password" value={signin.password} onChange={(event) => setSignin((old) => ({ ...old, password: event.target.value }))} autoComplete="current-password" />
      </label>
    </>,
    <>
      <button className="a-btn primary" onClick={signIn} disabled={busy}>
        {t.signin}
      </button>
      {appSettings.allowSignup === false ? (
        <p className="a-quiet">{t.signupOff}</p>
      ) : (
        <button className="a-btn quiet" onClick={() => setMode("signup")}>
          {t.toSignup}
        </button>
      )}
      <button
        className="a-btn line"
        onClick={() => {
          setReset({ email: signin.identifier.trim(), password: "" });
          setMode("reset");
        }}
      >
        {t.forgot}
      </button>
    </>
  );
}

/* -------------------------------------------------------------------- shared */

function filesOf(course) {
  return (course.materials || []).filter((mat) => !mat.hidden);
}

function opensFile(file) {
  return file.type === "Video" || /^https:\/\/(www\.)?(youtube\.com|youtu\.be)/i.test(String(file.url || ""));
}

function ext(type) {
  const raw = String(type || "PDF").trim();
  return raw.slice(0, 4).toUpperCase();
}

function short(name) {
  const words = String(name || "")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(" ")
    .filter(Boolean);
  if (!words.length) return "WS";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function openSaved(entry) {
  if (entry.url) triggerBrowserDownload(entry.url, entry.name);
}
