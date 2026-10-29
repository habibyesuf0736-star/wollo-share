import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../lib/api.js";
import { DEFAULT_SUBCATEGORIES, isStaffOnlyCourse, nowStamp, triggerBrowserDownload, uniqueId } from "../lib/utils.js";
import {
  STORAGE_KEYS,
  readJson,
  writeJson,
  readNumber,
  writeNumber,
  removeKey,
  takeTabJson
} from "../lib/storage.js";
import { HELP_SEO, LIBRARY_SEO, PREMIUM_SEO, SITE_NAME, applyPageSeo, courseSlug, findCourseBySlug, seoForCourse } from "../lib/seo.js";

const AppContext = createContext(null);

export const DEFAULT_TEXTS = {
  siteTitle: "Wollo Share",
  siteSubtitle: "Wollo University course library",
  welcomeTitle: "Every Wollo University course material in one library",
  welcomeDesc: "Notes, exams, slides and manuals.",
  footerText: "Wollo Share · Built by Wollo University students, for Wollo University students.",
  loginTitle: "One account for the whole library",
  loginLines: "",
  premiumPayment: ""
};

export const DEFAULT_APPEARANCE = {
  primaryColor: "#1d624f",
  fontSize: "16px",
  fontStyle: "sans",
  logoUrl: "",
  modules: { topics: true, docs: true }
};

const BANNER_DISMISSED_KEY = "wollo_announcement_dismissed_v1";

// The rules the administrator sets on Admin → Downloads. The server owns them; this is
// the same shape and the same clamps so a first paint before the fetch is not misleading.
export const DEFAULT_DOWNLOAD_POLICY = {
  mode: "credits",
  uploadsPerCredit: 2,
  adSeconds: 10
};

export function normalizeDownloadPolicy(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const mode = ["credits", "free", "premium"].includes(String(source.mode)) ? String(source.mode) : DEFAULT_DOWNLOAD_POLICY.mode;
  const uploads = Math.round(Number(source.uploadsPerCredit));
  const ad = Math.round(Number(source.adSeconds));
  return {
    mode,
    uploadsPerCredit: Number.isFinite(uploads) ? Math.min(10, Math.max(1, uploads)) : DEFAULT_DOWNLOAD_POLICY.uploadsPerCredit,
    adSeconds: Number.isFinite(ad) ? Math.min(120, Math.max(0, ad)) : DEFAULT_DOWNLOAD_POLICY.adSeconds
  };
}

// Plans that buy unlimited downloads; `free_unlimited` is a grant, not a payment.
const PAID_PLANS = ["premium_monthly", "premium_annual", "paid_lifetime", "paid_download_only"];

// The session lives in localStorage and the token behind it lasts a year, so a student who
// signs in once stays signed in through closing the browser or restarting the machine.
function readStoredSession() {
  const stored = readJson(STORAGE_KEYS.CURRENT_SESSION, null);
  if (stored) return stored;
  return takeTabJson(STORAGE_KEYS.CURRENT_SESSION);
}

// "#/admin/materials" opens straight into that workspace section, and "#/login" or "/login"
// opens the sign-in screen so a refresh or a shared link does not drop back into the library.
function viewFromLocation() {
  const hash = String(window.location.hash);
  const pathname = String(window.location.pathname);
  const coursePath = pathname.match(/^\/c\/([^/]+)/);
  if (coursePath) return { name: "sublist", courseId: null, courseSlug: decodeURIComponent(coursePath[1]) };
  // A scanned sign-in code lands here; the id is the only thing the link carries.
  const authorizePath = pathname.match(/^\/authorize\/([A-Za-z0-9_-]{8,64})/);
  if (authorizePath) return { name: "deviceLogin", qrId: authorizePath[1] };
  if (pathname === "/support" || /^#\/support/.test(hash)) return { name: "support" };
  if (pathname === "/help" || /^#\/help/.test(hash)) return { name: "help" };
  if (pathname === "/premium" || /^#\/premium/.test(hash)) return { name: "premium" };
  if (pathname === "/login" || /^#\/login/.test(hash)) return { name: "login" };
  if (/^#\/profile/.test(hash)) return { name: "profile" };
  const match = hash.match(
    /^#\/admin(?:\/(overview|reviews|courses|materials|appearance|downloads|users|mail|analytics|backup))?/
  );
  return match ? { name: "admin", courseId: null, tab: match[1] || "" } : { name: "library", courseId: null };
}

function initialView() {
  return viewFromLocation();
}

function clearStaffHash() {
  if (/^#\/(admin|support)/.test(window.location.hash)) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

function decodeTokenPayload(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length !== 3 || parts[0] !== "wstok" || !/^[a-f\d]+$/i.test(parts[1])) return null;
    const raw = decodeURIComponent(parts[1].replace(/.{2}/g, (byte) => `%${byte}`));
    const [id, email, role] = raw.split("|");
    return { id, email, role };
  } catch {
    return null;
  }
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== "object" || !raw.authToken) return null;
  if (Number(raw.expiresAt) && raw.expiresAt < Date.now()) return null;
  if (raw.id && raw.email && raw.role) return raw;
  const decoded = decodeTokenPayload(raw.authToken);
  if (!decoded) return null;
  return { ...raw, ...decoded };
}

export function AppProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [coursesData, setCoursesData] = useState(() => readJson(STORAGE_KEYS.COURSES, []));
  const [usersData, setUsersData] = useState(() => readJson(STORAGE_KEYS.USERS, []));
  const [pageTexts, setPageTexts] = useState(() => ({ ...DEFAULT_TEXTS, ...(readJson(STORAGE_KEYS.TEXTS, {}) || {}) }));
  const [appearanceSettings, setAppearanceSettings] = useState(() => ({
    ...DEFAULT_APPEARANCE,
    ...(readJson(STORAGE_KEYS.APPEARANCE, {}) || {})
  }));
  const [userRatings, setUserRatings] = useState(() => readJson(STORAGE_KEYS.USER_RATINGS, {}) || {});
  const [downloadPolicy, setDownloadPolicy] = useState(() =>
    normalizeDownloadPolicy(readJson(STORAGE_KEYS.DOWNLOAD_POLICY, null))
  );
  const [session, setSession] = useState(() => normalizeSession(readStoredSession()));
  const [studentPreview, setStudentPreview] = useState(false);
  const [view, setView] = useState(() => initialView());
  // Which college / program the visitor drilled into on the library page.
  const [browse, setBrowse] = useState({ college: "", courseId: "" });
  const [toasts, setToasts] = useState([]);
  const [gate, setGate] = useState(null);
  const [videoTarget, setVideoTarget] = useState(null);
  const pendingDownloadRef = useRef(readJson(STORAGE_KEYS.PENDING_DOWNLOAD, null));
  const hasLocalMutationRef = useRef(false);
  const baseRevisionRef = useRef(0);
  const syncTimerRef = useRef(null);

  /* ------------------------------------------------------------------ toasts */
  const toast = useCallback((message) => {
    const item = { id: uniqueId("toast"), message: String(message) };
    setToasts((list) => [...list, item]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== item.id)), 4200);
  }, []);
  const dismissToast = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  /* ------------------------------------------------------------ derived auth */
  const isAdmin = Boolean(session && session.role === "admin" && !studentPreview);
  const ownerIsAdmin = Boolean(session && session.role === "admin");
  // Support staff run their own panel, but they are still library staff: everything an
  // administrator can review or publish, they can too — except the admin workspace itself.
  const isStaff = Boolean(session && (session.role === "admin" || session.role === "support") && !studentPreview);
  const ownerIsStaff = Boolean(session && (session.role === "admin" || session.role === "support"));
  const activeUser = useMemo(() => {
    if (!session) return null;
    return (
      usersData.find(
        (u) =>
          u.id === session.id ||
          (u.email && session.email && String(u.email).toLowerCase() === String(session.email).toLowerCase())
      ) || null
    );
  }, [usersData, session]);

  const canEdit = isAdmin;

  const canSeeCourse = useCallback(
    (course) => {
      // Evangadi sells its own pack, so it is not part of the student library at all.
      if (isStaffOnlyCourse(course)) return isAdmin;
      if (!course.restricted) return true;
      if (studentPreview) return false;
      if (isAdmin) return true;
      if (!session) return false;
      if (session.role === "admin" || session.role === "support") return true;
      if (!activeUser) return course.id === "course-evangadi";
      if (activeUser.role === "admin") return true;
      return Array.isArray(activeUser.allowedCourseIds) && activeUser.allowedCourseIds.includes(course.id);
    },
    [activeUser, isAdmin, session, studentPreview]
  );

  /* -------------------------------------------------------------- persistence */
  useEffect(() => {
    writeJson(STORAGE_KEYS.COURSES, coursesData);
  }, [coursesData]);
  useEffect(() => {
    writeJson(STORAGE_KEYS.USERS, usersData);
  }, [usersData]);
  useEffect(() => {
    writeJson(STORAGE_KEYS.TEXTS, pageTexts);
  }, [pageTexts]);
  useEffect(() => {
    writeJson(STORAGE_KEYS.APPEARANCE, appearanceSettings);
  }, [appearanceSettings]);
  useEffect(() => {
    writeJson(STORAGE_KEYS.USER_RATINGS, userRatings);
  }, [userRatings]);
  useEffect(() => {
    writeJson(STORAGE_KEYS.DOWNLOAD_POLICY, downloadPolicy);
  }, [downloadPolicy]);

  // The browser tab wears the signed-in student's own photo; the admin's uploaded logo
  // comes next and the university emblem is the fallback. The type attribute is dropped
  // because a saved avatar is a data URL that may be JPEG or PNG.
  const tabPhoto = activeUser?.avatarUrl || "";
  useEffect(() => {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    const href = tabPhoto || appearanceSettings.logoUrl || "/wollo-university-emblem.png";
    if (link.getAttribute("href") !== href) {
      link.setAttribute("href", href);
      if (tabPhoto) link.removeAttribute("type");
    }
  }, [appearanceSettings.logoUrl, tabPhoto]);

  // Admin edits are pushed to the shared JSON database (debounced). The queue is
  // mirrored to localStorage so a reload or crash mid-save is replayed on next boot.
  const pendingSyncRef = useRef(null);

  // Each server read records the revision the client is now editing against, so a later
  // save can be rejected when somebody else wrote in the meantime.
  const fetchServerState = useCallback(
    (token) =>
      api.fetchState(token).then((res) => {
        baseRevisionRef.current = Number(res && res.contentRevision) || baseRevisionRef.current;
        return res;
      }),
    []
  );

  const flushState = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    const pending = pendingSyncRef.current;
    if (!pending) return;
    pendingSyncRef.current = null;
    hasLocalMutationRef.current = false;
    api.pushState(pending.payload, pending.token).then(
      (res) => {
        if (res && res.ok === false) {
          hasLocalMutationRef.current = true;
          toast(res.error || "Could not sync changes to the server.");
        } else {
          baseRevisionRef.current = Number(res && res.contentRevision) || baseRevisionRef.current;
          removeKey(STORAGE_KEYS.PENDING_ADMIN_STATE);
        }
      },
      () => {
        hasLocalMutationRef.current = true;
      }
    );
  }, [toast]);

  useEffect(() => {
    if (!isAdmin || hasLocalMutationRef.current !== true) return;
    pendingSyncRef.current = {
      payload: {
        coursesData,
        usersData,
        pageTexts,
        appearanceSettings,
        downloadPolicy,
        userRatings,
        contentRevision: baseRevisionRef.current
      },
      token: session.authToken
    };
    writeJson(STORAGE_KEYS.PENDING_ADMIN_STATE, pendingSyncRef.current);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(flushState, 400);
  }, [appearanceSettings, coursesData, downloadPolicy, flushState, isAdmin, pageTexts, session, userRatings, usersData]);

  useEffect(() => {
    window.addEventListener("pagehide", flushState);
    window.addEventListener("beforeunload", flushState);
    return () => {
      window.removeEventListener("pagehide", flushState);
      window.removeEventListener("beforeunload", flushState);
      flushState();
    };
  }, [flushState]);

  const markDirty = useCallback(() => {
    hasLocalMutationRef.current = true;
  }, []);

  const commitCourses = useCallback(
    (updater) => {
      markDirty();
      setCoursesData((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        return next;
      });
    },
    [markDirty]
  );

  const commitUsers = useCallback(
    (updater) => {
      markDirty();
      setUsersData((prev) => (typeof updater === "function" ? updater(prev) : updater));
    },
    [markDirty]
  );

  const commitPageTexts = useCallback(
    (updater) => {
      markDirty();
      setPageTexts((prev) => ({ ...prev, ...(typeof updater === "function" ? updater(prev) : updater) }));
    },
    [markDirty]
  );

  const commitAppearance = useCallback(
    (updater) => {
      markDirty();
      setAppearanceSettings((prev) => ({ ...prev, ...(typeof updater === "function" ? updater(prev) : updater) }));
    },
    [markDirty]
  );

  const commitDownloadPolicy = useCallback(
    (updater) => {
      markDirty();
      setDownloadPolicy((prev) =>
        normalizeDownloadPolicy({ ...prev, ...(typeof updater === "function" ? updater(prev) : updater) })
      );
    },
    [markDirty]
  );

  /* -------------------------------------------------------------------- boot */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let res = await fetchServerState(session ? session.authToken : null);
      if (res && res.status === 401) {
        setSession(null);
        removeKey(STORAGE_KEYS.CURRENT_SESSION);
        res = await fetchServerState(null);
      }
      if (cancelled) return;

      // A save interrupted by a reload is replayed only while the server still holds
      // the same revision we queued against; a newer server revision means somebody
      // else wrote since, and replaying would silently revert their work.
      const interrupted = readJson(STORAGE_KEYS.PENDING_ADMIN_STATE, null);
      let replayed = false;
      if (interrupted && interrupted.payload && session && session.role === "admin") {
        const queuedRevision = Number(interrupted.payload.contentRevision) || 0;
        const serverMovedOn = Number(res && res.contentRevision) > queuedRevision;
        if (serverMovedOn) {
          removeKey(STORAGE_KEYS.PENDING_ADMIN_STATE);
          toast("Unsynced admin edits were skipped to protect newer server data.");
        } else {
          const replay = await api.replayPendingState(interrupted.payload, session.authToken);
          if (replay && replay.ok !== false) {
            removeKey(STORAGE_KEYS.PENDING_ADMIN_STATE);
            replayed = true;
          }
        }
      }
      if (cancelled || !res || res.ok === false) {
        if (!cancelled) setBooting(false);
        return;
      }
      if (!replayed && !hasLocalMutationRef.current) {
        if (Array.isArray(res.coursesData) && res.coursesData.length) setCoursesData(res.coursesData);
        if (Array.isArray(res.usersData) && res.usersData.length) setUsersData(res.usersData);
        if (res.pageTexts && typeof res.pageTexts === "object")
          setPageTexts({ ...DEFAULT_TEXTS, ...res.pageTexts });
        if (res.appearanceSettings && typeof res.appearanceSettings === "object")
          setAppearanceSettings({ ...DEFAULT_APPEARANCE, ...res.appearanceSettings });
        if (res.userRatings && typeof res.userRatings === "object")
          setUserRatings((prev) => ({ ...prev, ...res.userRatings }));
      }
      // The gate rules always come from the server: a locally cached policy could
      // hand a student downloads the administrator has since closed. Students cannot edit
      // them, so a pending local change is no reason to keep theirs; only an admin tab with
      // unsaved edits (or a replay we just performed, whose answer predates it) holds back.
      if (
        res.downloadPolicy &&
        !replayed &&
        (session?.role !== "admin" || !hasLocalMutationRef.current)
      ) {
        setDownloadPolicy(normalizeDownloadPolicy(res.downloadPolicy));
      }
      if (!cancelled) setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- navigation */
  // A course gets a real address (/c/<slug>) so a shared or indexed link opens that
  // program's files instead of dropping the visitor back at the top of the library.
  const setCoursePath = (slug) => {
    const next = slug ? `/c/${slug}` : "/";
    if (window.location.pathname !== next) window.history.pushState(null, "", next);
  };
  const goLibrary = useCallback(() => {
    clearStaffHash();
    setBrowse({ college: "", courseId: "" });
    setView({ name: "library", courseId: null });
    if (window.location.pathname !== "/") window.history.pushState(null, "", "/");
  }, []);
  // Keeps the current college/program selection so "back" from a program's
  // materials returns to the year list instead of the top of the library.
  const goBrowse = useCallback((next) => {
    clearStaffHash();
    if (next) setBrowse((prev) => ({ ...prev, ...next }));
    setView({ name: "library", courseId: null });
    if (window.location.pathname !== "/") window.history.pushState(null, "", "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const goSublist = useCallback(
    (courseId, query = "") => {
      clearStaffHash();
      setView({ name: "sublist", courseId, query });
      const course = coursesData.find((item) => item.id === courseId);
      setCoursePath(course ? courseSlug(course) : "");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [coursesData]
  );
  // "Sign in" and "create an account" are the same screen on different tabs, so the
  // caller that means registration says so. A click event can arrive as the first
  // argument, so only the known tab name is taken.
  const goLogin = useCallback((tab) => {
    clearStaffHash();
    setView({ name: "login", tab: tab === "register" ? "register" : "" });
    if (window.location.pathname !== "/login") window.history.pushState(null, "", "/login");
  }, []);
  const goAdmin = useCallback((tab) => setView({ name: "admin", tab: tab || "" }), []);
  const goProfile = useCallback(() => {
    clearStaffHash();
    setView({ name: "profile" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  // The support panel has its own address so a staff member can bookmark it and a
  // student can come back to their complaint thread without going through the library.
  const goSupport = useCallback(() => {
    setView({ name: "support" });
    if (window.location.pathname !== "/support") window.history.pushState(null, "", "/support");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  // The pricing page is public and crawlable, so a customer can be sent a link and buy
  // without ever signing in first.
  const goPremium = useCallback(() => {
    setView({ name: "premium" });
    if (window.location.pathname !== "/premium") window.history.pushState(null, "", "/premium");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  // Help is readable without an account, so a visitor sent the link gets the rules and
  // the support route instead of a sign-in wall.
  const goHelp = useCallback(() => {
    clearStaffHash();
    setView({ name: "help" });
    if (window.location.pathname !== "/help") window.history.pushState(null, "", "/help");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // A pasted or crawled /c/<slug> address arrives before the catalog is loaded, so the
  // slug is matched to a course as soon as the library data lands.
  useEffect(() => {
    if (view.name !== "sublist" || view.courseId || !view.courseSlug) return;
    const course = findCourseBySlug(coursesData, view.courseSlug);
    if (course) setView({ name: "sublist", courseId: course.id, query: "", year: "" });
    else setView({ name: "library", courseId: null });
  }, [view, coursesData]);

  // Titles and descriptions follow the page so a crawler and a browser tab both say
  // what this screen holds.
  useEffect(() => {
    if (view.name === "sublist") {
      const course = coursesData.find((item) => item.id === view.courseId);
      if (course) {
        applyPageSeo(seoForCourse(course));
        return;
      }
    }
    if (view.name === "login") {
      applyPageSeo({
        path: "/login",
        title: `Sign in or create a free student account | ${SITE_NAME} — Wollo University materials`,
        description: "Register free to download Wollo University lecture notes, slide decks and past exam PDFs shared by other students."
      });
      return;
    }
    if (view.name === "support") {
      applyPageSeo({
        path: "/support",
        title: `Help & complaints — Wollo Share support team | ${SITE_NAME}`,
        description: "Report a broken file, a missing course document or a download problem to the Wollo Share support team and follow the answer in your own thread."
      });
      return;
    }
    if (view.name === "premium") {
      applyPageSeo(PREMIUM_SEO);
      return;
    }
    if (view.name === "help") {
      applyPageSeo(HELP_SEO);
      return;
    }
    if (view.name === "deviceLogin") {
      applyPageSeo({
        path: "/authorize",
        title: `Sign in on this device | ${SITE_NAME}`,
        description: "Confirm this computer or laptop on Wollo Share after scanning the sign-in code with your phone.",
        noindex: true
      });
      return;
    }
    if (view.name === "profile" || view.name === "admin") {
      applyPageSeo({ ...LIBRARY_SEO, noindex: true });
      return;
    }
    applyPageSeo(LIBRARY_SEO);
  }, [view, coursesData]);

  // Editing or pasting an address like "#/admin/materials" or "/c/math1011" routes the
  // running app too, not just a fresh page load.
  useEffect(() => {
    const onLocationChange = () => {
      const next = viewFromLocation();
      if (next.name === "login") setView({ name: "login" });
      else if (next.name === "deviceLogin") setView({ name: "deviceLogin", qrId: next.qrId });
      else if (next.name === "profile") setView({ name: "profile" });
      else if (next.name === "support") setView({ name: "support" });
      else if (next.name === "help") setView({ name: "help" });
      else if (next.name === "premium") setView({ name: "premium" });
      else if (next.name === "admin") setView({ name: "admin", courseId: null, tab: next.tab });
      else if (next.name === "sublist") setView({ name: "sublist", courseId: null, courseSlug: next.courseSlug, query: "", year: "" });
      else setView({ name: "library", courseId: null });
    };
    window.addEventListener("hashchange", onLocationChange);
    window.addEventListener("popstate", onLocationChange);
    return () => {
      window.removeEventListener("hashchange", onLocationChange);
      window.removeEventListener("popstate", onLocationChange);
    };
  }, []);

  // The sign-in screen owns its own address, so reloading or sharing it cannot silently
  // fall back to the library.
  useEffect(() => {
    const onLoginHash = /^#\/login/.test(window.location.hash);
    const onLoginPath = window.location.pathname === "/login";
    if (view.name === "login") {
      if (!onLoginHash && !onLoginPath) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search + "#/login");
      }
    } else if (onLoginHash || onLoginPath) {
      window.history.replaceState(null, "", onLoginPath ? "/" : window.location.pathname + window.location.search);
    }
  }, [view.name]);
  // Previewing as a student always leaves the admin workspace, otherwise the
  // admin-only screens would disappear mid-preview.
  const toggleStudentPreview = useCallback(() => {
    const next = !studentPreview;
    setStudentPreview(next);
    if (next) {
      clearStaffHash();
      setView({ name: "library", courseId: null });
    }
  }, [setStudentPreview, studentPreview]);

  /* -------------------------------------------------------------------- auth */
  const storeSession = useCallback((next) => {
    const normalized = normalizeSession(next);
    setSession(normalized);
    if (normalized) writeJson(STORAGE_KEYS.CURRENT_SESSION, normalized);
    else removeKey(STORAGE_KEYS.CURRENT_SESSION);
    return normalized;
  }, []);

  // Loading the account's own slice of shared state right after a sign-in keeps the library,
  // the credits and the profile photo correct on the very first paint.
  const settleSession = useCallback(
    async (rawSession) => {
      const saved = storeSession(rawSession);
      hasLocalMutationRef.current = false;
      const state = await fetchServerState(saved.authToken);
      if (state && state.ok !== false) {
        if (Array.isArray(state.coursesData)) setCoursesData(state.coursesData);
        if (Array.isArray(state.usersData) && state.usersData.length) setUsersData(state.usersData);
        if (state.userRatings) setUserRatings((prev) => ({ ...prev, ...state.userRatings }));
      }
      return saved;
    },
    [storeSession]
  );

  const login = useCallback(
    async ({ identifier, password }) => {
      const res = await api.login(identifier, password);
      if (res && res.ok === true && res.twoFactor) {
        return {
          ok: false,
          twoFactor: true,
          identifier,
          email: res.email || identifier,
          minutesLeft: res.minutesLeft || 10,
          message: res.message || ""
        };
      }
      if (!res || res.ok !== true || !res.session)
        return {
          ok: false,
          needsRecovery: Boolean(res && res.needsRecovery),
          email: res && res.email,
          error: (res && res.error) || "Sign in failed."
        };
      const saved = await settleSession(res.session);
      return {
        ok: true,
        session: saved,
        verifiedNow: Boolean(res.verifiedNow),
        codeSkipped: Boolean(res.codeSkipped),
        message: res.message || ""
      };
    },
    [settleSession]
  );

  // The emailed half of a sign-in: no session exists until these six digits match.
  const signInWithCode = useCallback(
    async ({ identifier, code }) => {
      const res = await api.verifySignInCode(identifier, code);
      if (!res || res.ok !== true || !res.session)
        return {
          ok: false,
          expired: Boolean(res && res.expired),
          error: (res && res.error) || "That code did not work."
        };
      const saved = await settleSession(res.session);
      return { ok: true, session: saved, message: res.message || "" };
    },
    [settleSession]
  );

  const resendSignInCode = useCallback(async (identifier) => {
    const res = await api.resendSignInCode(identifier);
    return {
      ok: Boolean(res && res.ok),
      mailSent: Boolean(res && res.mailSent),
      codeInvalidated: Boolean(res && res.codeInvalidated),
      error: (res && res.error) || "",
      message: (res && res.message) || ""
    };
  }, []);

  const register = useCallback(
    async (details) => {
      const res = await api.registerAccount(details);
      if (!res || res.ok !== true) return { ok: false, error: (res && res.error) || "Registration failed." };
      // The account exists, but it is not opened here: no session is stored until the
      // emailed code is confirmed, so a reload cannot slip past the code step.
      return {
        ok: true,
        user: res.user,
        pendingVerification: true,
        email: res.email || details.email,
        mailSent: Boolean(res.mailSent),
        message: res.message || ""
      };
    },
    []
  );

  const verifySignup = useCallback(
    async (email, code) => {
      const res = await api.verifyEmail(email, code);
      if (!res || res.ok !== true) return { ok: false, error: (res && res.error) || "Verification failed." };
      if (res.session) {
        const saved = await settleSession(res.session);
        if (res.user) setUsersData((prev) => [res.user, ...prev.filter((u) => u.id !== res.user.id)]);
        return { ok: true, signedIn: true, session: saved };
      }
      return { ok: true, signedIn: false, message: res.message };
    },
    [settleSession]
  );

  // A finished reset proves the mailbox and sets the password, so it opens the account instead
  // of sending the student back through the sign-in form.
  const finishRecovery = useCallback(
    async ({ email, code, newPassword }) => {
      const res = await api.completeRecovery({ email, code, newPassword });
      if (!res || res.ok !== true) return { ok: false, error: (res && res.error) || "Recovery failed." };
      if (!res.session) return { ok: true, signedIn: false, message: res.message };
      const saved = await settleSession(res.session);
      if (res.user) setUsersData((prev) => prev.map((u) => (u.id === res.user.id ? { ...u, ...res.user } : u)));
      return { ok: true, signedIn: true, session: saved };
    },
    [settleSession]
  );

  const saveProfile = useCallback(async (details) => {
    if (!session) return { ok: false, error: "Sign in to edit your profile." };
    const res = await api.updateProfile(details, session.authToken);
    if (!res || res.ok !== true) return { ok: false, error: (res && res.error) || "Could not save your profile." };
    if (res.user) setUsersData((prev) => prev.map((u) => (u.id === res.user.id ? { ...u, ...res.user } : u)));
    return { ok: true, user: res.user, message: res.message };
  }, [session]);

  const logout = useCallback(() => {
    storeSession(null);
    setStudentPreview(false);
    setVideoTarget(null);
    setGate(null);
    goLibrary();
  }, [goLibrary, storeSession]);

  /* --------------------------------------------------------- download status */
  // The rules the administrator set on Admin → Downloads, applied to this account.
  // Premium plans never wait; `free_unlimited` is a grant rather than a payment, so it
  // still sees the sponsor slot; the site-wide mode can open every file to any signed-in
  // student or close them to unpaid ones.
  const downloadStatus = useMemo(() => {
    const credits = Number(activeUser?.downloadCredits) || 0;
    const progress = Number(activeUser?.unpaidCurrentUploadProgress) || 0;
    const totalShared = Number(activeUser?.sharedMaterialsCount) || 0;
    const requiredCount = downloadPolicy.uploadsPerCredit;
    const open = (plan, badgeText, extra = {}) => ({
      canDownload: true,
      premium: false,
      plan,
      credits,
      progress,
      requiredCount,
      sharedCount: totalShared,
      badgeText,
      ...extra
    });
    const unlimited = (plan, badgeText, extra = {}) => open(plan, badgeText, { premium: true, ...extra });

    if (studentPreview) {
      return {
        canDownload: false,
        premium: false,
        plan: "visitor_unpaid",
        credits: 0,
        progress: 0,
        requiredCount,
        sharedCount: 0,
        badgeText: "Student preview · free materials only"
      };
    }
    if (isAdmin) {
      return {
        canDownload: true,
        premium: true,
        plan: "admin",
        credits: 0,
        progress: 0,
        requiredCount: 0,
        sharedCount: 0,
        badgeText: "Administrator · Unlimited downloads"
      };
    }
    if (!activeUser) {
      return {
        canDownload: false,
        premium: false,
        plan: "visitor_unpaid",
        credits: 0,
        progress: 0,
        requiredCount,
        sharedCount: 0,
        badgeText: "Free materials only · Sign in to save progress"
      };
    }

    // Staff open files to review them, whatever the plan says.
    if (activeUser.role === "support") {
      return open("support", "Support team · Unlimited downloads");
    }

    const plan =
      activeUser.accountPlan ||
      (activeUser.downloadOnlyAccount
        ? "paid_download_only"
        : activeUser.paymentStatus === "paid"
        ? "paid_lifetime"
        : "unpaid");

    if (plan === "premium_annual" || plan === "premium_monthly") {
      const expiry = activeUser.subscriptionExpiry ? new Date(activeUser.subscriptionExpiry) : null;
      if (expiry && expiry > new Date()) {
        return unlimited(
          plan,
          `${plan === "premium_monthly" ? "Premium monthly" : "Premium annual"} · Unlimited downloads`,
          { daysLeft: Math.ceil((expiry - new Date()) / 86400000) }
        );
      }
      // Lapsed or never-dated: the server folds the account back to unpaid, so the
      // library must not keep showing it as premium.
    }
    if (plan === "paid_download_only") return unlimited(plan, "Paid account · Unlimited downloads");
    if (plan === "paid_lifetime") return unlimited(plan, "Paid student · Lifetime downloads");
    if (plan === "free_unlimited") return open(plan, "Free · unlimited downloads");

    if (downloadPolicy.mode === "free") {
      return open("unpaid", "Free downloads are open to every student");
    }
    if (downloadPolicy.mode === "premium") {
      return {
        canDownload: false,
        premium: false,
        plan: "unpaid",
        credits,
        progress,
        requiredCount,
        sharedCount: totalShared,
        badgeText: "Premium files only · Ask for a plan"
      };
    }
    return {
      canDownload: credits > 0,
      premium: false,
      plan: "unpaid",
      credits,
      progress,
      requiredCount,
      sharedCount: totalShared,
      badgeText: credits > 0 ? `Free plan · ${credits} download${credits === 1 ? "" : "s"} ready` : "Free plan"
    };
  }, [activeUser, downloadPolicy, isAdmin, studentPreview]);

  /* ------------------------------------------------- earned download credits */
  // The server owns the credit ledger (two approved contributions = one download),
  // so the client re-reads it after signing in and after every submission.
  const [mySubmissions, setMySubmissions] = useState([]);

  const syncCredits = useCallback(
    async () => {
      if (!session) return null;
      const res = await api.listMySubmissions(session.authToken);
      if (!res || res.ok === false) return null;
      setMySubmissions(Array.isArray(res.submissions) ? res.submissions : []);
      if (activeUser && !studentPreview) {
        commitUsers((prev) =>
          prev.map((u) =>
            u.id === activeUser.id
              ? {
                  ...u,
                  downloadCredits: Number(res.downloadCredits) || 0,
                  downloadsCount: Number(res.downloadsCount) || Number(u.downloadsCount) || 0,
                  unpaidCurrentUploadProgress: Number(res.unpaidCurrentUploadProgress) || 0,
                  sharedMaterialsCount: Number(res.sharedMaterialsCount) || 0
                }
              : u
          )
        );
      }
      return res;
    },
    [activeUser, commitUsers, session, studentPreview]
  );

  useEffect(() => {
    if (!session) {
      setMySubmissions([]);
      return;
    }
    syncCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session && session.authToken]);

  // A student who is waiting on the review queue should get their file the moment
  // the administrator publishes their second upload, without reloading the page.
  useEffect(() => {
    if (!session || downloadStatus.premium) return undefined;
    const timer = setInterval(syncCredits, 25_000);
    const onFocus = () => syncCredits();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [downloadStatus.premium, session, syncCredits]);

  const materialIsFree = useCallback((mat) => Boolean(mat && mat.free), []);
  const canDownloadMaterial = useCallback(
    (mat) => Boolean(mat && (mat.free || downloadStatus.canDownload)),
    [downloadStatus.canDownload]
  );

  /* ------------------------------------------------------ gated download flow */
  // The server holds the ledger and the policy, so a student's local copy is replaced by
  // whatever the answer carries — including an administrator who just changed the mode.
  const adoptLedger = useCallback(
    (res) => {
      // A refusal is an answer too. The server marks a denial `ok: false`, but its body
      // still carries the policy and the ledger, so dropping it would leave the student
      // on the copy from before the administrator closed the library or moved their credits.
      if (!res) return;
      if (res.downloadMode) {
        setDownloadPolicy((prev) =>
          normalizeDownloadPolicy({
            ...prev,
            mode: res.downloadMode,
            uploadsPerCredit: res.uploadsPerCredit,
            adSeconds: res.adSeconds
          })
        );
      }
      if (!activeUser || studentPreview) return;
      // Only a real ledger answer may rewrite the numbers; an error body without them
      // would otherwise zero out credits the student still holds.
      if (res.downloadCredits === undefined && res.downloadsCount === undefined) return;
      commitUsers((prev) =>
        prev.map((u) =>
          u.id === activeUser.id
            ? {
                ...u,
                downloadCredits: Number(res.downloadCredits) || 0,
                downloadsCount: Number(res.downloadsCount) || Number(u.downloadsCount) || 0,
                unpaidCurrentUploadProgress: Number(res.unpaidCurrentUploadProgress) || 0,
                sharedMaterialsCount: Number(res.sharedMaterialsCount) || 0
              }
            : u
        )
      );
    },
    [activeUser, commitUsers, studentPreview]
  );

  // Access is decided here rather than in the browser, so the plan the administrator
  // hands out — or takes back — applies on the next click instead of the next reload.
  const performDownload = useCallback(
    async (courseId, materialId, sideMaterialId) => {
      const course = coursesData.find((c) => c.id === courseId);
      const mat = course ? (course.materials || []).find((m) => m.id === materialId) : null;
      if (!mat) return false;

      const needsAuthorisation = Boolean(session && activeUser && !studentPreview);
      if (needsAuthorisation) {
        const res = await api.authorizeDownload({ courseId, materialId }, session.authToken).catch(() => null);
        adoptLedger(res);
        // Refused: out of credits, or the library is closed to this plan now. A free file
        // and a premium account are allowed too, so the same call also stops a plan the
        // administrator took back. Only a request that got no answer at all falls through —
        // a student who was allowed a moment ago is not punished for an outage.
        if (res && res.allowed !== true) {
          pendingDownloadRef.current = null;
          removeKey(STORAGE_KEYS.PENDING_DOWNLOAD);
          setGate({ type: "upgrade", courseId, materialId, sideMaterialId, title: mat.name || "Study Material" });
          toast(res.reason || "That file is closed to your account right now.");
          return false;
        }
      }

      const sideMat = sideMaterialId ? (mat.sideMaterials || []).find((s) => s.id === sideMaterialId) : null;
      const href = sideMat
        ? sideMat.url && !sideMat.url.startsWith("#sample")
          ? sideMat.url
          : `data:text/plain;charset=utf-8,${encodeURIComponent(
              `Wollo Share Companion Material\n${sideMat.name}\n${sideMat.type || "PDF"} · ${sideMat.size || "1.4 MB"}`
            )}`
        : mat.url && !mat.url.startsWith("#sample")
        ? mat.url
        : `data:text/plain;charset=utf-8,${encodeURIComponent(
            `Wollo Share Course Material\nFile: ${mat.name}\nYear: ${mat.year || "Year 1"}\nType: ${mat.type}\nSize: ${mat.size}`
          )}`;
      triggerBrowserDownload(href, (sideMat || mat).name || "wollo-share-material");

      if (session && activeUser && !studentPreview) {
        // The download count itself comes back on the authorize answer; adding one here too
        // would report every file twice.
        commitUsers((prev) =>
          prev.map((u) => (u.id === activeUser.id ? { ...u, lastActiveAt: "Active now" } : u))
        );
      }
      pendingDownloadRef.current = null;
      removeKey(STORAGE_KEYS.PENDING_DOWNLOAD);
      toast(`Downloading "${(sideMat || mat).name}"`);
      return true;
    },
    [adoptLedger, activeUser, commitUsers, coursesData, session, studentPreview, toast]
  );

  const requestDownload = useCallback(
    (courseId, materialId, sideMaterialId = "") => {
      const course = coursesData.find((c) => c.id === courseId);
      const mat = course ? (course.materials || []).find((m) => m.id === materialId) : null;
      const sideMat = mat && sideMaterialId ? (mat.sideMaterials || []).find((s) => s.id === sideMaterialId) : null;
      const title = (sideMat || mat || {}).name || "Study Material";
      const isFree = Boolean(mat && mat.free);

      const queue = (type) => {
        pendingDownloadRef.current = { courseId, materialId, sideMaterialId, title };
        writeJson(STORAGE_KEYS.PENDING_DOWNLOAD, pendingDownloadRef.current);
        setGate({ type, courseId, materialId, sideMaterialId, title });
        return false;
      };

      if (!isFree && !session) return queue("register");
      if (!isFree && !downloadStatus.canDownload) return queue("upgrade");
      // Everyone outside a premium plan watches the sponsor slot first, unless the
      // administrator switched the wait off.
      if (!downloadStatus.premium && downloadPolicy.adSeconds > 0) return queue("ad");
      return performDownload(courseId, materialId, sideMaterialId);
    },
    [coursesData, downloadPolicy.adSeconds, downloadStatus.canDownload, downloadStatus.premium, performDownload, session, setGate]
  );

  // Called by the ad modal when its countdown reaches zero.
  const completeAdGate = useCallback(() => {
    const pending = pendingDownloadRef.current;
    setGate(null);
    if (!pending) return;
    pendingDownloadRef.current = null;
    removeKey(STORAGE_KEYS.PENDING_DOWNLOAD);
    performDownload(pending.courseId, pending.materialId, pending.sideMaterialId);
  }, [performDownload, setGate]);

  const closeGate = useCallback(() => setGate(null), []);

  // A download blocked by the paywall resumes automatically the moment access
  // arrives — the admin flipping a plan, or the second contribution being
  // approved. It re-enters requestDownload so the sponsor slot still plays.
  useEffect(() => {
    if (!downloadStatus.canDownload) return;
    const pending = pendingDownloadRef.current;
    if (!pending) return;
    if (gate && gate.type === "ad") return;
    pendingDownloadRef.current = null;
    removeKey(STORAGE_KEYS.PENDING_DOWNLOAD);
    setGate(null);
    requestDownload(pending.courseId, pending.materialId, pending.sideMaterialId);
  }, [downloadStatus.canDownload, gate, requestDownload]);

  const completePendingDownload = useCallback(() => {
    const pending = pendingDownloadRef.current;
    setGate(null);
    if (!pending) return;
    const fresh = coursesData.find((c) => c.id === pending.courseId);
    const mat = fresh ? (fresh.materials || []).find((m) => m.id === pending.materialId) : null;
    const sideMat = pending.sideMaterialId && mat ? (mat.sideMaterials || []).find((s) => s.id === pending.sideMaterialId) : null;
    const href = (sideMat || mat || {}).url || "#";
    if (sideMat || mat) {
      performDownload(pending.courseId, pending.materialId, pending.sideMaterialId);
    } else {
      toast("The requested material is no longer available.");
    }
    void href;
  }, [coursesData, performDownload, toast]);

  /* ----------------------------------------------------------- student share */
  // Contributions never land in the library directly: they go to the admin review
  // queue (and an email heads-up) and only appear once approved.
  const submitMaterialForReview = useCallback(
    async ({ courseId, name, type, size, url, year, semester, subcategory, department, contributorName }) => {
      if (!session) return { ok: false, error: "Sign in to send a document for review." };
      const course = coursesData.find((c) => c.id === courseId) || coursesData[0];
      const matName = String(name || "").trim();
      if (!course) return { ok: false, error: "Choose the course this document belongs to." };
      if (!matName) return { ok: false, error: "Give the document a title." };

      const res = await api.submitMaterial(
        {
          courseId: course.id,
          name: matName,
          type,
          size,
          url: url || "#sample-file",
          year,
          semester,
          subcategory: subcategory || "Lecture Notes",
          department: department || activeUser?.department || course.name,
          contributorName: contributorName || activeUser?.name || "Student"
        },
        session.authToken
      );
      if (!res || res.ok === false) {
        syncCredits();
        return {
          ok: false,
          duplicate: res && (res.status === 409 || Boolean(res.duplicateOf)),
          error: (res && res.error) || "Could not send the document for review."
        };
      }

      writeJson(STORAGE_KEYS.LAST_SUBMITTED_MAT_NAME, matName);
      if (contributorName) writeJson(STORAGE_KEYS.LAST_CONTRIBUTOR_NAME, contributorName);
      if (department) writeJson(STORAGE_KEYS.LAST_CONTRIBUTOR_DEPT, department);

      if (activeUser && !studentPreview) {
        commitUsers((prev) =>
          prev.map((u) =>
            u.id === activeUser.id
              ? {
                  ...u,
                  lastActiveAt: "Active now",
                  activityLog: [
                    {
                      id: uniqueId("act"),
                      type: "Submitted Material",
                      detail: `Sent '${matName}' for admin review (${course.name} · ${year} · ${semester})`,
                      timestamp: nowStamp()
                    },
                    ...(u.activityLog || [])
                  ].slice(0, 60)
                }
              : u
          )
        );
      }
      await syncCredits();
      return { ok: true, notified: Boolean(res.notified), submission: res.submission || null };
    },
    [activeUser, commitUsers, coursesData, session, studentPreview, syncCredits]
  );

  /* ------------------------------------------------------------ video progress */
  const videoProgress = useMemo(() => {
    if (activeUser && !studentPreview) return activeUser.videoProgress || {};
    return readJson(STORAGE_KEYS.VIDEO_PROGRESS, {}) || {};
  }, [activeUser, studentPreview]);

  const recordVideoProgress = useCallback(
    (courseId, materialId, patch) => {
      const duration = Math.max(0, Math.round(Number(patch.duration) || 0));
      const seconds = Math.max(0, Math.round(Number(patch.seconds) || 0));
      const percent = duration > 0 ? Math.min(100, Math.round((seconds / duration) * 100)) : Math.max(0, Math.min(100, Math.round(Number(patch.percent) || 0)));
      const entry = {
        seconds,
        duration,
        percent,
        completed: percent >= 90,
        updatedAt: new Date().toISOString()
      };
      if (!courseId || !materialId) return entry;
      const key = `${courseId}::${materialId}`;
      if (session && activeUser && !studentPreview) {
        commitUsers((prev) =>
          prev.map((u) =>
            u.id === activeUser.id ? { ...u, videoProgress: { ...(u.videoProgress || {}), [key]: entry } } : u
          )
        );
        api.saveVideoProgress({ courseId, materialId, ...entry }, session.authToken).catch(() => {});
      } else {
        const store = readJson(STORAGE_KEYS.VIDEO_PROGRESS, {}) || {};
        writeJson(STORAGE_KEYS.VIDEO_PROGRESS, { ...store, [key]: entry });
      }
      return entry;
    },
    [activeUser, commitUsers, session, studentPreview]
  );

  /* --------------------------------------------------------------- materials */
  const patchCourse = useCallback(
    (courseId, patchFn) =>
      commitCourses((prev) => prev.map((c) => (c.id === courseId ? patchFn(c) : c))),
    [commitCourses]
  );

  const addCourse = useCallback(
    (course) => {
      const record = {
        id: course.id || uniqueId("course"),
        subcategories: [...DEFAULT_SUBCATEGORIES],
        materials: [],
        color: "#1d624f",
        ...course
      };
      commitCourses((prev) => [record, ...prev]);
      return record;
    },
    [commitCourses]
  );

  const updateCourse = useCallback(
    (courseId, patch) => patchCourse(courseId, (c) => ({ ...c, ...patch })),
    [patchCourse]
  );

  const deleteCourse = useCallback(
    (courseId) => commitCourses((prev) => prev.filter((c) => c.id !== courseId)),
    [commitCourses]
  );

  const moveCourse = useCallback(
    (index, direction) =>
      commitCourses((prev) => {
        const target = index + direction;
        if (target < 0 || target >= prev.length) return prev;
        const next = [...prev];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      }),
    [commitCourses]
  );

  const addMaterial = useCallback(
    (courseId, material) =>
      patchCourse(courseId, (c) => {
        const subcategories = c.subcategories && c.subcategories.length ? [...c.subcategories] : [...DEFAULT_SUBCATEGORIES];
        if (material.subcategory && !subcategories.includes(material.subcategory)) subcategories.push(material.subcategory);
        return {
          ...c,
          subcategories,
          materials: [
            ...(c.materials || []),
            { id: uniqueId("mat"), ratingAvg: 0, ratingCount: 0, hidden: false, ...material }
          ]
        };
      }),
    [patchCourse]
  );

  const updateMaterial = useCallback(
    (courseId, materialId, patch) =>
      patchCourse(courseId, (c) => ({
        ...c,
        materials: (c.materials || []).map((m) => (m.id === materialId ? { ...m, ...patch } : m))
      })),
    [patchCourse]
  );

  const deleteMaterial = useCallback(
    (courseId, materialId) =>
      patchCourse(courseId, (c) => ({ ...c, materials: (c.materials || []).filter((m) => m.id !== materialId) })),
    [patchCourse]
  );

  const toggleMaterialVisibility = useCallback(
    (courseId, materialId) =>
      patchCourse(courseId, (c) => ({
        ...c,
        materials: (c.materials || []).map((m) => (m.id === materialId ? { ...m, hidden: !m.hidden } : m))
      })),
    [patchCourse]
  );

  const addSideMaterial = useCallback(
    (courseId, materialId, sideMaterial) =>
      patchCourse(courseId, (c) => ({
        ...c,
        materials: (c.materials || []).map((m) =>
          m.id === materialId
            ? { ...m, sideMaterials: [{ id: uniqueId("side"), ...sideMaterial }, ...(m.sideMaterials || [])] }
            : m
        )
      })),
    [patchCourse]
  );

  const deleteSideMaterial = useCallback(
    (courseId, materialId, sideMaterialId) =>
      patchCourse(courseId, (c) => ({
        ...c,
        materials: (c.materials || []).map((m) =>
          m.id === materialId
            ? { ...m, sideMaterials: (m.sideMaterials || []).filter((s) => s.id !== sideMaterialId) }
            : m
        )
      })),
    [patchCourse]
  );

  /* ------------------------------------------------------------------ rating */
  const ratingKey = useCallback((materialId) => {
    if (!session) return "visitor";
    const token = session.id || session.email;
    return `${token.toLowerCase()}::${materialId.toLowerCase()}`;
  }, [session]);

  const myRatingFor = useCallback(
    (materialId) => Number(userRatings[ratingKey(materialId)]) || 0,
    [ratingKey, userRatings]
  );

  const rateMaterial = useCallback(
    async (courseId, materialId, stars) => {
      if (!session) {
        toast("Sign in with a student account to rate materials.");
        goLogin();
        return false;
      }
      const res = await api.rateMaterial(courseId, materialId, stars, session.authToken);
      if (!res || res.ok !== true) {
        toast((res && res.error) || "Rating could not be saved.");
        return false;
      }
      if (typeof res.ratingAvg === "number") {
        commitCourses((prev) =>
          prev.map((c) =>
            c.id !== courseId
              ? c
              : {
                  ...c,
                  materials: (c.materials || []).map((m) =>
                    m.id === materialId ? { ...m, ratingAvg: res.ratingAvg, ratingCount: res.ratingCount } : m
                  )
                }
          )
        );
      }
      setUserRatings((prev) => ({ ...prev, [`${String(session.id || session.email).toLowerCase()}::${materialId.toLowerCase()}`]: stars }));
      toast(`Thanks — you rated this material ${stars}★`);
      return true;
    },
    [commitCourses, goLogin, session, toast]
  );

  /* -------------------------------------------------------------------- ads */
  const ads = useMemo(() => (Array.isArray(pageTexts.__ads) ? pageTexts.__ads : []), [pageTexts]);
  const [dismissedAds, setDismissedAds] = useState(() => readJson(STORAGE_KEYS.DISMISSED_ADS, []) || []);

  const saveAd = useCallback(
    (ad) => {
      commitPageTexts((prev) => {
        const list = Array.isArray(prev.__ads) ? [...prev.__ads] : [];
        const index = list.findIndex((a) => a.id === ad.id);
        if (index >= 0) list[index] = { ...list[index], ...ad };
        else list.unshift(ad);
        return { __ads: list };
      });
    },
    [commitPageTexts]
  );

  const toggleAd = useCallback(
    (adId) =>
      commitPageTexts((prev) => ({
        __ads: (Array.isArray(prev.__ads) ? prev.__ads : []).map((a) => (a.id === adId ? { ...a, active: !a.active } : a))
      })),
    [commitPageTexts]
  );

  const deleteAd = useCallback(
    (adId) =>
      commitPageTexts((prev) => ({
        __ads: (Array.isArray(prev.__ads) ? prev.__ads : []).filter((a) => a.id !== adId)
      })),
    [commitPageTexts]
  );

  const dismissAd = useCallback(
    (adId) => {
      const next = [...new Set([...dismissedAds, adId])];
      setDismissedAds(next);
      writeJson(STORAGE_KEYS.DISMISSED_ADS, next);
    },
    [dismissedAds]
  );

  /* ------------------------------------------------------------------ banner */
  const banner = useMemo(() => {
    const cfg = pageTexts.__announcementBanner;
    return cfg && typeof cfg === "object" ? cfg : { enabled: false, text: "", theme: "info", id: "" };
  }, [pageTexts]);
  const [bannerDismissed, setBannerDismissed] = useState(() => Boolean(sessionStorage.getItem(BANNER_DISMISSED_KEY)));

  const saveBanner = useCallback(
    (cfg) => commitPageTexts({ __announcementBanner: { ...cfg, id: cfg.id || uniqueId("banner") } }),
    [commitPageTexts]
  );
  const clearBanner = useCallback(
    () => commitPageTexts({ __announcementBanner: { enabled: false, text: "", theme: "info", id: "" } }),
    [commitPageTexts]
  );
  const dismissBanner = useCallback(() => {
    try {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setBannerDismissed(true);
  }, []);

  /* ------------------------------------------------------------------- users */
  const saveUser = useCallback(
    (user) =>
      commitUsers((prev) => {
        const index = prev.findIndex((u) => u.id === user.id);
        if (index >= 0) {
          const next = [...prev];
          next[index] = { ...next[index], ...user };
          return next;
        }
        return [{ role: "user", id: uniqueId("user"), ...user }, ...prev];
      }),
    [commitUsers]
  );

  const deleteUser = useCallback(
    async (userId) => {
      if (session && session.role === "admin") {
        const res = await api.deleteAccount(userId, session.authToken);
        if (res && res.ok === false) {
          toast(res.error || "Could not remove the account from the database.");
          return false;
        }
        // The DELETE endpoint already persisted the removal, so re-read instead of
        // queueing a whole-state PUT against the revision that request just bumped.
        hasLocalMutationRef.current = false;
        const state = await fetchServerState(session.authToken);
        if (state && Array.isArray(state.usersData)) setUsersData(state.usersData);
        return true;
      }
      commitUsers((prev) => prev.filter((u) => u.id !== userId));
      return true;
    },
    [commitUsers, fetchServerState, session, toast]
  );

  // The administrator hands out the support role; the server owns the change so a
  // wholesale state save can never quietly move a student back into the team.
  const setUserRole = useCallback(
    async (userId, role) => {
      if (!isAdmin) return { ok: false, error: "Only the administrator assigns support roles." };
      const res = await api.assignUserRole(userId, role, session.authToken);
      if (res && res.ok !== false && res.user) {
        setUsersData((prev) => prev.map((u) => (u.id === res.user.id ? { ...u, ...res.user } : u)));
        toast(res.user.name + (role === "support" ? " is now support staff." : " is back to a student account."));
      }
      return res;
    },
    [isAdmin, session, toast]
  );

  // Credits live on the server ledger, so the answer replaces the local copy of the
  // account instead of the row drifting away from what the student actually owns.
  const adjustUserCredits = useCallback(
    async (userId, delta) => {
      if (!isAdmin || !session) return { ok: false, error: "Only the administrator can change downloads left." };
      const res = await api.adjustUserCredits(userId, delta, session.authToken);
      if (res && res.ok !== false && res.user) {
        setUsersData((prev) => prev.map((u) => (u.id === res.user.id ? { ...u, ...res.user } : u)));
        toast(res.given > 0 ? `Gave ${res.user.name} ${res.given} download${res.given === 1 ? "" : "s"}.` : `Took ${Math.abs(res.given)} download${Math.abs(res.given) === 1 ? "" : "s"} back from ${res.user.name}.`);
      } else if (res && res.error) {
        toast(res.error);
      }
      return res;
    },
    [isAdmin, session, toast]
  );

  // Who may open one restricted course is decided here, in one write, so the list the
  // administrator sees when they assign a course is the list that lands on the server.
  const setCourseAccess = useCallback(
    (courseId, userIds) => {
      if (!isAdmin) return { ok: false, error: "Only the administrator assigns courses." };
      const wanted = new Set(userIds);
      commitUsers((prev) =>
        prev.map((user) => {
          const has = Array.isArray(user.allowedCourseIds) && user.allowedCourseIds.includes(courseId);
          if (has === wanted.has(user.id)) return user;
          const allowedCourseIds = has
            ? user.allowedCourseIds.filter((id) => id !== courseId)
            : [...(user.allowedCourseIds || []), courseId];
          return { ...user, allowedCourseIds };
        })
      );
      return { ok: true, count: wanted.size };
    },
    [commitUsers, isAdmin]
  );

  const logActivity = useCallback(
    (type, detail) => {
      if (!activeUser) return;
      commitUsers((prev) =>
        prev.map((u) =>
          u.id === activeUser.id
            ? {
                ...u,
                lastActiveAt: "Active now",
                activityLog: [{ id: uniqueId("act"), type, detail, timestamp: nowStamp() }, ...(u.activityLog || [])].slice(0, 60)
              }
            : u
        )
      );
    },
    [activeUser, commitUsers]
  );

  const resetDatabase = useCallback(async () => {
    if (!isAdmin) return { ok: false, error: "Admin session required." };
    const res = await api.resetDatabase(session.authToken);
    if (res && res.ok) {
      hasLocalMutationRef.current = false;
      const state = await fetchServerState(session.authToken);
      if (state && state.coursesData) setCoursesData(state.coursesData);
      if (state && state.usersData) setUsersData(state.usersData);
      toast("Database reset to the seeded Wollo Share catalog.");
    }
    return res;
  }, [isAdmin, session, toast]);

  /* ------------------------------------------- review queue (admin & support) */
  // Approving writes straight into the shared database, so the workspace re-reads
  // the library afterwards and drops any queued local edit that would overwrite it.
  const reloadLibraryFromServer = useCallback(async () => {
    if (!session) return;
    const state = await fetchServerState(session.authToken);
    if (!state || state.ok === false) return;
    if (Array.isArray(state.coursesData)) setCoursesData(state.coursesData);
    if (Array.isArray(state.usersData) && state.usersData.length) setUsersData(state.usersData);
  }, [session]);

  const approveSubmission = useCallback(
    async (submissionId) => {
      if (!isStaff) return { ok: false, error: "Support team session required." };
      hasLocalMutationRef.current = false;
      const res = await api.approveMaterialSubmission(submissionId, {}, session.authToken);
      if (res && res.ok !== false) {
        await reloadLibraryFromServer();
        toast(res.credited ? "Published — the student just earned a download." : "Published to the library.");
      }
      return res;
    },
    [isStaff, reloadLibraryFromServer, session, toast]
  );

  const rejectSubmission = useCallback(
    async (submissionId, reason) => {
      if (!isStaff) return { ok: false, error: "Support team session required." };
      const res = await api.rejectMaterialSubmission(submissionId, reason, session.authToken);
      if (res && res.ok !== false) toast("Submission rejected.");
      return res;
    },
    [isStaff, session, toast]
  );

  const editSubmission = useCallback(
    async (submissionId, patch) => {
      if (!isStaff) return { ok: false, error: "Support team session required." };
      hasLocalMutationRef.current = false;
      const res = await api.updateMaterialSubmission(submissionId, patch, session.authToken);
      if (res && res.ok !== false) await reloadLibraryFromServer();
      return res;
    },
    [isStaff, reloadLibraryFromServer, session]
  );

  /* ------------------------------------------------------------ appearance */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--primary", appearanceSettings.primaryColor || "#1d624f");
    root.style.setProperty("--bs-primary", appearanceSettings.primaryColor || "#1d624f");
    root.style.setProperty("--green", appearanceSettings.primaryColor || "#1d624f");
    root.style.fontSize = appearanceSettings.fontSize || "16px";
    const family =
      appearanceSettings.fontStyle === "serif"
        ? "Georgia, 'Times New Roman', serif"
        : appearanceSettings.fontStyle === "mono"
        ? "'IBM Plex Mono', monospace"
        : "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif";
    root.style.setProperty("--bs-body-font-family", family);
    document.body.style.fontFamily = family;
  }, [appearanceSettings]);

  // Premium accounts get their own chrome (gold accents, badge, hero tint).
  useEffect(() => {
    document.body.classList.toggle("is-premium", Boolean(downloadStatus.premium) && !studentPreview);
  }, [downloadStatus.premium, studentPreview]);

  /* --------------------------------------------------------------- library */
  const stats = useMemo(() => {
    const accessible = coursesData.filter(canSeeCourse);
    const files = accessible.reduce((sum, c) => sum + (c.materials || []).filter((m) => !m.hidden).length, 0);
    const rated = [];
    accessible.forEach((c) =>
      (c.materials || []).forEach((m) => {
        if (!m.hidden && typeof m.ratingAvg === "number" && m.ratingAvg > 0) rated.push(m.ratingAvg);
      })
    );
    const colleges = Array.from(new Set(coursesData.map((c) => c.college).filter(Boolean))).sort();
    const contributors = new Set(usersData.map((u) => u.id)).size;
    return {
      courses: accessible.length,
      files,
      avgRating: rated.length ? (rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1) : "4.9",
      colleges,
      contributors
    };
  }, [canSeeCourse, coursesData, usersData]);

  const value = {
    booting,
    coursesData,
    usersData,
    pageTexts,
    appearanceSettings,
    downloadPolicy,
    commitDownloadPolicy,
    ads,
    banner,
    stats,
    session,
    activeUser,
    isAdmin,
    ownerIsAdmin,
    isStaff,
    ownerIsStaff,
    canEdit,
    studentPreview,
    setStudentPreview,
    toggleStudentPreview,
    view,
    browse,
    goLibrary,
    goBrowse,
    goSublist,
    goLogin,
    goAdmin,
    goProfile,
    goSupport,
    goHelp,
    goPremium,
    login,
    signInWithCode,
    resendSignInCode,
    register,
    adoptSession: storeSession,
    verifySignup,
    finishRecovery,
    saveProfile,
    logout,
    canSeeCourse,
    downloadStatus,
    materialIsFree,
    canDownloadMaterial,
    requestDownload,
    completePendingDownload,
    completeAdGate,
    mySubmissions,
    syncCredits,
    approveSubmission,
    rejectSubmission,
    editSubmission,
    refreshFromServer: reloadLibraryFromServer,
    submitMaterialForReview,
    videoProgress,
    recordVideoProgress,
    gate,
    setGate,
    closeGate,
    videoTarget,
    setVideoTarget,
    addCourse,
    updateCourse,
    deleteCourse,
    moveCourse,
    addMaterial,
    updateMaterial,
    deleteMaterial,
    toggleMaterialVisibility,
    addSideMaterial,
    deleteSideMaterial,
    rateMaterial,
    myRatingFor,
    saveAd,
    toggleAd,
    deleteAd,
    dismissAd,
    dismissedAds,
    saveBanner,
    clearBanner,
    bannerDismissed,
    dismissBanner,
    commitPageTexts,
    commitAppearance,
    saveUser,
    setCourseAccess,
    deleteUser,
    setUserRole,
    adjustUserCredits,
    logActivity,
    resetDatabase,
    toast,
    toasts,
    dismissToast,
    markDirty
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
