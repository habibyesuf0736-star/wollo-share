import React, { useMemo, useState } from "react";
import { Download, Gift, Lock, Users } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";

const MODES = [
  {
    key: "credits",
    title: "Earn it or buy it",
    line: "Free accounts spend a downloaded credit; premium accounts download freely.",
    icon: Download
  },
  {
    key: "free",
    title: "Open to every student",
    line: "Anyone signed in can download any file — no credits, no plan.",
    icon: Gift
  },
  {
    key: "premium",
    title: "Premium accounts only",
    line: "Paid plans download; free accounts see the plan offer instead of the file.",
    icon: Lock
  }
];

const PLAN_OF = (user) =>
  user.accountPlan || (user.downloadOnlyAccount ? "paid_download_only" : user.paymentStatus === "paid" ? "paid_lifetime" : "unpaid");

const PAID = ["premium_monthly", "premium_annual", "paid_lifetime", "paid_download_only"];

export default function AdminDownloads({ onNavigate }) {
  const { downloadPolicy, commitDownloadPolicy, usersData, coursesData, toast } = useApp();
  const [saveNote, setSaveNote] = useState("");

  const materialCount = useMemo(
    () => coursesData.reduce((sum, c) => sum + (c.materials || []).filter((m) => !m.hidden).length, 0),
    [coursesData]
  );
  const freeMaterialCount = useMemo(
    () => coursesData.reduce((sum, c) => sum + (c.materials || []).filter((m) => m.free && !m.hidden).length, 0),
    [coursesData]
  );

  const buckets = useMemo(() => {
    let paid = 0;
    let granted = 0;
    let withCredits = 0;
    let empty = 0;
    for (const user of usersData) {
      if (user.role === "admin" || user.role === "support") continue;
      const plan = PLAN_OF(user);
      if (PAID.includes(plan)) paid += 1;
      else if (plan === "free_unlimited") granted += 1;
      else if ((Number(user.downloadCredits) || 0) > 0) withCredits += 1;
      else empty += 1;
    }
    return { paid, granted, withCredits, empty };
  }, [usersData]);

  // One sentence that tells the truth about the current combination, so the admin does not
  // have to hold three settings in their head at once.
  const outcome = useMemo(() => {
    const mode = MODES.find((m) => m.key === downloadPolicy.mode) || MODES[0];
    const wait = downloadPolicy.adSeconds > 0 ? ` Every download outside a paid plan starts with a ${downloadPolicy.adSeconds}s sponsor spot.` : " No sponsor spot for anyone.";
    if (downloadPolicy.mode === "free") {
      return `Signed-in students download any of the ${materialCount} published files without spending anything.${wait}`;
    }
    if (downloadPolicy.mode === "premium") {
      return `Only paid plans download. ${buckets.withCredits + buckets.empty} free accounts are shown the plan offer, and ${freeMaterialCount} file${freeMaterialCount === 1 ? " stays" : "s stay"} open to everyone.`;
    }
    const creditLine = `${downloadPolicy.uploadsPerCredit} approved upload${downloadPolicy.uploadsPerCredit === 1 ? "" : "s"} earn${
      downloadPolicy.uploadsPerCredit === 1 ? "" : "s"
    } a student one download. ${buckets.withCredits} free account${buckets.withCredits === 1 ? "" : "s"} can download now, ${buckets.empty} cannot.`;
    return `${creditLine}${wait}`;
  }, [buckets, downloadPolicy, freeMaterialCount, materialCount]);

  const setMode = (key) => {
    commitDownloadPolicy({ mode: key });
    const mode = MODES.find((m) => m.key === key);
    setSaveNote(`Saved · ${mode.title}`);
    toast(`Download rule: ${mode.title}.`);
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <span className="ws-section-kicker">Access control</span>
          <h2 className="h4 mb-1">Downloads</h2>
          <p className="small text-secondary mb-0">Saved to the shared database — every device sees it on the next click.</p>
        </div>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onNavigate && onNavigate("users")}>
          <Users size={14} className="me-1 align-text-bottom" aria-hidden="true" />
          Per-account access
        </button>
      </div>

      <div className="row g-2">
        {MODES.map((mode) => {
          const active = downloadPolicy.mode === mode.key;
          const Icon = mode.icon;
          return (
            <div key={mode.key} className="col-12 col-md-4">
              <button
                type="button"
                className={`card kpi-card w-100 text-start p-3 ${active ? "active" : ""}`}
                onClick={() => setMode(mode.key)}
                aria-pressed={active}
              >
                <span className="d-flex align-items-center gap-2 mb-1">
                  <Icon size={15} className={active ? "text-success" : "text-secondary"} aria-hidden="true" />
                  <strong className="small">{mode.title}</strong>
                </span>
                <span className="small text-secondary">{mode.line}</span>
                <span className={`badge rounded-pill mt-2 ${active ? "text-bg-success" : "text-bg-light border"}`}>
                  {active ? "In force" : "Tap to apply"}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="card p-3">
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-4">
            <label className="form-label small fw-semibold" htmlFor="uploadsPerCredit">
              Approved uploads that earn one download
            </label>
            <input
              id="uploadsPerCredit"
              className="form-control"
              type="number"
              min="1"
              max="10"
              step="1"
              disabled={downloadPolicy.mode !== "credits"}
              value={downloadPolicy.uploadsPerCredit}
              onChange={(e) => {
                commitDownloadPolicy({ uploadsPerCredit: Number(e.target.value) });
                setSaveNote("Saved");
              }}
            />
            <div className="small text-secondary mt-1">
              {downloadPolicy.mode === "credits" ? "Counts every student who has not been given a plan." : "Not used while another rule is in force."}
            </div>
          </div>
          <div className="col-12 col-md-5">
            <label className="form-label small fw-semibold" htmlFor="adSeconds">
              Sponsor spot before a download (seconds)
            </label>
            <input
              id="adSeconds"
              className="form-control"
              type="number"
              min="0"
              max="120"
              step="1"
              value={downloadPolicy.adSeconds}
              onChange={(e) => {
                commitDownloadPolicy({ adSeconds: Number(e.target.value) });
                setSaveNote("Saved");
              }}
            />
            <div className="small text-secondary mt-1">
              {downloadPolicy.adSeconds === 0 ? "Files start at once — paid plans never saw a spot anyway." : "Skipped by premium plans, staff and free-unlimited accounts."}
            </div>
          </div>
          <div className="col-12 col-md-3 text-md-end">
            <div className="small text-secondary">
              {materialCount} published · {freeMaterialCount} marked free
            </div>
            {saveNote ? (
              <span className="badge rounded-pill text-bg-success mt-1">{saveNote}</span>
            ) : null}
          </div>
        </div>

        <div className="alert alert-light border small mt-3 mb-0">{outcome}</div>
      </div>

      <div className="row g-2">
        <div className="col-6 col-lg-3">
          <div className="card p-3 h-100">
            <div className="small text-secondary">Paid plans</div>
            <div className="h4 mb-0">{buckets.paid}</div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="card p-3 h-100">
            <div className="small text-secondary">Free · unlimited grants</div>
            <div className="h4 mb-0">{buckets.granted}</div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="card p-3 h-100">
            <div className="small text-secondary">Free accounts with downloads left</div>
            <div className="h4 mb-0">{buckets.withCredits}</div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="card p-3 h-100">
            <div className="small text-secondary">Free accounts with none left</div>
            <div className="h4 mb-0">{buckets.empty}</div>
          </div>
        </div>
      </div>

      <div className="card p-3">
        <h3 className="h6 mb-2">Per file</h3>
        <p className="small text-secondary mb-2">
          A file marked <strong>Free</strong> opens to any signed-in student whatever the rule above says. Open the Materials
          tab and use the column in any row.
        </p>
        <button type="button" className="btn btn-sm btn-soft align-self-start" onClick={() => onNavigate && onNavigate("materials")}>
          <Download size={14} className="me-1 align-text-bottom" aria-hidden="true" />
          Manage which files are free
        </button>
      </div>
    </div>
  );
}
