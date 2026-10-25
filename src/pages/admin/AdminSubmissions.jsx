import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Inbox, RefreshCw, Search, ShieldAlert, ThumbsDown, X } from "lucide-react";
import * as api from "../../lib/api.js";
import EmptyState from "../../components/EmptyState.jsx";
import { UPLOADS_PER_CREDIT, useApp } from "../../store/AppContext.jsx";

const STATUSES = ["all", "pending", "approved", "rejected", "duplicate"];

function statusBadge(sub) {
  if (sub.status === "approved") return <span className="badge rounded-pill text-bg-success">approved</span>;
  if (sub.status === "pending") return <span className="badge rounded-pill text-bg-warning">in review</span>;
  if (sub.decidedBy === "automatic-duplicate-guard")
    return <span className="badge rounded-pill text-bg-danger">duplicate blocked</span>;
  return <span className="badge rounded-pill text-bg-secondary">rejected</span>;
}

function when(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AdminSubmissions() {
  const { session, coursesData, approveSubmission, rejectSubmission, toast } = useApp();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending");
  const [courseFilter, setCourseFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");
  const [semesterFilter, setSemesterFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [rejecting, setRejecting] = useState(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const res = await api.listMaterialSubmissions(session.authToken);
    if (res && res.ok !== false) setRows(Array.isArray(res.submissions) ? res.submissions : []);
    else if (res && res.error) toast(res.error);
    setLoading(false);
  }, [session, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const out = { pending: 0, approved: 0, rejected: 0, duplicate: 0 };
    rows.forEach((s) => {
      if (s.status === "pending") out.pending += 1;
      else if (s.status === "approved") out.approved += 1;
      else if (s.decidedBy === "automatic-duplicate-guard") out.duplicate += 1;
      else out.rejected += 1;
    });
    return out;
  }, [rows]);

  const years = useMemo(() => Array.from(new Set(rows.map((s) => s.year).filter(Boolean))).sort(), [rows]);
  const semesters = useMemo(
    () => Array.from(new Set(rows.map((s) => s.semester).filter(Boolean))).sort(),
    [rows]
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((s) => {
      if (status === "pending" && !(s.status === "pending")) return false;
      if (status === "approved" && s.status !== "approved") return false;
      if (status === "rejected" && !(s.status === "rejected" && s.decidedBy !== "automatic-duplicate-guard")) return false;
      if (status === "duplicate" && !(s.status === "rejected" && s.decidedBy === "automatic-duplicate-guard")) return false;
      if (courseFilter !== "All" && s.courseId !== courseFilter) return false;
      if (yearFilter !== "All" && s.year !== yearFilter) return false;
      if (semesterFilter !== "All" && s.semester !== semesterFilter) return false;
      if (needle) {
        const hay = `${s.name} ${s.courseName} ${s.contributorName} ${s.userEmail} ${s.department}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [courseFilter, rows, search, semesterFilter, status, yearFilter]);

  const decide = async (sub, action) => {
    setBusyId(sub.id);
    const res = action === "approve" ? await approveSubmission(sub.id) : await rejectSubmission(sub.id, rejecting?.reason || "");
    setBusyId("");
    if (res && res.ok !== false) {
      setRejecting(null);
      load();
    } else if (res && res.error) {
      toast(res.error);
    }
  };

  const kpis = [
    { key: "pending", label: "Waiting for review", value: counts.pending, icon: Inbox, tone: "warning" },
    { key: "approved", label: "Published", value: counts.approved, icon: Check, tone: "success" },
    { key: "rejected", label: "Rejected", value: counts.rejected, icon: ThumbsDown, tone: "secondary" },
    { key: "duplicate", label: "Duplicate attempts blocked", value: counts.duplicate, icon: ShieldAlert, tone: "danger" }
  ];

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <span className="ws-section-kicker">Student contributions</span>
          <h2 className="h4 mb-1">Material review queue</h2>
          <p className="small text-secondary mb-0">
            Publishing {UPLOADS_PER_CREDIT} approved uploads earns the student one download. Repeated or duplicate
            documents are blocked automatically and never earn a credit.
          </p>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={`me-1 align-text-bottom ${loading ? "spin" : ""}`} aria-hidden="true" />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="row g-2">
        {kpis.map((kpi) => (
          <div key={kpi.key} className="col-6 col-lg-3">
            <button
              type="button"
              className={`card kpi-card w-100 text-start p-3 ${status === kpi.key ? "active" : ""}`}
              onClick={() => setStatus(kpi.key)}
            >
              <span className="small text-secondary d-flex align-items-center gap-1">
                <kpi.icon size={14} aria-hidden="true" />
                {kpi.label}
              </span>
              <span className="h4 mb-0 mt-1">{kpi.value}</span>
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-body p-3">
          <div className="row g-2">
            <div className="col-12 col-md-4">
              <label className="form-label small fw-semibold" htmlFor="subSearch">
                Search
              </label>
              <div className="input-group">
                <span className="input-group-text">
                  <Search size={14} aria-hidden="true" />
                </span>
                <input
                  id="subSearch"
                  className="form-control"
                  placeholder="Document, student or course…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small fw-semibold" htmlFor="subStatus">
                Status
              </label>
              <select id="subStatus" className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All statuses" : s === "duplicate" ? "Duplicate blocks" : s}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small fw-semibold" htmlFor="subCourse">
                Course
              </label>
              <select id="subCourse" className="form-select" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
                <option value="All">All courses</option>
                {coursesData.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small fw-semibold" htmlFor="subYear">
                Year
              </label>
              <select id="subYear" className="form-select" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                <option value="All">All years</option>
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small fw-semibold" htmlFor="subSem">
                Semester
              </label>
              <select
                id="subSem"
                className="form-select"
                value={semesterFilter}
                onChange={(e) => setSemesterFilter(e.target.value)}
              >
                <option value="All">All semesters</option>
                {semesters.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {rejecting ? (
        <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2 mb-0" role="alert">
          <strong className="me-1">Reject “{rejecting.name}”?</strong>
          <input
            className="form-control form-control-sm flex-grow-1"
            style={{ minWidth: 220 }}
            placeholder="Reason shown to the student"
            value={rejecting.reason}
            onChange={(e) => setRejecting({ ...rejecting, reason: e.target.value })}
          />
          <button type="button" className="btn btn-sm btn-coral" onClick={() => decide(rejecting, "reject")}>
            Confirm rejection
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setRejecting(null)}>
            <X size={14} className="me-1 align-text-bottom" aria-hidden="true" />
            Cancel
          </button>
        </div>
      ) : null}

      <div className="card p-0 table-responsive table-stack">
        <table className="table align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">Document</th>
              <th scope="col">Course · year · semester</th>
              <th scope="col">Shared by</th>
              <th scope="col">Sent</th>
              <th scope="col">Status</th>
              <th scope="col" className="text-end">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((sub) => (
              <tr key={sub.id}>
                <td style={{ minWidth: 220 }}>
                  <div className="fw-semibold text-truncate">{sub.name}</div>
                  <div className="small text-secondary">
                    {sub.type} · {sub.size} · {sub.subcategory}
                  </div>
                  {sub.reason ? (
                    <div className="small text-danger mt-1" style={{ maxWidth: 360 }}>
                      {sub.reason}
                    </div>
                  ) : null}
                </td>
                <td className="small">
                  <div className="text-truncate" style={{ maxWidth: 200 }}>
                    {sub.courseName}
                  </div>
                  <div className="text-secondary">
                    {sub.year} · {sub.semester}
                  </div>
                </td>
                <td className="small">
                  <div>{sub.contributorName}</div>
                  <div className="text-secondary">{sub.userEmail}</div>
                </td>
                <td className="small text-secondary text-nowrap">{when(sub.createdAt)}</td>
                <td>{statusBadge(sub)}</td>
                <td className="text-end text-nowrap">
                  {sub.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary me-1"
                        disabled={busyId === sub.id}
                        onClick={() => decide(sub, "approve")}
                      >
                        <Check size={14} className="me-1 align-text-bottom" aria-hidden="true" />
                        Publish
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={busyId === sub.id}
                        onClick={() => setRejecting({ id: sub.id, name: sub.name, reason: "" })}
                      >
                        Reject
                      </button>
                    </>
                  ) : sub.url && !sub.url.startsWith("#") ? (
                    <a className="btn btn-sm btn-outline-secondary" href={sub.url} target="_blank" rel="noopener noreferrer">
                      Open file
                    </a>
                  ) : (
                    <span className="small text-secondary">decided {when(sub.decidedAt)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && !loading ? (
        <EmptyState
          icon={<Inbox size={24} />}
          title="Nothing in this filter"
          description="Switch the status filter or refresh — new student uploads appear here the moment they are sent."
        />
      ) : null}
    </div>
  );
}
