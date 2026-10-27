import React from "react";
import { useApp } from "../store/AppContext.jsx";
import { Crown, Eye, LibraryBig, LifeBuoy, LogIn, LogOut, ShieldCheck, Upload } from "lucide-react";
import universityEmblem from "../assets/images/wollo-university-emblem.jpg";
import UserAvatar from "./UserAvatar.jsx";

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
    goLogin,
    goProfile,
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
