import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../lib/api.js";
import { DEFAULT_SUBCATEGORIES, nowStamp, triggerBrowserDownload, uniqueId } from "../lib/utils.js";
import {
  STORAGE_KEYS,
  readJson,
  writeJson,
  readNumber,
  writeNumber,
  removeKey,
  readTabJson,
  writeTabJson,
  removeTabKey
} from "../lib/storage.js";

const AppContext = createContext(null);

export const DEFAULT_TEXTS = {
  siteTitle: "Wollo Share",
  siteSubtitle: "Wollo University · Student Study & Course Resource Hub",
  welcomeTitle: "Every Wollo University course material in one library",
  welcomeDesc:
    "Lecture notes, past exams, slides and lab manuals organized by college, program, academic year and semester — from Freshman courses to graduation.",
  footerText: "Wollo Share · Built by Wollo University students, for Wollo University students."
};

export const DEFAULT_APPEARANCE = {
  primaryColor: "#1d624f",
  fontSize: "16px",
  fontStyle: "sans",
  logoUrl: "",
  modules: { stats: true, topics: true, docs: true }
};

const BANNER_DISMISSED_KEY = "wollo_announcement_dismissed_v1";

// Materials a free account must have approved before it earns one download.
export const UPLOADS_PER_CREDIT = 2;
// Non-premium accounts watch this many seconds of the sponsor slot first.
export const AD_SECONDS = 10;

// Sessions live in sessionStorage, matching the key the legacy app used.
function readStoredSession() {
  return readTabJson(STORAGE_KEYS.CURRENT_SESSION, null);
}

// "#/admin/materials" opens straight into that workspace section, and "#/login" or "/login"
// opens the sign-in screen so a refresh or a shared link does not drop back into the library.
function viewFromLocation() {
  const hash = String(window.location.hash);
  if (window.location.pathname === "/login" || /^#\/login/.test(hash)) return { name: "login" };
  if (/^#\/profile/.test(hash)) return { name: "profile" };
  const match = hash.match(/^#\/admin(?:\/(overview|reviews|courses|materials|appearance|users|analytics))?/);
  return match ? { name: "admin", courseId: null, tab: match[1] || "" } : { name: "library", courseId: null };
}

function initialView() {
  return viewFromLocation();
}

function clearAdminHash() {
  if (/^#\/admin/.test(window.location.hash)) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

function decodeTokenPayload(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length !== 3 || parts[0] !== "wstok") return null;
    const raw = decodeURIComponent(
      atob(parts[1])
        .split("")
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );
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
      if (!course.restricted) return true;
      if (studentPreview) return false;
      if (isAdmin) return true;
      if (!session) return false;
      if (session.role === "admin") return true;
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
      payload: { coursesData, usersData, pageTexts, appearanceSettings, userRatings, contentRevision: baseRevisionRef.current },
      token: session.authToken
    };
    writeJson(STORAGE_KEYS.PENDING_ADMIN_STATE, pendingSyncRef.current);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(flushState, 400);
  }, [appearanceSettings, coursesData, flushState, isAdmin, pageTexts, session, userRatings, usersData]);

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

  /* -------------------------------------------------------------------- boot */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let res = await fetchServerState(session ? session.authToken : null);
      if (res && res.status === 401) {
        setSession(null);
        removeTabKey(STORAGE_KEYS.CURRENT_SESSION);
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
      if (!cancelled) setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- navigation */
  const goLibrary = useCallback(() => {
    clearAdminHash();
    setBrowse({ college: "", courseId: "" });
    setView({ name: "library", courseId: null });
  }, []);
  // Keeps the current college/program selection so "back" from a program's
  // materials returns to the year list instead of the top of the library.
  const goBrowse = useCallback((next) => {
    clearAdminHash();
    if (next) setBrowse((prev) => ({ ...prev, ...next }));
    setView({ name: "library", courseId: null });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const goSublist = useCallback((courseId, query = "", year = "") => {
    clearAdminHash();
    setView({ name: "sublist", courseId, query, year });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const goLogin = useCallback(() => {
    clearAdminHash();
    setView({ name: "login" });
  }, []);
  const goAdmin = useCallback((tab) => setView({ name: "admin", tab: tab || "" }), []);
  const goProfile = useCallback(() => {
    clearAdminHash();
    setView({ name: "profile" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Editing or pasting an address like "#/admin/materials" or "#/login" routes the running
  // app too, not just a fresh page load.
  useEffect(() => {
    const onLocationChange = () => {
      const next = viewFromLocation();
      if (next.name === "login") setView({ name: "login" });
      else if (next.name === "profile") setView({ name: "profile" });
      else if (next.name === "admin") setView({ name: "admin", courseId: null, tab: next.tab });
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
      clearAdminHash();
      setView({ name: "library", courseId: null });
    }
  }, [setStudentPreview, studentPreview]);

  /* -------------------------------------------------------------------- auth */
  const storeSession = useCallback((next) => {
    const normalized = normalizeSession(next);
    setSession(normalized);
    if (normalized) writeTabJson(STORAGE_KEYS.CURRENT_SESSION, normalized);
    else removeTabKey(STORAGE_KEYS.CURRENT_SESSION);
    return normalized;
  }, []);

  const login = useCallback(
    async ({ identifier, password }) => {
      const res = await api.login(identifier, password);
      if (!res || res.ok !== true || !res.session) return { ok: false, needsVerification: Boolean(res && res.needsVerification), email: res && res.email, error: (res && res.error) || "Sign in failed." };
      const saved = storeSession(res.session);
      hasLocalMutationRef.current = false;
      const state = await fetchServerState(saved.authToken);
      if (state && state.ok !== false) {
        if (Array.isArray(state.coursesData)) setCoursesData(state.coursesData);
        if (Array.isArray(state.usersData) && state.usersData.length) setUsersData(state.usersData);
        if (state.userRatings) setUserRatings((prev) => ({ ...prev, ...state.userRatings }));
      }
      return { ok: true, session: saved };
    },
    [storeSession]
  );

  const register = useCallback(
    async (details) => {
      const res = await api.registerAccount(details);
      if (!res || res.ok !== true) return { ok: false, error: (res && res.error) || "Registration failed." };
      if (res.session) {
        storeSession(res.session);
        if (res.user) setUsersData((prev) => [res.user, ...prev.filter((u) => u.id !== res.user.id)]);
        return { ok: true, user: res.user, signedIn: true };
      }
      // No session until the 6-digit code is confirmed (or the admin approves it).
      return {
        ok: true,
        signedIn: false,
        pendingVerification: Boolean(res.pendingVerification),
        email: res.email || details.email,
        mailSent: Boolean(res.mailSent),
        message: res.message
      };
    },
    [storeSession]
  );

  const verifySignup = useCallback(
    async (email, code) => {
      const res = await api.verifyEmail(email, code);
      if (!res || res.ok !== true) return { ok: false, error: (res && res.error) || "Verification failed." };
      if (res.session) {
        const saved = storeSession(res.session);
        hasLocalMutationRef.current = false;
        if (res.user) setUsersData((prev) => [res.user, ...prev.filter((u) => u.id !== res.user.id)]);
        const state = await fetchServerState(saved.authToken);
        if (state && state.ok !== false) {
          if (Array.isArray(state.coursesData)) setCoursesData(state.coursesData);
          if (state.userRatings) setUserRatings((prev) => ({ ...prev, ...state.userRatings }));
        }
        return { ok: true, signedIn: true };
      }
      return { ok: true, signedIn: false, message: res.message };
    },
    [fetchServerState, storeSession]
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
  // Premium and paid plans download instantly. Free accounts pay with a
  // 10-second advertisement plus one earned credit — a credit is granted for
  // every two materials the administrator approves from the review queue.
  const downloadStatus = useMemo(() => {
    const credits = Number(activeUser?.downloadCredits) || 0;
    const progress = Number(activeUser?.unpaidCurrentUploadProgress) || 0;
    if (studentPreview) {
      return {
        canDownload: false,
        premium: false,
        plan: "visitor_unpaid",
        credits: 0,
        progress: 0,
        requiredCount: UPLOADS_PER_CREDIT,
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
    if (activeUser) {
      const plan =
        activeUser.accountPlan ||
        (activeUser.downloadOnlyAccount
          ? "paid_download_only"
          : activeUser.paymentStatus === "paid"
          ? "paid_lifetime"
          : "unpaid");
      const totalShared = Number(activeUser.sharedMaterialsCount) || 0;

      if (plan === "premium_annual" || plan === "premium_monthly") {
        const expiry = activeUser.subscriptionExpiry ? new Date(activeUser.subscriptionExpiry) : null;
        if (!expiry || expiry > new Date()) {
          return {
            canDownload: true,
            premium: true,
            plan,
            credits,
            progress,
            requiredCount: UPLOADS_PER_CREDIT,
            sharedCount: totalShared,
            daysLeft: expiry ? Math.ceil((expiry - new Date()) / 86400000) : undefined,
            badgeText: `${plan === "premium_monthly" ? "Premium monthly" : "Premium annual"} · Unlimited downloads`
          };
        }
      }
      if (plan === "paid_download_only") {
        return {
          canDownload: true,
          premium: true,
          plan,
          credits,
          progress,
          requiredCount: UPLOADS_PER_CREDIT,
          sharedCount: totalShared,
          badgeText: "Paid account · Unlimited downloads"
        };
      }
      if (plan === "paid_lifetime") {
        return {
          canDownload: true,
          premium: true,
          plan,
          credits,
          progress,
          requiredCount: UPLOADS_PER_CREDIT,
          sharedCount: totalShared,
          badgeText: "Paid student · Lifetime downloads"
        };
      }
      return {
        canDownload: credits > 0,
        premium: false,
        plan: "unpaid",
        credits,
        progress,
        requiredCount: UPLOADS_PER_CREDIT,
        sharedCount: totalShared,
        badgeText: credits > 0
          ? `Free plan · ${credits} earned download${credits === 1 ? "" : "s"} ready`
          : "Free plan · share 2 materials to unlock 1 download"
      };
    }
    return {
      canDownload: false,
      premium: false,
      plan: "visitor_unpaid",
      credits: 0,
      progress: 0,
      requiredCount: UPLOADS_PER_CREDIT,
      sharedCount: 0,
      badgeText: "Free materials only · Sign in to save progress"
    };
  }, [activeUser, isAdmin, studentPreview]);

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
  const performDownload = useCallback(
    (courseId, materialId, sideMaterialId) => {
      const course = coursesData.find((c) => c.id === courseId);
      const mat = course ? (course.materials || []).find((m) => m.id === materialId) : null;
      if (!mat) return false;
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
        commitUsers((prev) =>
          prev.map((u) =>
            u.id === activeUser.id
              ? { ...u, downloadsCount: (Number(u.downloadsCount) || 0) + 1, lastActiveAt: "Active now" }
              : u
          )
        );
      }
      // A free account pays for premium files with one earned credit; the server
      // ledger is re-read afterwards so the two devices can never drift.
      if (session && !downloadStatus.premium && mat && !mat.free) {
        if (activeUser && !studentPreview) {
          commitUsers((prev) =>
            prev.map((u) =>
              u.id === activeUser.id
                ? { ...u, downloadCredits: Math.max(0, (Number(u.downloadCredits) || 0) - 1) }
                : u
            )
          );
        }
        api
          .consumeDownloadCredit(session.authToken)
          .then((res) => {
            if (res && res.ok !== false) syncCredits();
          })
          .catch(() => {});
      }
      pendingDownloadRef.current = null;
      removeKey(STORAGE_KEYS.PENDING_DOWNLOAD);
      toast(`Downloading "${(sideMat || mat).name}"`);
      return true;
    },
    [activeUser, commitUsers, coursesData, downloadStatus.premium, session, studentPreview, syncCredits, toast]
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
      // Everyone outside a premium plan watches the sponsor slot first.
      if (!downloadStatus.premium) return queue("ad");
      return performDownload(courseId, materialId, sideMaterialId);
    },
    [coursesData, downloadStatus.canDownload, downloadStatus.premium, performDownload, session, setGate]
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

  /* ---------------------------------------------------- review queue (admin) */
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
      if (!isAdmin) return { ok: false, error: "Admin session required." };
      hasLocalMutationRef.current = false;
      const res = await api.approveMaterialSubmission(submissionId, {}, session.authToken);
      if (res && res.ok !== false) {
        await reloadLibraryFromServer();
        toast(res.credited ? "Published — the student just earned a download." : "Published to the library.");
      }
      return res;
    },
    [isAdmin, reloadLibraryFromServer, session, toast]
  );

  const rejectSubmission = useCallback(
    async (submissionId, reason) => {
      if (!isAdmin) return { ok: false, error: "Admin session required." };
      const res = await api.rejectMaterialSubmission(submissionId, reason, session.authToken);
      if (res && res.ok !== false) toast("Submission rejected.");
      return res;
    },
    [isAdmin, session, toast]
  );

  const editSubmission = useCallback(
    async (submissionId, patch) => {
      if (!isAdmin) return { ok: false, error: "Admin session required." };
      hasLocalMutationRef.current = false;
      const res = await api.updateMaterialSubmission(submissionId, patch, session.authToken);
      if (res && res.ok !== false) await reloadLibraryFromServer();
      return res;
    },
    [isAdmin, reloadLibraryFromServer, session]
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
    ads,
    banner,
    stats,
    session,
    activeUser,
    isAdmin,
    ownerIsAdmin,
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
    login,
    register,
    verifySignup,
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
    deleteUser,
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
