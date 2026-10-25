import React from "react";
import { useApp } from "../store/AppContext.jsx";
import { Crown, Eye, LibraryBig, LogIn, LogOut, ShieldCheck, Upload } from "lucide-react";
import universityEmblem from "../assets/images/wollo-university-emblem.jpg";

function BrandMark() {
  const { appearanceSettings } = useApp();
  return (
    <span className="ws-brand-mark" aria-hidden="true">
      <img src={appearanceSettings.logoUrl || universityEmblem} alt="" />
    </span>
  );
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "WS";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

export default function TopBar() {
  const {
    pageTexts,
    session,
    activeUser,
    isAdmin,
    ownerIsAdmin,
    studentPreview,
    toggleStudentPreview,
    logout,
    goLibrary,
    goAdmin,
    goLogin,
    view,
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
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setGate({ type: "share", courseId: view.courseId || "" })}>
            <Upload size={15} className="me-1 align-text-bottom" aria-hidden="true" />
            Share material
          </button>
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
              <span className="ws-user">
                <span className="ws-user-avatar" aria-hidden="true">
                  {initials(displayName)}
                </span>
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
              </span>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={logout} title="Sign out">
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
