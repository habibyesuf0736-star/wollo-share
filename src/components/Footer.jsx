import React from "react";
import { useApp } from "../store/AppContext.jsx";
import { ArrowUp, Crown, GraduationCap, Heart, LibraryBig, LifeBuoy, MapPin, Send, Upload } from "lucide-react";
import universityEmblem from "../assets/images/wollo-university-emblem.png";

const linkClass = "btn btn-link p-0 text-start";
const linkStyle = { color: "inherit", fontSize: "inherit" };

export default function Footer() {
  const {
    pageTexts,
    stats,
    goLibrary,
    goBrowse,
    goLogin,
    goPremium,
    goHelp,
    goSupport,
    setGate,
    view,
    session
  } = useApp();

  // The freshman college is named in the catalog, not hard-coded here, so the link keeps
  // working after the administrators rename it.
  const freshmanCollege = stats.colleges.find((name) => /freshman/i.test(name)) || "";
  const openSupport = session ? goSupport : goLogin;

  return (
    <footer className="ws-footer mt-5">
      <div className="ws-page">
        <div className="row g-4">
          <div className="col-12 col-md-6 col-lg-4">
            <span className="ws-footer-brand">
              <span className="ws-footer-mark" aria-hidden="true">
                <img src={universityEmblem} alt="" />
              </span>
              {pageTexts.siteTitle || "Wollo Share"}
            </span>
            <p className="mt-3 mb-0" style={{ maxWidth: "42ch", lineHeight: 1.65 }}>
              {pageTexts.footerText || "Wollo Share — student-built course materials library."}
            </p>
            <p className="mt-3 mb-0 d-flex align-items-center gap-2" style={{ fontSize: 12.5, color: "rgba(255,255,255,.6)" }}>
              <MapPin size={14} aria-hidden="true" /> Dessie, South Wollo, Amhara · Ethiopia
            </p>
          </div>

          <div className="col-6 col-md-3 col-lg-2">
            <h4>Browse</h4>
            <button type="button" className={linkClass} style={linkStyle} onClick={goLibrary}>
              <LibraryBig size={14} className="me-1 align-text-bottom" aria-hidden="true" />
              All colleges
            </button>
            {freshmanCollege ? (
              <button
                type="button"
                className={linkClass}
                style={linkStyle}
                onClick={() => goBrowse({ college: freshmanCollege, courseId: "" })}
              >
                <GraduationCap size={14} className="me-1 align-text-bottom" aria-hidden="true" />
                Freshman courses
              </button>
            ) : null}
            <button
              type="button"
              className={linkClass}
              style={linkStyle}
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              <ArrowUp size={14} className="me-1 align-text-bottom" aria-hidden="true" />
              Back to top
            </button>
          </div>

          <div className="col-6 col-md-3 col-lg-2">
            <h4>Account</h4>
            {session ? (
              <button type="button" className={linkClass} style={linkStyle} onClick={goLibrary}>
                My library
              </button>
            ) : (
              <>
                <button type="button" className={linkClass} style={linkStyle} onClick={goLogin}>
                  Sign in
                </button>
                <button type="button" className={linkClass} style={linkStyle} onClick={() => goLogin("register")}>
                  Create a free account
                </button>
              </>
            )}
            <button type="button" className={linkClass} style={linkStyle} onClick={goPremium}>
              <Crown size={14} className="me-1 align-text-bottom" aria-hidden="true" />
              Premium plans
            </button>
            <button
              type="button"
              className={linkClass}
              style={linkStyle}
              onClick={() => (session ? setGate({ type: "share", courseId: view.courseId || "" }) : goLogin())}
            >
              <Upload size={14} className="me-1 align-text-bottom" aria-hidden="true" />
              Share material
            </button>
          </div>

          <div className="col-6 col-md-3 col-lg-2">
            <h4>Help</h4>
            <button type="button" className={linkClass} style={linkStyle} onClick={goHelp}>
              <LifeBuoy size={14} className="me-1 align-text-bottom" aria-hidden="true" />
              Help center
            </button>
            <button type="button" className={linkClass} style={linkStyle} onClick={openSupport}>
              <Send size={14} className="me-1 align-text-bottom" aria-hidden="true" />
              Message support
            </button>
            <p className="mt-2 mb-0" style={{ fontSize: 12.5, color: "rgba(255,255,255,.6)", lineHeight: 1.55 }}>
              Broken file, missing exam or an account that will not open — the student team answers in your thread.
            </p>
          </div>

          <div className="col-12 col-md-6 col-lg-2">
            <h4>Library right now</h4>
            <div className="d-flex flex-wrap gap-2">
              <span className="upgrade-plan-tag">{stats.courses} programs</span>
              <span className="upgrade-plan-tag">{stats.files} files</span>
              <span className="upgrade-plan-tag">{stats.colleges.length} colleges</span>
            </div>
          </div>
        </div>

        <div className="ws-footer-note">
          <span>© {new Date().getFullYear()} {pageTexts.siteTitle || "Wollo Share"} · Built by students, for students</span>
          <span className="d-inline-flex align-items-center gap-1">
            Made with <Heart size={12} aria-hidden="true" /> in Wollo
          </span>
        </div>
      </div>
    </footer>
  );
}
