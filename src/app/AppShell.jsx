import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { PLANS } from "../lib/plans.js";
import { FRESHMAN_DEPARTMENT, buildDepartmentGroups, matchDepartmentPrograms } from "../lib/departments.js";
import { phoneFromLocal, phoneLocalDigits, phoneProblem, namedFile, triggerBrowserDownload } from "../lib/utils.js";
import {
  listLoginDevices,
  requestPremiumPlan,
  requestRecovery,
  resendVerificationCode,
  revokeLoginDevice,
  signOutOtherDevices,
  listPracticeQuestions,
  getPracticeLeaderboard,
  submitPractice
} from "../lib/api.js";
import { addToRecent, clearRecent, fileKey, listRecent, listShelf, loadLibrary, removeFromShelf, saveLibrary, toggleShelf, when } from "../mobile/local.js";
import { hasDoc, listDocs, prepareDoc, viewDoc } from "./docs.js";
import { COPY } from "./strings.js";
import { APP_VERSION } from "./version.js";
import { hasSeenIntro, hasSeenTutorial, markIntroSeen, markTutorialSeen } from "./launch.js";
import Onboarding from "./Onboarding.jsx";
import Scan from "./Scan.jsx";
import Tutorial from "./Tutorial.jsx";

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
  wifi: "M4.5 9.8a11 11 0 0 1 15 0M7.6 13.2a6.6 6.6 0 0 1 8.8 0M12 17.4h.01",
  scan: "M4 9V5.6A1.6 1.6 0 0 1 5.6 4H9m6 0h3.4A1.6 1.6 0 0 1 20 5.6V9m0 6v3.4a1.6 1.6 0 0 1-1.6 1.6H15m-6 0H5.6A1.6 1.6 0 0 1 4 18.4V15M4 12h16",
  practice: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2m-6 9 2 2 4-4"
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
      {src ? (
        <img src={src} alt="" onError={(event) => (event.currentTarget.style.display = "none")} />
      ) : (
        <Icon name="account" size={20} />
      )}
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
  const { booting, appSettings, appearanceSettings, gate, closeGate, toast, toasts, session, allowFileFetch, requestDownload } = useApp();
  const [lang, setLang] = useState(() => localStorage.getItem("wollo_app_lang") || "en");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("wollo_app_theme") || appSettings.theme || "auto"
  );
  const [tab, setTab] = useState("home");
  const [intro, setIntro] = useState(() => !hasSeenIntro());
  const [authMode, setAuthMode] = useState("signin");
  const [tutorial, setTutorial] = useState(false);
  const [read, setRead] = useState(null);
  const [ReaderLayer, setReaderLayer] = useState(null);

  useEffect(() => {
    localStorage.setItem("wollo_app_lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
  }, [lang]);

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
      document.documentElement.dataset.aTheme =
        theme === "dark" || (theme === "auto" && prefersDark.matches) ? "dark" : "light";
    };
    apply();
    if (theme !== "auto") return undefined;
    prefersDark.addEventListener("change", apply);
    return () => prefersDark.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    const accent = appSettings.accent || appearanceSettings.primaryColor || "#1a4fa8";
    const rgb = rgbOf(accent);
    if (!rgb) return;
    paintAccent(accent, rgb);
  }, [appSettings.accent, appearanceSettings.primaryColor]);

  useEffect(() => {
    if (gate && gate.type === "register") {
      setTab("account");
      closeGate();
    }
  }, [closeGate, gate]);

  const signedIn = Boolean(session);
  useEffect(() => {
    if (!signedIn) {
      setTutorial(false);
      return;
    }
    if (!hasSeenTutorial(session.id)) setTutorial(true);
  }, [session, signedIn]);

  const closeTutorial = () => {
    markTutorialSeen(session?.id);
    setTutorial(false);
  };

  useEffect(() => {
    if (!read || ReaderLayer) return undefined;
    let live = true;
    import("./Reader.jsx").then((mod) => {
      if (live) setReaderLayer(() => mod.default);
    });
    return () => {
      live = false;
    };
  }, [read, ReaderLayer]);

  const copyForRead = useCallback(
    async (entry, { store = true } = {}) => {
      const got = await allowFileFetch(entry.courseId, entry.materialId, entry.sideMaterialId || "");
      if (!got.allowed) {
        requestDownload(entry.courseId, entry.materialId, entry.sideMaterialId || "");
        return { error: "auth" };
      }
      if (!got.url) return { error: "remote" };
      const full = {
        ...entry,
        name: got.name || entry.name,
        course: got.course || entry.course,
        url: got.url
      };
      if (!store) return viewDoc(full.url);
      const stored = await prepareDoc(
        {
          key: full.key,
          name: full.name,
          course: full.course,
          courseId: full.courseId,
          materialId: full.materialId,
          sideMaterialId: full.sideMaterialId || ""
        },
        full.url
      );
      if (stored.error) return stored;
      addToRecent({
        key: full.key,
        name: full.name,
        course: full.course,
        courseId: full.courseId,
        materialId: full.materialId,
        sideMaterialId: full.sideMaterialId || "",
        type: full.type,
        url: full.url
      });
      return stored;
    },
    [allowFileFetch, requestDownload]
  );

  const openRead = useCallback((entry) => {
    if (!entry.courseId || !entry.materialId) {
      if (entry.url) triggerBrowserDownload(entry.url, namedFile(entry.name, entry.url, entry.type));
      return;
    }
    setRead(entry);
  }, []);

  useEffect(() => {
    if (!read) return undefined;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [read]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.Capacitor?.isNativePlatform?.()) return undefined;
    const plugin = window.Capacitor.Plugins.App;
    if (!plugin?.addListener) return undefined;
    const handle = plugin.addListener("backButton", () => {
      if (read) return setRead(null);
      if (intro) return;
      if (tutorial) return closeTutorial();
      if (gate) return closeGate();
      if (!signedIn) return plugin.minimizeApp?.() ?? plugin.exitApp?.();
      if (tab !== "home") return setTab("home");
      return plugin.exitApp?.();
    });
    return () => {
      handle?.then?.((removed) => removed?.remove?.());
    };
  }, [closeGate, gate, intro, read, signedIn, tab, tutorial]);

  const t = COPY[lang] || COPY.en;

  if (appSettings.enabled === false) return <OffScreen t={t} />;
  if (outdated(APP_VERSION, appSettings.minimumVersion)) return <UpdateScreen t={t} url={appSettings.updateUrl} />;
  if (booting) return <Loading t={t} />;

  return (
    <>
      {intro ? (
        <Onboarding
          t={t}
          lang={lang}
          onLang={setLang}
          onFinish={(mode) => {
            markIntroSeen();
            if (mode) setAuthMode(mode);
            setIntro(false);
          }}
        />
      ) : !signedIn ? (
        <Auth
          t={t}
          lang={lang}
          onLang={setLang}
          theme={theme}
          onTheme={chooseTheme}
          note={t.gateBody}
          startMode={authMode}
        />
      ) : (
        <>
          {tab === "home" ? <Home t={t} go={setTab} onRead={openRead} /> : null}
          {tab === "browse" ? <Browse t={t} onRead={openRead} /> : null}
          {tab === "practice" ? <Practice t={t} /> : null}
          {tab === "scan" ? <Scan t={t} /> : null}
          {tab === "saved" ? <Saved t={t} onRead={openRead} /> : null}
          {tab === "account" ? (
            <Account
              t={t}
              lang={lang}
              onLang={setLang}
              theme={theme}
              onTheme={chooseTheme}
              go={setTab}
              onTutorial={() => setTutorial(true)}
            />
          ) : null}

          <nav className="a-dock" role="navigation" aria-label={t.brand}>
            {[
              ["home", t.home, "home"],
              ["browse", t.browse, "search"],
              ["practice", t.practice, "practice"],
              ["scan", t.scan, "scan"],
              ["saved", t.saved, "shelf"],
              ["account", t.account, "account"]
            ].map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                className={tab === key ? "on" : ""}
                onClick={() => setTab(key)}
                aria-current={tab === key ? "page" : undefined}
                aria-label={label}
              >
                <Icon name={icon} size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {gate && gate.type === "ad" ? <AdSheet t={t} /> : null}
          {gate && gate.type === "upgrade" ? <UpgradeSheet t={t} onPlans={() => setTab("account")} /> : null}
          {tutorial ? <Tutorial t={t} onClose={closeTutorial} /> : null}
          {read && ReaderLayer ? (
            <ReaderLayer
              t={t}
              entry={read}
              keep={(opts) => copyForRead(read, opts)}
              onClose={() => setRead(null)}
            />
          ) : null}
        </>
      )}

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

/* ---------------------------------------------------------------- loading/off screens */

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
      <button
        className="a-btn primary"
        style={{ marginTop: 26 }}
        onClick={() => window.open("https://wollo-share.vercel.app", "_blank")}
        aria-label={t.offBtn}
      >
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
      <button
        className="a-btn primary"
        style={{ marginTop: 26 }}
        onClick={() => window.open(url || "https://wollo-share.vercel.app", "_blank")}
        aria-label={t.updateBtn}
      >
        {t.updateBtn}
        <Icon name="open" size={16} />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------- home feed carousel */

function HomeFeedCarousel({ cards }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (cards.length < 2 || paused) return undefined;
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % cards.length);
    }, 4000);
    return () => clearInterval(timerRef.current);
  }, [cards.length, paused]);

  if (!cards.length) return null;

  const card = cards[index];
  return (
    <div
      className="a-carousel"
      aria-label="Announcements"
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
    >
      <div className="a-carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {cards.map((c) => (
          <div className="a-carousel-slide" key={c.id}>
            {c.imageUrl ? <img src={c.imageUrl} alt="" loading="lazy" /> : null}
            <div className="a-feed-body">
              {c.kind ? (
                <p className="a-feed-kicker">{c.kind}</p>
              ) : null}
              <p className="a-feed-title">{c.title}</p>
              {c.summary ? <p style={{ margin: "0", fontSize: "13.5px", color: "var(--a-quiet)" }}>{c.summary}</p> : null}
              {c.linkUrl ? (
                <a
                  href={c.linkUrl}
                  className="a-feed-cta"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={c.ctaLabel || "Learn more"}
                >
                  {c.ctaLabel || "Learn more"}
                  <Icon name="open" size={14} />
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {cards.length > 1 ? (
        <div className="a-carousel-dots" role="tablist" aria-label="Carousel navigation">
          {cards.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              className={i === index ? "on" : ""}
              onClick={() => setIndex(i)}
              aria-label={`Slide ${i + 1}`}
              aria-current={i === index ? "true" : undefined}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------- home feed news list */

function HomeFeedNews({ cards, t }) {
  const seen = new Set();
  const unique = cards.filter((c) => (seen.has(c.id) ? false : seen.add(c.id)));
  if (!unique.length) return null;

  return (
    <section aria-label={t.newsSection}>
      <h2 className="a-label">{t.newsSection}</h2>
      <div className="a-feed">
        {unique.map((c) => (
          <div className="a-feed-card" key={c.id}>
            {c.imageUrl ? <img className="a-feed-img" src={c.imageUrl} alt="" loading="lazy" /> : null}
            <div className="a-feed-body">
              {c.kind ? <p className="a-feed-kicker">{c.kind}</p> : null}
              <p className="a-feed-title">{c.title}</p>
              {c.summary ? (
                <p style={{ margin: "0", fontSize: "13.5px", color: "var(--a-quiet)", lineHeight: 1.5 }}>
                  {c.summary}
                </p>
              ) : null}
              {c.linkUrl ? (
                <a
                  href={c.linkUrl}
                  className="a-feed-cta"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={c.ctaLabel || "Read more"}
                >
                  {c.ctaLabel || "Read more"}
                  <Icon name="open" size={14} />
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- home */

function Home({ t, go, onRead }) {
  const {
    session,
    activeUser,
    coursesData,
    canSeeCourse,
    appSettings,
    downloadPolicy,
    downloadStatus,
    homeFeed
  } = useApp();
  const [shelf] = useState(() => listShelf());
  const [recent] = useState(() => listRecent());
  const department = String(activeUser?.department || "").trim();
  const live = useMemo(() => coursesData.filter((c) => canSeeCourse(c)), [canSeeCourse, coursesData]);
  const mine = useMemo(() => matchDepartmentPrograms(live, department), [department, live]);
  const files = useMemo(
    () => live.reduce((total, course) => total + (course.materials || []).filter((m) => !m.hidden).length, 0),
    [live]
  );

  const first = String(session?.name || activeUser?.name || "").trim().split(" ")[0];
  const total = shelf.length + recent.length;
  const notice = String(appSettings.message || "").trim();

  const carouselCards = homeFeed?.carousel || [];
  const newsCards = [
    ...(homeFeed?.pinned || []),
    ...(homeFeed?.announcements || []),
    ...(homeFeed?.news || []),
    ...(homeFeed?.events || []),
    ...(homeFeed?.updates || [])
  ];

  return (
    <main className="a" role="main">
      <header className="a-head">
        <div>
          <p className="a-eyebrow">{first ? t.hi : t.brand}</p>
          <h1 className="a-title">{first || t.brand}</h1>
        </div>
        <Face src={activeUser?.avatarUrl || activeUser?.photoUrl || session?.photoUrl} />
      </header>

      <p className="a-lede">{appSettings.welcome}</p>

      <div className="a-actions">
        <button className="a-btn primary" onClick={() => go("browse")} aria-label={t.browse}>
          <Icon name="search" size={17} />
          {t.browse}
        </button>
        <button className="a-btn quiet" onClick={() => go("saved")} aria-label={t.saved}>
          <Icon name="shelf" size={17} />
          {t.saved}
          <em>{total}</em>
        </button>
      </div>

      {notice ? (
        <div className="a-notice" role="note">
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
          {!downloadStatus.premium && downloadStatus.credits !== undefined
            ? ` · ${downloadStatus.credits} ${t.credits}`
            : ""}
        </span>
      </p>

      {!session ? (
        <button className="a-btn line" onClick={() => go("account")} aria-label={t.signin}>
          {t.signin}
          <Icon name="next" size={16} />
        </button>
      ) : null}

      {/* Admin-controlled rotating banner */}
      {carouselCards.length ? (
        <HomeFeedCarousel cards={carouselCards} />
      ) : null}

      {/* Practice shortcuts */}
      <section aria-label={t.practice} style={{ marginTop: "18px" }}>
        <h2 className="a-label">{t.practice}</h2>
        <div className="a-actions" style={{ marginTop: 0 }}>
          <button
            className="a-btn quiet"
            style={{ marginTop: 0 }}
            onClick={() => go("practice")}
            aria-label={t.browseQ}
          >
            <Icon name="practice" size={16} />
            {t.browseQ}
          </button>
          <button
            className="a-btn quiet"
            style={{ marginTop: 0 }}
            onClick={() => go("practice")}
            aria-label={t.takeExam}
          >
            <Icon name="star" size={16} />
            {t.takeExam}
          </button>
        </div>
      </section>

      {/* Admin-controlled news & announcements */}
      {newsCards.length ? (
        <HomeFeedNews cards={newsCards} t={t} />
      ) : null}

      {mine.length ? (
        <section aria-label={t.myCourses}>
          <h2 className="a-label">{t.myCourses}</h2>
          <div className="a-strip">
            {mine.slice(0, 8).map((course) => (
              <button
                className="a-card"
                key={course.id}
                onClick={() => go("browse")}
                aria-label={course.name}
              >
                <span className="a-badge">{short(course.name)}</span>
                <strong>{course.name}</strong>
                <em>
                  {filesOf(course).length} {t.files}
                </em>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {recent.length ? (
        <section aria-label={t.recent}>
          <h2 className="a-label">{t.recent}</h2>
          <div className="a-panel">
            {recent.slice(0, 4).map((entry) => (
              <button
                className="a-item"
                key={entry.key}
                onClick={() =>
                  readableDoc(entry.name, entry.type) ? onRead(entry) : openSaved(entry)
                }
                aria-label={entry.name}
              >
                <span className={`a-badge ${ext(entry.type).toLowerCase()}`}>{ext(entry.type)}</span>
                <span className="a-main">
                  <strong>{entry.name}</strong>
                  <em>{entry.course}</em>
                </span>
                <span className="a-side">{when(entry.at)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

/* -------------------------------------------------------------------- browse */

function Browse({ t, onRead }) {
  const { session, activeUser, coursesData, canSeeCourse, requestDownload } = useApp();
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState("mine");
  const [open, setOpen] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [shelf, setShelf] = useState(() => listShelf());
  const [recent, setRecent] = useState(() => listRecent());
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [saved, setSaved] = useState(() => loadLibrary());
  const [copies, setCopies] = useState(0);
  const department = String(activeUser?.department || "").trim();

  const live = useMemo(() => coursesData.filter((c) => canSeeCourse(c)), [canSeeCourse, coursesData]);
  const visible = online ? live : saved?.list || live;

  useEffect(() => {
    window.__WS_ON_DOWNLOAD__ = (file) => {
      const key = fileKey(file.courseId, file.materialId, file.sideMaterialId || "");
      addToRecent({ ...file, key });
      if (file.url && readableDoc(file.name, file.type) && !hasDoc(key))
        prepareDoc(
          {
            key,
            name: file.name,
            course: file.course,
            courseId: file.courseId,
            materialId: file.materialId,
            sideMaterialId: file.sideMaterialId || ""
          },
          file.url
        ).then((got) => {
          if (!got.error) setCopies((n) => n + 1);
        });
      setRecent(listRecent());
    };
    return () => delete window.__WS_ON_DOWNLOAD__;
  }, []);

  useEffect(() => {
    const tick = () => setCopies((n) => n + 1);
    window.addEventListener("wollo:docs", tick);
    return () => window.removeEventListener("wollo:docs", tick);
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
  const onPhone = useMemo(() => new Set(listDocs().map((item) => item.key)), [copies]);
  const mineIds = useMemo(
    () => new Set(matchDepartmentPrograms(visible, department).map((c) => c.id)),
    [department, visible]
  );
  const needle = query.trim().toLowerCase();

  const shown = useMemo(
    () =>
      visible.filter((course) => {
        if (only === "mine" && department && !mineIds.has(course.id)) return false;
        if (!needle) return true;
        return (
          String(course.name || "").toLowerCase().includes(needle) ||
          (course.materials || []).some((mat) =>
            String(mat.name || "").toLowerCase().includes(needle)
          )
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
    <main className="a" role="main">
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

      <div className="a-search" role="search">
        <Icon name="search" size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.find}
          aria-label={t.find}
        />
        {query ? (
          <button
            type="button"
            className="a-clear"
            onClick={() => setQuery("")}
            aria-label={t.clear}
          >
            <Icon name="close" size={15} />
          </button>
        ) : null}
      </div>

      {department ? (
        <div className="a-chips" role="tablist" aria-label="Course filter">
          <button
            className={`a-chip${only === "mine" ? " on" : ""}`}
            onClick={() => setOnly("mine")}
            role="tab"
            aria-selected={only === "mine"}
          >
            {t.myCourses}
          </button>
          <button
            className={`a-chip${only === "all" ? " on" : ""}`}
            onClick={() => setOnly("all")}
            role="tab"
            aria-selected={only === "all"}
          >
            {t.otherCourses}
          </button>
        </div>
      ) : null}

      <p className="a-count-line">
        {shown.length} {t.courses}
      </p>

      <div className="a-panel" role="region" aria-label={t.browse}>
        {shown.map((course) => {
          const expanded = open.has(course.id);
          const mats = filesOf(course);
          return (
            <div key={course.id} className={expanded ? "a-open" : ""}>
              <button
                className="a-item"
                onClick={() => toggle(course.id)}
                aria-expanded={expanded}
                aria-label={course.name}
              >
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
                      stored={onPhone.has(fileKey(course.id, mat.id, ""))}
                      onOpen={() => setDetail({ course, mat })}
                      onRead={() => onRead(readEntry(course, mat))}
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
                          stored={onPhone.has(fileKey(course.id, mat.id, side.id))}
                          onOpen={() => setDetail({ course, mat, side })}
                          onRead={() => onRead(readEntry(course, mat, side))}
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
          stored={onPhone.has(
            fileKey(detail.course.id, detail.mat.id, detail.side ? detail.side.id : "")
          )}
          starred={shelfKeys.has(
            fileKey(detail.course.id, detail.mat.id, detail.side ? detail.side.id : "")
          )}
          onRead={() => {
            onRead(readEntry(detail.course, detail.mat, detail.side));
            setDetail(null);
          }}
          onClose={() => setDetail(null)}
          onTake={() => {
            requestDownload(
              detail.course.id,
              detail.mat.id,
              detail.side ? detail.side.id : ""
            );
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

function FileRow({ t, course, mat, side, shelfKeys, recentKeys, stored, onOpen, onRead, onTake, onStar }) {
  const file = side || mat;
  const key = fileKey(course.id, mat.id, side ? side.id : "");
  const meta = side ? mat.name : [mat.type, mat.size].filter(Boolean).join(" · ");
  const taken = recentKeys.has(key);
  const kept = shelfKeys.has(key);
  const canRead = readableDoc(file.name, file.type);
  return (
    <div className="a-item">
      <button className="a-main" onClick={onOpen} style={{ textAlign: "left" }} aria-label={file.name}>
        <strong>{file.name}</strong>
        <em>{[meta, stored ? t.readerOffline : ""].filter(Boolean).join(" · ")}</em>
      </button>
      <button
        className={`a-act${kept ? " on" : ""}`}
        onClick={onStar}
        aria-label={kept ? t.remove : t.keep}
        aria-pressed={kept}
        type="button"
      >
        <Icon name="saved" size={16} fill={kept} />
      </button>
      <button className="a-btn row" onClick={canRead ? onRead : onTake} aria-label={canRead ? t.readerOpen : taken || opensFile(file) ? t.open : t.download}>
        {canRead ? t.readerOpen : taken || opensFile(file) ? t.open : t.download}
        <Icon name={canRead ? "open" : taken || opensFile(file) ? "open" : "down"} size={15} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------- practice tab */

function Practice({ t }) {
  const { session } = useApp();
  const token = session?.authToken || "";

  const [leaderboard, setLeaderboard] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [qError, setQError] = useState("");
  const [lError, setLError] = useState("");
  const [filters, setFilters] = useState({ college: "", q: "" });
  const [expanded, setExpanded] = useState(null);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPracticeLeaderboard("weekly", token)
      .then((res) => {
        if (res && res.ok !== false) setLeaderboard(res.entries || res.leaderboard || []);
        else setLError(res?.error || "");
      })
      .catch(() => setLError("Could not load."));
  }, [token]);

  useEffect(() => {
    const { college, q } = filters;
    listPracticeQuestions({ college: college || undefined, q: q || undefined }, token)
      .then((res) => {
        if (res && res.ok !== false) setQuestions(res.questions || []);
        else setQError(res?.error || "Could not load questions.");
      })
      .catch(() => setQError("Could not load questions."));
  }, [filters, token]);

  const submit = async (questionId) => {
    const given = answers[questionId];
    if (!given) return;
    setBusy(true);
    const res = await submitPractice(
      { answers: [{ questionId, given: String(given) }], mode: "practice", title: "Practice" },
      token
    ).catch(() => null);
    setBusy(false);
    if (!res || res.ok === false) return;
    const detail = (res.results || [])[0] || (res.result ? res.result : null);
    if (detail) setResults((old) => ({ ...old, [questionId]: detail }));
  };

  return (
    <main className="a" role="main">
      <header className="a-head">
        <div>
          <p className="a-eyebrow">{t.brand}</p>
          <h1 className="a-title">{t.practice}</h1>
        </div>
        <span className="a-mark" aria-hidden="true">P</span>
      </header>

      {/* Leaderboard */}
      <section aria-label={t.leaderboard}>
        <h2 className="a-label">{t.leaderboard}</h2>
        {lError ? <p className="a-quiet">{lError}</p> : null}
        {!leaderboard ? (
          <div className="a-skeleton" />
        ) : leaderboard.length === 0 ? null : (
          <div className="a-leaderboard">
            {leaderboard.slice(0, 5).map((entry, i) => (
              <div className="a-leaderboard-row" key={entry.id || entry.userId || i}>
                <span className={`a-leaderboard-rank${i < 3 ? " top" : ""}`}>{i + 1}</span>
                <Face src={entry.avatarUrl || ""} />
                <span className="a-main">
                  <strong>{entry.name || entry.displayName || "Student"}</strong>
                  <em>{entry.department || entry.college || ""}</em>
                </span>
                <span className="a-leaderboard-pts">
                  {entry.points ?? entry.score ?? 0} {t.points}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Filter bar */}
      <section aria-label={t.questions} style={{ marginTop: "10px" }}>
        <h2 className="a-label">{t.questions}</h2>
        <div className="a-search" role="search">
          <Icon name="search" size={17} />
          <input
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder={t.find}
            aria-label={t.find}
          />
          {filters.q ? (
            <button
              type="button"
              className="a-clear"
              onClick={() => setFilters((f) => ({ ...f, q: "" }))}
              aria-label={t.clear}
            >
              <Icon name="close" size={15} />
            </button>
          ) : null}
        </div>

        {/* Question list */}
        {qError ? <p className="a-err">{qError}</p> : null}
        {!questions ? (
          <>
            <div className="a-skeleton" />
            <div className="a-skeleton" />
          </>
        ) : questions.length === 0 ? (
          <p className="a-quiet">{t.noQuestions}</p>
        ) : (
          <div className="a-practice-row">
            {questions.map((q) => {
              const isOpen = expanded === q.id;
              const result = results[q.id];
              const kindBadge = (q.kind || q.type || "Q").slice(0, 3).toUpperCase();
              return (
                <div className="a-practice-card" key={q.id}>
                  <button
                    className="a-item"
                    onClick={() => setExpanded(isOpen ? null : q.id)}
                    aria-expanded={isOpen}
                    aria-label={q.body || q.text || q.title}
                  >
                    <span className="a-badge">{kindBadge}</span>
                    <span className="a-main">
                      <strong>
                        {String(q.body || q.text || q.title || "").slice(0, 72)}
                      </strong>
                      <em>
                        {[q.chapter, q.points ? `${q.points} ${t.points}` : ""].filter(Boolean).join(" · ")}
                      </em>
                    </span>
                    <span className="a-side">
                      <Icon name="chevron" size={17} />
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="a-practice-card-body">
                      <p>{q.body || q.text || q.title}</p>

                      {/* MCQ */}
                      {(q.kind === "mcq" || q.type === "mcq") && Array.isArray(q.choices) ? (
                        q.choices.map((choice, ci) => {
                          const letter = String.fromCharCode(65 + ci);
                          const chosen = answers[q.id] === letter;
                          let cls = "a-practice-option";
                          if (result) {
                            if (letter === result.correct) cls += " correct";
                            else if (chosen && letter !== result.correct) cls += " wrong";
                          } else if (chosen) {
                            cls += " selected";
                          }
                          return (
                            <button
                              key={letter}
                              type="button"
                              className={cls}
                              onClick={() => !result && setAnswers((a) => ({ ...a, [q.id]: letter }))}
                              aria-pressed={chosen}
                              disabled={!!result}
                            >
                              <strong style={{ minWidth: "18px" }}>{letter}.</strong>
                              {choice}
                            </button>
                          );
                        })
                      ) : null}

                      {/* True/False */}
                      {(q.kind === "truefalse" || q.type === "truefalse") ? (
                        ["True", "False"].map((val) => {
                          const chosen = answers[q.id] === val;
                          let cls = "a-practice-option";
                          if (result) {
                            if (val === result.correct) cls += " correct";
                            else if (chosen) cls += " wrong";
                          } else if (chosen) {
                            cls += " selected";
                          }
                          return (
                            <button
                              key={val}
                              type="button"
                              className={cls}
                              onClick={() => !result && setAnswers((a) => ({ ...a, [q.id]: val }))}
                              aria-pressed={chosen}
                              disabled={!!result}
                            >
                              {val}
                            </button>
                          );
                        })
                      ) : null}

                      {/* Short answer */}
                      {!["mcq", "truefalse"].includes(q.kind || q.type || "") ? (
                        <label className="a-field">
                          <span>{t.yourAnswer}</span>
                          <input
                            value={answers[q.id] || ""}
                            onChange={(e) =>
                              !result &&
                              setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                            }
                            disabled={!!result}
                          />
                        </label>
                      ) : null}

                      {/* Submit */}
                      {!result ? (
                        <button
                          className="a-btn primary"
                          style={{ marginTop: "14px" }}
                          onClick={() => submit(q.id)}
                          disabled={busy || !answers[q.id]}
                          aria-label={t.submit}
                        >
                          {t.submit}
                        </button>
                      ) : null}

                      {/* Result */}
                      {result ? (
                        <>
                          <div className={`a-practice-result ${result.isCorrect ? "correct" : "wrong"}`}>
                            {result.isCorrect ? t.correct : t.wrong}
                          </div>
                          {result.explanation ? (
                            <div className="a-practice-explanation">
                              <strong>{t.explanation}:</strong> {result.explanation}
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

/* --------------------------------------------------------------------- saved */

function Saved({ t, onRead }) {
  const { refreshFromServer } = useApp();
  const [shelf, setShelf] = useState(() => listShelf());
  const [recent, setRecent] = useState(() => listRecent());
  const [saved, setSaved] = useState(() => loadLibrary());
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [copies, setCopies] = useState(0);

  useEffect(() => {
    const tick = () => setCopies((n) => n + 1);
    window.addEventListener("wollo:docs", tick);
    return () => window.removeEventListener("wollo:docs", tick);
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

  const onPhone = useMemo(() => new Set(listDocs().map((item) => item.key)), [copies]);
  const open = (entry) =>
    readableDoc(entry.name, entry.type) ? onRead(entry) : openSaved(entry);

  return (
    <main className="a" role="main">
      <header className="a-head">
        <div>
          <p className="a-eyebrow">
            {online ? (saved?.at ? `${t.savedAt} · ${when(saved.at)}` : t.brand) : t.offline}
          </p>
          <h1 className="a-title">{t.saved}</h1>
        </div>
        <button
          className="a-close"
          onClick={() => refreshFromServer()}
          aria-label={t.refresh}
          type="button"
        >
          <Icon name="refresh" size={16} />
        </button>
      </header>

      <h2 className="a-label">{t.starred}</h2>
      <div className="a-panel">
        {shelf.map((entry) => (
          <div className="a-item" key={entry.key}>
            <button
              className="a-main"
              onClick={() => open(entry)}
              style={{ textAlign: "left" }}
              aria-label={entry.name}
            >
              <strong>{entry.name}</strong>
              <em>
                {[entry.course, onPhone.has(entry.key) ? t.readerOffline : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </em>
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
            <button
              className="a-main"
              onClick={() => open(entry)}
              style={{ textAlign: "left" }}
              aria-label={entry.name}
            >
              <strong>{entry.name}</strong>
              <em>
                {[entry.course, onPhone.has(entry.key) ? t.readerOffline : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </em>
            </button>
            <span className="a-side">{when(entry.at)}</span>
            <button
              className="a-act"
              onClick={() => open(entry)}
              aria-label={t.open}
              type="button"
            >
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
          aria-label={t.clear}
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
      <div className="a-seg" role="group" aria-label={t.lang}>
        {[
          ["en", "EN"],
          ["am", "አማ"]
        ].map(([key, label]) => (
          <button
            key={key}
            className={`a-segbtn${lang === key ? " on" : ""}`}
            onClick={() => onLang(key)}
            aria-pressed={lang === key}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <h2 className="a-label">{t.theme}</h2>
      <div className="a-seg" role="group" aria-label={t.theme}>
        {[
          ["auto", t.auto],
          ["light", t.light],
          ["dark", t.dark]
        ].map(([key, label]) => (
          <button
            key={key}
            className={`a-segbtn${theme === key ? " on" : ""}`}
            onClick={() => onTheme(key)}
            aria-pressed={theme === key}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

function Devices({ t }) {
  const { session, logout, toast } = useApp();
  const [rows, setRows] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await listLoginDevices(session.authToken);
      setRows(res.ok ? res.devices : []);
      if (!res.ok) toast(res.error || t.fail);
    } catch {
      setRows([]);
      toast(t.scanOffline);
    }
  }, [session, t.fail, t.scanOffline, toast]);

  useEffect(() => {
    if (session?.authToken) load();
  }, [load, session]);

  const drop = async (deviceId) => {
    const res = await revokeLoginDevice(deviceId, session.authToken).catch(() => null);
    if (!res) return toast(t.scanOffline);
    if (res.current) return logout();
    if (!res.ok) return toast(res.error || t.fail);
    toast(res.message);
    setRows((old) => (old || []).filter((row) => row.id !== deviceId));
  };

  const dropOthers = async () => {
    const res = await signOutOtherDevices(session.authToken).catch(() => null);
    if (!res) return toast(t.scanOffline);
    if (!res.ok) return toast(res.error || t.fail);
    toast(res.message);
    setRows((old) => (old || []).filter((row) => row.current));
  };

  const others = (rows || []).filter((row) => !row.current);

  return (
    <>
      <h2 className="a-label">{t.devices}</h2>
      <div className="a-panel">
        {(rows || []).map((row) => (
          <div className="a-item" key={row.id}>
            <span className="a-main">
              <strong>{row.current ? t.deviceThis : row.label || t.scanUnknown}</strong>
              <em>{[row.method, when(row.createdAt)].filter(Boolean).join(" · ")}</em>
            </span>
            {row.current ? null : (
              <button
                className="a-act"
                onClick={() => drop(row.id)}
                aria-label={t.deviceOut}
                type="button"
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </div>
        ))}
        {rows && !rows.length ? <p className="a-quiet">{t.deviceNone}</p> : null}
      </div>
      {others.length ? (
        <button className="a-btn line" onClick={dropOthers} type="button" aria-label={t.deviceOutAll}>
          {t.deviceOutAll}
        </button>
      ) : null}
    </>
  );
}

function Account({ t, lang, onLang, theme, onTheme, go, onTutorial }) {
  const { session, activeUser, downloadStatus, downloadPolicy, logout, isStaff, appSettings, toast } =
    useApp();
  const [premium, setPremium] = useState(false);
  if (!session) return <Auth t={t} lang={lang} onLang={onLang} theme={theme} onTheme={onTheme} />;

  const department = String(activeUser?.department || "").trim();
  const name = String(activeUser?.name || session.name || t.brand).trim();
  const avatarSrc = activeUser?.avatarUrl || activeUser?.photoUrl || session?.photoUrl || "";
  const rows = [
    [t.email, activeUser?.email || session.email],
    department ? [t.department, department] : null,
    [t.plan, downloadStatus.badgeText || (downloadStatus.premium ? t.premium : t.free)],
    !downloadStatus.premium && downloadPolicy.mode === "credits"
      ? [t.credits, downloadStatus.credits]
      : null
  ].filter(Boolean);

  return (
    <main className="a" role="main">
      {/* Account header with avatar */}
      <header className="a-head">
        <div>
          <p className="a-eyebrow">{t.hi}</p>
          <h1 className="a-title">{name.split(" ")[0]}</h1>
          <p className="a-lede" style={{ marginTop: "4px", fontSize: "13px" }}>
            {activeUser?.email || session.email}
          </p>
        </div>
        <span
          className="a-face"
          style={{ width: "52px", height: "52px", flex: "0 0 52px", fontSize: "18px", fontWeight: 700 }}
          aria-hidden="true"
        >
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : (
            <Icon name="account" size={24} />
          )}
        </span>
      </header>

      <div className="a-panel" role="region" aria-label={t.account}>
        {rows.map(([label, value]) => (
          <div className="a-kv" key={label}>
            <span>{label}</span>
            <b>{String(value ?? "")}</b>
          </div>
        ))}
      </div>

      <Prefs t={t} lang={lang} onLang={onLang} theme={theme} onTheme={onTheme} />

      <Devices t={t} />

      {appSettings.hidePremium ? null : (
        <button className="a-btn primary" onClick={() => setPremium(true)} aria-label={t.choose}>
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
          aria-label={t.openAdmin}
        >
          {t.openAdmin}
          <Icon name="open" size={16} />
        </button>
      ) : null}

      <button className="a-btn quiet" onClick={() => go("saved")} aria-label={t.saved}>
        <Icon name="shelf" size={16} />
        {t.saved}
      </button>

      <button className="a-btn quiet" onClick={onTutorial} aria-label={t.tutReplay}>
        <Icon name="note" size={16} />
        {t.tutReplay}
      </button>

      <button
        className="a-btn line"
        onClick={() => {
          logout();
          go("home");
        }}
        aria-label={t.signout}
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
          <button
            className={`a-item pick${plan === item.key ? " on" : ""}`}
            key={item.key}
            onClick={() => setPlan(item.key)}
            aria-pressed={plan === item.key}
            type="button"
          >
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
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Telebirr · 123456"
        />
      </label>
      {error ? <p className="a-err">{error}</p> : null}
      <button
        className="a-btn primary"
        onClick={send}
        disabled={busy || !reference.trim()}
        aria-label={t.sendref}
      >
        {t.sendref}
      </button>
      <p className="a-quiet">{t.note}</p>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- sheet */

function Sheet({ t, eyebrow, title, onClose, children }) {
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
      <section
        className="a-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="a-handle" aria-hidden="true" />
        <div className="a-shead">
          <div>
            {eyebrow ? <p className="a-eyebrow">{eyebrow}</p> : null}
            <h2 className="a-stitle">{title}</h2>
          </div>
          <button
            className="a-close"
            onClick={onClose}
            aria-label={t.cancel}
            type="button"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function FileSheet({ t, course, mat, side, stored, starred, onClose, onRead, onTake, onStar }) {
  const { rateMaterial, myRatingFor, appSettings } = useApp();
  const file = side || mat;
  const mine = myRatingFor(mat.id) || 0;
  const [stars, setStars] = useState(mine);
  const avg = Number(mat.ratingAvg || 0).toFixed(1);
  const canRead = readableDoc(file.name, file.type);
  return (
    <Sheet t={t} eyebrow={course.name} title={file.name} onClose={onClose}>
      <p className="a-quiet" style={{ marginTop: 0 }}>
        {[file.type, file.size, stored ? t.readerOffline : ""].filter(Boolean).join(" · ")}
        {mat.ratingCount ? ` · ${avg}★ ${mat.ratingCount}` : ""}
      </p>
      <button className="a-btn primary" onClick={canRead ? onRead : onTake} aria-label={canRead ? t.readerOpen : opensFile(file) ? t.open : t.download}>
        {canRead ? t.readerOpen : opensFile(file) ? t.open : t.download}
        <Icon name="open" size={17} />
      </button>
      <button className="a-btn quiet" onClick={onStar} aria-label={starred ? t.remove : t.keep}>
        <Icon name="saved" size={16} fill={starred} />
        {starred ? t.remove : t.keep}
      </button>
      {appSettings.showRatings === false ? null : (
        <>
          <h2 className="a-label" style={{ marginTop: 24 }}>
            {t.rate}
          </h2>
          <div className="a-stars" role="group" aria-label={t.rate}>
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

/* ---------------------------------------------------------------- gate sheets */

function AdSheet({ t }) {
  const { downloadPolicy, downloadStatus, gate, setGate, closeGate, completeAdGate, appSettings } =
    useApp();
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
        {downloadStatus.premium
          ? t.premium
          : downloadPolicy.mode === "credits"
          ? `${t.credits}: ${Math.max(0, downloadStatus.credits - 1)}`
          : t.free}
      </p>
      {appSettings.hidePremium ? null : (
        <button
          className="a-btn line"
          onClick={() => setGate({ ...gate, type: "upgrade" })}
          aria-label={t.plans}
        >
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
      <button className="a-btn primary" onClick={onPlans} aria-label={t.plans}>
        {t.plans}
      </button>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------- auth */

function Auth({ t, lang, onLang, theme, onTheme, note, startMode }) {
  const {
    login,
    register,
    verifySignup,
    signInWithCode,
    resendSignInCode,
    finishRecovery,
    coursesData,
    appSettings,
    toast
  } = useApp();
  const [mode, setMode] = useState(startMode === "signup" ? "signup" : "signin");
  const [signin, setSignin] = useState({ identifier: "", password: "" });
  const [signup, setSignup] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    department: FRESHMAN_DEPARTMENT
  });
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
    if (res.ok)
      return toast(`${t.hi}, ${(res.session.name || res.session.email || "").split(" ")[0]}`);
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
    const res = await finishRecovery({
      email: reset.email.trim() || signin.identifier.trim(),
      code,
      newPassword: reset.password
    });
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
          <p className="a-eyebrow">{note ? t.gateTitle : t.brand}</p>
          <h1 className="a-title">{title}</h1>
        </div>
        <span className="a-mark" aria-hidden="true">W</span>
      </header>
      {note ? <p className="a-lede">{note}</p> : null}
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
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </label>
        {mode === "resetcode" ? (
          <label className="a-field">
            <span>{t.newpass}</span>
            <input
              type="password"
              value={reset.password}
              onChange={(event) => setReset((old) => ({ ...old, password: event.target.value }))}
              autoComplete="new-password"
            />
          </label>
        ) : null}
      </>,
      <>
        <button
          className="a-btn primary"
          onClick={
            mode === "verify" ? confirmCode : mode === "twofactor" ? twoFactor : finishReset
          }
          disabled={busy}
          aria-label={t.confirm}
        >
          {t.confirm}
        </button>
        <button className="a-btn line" onClick={again} aria-label={t.resend}>
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
        <input
          value={reset.email}
          onChange={(event) => setReset((old) => ({ ...old, email: event.target.value }))}
          autoComplete="email"
        />
      </label>,
      <>
        <button className="a-btn primary" onClick={askReset} disabled={busy} aria-label={t.send}>
          {t.send}
        </button>
        <button className="a-btn line" onClick={() => setMode("signin")} aria-label={t.back}>
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
          <input
            value={signup.name}
            onChange={(event) => setSignup((old) => ({ ...old, name: event.target.value }))}
            autoComplete="name"
          />
        </label>
        <label className="a-field">
          <span>{t.email}</span>
          <input
            value={signup.email}
            onChange={(event) => setSignup((old) => ({ ...old, email: event.target.value }))}
            autoComplete="email"
            inputMode="email"
          />
        </label>
        <label className="a-field">
          <span>{t.phone} · +251</span>
          <input
            value={phoneLocalDigits(signup.phone)}
            onChange={(event) =>
              setSignup((old) => ({ ...old, phone: phoneFromLocal(event.target.value) }))
            }
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="912345678"
          />
        </label>
        <label className="a-field">
          <span>{t.password}</span>
          <input
            type="password"
            value={signup.password}
            onChange={(event) => setSignup((old) => ({ ...old, password: event.target.value }))}
            autoComplete="new-password"
          />
        </label>
        <label className="a-field">
          <span>{t.department}</span>
          <select
            value={signup.department}
            onChange={(event) => setSignup((old) => ({ ...old, department: event.target.value }))}
          >
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
        <button className="a-btn primary" onClick={signUp} disabled={busy} aria-label={t.signup}>
          {t.signup}
        </button>
        <button className="a-btn line" onClick={() => setMode("signin")} aria-label={t.toSignin}>
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
        <input
          value={signin.identifier}
          onChange={(event) => setSignin((old) => ({ ...old, identifier: event.target.value }))}
          autoComplete="username"
        />
      </label>
      <label className="a-field">
        <span>{t.password}</span>
        <input
          type="password"
          value={signin.password}
          onChange={(event) => setSignin((old) => ({ ...old, password: event.target.value }))}
          autoComplete="current-password"
        />
      </label>
    </>,
    <>
      <button className="a-btn primary" onClick={signIn} disabled={busy} aria-label={t.signin}>
        {t.signin}
      </button>
      {appSettings.allowSignup === false ? (
        <p className="a-quiet">{t.signupOff}</p>
      ) : (
        <button className="a-btn quiet" onClick={() => setMode("signup")} aria-label={t.toSignup}>
          {t.toSignup}
        </button>
      )}
      <button
        className="a-btn line"
        onClick={() => {
          setReset({ email: signin.identifier.trim(), password: "" });
          setMode("reset");
        }}
        aria-label={t.forgot}
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
  return (
    file.type === "Video" ||
    /^https:\/\/(www\.)?(youtube\.com|youtu\.be)/i.test(String(file.url || ""))
  );
}

const DOC_EXT = /\.(pdf|docx|pptx|txt|html|htm)$/i;

function readableDoc(name, type) {
  if (DOC_EXT.test(String(name || ""))) return true;
  return ["pdf", "docx", "pptx", "text", "txt"].includes(
    String(type || "")
      .toLowerCase()
      .replace(/\./g, "")
  );
}

function readEntry(course, mat, side) {
  const file = side || mat;
  return {
    key: fileKey(course.id, mat.id, side ? side.id : ""),
    name: file.name || course.name || "Document",
    course: course.name || "",
    courseId: course.id,
    materialId: mat.id,
    sideMaterialId: side ? side.id : "",
    type: file.type || "",
    url: file.url && !String(file.url).startsWith("#sample") ? file.url : ""
  };
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
  if (entry.url) triggerBrowserDownload(entry.url, namedFile(entry.name, entry.url, entry.type));
}
