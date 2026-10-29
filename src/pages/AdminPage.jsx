import React, { useEffect, useState } from "react";
import { BarChart3, Crown, DatabaseBackup, Download, FolderOpen, GraduationCap, Inbox, LayoutDashboard, Mail, Palette, Users } from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import * as api from "../lib/api.js";
import AdminCommandBar from "../components/AdminCommandBar.jsx";
import AdminOverview from "./admin/AdminOverview.jsx";
import AdminCourses from "./admin/AdminCourses.jsx";
import AdminMaterials from "./admin/AdminMaterials.jsx";
import AdminSubmissions from "./admin/AdminSubmissions.jsx";
import AdminAppearance from "./admin/AdminAppearance.jsx";
import AdminDownloads from "./admin/AdminDownloads.jsx";
import AdminUsers from "./admin/AdminUsers.jsx";
import AdminMail from "./admin/AdminMail.jsx";
import AdminAnalytics from "./admin/AdminAnalytics.jsx";
import AdminBackup from "./admin/AdminBackup.jsx";
import AdminPremiumOrders from "./admin/AdminPremiumOrders.jsx";

const TABS = [
  ["overview", "Overview", LayoutDashboard],
  ["reviews", "Material reviews", Inbox],
  ["premium", "Premium orders", Crown],
  ["courses", "Courses", GraduationCap],
  ["materials", "Materials", FolderOpen],
  ["downloads", "Downloads", Download],
  ["appearance", "Branding & ads", Palette],
  ["users", "Students", Users],
  ["mail", "Email delivery", Mail],
  ["analytics", "Analytics", BarChart3],
  ["backup", "Backup", DatabaseBackup]
];

const TAB_KEYS = TABS.map(([key]) => key);

function tabFromHash() {
  const match = window.location.hash.match(/^#\/admin\/([a-zA-Z-]+)/);
  return match && TAB_KEYS.includes(match[1]) ? match[1] : "";
}

export default function AdminPage() {
  const {
    coursesData,
    usersData,
    ads,
    view,
    session,
    goLibrary,
    goLogin,
    goSublist,
    studentPreview,
    toggleStudentPreview,
    ownerIsAdmin
  } = useApp();
  const [tab, setTab] = useState(() => tabFromHash() || "overview");
  const [pendingReviews, setPendingReviews] = useState(0);
  const [premiumOrders, setPremiumOrders] = useState(0);

  // The nav badge is the admin's to-do list, so it is re-read whenever a tab opens.
  useEffect(() => {
    if (!ownerIsAdmin || studentPreview || !session) return undefined;
    let cancelled = false;
    api
      .listMaterialSubmissions(session.authToken)
      .then((res) => {
        if (cancelled || !res || !Array.isArray(res.submissions)) return;
        setPendingReviews(res.submissions.filter((s) => s.status === "pending").length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ownerIsAdmin, session, studentPreview, tab]);

  // Premium orders are money waiting on the administrator, so they get the same badge.
  useEffect(() => {
    if (!ownerIsAdmin || studentPreview || !session) return undefined;
    let cancelled = false;
    api
      .listTickets(session.authToken)
      .then((res) => {
        if (cancelled || !res || !Array.isArray(res.tickets)) return;
        setPremiumOrders(res.tickets.filter((t) => t.premiumPlan && !t.premiumConfirmedAt && t.status !== "closed").length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ownerIsAdmin, session, studentPreview, tab]);

  useEffect(() => {
    if (TAB_KEYS.includes(view.tab)) setTab(view.tab);
  }, [view.tab]);

  const selectTab = (next) => {
    setTab(next);
    window.history.replaceState(null, "", `#/admin/${next}`);
  };

  useEffect(() => {
    if (!ownerIsAdmin || studentPreview) return;
    const onHashChange = () => {
      const next = tabFromHash();
      if (next) setTab(next);
    };
    window.addEventListener("hashchange", onHashChange);
    if (!tabFromHash()) window.history.replaceState(null, "", `#/admin/${tab}`);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [ownerIsAdmin, studentPreview, tab]);

  const materialCount = coursesData.reduce((sum, c) => sum + (c.materials || []).length, 0);
  const counts = {
    reviews: pendingReviews,
    premium: premiumOrders,
    courses: coursesData.length,
    materials: materialCount,
    appearance: ads.filter((a) => a.active).length,
    users: usersData.length
  };

  if (!ownerIsAdmin) {
    return (
      <div className="ws-page">
        <div className="card p-4 text-center mx-auto" style={{ maxWidth: 560 }}>
          <h2 className="h5">Administrator access required</h2>
          <p className="text-secondary small">
            Sign in with the admin account to manage courses, materials, branding and students.
          </p>
          <div className="d-flex justify-content-center gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={goLogin}>
              Sign in as administrator
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={goLibrary}>
              Back to library
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (studentPreview) {
    return (
      <div className="ws-page">
        <div className="card p-4 text-center mx-auto" style={{ maxWidth: 560 }}>
          <h2 className="h5">Student preview is on</h2>
          <p className="text-secondary small">
            You are seeing Wollo Share exactly as a signed-out student does, so the admin controls are hidden.
          </p>
          <div className="d-flex justify-content-center gap-2">
            <button type="button" className="btn btn-coral btn-sm" onClick={toggleStudentPreview}>
              Exit student preview
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={goLibrary}>
              Stay in preview and browse
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ws-page">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <span className="ws-section-kicker">Wollo Share · control room</span>
          <h1 className="h3 mb-1">Admin workspace</h1>
          <p className="small text-secondary mb-0">Everything here is saved to the shared Wollo Share database.</p>
        </div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={toggleStudentPreview}>
            Student preview
          </button>
          <button type="button" className="btn btn-sm btn-soft" onClick={goLibrary}>
            View site
          </button>
        </div>
      </div>

      <AdminCommandBar onSelectTab={selectTab} onOpenCourse={goSublist} />

      {premiumOrders > 0 && tab !== "premium" ? (
        <div className="banner warn mb-3 d-flex flex-wrap align-items-center gap-2" role="status">
          <Crown size={16} aria-hidden="true" />
          <span>
            <strong>{premiumOrders}</strong> student{premiumOrders === 1 ? "" : "s"} asked for Premium and
            {premiumOrders === 1 ? " is" : " are"} waiting for the payment to be confirmed.
          </span>
          <button type="button" className="btn btn-sm btn-primary ms-auto" onClick={() => selectTab("premium")}>
            Review orders
          </button>
        </div>
      ) : null}

      <nav className="admin-nav my-3" aria-label="Admin sections">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => selectTab(key)}>
            <Icon size={14} className="me-1 align-text-bottom" aria-hidden="true" />
            {label}
            {counts[key] !== undefined ? <span className="ms-2 mono" style={{ fontSize: 11 }}>({counts[key]})</span> : null}
          </button>
        ))}
      </nav>

      {tab === "overview" ? <AdminOverview onNavigate={selectTab} /> : null}
      {tab === "reviews" ? <AdminSubmissions /> : null}
      {tab === "premium" ? <AdminPremiumOrders onCountChange={setPremiumOrders} /> : null}
      {tab === "courses" ? <AdminCourses /> : null}
      {tab === "materials" ? <AdminMaterials /> : null}
      {tab === "downloads" ? <AdminDownloads onNavigate={selectTab} /> : null}
      {tab === "appearance" ? <AdminAppearance /> : null}
      {tab === "users" ? <AdminUsers /> : null}
      {tab === "mail" ? <AdminMail /> : null}
      {tab === "analytics" ? <AdminAnalytics /> : null}
      {tab === "backup" ? <AdminBackup /> : null}
    </div>
  );
}
