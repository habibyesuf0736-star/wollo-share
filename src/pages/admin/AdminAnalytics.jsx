import React, { useMemo, useState } from "react";
import { useApp } from "../../store/AppContext.jsx";
import StatCard from "../../components/StatCard.jsx";
import { parseStamp } from "../../lib/utils.js";

const RANGES = [7, 14, 30];

export default function AdminAnalytics() {
  const { coursesData, usersData, stats } = useApp();
  const [range, setRange] = useState(14);

  const events = useMemo(() => {
    const list = [];
    usersData.forEach((user) =>
      (user.activityLog || []).forEach((event) => {
        const date = parseStamp(event.timestamp);
        if (!date) return;
        list.push({ ...event, date, user });
      })
    );
    return list;
  }, [usersData]);

  const buckets = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-US", { day: "numeric", month: "short" }), uploads: 0, downloads: 0 });
    }
    const index = new Map(days.map((day) => [day.key, day]));
    events.forEach((event) => {
      const key = event.date.toISOString().slice(0, 10);
      const day = index.get(key);
      if (!day) return;
      const type = String(event.type || "").toLowerCase();
      if (type.includes("shar") || type.includes("upload") || type.includes("contribut")) day.uploads += 1;
      if (type.includes("download")) day.downloads += 1;
    });
    return days;
  }, [events, range]);

  const maxDay = Math.max(1, ...buckets.map((b) => Math.max(b.uploads, b.downloads)));

  const formatCounts = useMemo(() => {
    const counts = {};
    coursesData.forEach((c) =>
      (c.materials || []).forEach((m) => {
        const key = m.type || "Other";
        counts[key] = (counts[key] || 0) + 1;
      })
    );
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [coursesData]);

  const totalFiles = formatCounts.reduce((sum, [, n]) => sum + n, 0);
  const palette = ["#1d624f", "#d7ed85", "#e87558", "#2563eb", "#9333ea", "#0ea5a4", "#f59e0b"];
  let sweep = 0;
  const gradient = formatCounts
    .map(([type, count], i) => {
      const start = (sweep / (totalFiles || 1)) * 360;
      sweep += count;
      const end = (sweep / (totalFiles || 1)) * 360;
      return `${palette[i % palette.length]} ${start}deg ${end}deg`;
    })
    .join(", ");

  const topCourses = useMemo(
    () =>
      coursesData
        .map((c) => ({ name: c.name, files: (c.materials || []).filter((m) => !m.hidden).length }))
        .sort((a, b) => b.files - a.files)
        .slice(0, 8),
    [coursesData]
  );
  const maxCourseFiles = Math.max(1, ...topCourses.map((c) => c.files));

  const activityTypes = useMemo(() => {
    const counts = {};
    events.forEach((e) => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [events]);
  const maxActivity = Math.max(1, ...activityTypes.map(([, n]) => n));

  return (
    <div className="d-flex flex-column gap-3">
      <div className="row g-2">
        <div className="col-6 col-md-3">
          <StatCard value={totalFiles} label="Files in library" />
        </div>
        <div className="col-6 col-md-3">
          <StatCard value={usersData.length} label="Student accounts" />
        </div>
        <div className="col-6 col-md-3">
          <StatCard value={events.length} label="Tracked events" />
        </div>
        <div className="col-6 col-md-3">
          <StatCard value={`${stats.avgRating} ★`} label="Average rating" />
        </div>
      </div>

      <div className="card p-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          <h3 className="h6 mb-0">Uploads & downloads · last {range} days</h3>
          <div className="d-flex gap-1">
            {RANGES.map((r) => (
              <button key={r} type="button" className={`btn btn-sm ${range === r ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setRange(r)}>
                {r}d
              </button>
            ))}
          </div>
        </div>
        <div className="d-flex align-items-end gap-2 chart-scroll" style={{ height: 160, overflowX: "auto" }}>
          {buckets.map((day) => (
            <div key={day.key} className="text-center flex-grow-1" style={{ minWidth: 26 }}>
              <div className="d-flex align-items-end justify-content-center gap-1" style={{ height: 120 }}>
                <div className="bar" style={{ width: 8, height: `${(day.uploads / maxDay) * 110}px`, background: "var(--green)" }} title={`${day.uploads} uploads`} />
                <div className="bar" style={{ width: 8, height: `${(day.downloads / maxDay) * 110}px`, background: "var(--coral)" }} title={`${day.downloads} downloads`} />
              </div>
              <div className="mono text-secondary" style={{ fontSize: 9.5 }}>
                {day.label.split(" ").slice(-1)[0]}
              </div>
            </div>
          ))}
        </div>
        <p className="small text-secondary mt-2 mb-0">
          <span style={{ color: "var(--green)" }}>■</span> uploads · <span style={{ color: "var(--coral)" }}>■</span> downloads
        </p>
      </div>

      <div className="row g-3">
        <div className="col-12 col-md-5">
          <div className="card p-3 h-100">
            <h3 className="h6 mb-3">Library by format</h3>
            <div className="d-flex align-items-center gap-3 flex-wrap">
              <div className="donut" style={{ background: `conic-gradient(${gradient || "#e5e7eb 0deg 360deg"})` }}>
                <div className="donut-hole">{totalFiles}</div>
              </div>
              <ul className="list-unstyled small mb-0 d-flex flex-column gap-1">
                {formatCounts.map(([type, count], i) => (
                  <li key={type} className="d-flex align-items-center gap-2">
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: palette[i % palette.length], display: "inline-block" }} />
                    {type} <span className="text-secondary">({count})</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-7">
          <div className="card p-3 h-100">
            <h3 className="h6 mb-3">Courses with the most files</h3>
            <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
              {topCourses.map((course) => (
                <li key={course.name}>
                  <div className="d-flex justify-content-between small">
                    <span className="text-truncate" style={{ maxWidth: 320 }}>
                      {course.name}
                    </span>
                    <span className="text-secondary">{course.files}</span>
                  </div>
                  <div className="progress mt-1" style={{ height: 6 }}>
                    <div className="progress-bar" style={{ width: `${(course.files / maxCourseFiles) * 100}%`, background: "var(--green)" }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="card p-3">
        <h3 className="h6 mb-3">Student activity mix</h3>
        {activityTypes.length === 0 ? (
          <p className="small text-secondary mb-0">No activity has been recorded yet.</p>
        ) : (
          <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
            {activityTypes.map(([type, count]) => (
              <li key={type}>
                <div className="d-flex justify-content-between small">
                  <span>{type}</span>
                  <span className="text-secondary">{count}</span>
                </div>
                <div className="progress mt-1" style={{ height: 6 }}>
                  <div className="progress-bar" style={{ width: `${(count / maxActivity) * 100}%`, background: "var(--green)" }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
