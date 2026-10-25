import React, { useMemo } from "react";
import { useApp } from "../../store/AppContext.jsx";
import StatCard from "../../components/StatCard.jsx";

export default function AdminOverview({ onNavigate }) {
  const { coursesData, usersData, stats, ads, banner, resetDatabase, toast, session } = useApp();

  const totals = useMemo(() => {
    const materials = coursesData.flatMap((c) => c.materials || []);
    const hidden = materials.filter((m) => m.hidden).length;
    const shared = materials.filter((m) => m.sharedBy).length;
    const rated = materials.filter((m) => (m.ratingCount || 0) > 0).length;
    const paid = usersData.filter((u) => u.accountPlan === "paid_lifetime" || u.paymentStatus === "paid" || u.downloadOnlyAccount).length;
    const sideCount = materials.reduce((sum, m) => sum + (m.sideMaterials || []).length, 0);
    return { materials: materials.length, hidden, shared, rated, paid, sideCount };
  }, [coursesData, usersData]);

  const emptyCourses = useMemo(
    () => coursesData.filter((course) => !(course.materials || []).some((mat) => !mat.hidden)).length,
    [coursesData]
  );

  const recent = useMemo(() => {
    const events = [];
    usersData.forEach((user) =>
      (user.activityLog || []).forEach((event) => events.push({ ...event, user: user.name || user.email }))
    );
    return events
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
      .slice(0, 12);
  }, [usersData]);

  return (
    <div className="d-flex flex-column gap-3">
      <div className="row g-2">
        <div className="col-6 col-md-3">
          <StatCard value={totals.materials} label="Total materials" hint={`${totals.hidden} hidden`} />
        </div>
        <div className="col-6 col-md-3">
          <StatCard value={usersData.length} label="Registered accounts" hint={`${totals.paid} paid`} />
        </div>
        <div className="col-6 col-md-3">
          <StatCard value={totals.shared} label="Student uploads" hint={`${totals.sideCount} companion files`} />
        </div>
        <div className="col-6 col-md-3">
          <StatCard value={ads.filter((a) => a.active).length} label="Live ads" hint={banner.enabled ? "Banner is on" : "Banner off"} />
        </div>
      </div>

      <div className="card p-3">
        <h3 className="h6 mb-3">Quick actions</h3>
        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-primary" onClick={() => onNavigate("courses")}>
            + Create course
          </button>
          <button type="button" className="btn btn-sm btn-soft" onClick={() => onNavigate("materials")}>
            Manage materials
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onNavigate("appearance")}>
            Branding & ads
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onNavigate("users")}>
            Student accounts
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onNavigate("analytics")}>
            Analytics
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onNavigate("appearance")}>
            Edit hero text
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onNavigate("appearance")}>
            Publish announcement
          </button>
        </div>
        <hr />
        <p className="small text-secondary mb-2">
          Signed in as {session?.name || session?.email} · {stats.colleges.length} colleges · {stats.files} published
          files visible to students.
        </p>
        <button
          type="button"
          className="btn btn-sm btn-coral"
          onClick={async () => {
            const res = await resetDatabase();
            if (res && res.ok === false) toast(res.error || "Reset failed.");
          }}
        >
          Reset database to seeded catalog
        </button>
      </div>

      <div className="card p-3">
        <h3 className="h6 mb-3">Needs attention</h3>
        <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
          <li className="d-flex justify-content-between align-items-center gap-2 small">
            <span>
              <strong>{emptyCourses}</strong> courses have no published document yet
            </span>
            <button type="button" className="btn btn-sm btn-soft py-0" onClick={() => onNavigate("courses")}>
              Fill courses
            </button>
          </li>
          <li className="d-flex justify-content-between align-items-center gap-2 small">
            <span>
              <strong>{totals.hidden}</strong> materials hidden from students
            </span>
            <button type="button" className="btn btn-sm btn-soft py-0" onClick={() => onNavigate("materials")}>
              Review
            </button>
          </li>
          <li className="d-flex justify-content-between align-items-center gap-2 small">
            <span>
              <strong>{ads.length}</strong> advertisement{ads.length === 1 ? "" : "s"} ·{" "}
              {banner.enabled ? "announcement banner is live" : "no announcement banner"}
            </span>
            <button type="button" className="btn btn-sm btn-soft py-0" onClick={() => onNavigate("appearance")}>
              Site content
            </button>
          </li>
          <li className="d-flex flex-wrap justify-content-between align-items-center gap-2 small">
            <span className="activity-detail">
              <strong>{totals.paid}</strong> of {usersData.length} accounts have paid access
            </span>
            <button type="button" className="btn btn-sm btn-soft py-0" onClick={() => onNavigate("users")}>
              Manage plans
            </button>
          </li>
        </ul>
      </div>

      <div className="card p-3">
        <h3 className="h6 mb-3">Latest student activity</h3>
        {recent.length === 0 ? (
          <p className="small text-secondary mb-0">No recorded activity yet.</p>
        ) : (
          <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
            {recent.map((event) => (
              <li key={event.id} className="d-flex flex-wrap justify-content-between gap-2 small">
                <span className="activity-detail">
                  <strong>{event.type}</strong> — {event.detail}
                </span>
                <span className="text-secondary activity-meta">
                  {event.user} · {event.timestamp}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
