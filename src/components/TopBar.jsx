import React, { useEffect, useState } from "react";
import { useApp } from "../store/AppContext.jsx";
import { ClipboardList, Crown, Download, Eye, LibraryBig, LifeBuoy, LogIn, LogOut, MessageSquare, Moon, Newspaper, ShieldCheck, Sun, Upload } from "lucide-react";
import universityEmblem from "../assets/images/wollo-university-emblem.png";
import UserAvatar from "./UserAvatar.jsx";
import { isAdCard } from "../lib/homeFeed.js";

const THEME_KEY = "wollo_web_theme_v1";

function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_KEY) || "light"; } catch { return "light"; }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  // Respect system preference on first load when no override is set.
  useEffect(() => {
    try {
      if (!localStorage.getItem(THEME_KEY)) {
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (dark) setTheme("dark");
      }
    } catch { /* ignore */ }
  }, []);

  const toggle = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  return (
    <button
      type="button"
      className="ws-theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {theme === "dark" ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
    </button>
  );
}

function BrandMark() {
  const { appearanceSettings } = useApp();
  return (
    <span className="ws-brand-mark" aria-hidden="true">
      <img src={appearanceSettings.logoUrl || universityEmblem} alt="" />
    </span>
  );
}

export default function TopBar() {
  const {
    pageTexts,
    session,
    activeUser,
    isAdmin,
    ownerIsAdmin,
    ownerIsStaff,
    studentPreview,
    toggleStudentPreview,
    logout,
    goLibrary,
    goAdmin,
    goSupport,
    goHelp,
    goChat,
    goPractice,
    goDownloads,
    goNews,
    goLogin,
    goProfile,
    goPremium,
    view,
    homeFeed,
    downloadStatus,
    setGate
  } = useApp();

  const onLibrary = view.name === "library" || view.name === "sublist";
  const displayName = activeUser?.name || session?.name || session?.email || "Student";

  return (
    <header className="ws-topline sticky-top">
      <div className="ws-inner-top">
        <button type="button" className="ws-brand border-0 p-0 bg-transparent text-start" onClick={goLibrary}>
          <BrandMark />
          <span>
            <span className="d-block ws-brand-title">{pageTexts.siteTitle || "Wollo Share"}</span>
            <span className="d-block ws-brand-sub">{pageTexts.siteSubtitle || "Wollo University resource hub"}</span>
          </span>
        </button>

        <nav className="ws-nav">
          <button
            type="button"
            className={`btn btn-sm ${onLibrary ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={goLibrary}
          >
            <LibraryBig size={15} className="me-1 align-text-bottom" aria-hidden="true" />
            Library
          </button>
          {/* The link only appears once the team has published something — a News tab that
              opens an empty page reads as a broken feature, not as a quiet one. */}
          {(homeFeed?.all || []).some((card) => !isAdCard(card)) ? (
            <button
              type="button"
              className={`btn btn-sm ${view.name === "news" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => goNews(null)}
            >
              <Newspaper size={15} className="me-1 align-text-bottom" aria-hidden="true" />
              News
            </button>
          ) : null}
          {/* The room needs an account, so a visitor is not offered a page that only asks
              them to sign in — students get the button, everyone else gets Help. */}
          {session ? (
            <button
              type="button"
              className={`btn btn-sm ${view.name === "chat" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={goChat}
              title="The university-wide student chatroom"
            >
              <MessageSquare size={15} className="me-1 align-text-bottom" aria-hidden="true" />
              Chatroom
            </button>
          ) : null}
          {session ? (
            <button
              type="button"
              className={`btn btn-sm ${view.name === "practice" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={goPractice}
              title="Practice questions, timed exams and the top-students leaderboard"
            >
              <ClipboardList size={15} className="me-1 align-text-bottom" aria-hidden="true" />
              Practice
            </button>
          ) : null}
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setGate({ type: "share", courseId: view.courseId || "" })}>
            <Upload size={15} className="me-1 align-text-bottom" aria-hidden="true" />
            Share material
          </button>
          <button
            type="button"
            className={`btn btn-sm ${view.name === "premium" ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={goPremium}
          >
            <Crown size={15} className="me-1 align-text-bottom" aria-hidden="true" />
            Premium
          </button>
          {session ? (
            <button
              type="button"
              className={`btn btn-sm ${view.name === "support" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={goSupport}
              title={ownerIsStaff && !studentPreview ? "The support team panel" : "Leave your complaints and problems for the support team"}
            >
              <LifeBuoy size={15} className="me-1 align-text-bottom" aria-hidden="true" />
              {ownerIsStaff && !studentPreview ? "Support panel" : "Need help?"}
            </button>
          ) : (
            // The support desk needs an account, so a visitor gets the rules page instead
            // of a screen that only tells them to sign in.
            <button
              type="button"
              className={`btn btn-sm ${view.name === "help" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={goHelp}
              title="How downloads work and how to reach the support team"
            >
              <LifeBuoy size={15} className="me-1 align-text-bottom" aria-hidden="true" />
              Help
            </button>
          )}
          {session ? (
            <button
              type="button"
              className={`btn btn-sm ${view.name === "downloads" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={goDownloads}
              title="Files you have saved for offline reading"
            >
              <Download size={15} className="me-1 align-text-bottom" aria-hidden="true" />
              Downloads
            </button>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              className={`btn btn-sm ${view.name === "admin" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={goAdmin}
            >
              <ShieldCheck size={15} className="me-1 align-text-bottom" aria-hidden="true" />
              Admin
            </button>
          ) : null}
          {ownerIsAdmin ? (
            <button
              type="button"
              className={`btn btn-sm ${studentPreview ? "btn-coral" : "btn-outline-secondary"}`}
              onClick={toggleStudentPreview}
              title="Preview the site as a signed-out student"
            >
              <Eye size={15} className="me-1 align-text-bottom" aria-hidden="true" />
              {studentPreview ? "Exit preview" : "Student preview"}
            </button>
          ) : null}

          {session ? (
            <>
              <span className="ws-nav-divider d-none d-md-block" aria-hidden="true" />
              <ThemeToggle />
              <button
                type="button"
                className={`ws-user ${view.name === "profile" ? "is-active" : ""}`}
                onClick={goProfile}
                title="Open your profile"
                aria-current={view.name === "profile" ? "page" : undefined}
              >
                <UserAvatar photo={activeUser?.avatarUrl} name={displayName} alt="" />
                <span className="d-none d-sm-block text-start">
                  <span className="d-block ws-user-name">
                    {displayName}
                    {downloadStatus.premium ? (
                      <span className="ws-premium-pill ms-2 align-middle">
                        <Crown size={10} aria-hidden="true" />
                        Premium
                      </span>
                    ) : null}
                  </span>
                  <span className="d-block ws-user-plan">{downloadStatus.badgeText}</span>
                </span>
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary ws-nav-compact" onClick={logout} title="Sign out" aria-label="Sign out">
                <LogOut size={15} aria-hidden="true" />
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-sm btn-primary" onClick={goLogin}>
              <LogIn size={15} className="me-1 align-text-bottom" aria-hidden="true" />
              Sign in
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
