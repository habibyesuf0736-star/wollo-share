import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Database, Download, FileSpreadsheet, FileText, ShieldCheck, Upload, Users } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import Modal from "../../components/Modal.jsx";
import StatCard from "../../components/StatCard.jsx";
import * as api from "../../lib/api.js";

const SCOPE_LABEL = { accounts: "accounts", library: "library and site content", all: "everything" };

function fileStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function saveFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function inspectBackup(parsed) {
  const state = parsed && typeof parsed.state === "object" && parsed.state ? parsed.state : parsed;
  if (!state || typeof state !== "object") return null;
  const hasUsers = Array.isArray(state.usersData);
  const hasCourses = Array.isArray(state.coursesData);
  if (!hasUsers && !hasCourses) return null;
  return {
    scope: hasUsers && hasCourses ? "all" : hasUsers ? "accounts" : "library",
    exportedAt: parsed.exportedAt || "",
    accounts: hasUsers ? state.usersData.length : 0,
    courses: hasCourses ? state.coursesData.length : 0,
    materials: hasCourses
      ? state.coursesData.reduce((sum, course) => sum + ((course && course.materials) || []).length, 0)
      : 0
  };
}

export default function AdminBackup() {
  const { session, toast } = useApp();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);
  const [intent, setIntent] = useState("accounts");
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!session) return undefined;
    api.getBackupInfo(session.authToken).then((res) => {
      if (!cancelled && res && res.ok !== false) setInfo(res);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const download = async (scope) => {
    setBusy(scope);
    setError("");
    const doc = await api.getBackup(session.authToken, scope);
    setBusy("");
    if (!doc || doc.ok === false || !doc.state) {
      setError((doc && doc.error) || "The server did not return a backup file.");
      return;
    }
    saveFile(`wollo-share-${scope === "all" ? "backup" : scope}-${fileStamp()}.json`, JSON.stringify(doc, null, 2), "application/json");
    toast(scope === "accounts" ? "Accounts backup downloaded." : scope === "library" ? "Library backup downloaded." : "Complete backup downloaded.");
  };

  const downloadCsv = async () => {
    setBusy("csv");
    setError("");
    const res = await api.getAccountsCsv(session.authToken);
    setBusy("");
    if (!res || res.ok === false) {
      setError((res && res.error) || "Could not download the accounts list.");
      return;
    }
    saveFile(`wollo-share-accounts-${fileStamp()}.csv`, res.text, "text/csv");
    toast("Accounts list downloaded — open it in Excel or Sheets.");
  };

  const downloadSentCsv = async () => {
    setBusy("sent");
    setError("");
    const res = await api.getSubmissionsCsv(session.authToken);
    setBusy("");
    if (!res || res.ok === false) {
      setError((res && res.error) || "Could not download the sent materials list.");
      return;
    }
    saveFile(`wollo-share-sent-materials-${fileStamp()}.csv`, res.text, "text/csv");
    toast("Sent materials downloaded — every document students submitted, with its review status.");
  };

  const pickFile = (scope) => {
    setIntent(scope);
    setError("");
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const onFileChosen = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      const parsed = JSON.parse(await file.text());
      const found = inspectBackup(parsed);
      if (!found) {
        setError("That file is not a Wollo Share backup — it has no accounts or courses in it.");
        return;
      }
      if (found.scope !== intent) {
        setError(`That is a ${SCOPE_LABEL[found.scope]} backup. Use the “Restore ${SCOPE_LABEL[found.scope]}” button instead.`);
        return;
      }
      if ((found.scope === "accounts" && !found.accounts) || (found.scope === "library" && !found.courses)) {
        setError("That backup is empty, so nothing was restored.");
        return;
      }
      setPending({ ...found, fileName: file.name, backup: parsed });
    } catch {
      setError("That file could not be read as JSON. Pick a backup file you downloaded earlier.");
    }
  };

  const confirmRestore = async () => {
    if (!pending) return;
    setBusy("restore");
    setError("");
    try {
      // A same-scope copy of what is live now is saved to disk first, so a wrong file is undoable.
      const current = await api.getBackup(session.authToken, pending.scope);
      if (current && current.ok !== false && current.state) {
        saveFile(`wollo-share-before-restore-${pending.scope}-${fileStamp()}.json`, JSON.stringify(current, null, 2), "application/json");
      }
      const res = await api.restoreBackup(pending.backup, session.authToken);
      if (!res || res.ok === false) {
        setError((res && res.error) || "The server refused the restore, so nothing was changed.");
        setBusy("");
        return;
      }
      const summary =
        res.scope === "accounts"
          ? `Restored ${res.restored.accounts.accounts} accounts.`
          : res.scope === "library"
          ? `Restored ${res.restored.library.courses} courses and ${res.restored.library.materials} materials.`
          : `Restored ${res.restored.accounts.accounts} accounts and ${res.restored.library.courses} courses.`;
      setPending(null);
      setBusy("");
      toast(summary);
      setTimeout(() => window.location.reload(), 900);
    } catch {
      setError("The restore request failed, so nothing was changed.");
      setBusy("");
    }
  };

  const accounts = (info && info.accounts) || {};
  const library = (info && info.library) || {};
  const sent = (info && info.sentMaterials) || {};
  const complaints = (info && info.complaints) || {};

  return (
    <div className="d-flex flex-column gap-3">
      {error ? (
        <div className="banner warn" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="row g-2">
        <div className="col-6 col-md-3">
          <StatCard value={accounts.accounts ?? "…"} label="Accounts" />
        </div>
        <div className="col-6 col-md-3">
          <StatCard value={accounts.pending ?? "…"} label="Awaiting verification" />
        </div>
        <div className="col-6 col-md-3">
          <StatCard value={library.courses ?? "…"} label="Courses" />
        </div>
        <div className="col-6 col-md-3">
          <StatCard value={library.materials ?? "…"} label="Materials" />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100 d-flex flex-column">
            <div className="d-flex align-items-center gap-2 mb-1">
              <Users size={18} aria-hidden="true" />
              <h3 className="h6 mb-0">Student accounts</h3>
            </div>
            <p className="small text-secondary mb-1">
              Names, emails, phones, departments, plans, verification status, activity history and sign-in credentials.
            </p>
            <p className="small text-secondary mb-3">
              {info
                ? `${accounts.accounts} accounts · ${accounts.verified} verified · ${accounts.pending} pending · ${accounts.paid} on a paid plan`
                : "Reading the database…"}
            </p>
            <div className="d-flex flex-wrap gap-2 mt-auto">
              <button type="button" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2" onClick={() => download("accounts")} disabled={Boolean(busy)}>
                <Download size={15} aria-hidden="true" />
                {busy === "accounts" ? "Preparing…" : "Download accounts"}
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2" onClick={downloadCsv} disabled={Boolean(busy)}>
                <FileSpreadsheet size={15} aria-hidden="true" />
                {busy === "csv" ? "Preparing…" : "Accounts CSV"}
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2" onClick={() => pickFile("accounts")} disabled={Boolean(busy)}>
                <Upload size={15} aria-hidden="true" />
                Restore accounts…
              </button>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100 d-flex flex-column">
            <div className="d-flex align-items-center gap-2 mb-1">
              <BookOpen size={18} aria-hidden="true" />
              <h3 className="h6 mb-0">Library & site content</h3>
            </div>
            <p className="small text-secondary mb-1">
              Courses, materials with their file links and side materials, page text, branding, ratings and submitted files.
            </p>
            <p className="small text-secondary mb-3">
              {info
                ? `${library.courses} courses · ${library.materials} materials · ${library.ratings} rated files · ${library.submissions} submissions`
                : "Reading the database…"}
            </p>
            <div className="d-flex flex-wrap gap-2 mt-auto">
              <button type="button" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2" onClick={() => download("library")} disabled={Boolean(busy)}>
                <Download size={15} aria-hidden="true" />
                {busy === "library" ? "Preparing…" : "Download library"}
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2" onClick={() => pickFile("library")} disabled={Boolean(busy)}>
                <Upload size={15} aria-hidden="true" />
                Restore library…
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <div className="d-flex align-items-center gap-2">
              <FileText size={16} aria-hidden="true" />
              <h3 className="h6 mb-0">Materials students sent</h3>
            </div>
            <p className="small text-secondary mb-0 mt-1">
              {info
                ? `${sent.total} sent · ${sent.pending} waiting for review · ${sent.approved} published · ${sent.rejected} rejected · ${sent.contributors} contributors`
                : "Reading the database…"}{" "}
              Every row carries the student, the course, the file and who decided it, so the whole contribution history fits in one spreadsheet.
            </p>
            <p className="small text-secondary mb-0 mt-1">
              {info
                ? `${complaints.open} complaints open · ${complaints.answered} answered · ${complaints.closed} closed`
                : "Complaint counts load with the database summary."}
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2" onClick={downloadSentCsv} disabled={Boolean(busy)}>
              <FileSpreadsheet size={15} aria-hidden="true" />
              {busy === "sent" ? "Preparing…" : "Sent materials CSV"}
            </button>
          </div>
        </div>
      </div>

      <div className="card p-3">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <div className="d-flex align-items-center gap-2">
              <Database size={16} aria-hidden="true" />
              <h3 className="h6 mb-0">Everything in one file</h3>
            </div>
            <p className="small text-secondary mb-0 mt-1">
              Accounts and library together, for a full off-site copy. One file per data set is easier to inspect and restore.
            </p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2" onClick={() => download("all")} disabled={Boolean(busy)}>
              <Download size={15} aria-hidden="true" />
              {busy === "all" ? "Preparing…" : "Download everything"}
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2" onClick={() => pickFile("all")} disabled={Boolean(busy)}>
              <Upload size={15} aria-hidden="true" />
              Restore everything…
            </button>
          </div>
        </div>
      </div>

      <div className="card p-3">
        <div className="d-flex align-items-center gap-2 mb-2">
          <ShieldCheck size={16} aria-hidden="true" />
          <h3 className="h6 mb-0">Good to know</h3>
        </div>
        <ul className="small text-secondary mb-0 ps-3 d-flex flex-column gap-1">
          <li>Every change, signup and profile edit is written to the {info ? (info.storage === "supabase" ? "Supabase database" : "server file") : "database"} immediately.</li>
          <li>Restoring accounts leaves courses, materials and branding untouched; restoring the library leaves accounts untouched.</li>
          <li>Accounts and library backups contain sign-in data — keep them private. The CSV list is for spreadsheets only and cannot be restored.</li>
        </ul>
      </div>

      <input ref={fileInputRef} type="file" accept="application/json,.json" className="d-none" onChange={onFileChosen} />

      <Modal
        open={Boolean(pending)}
        onClose={() => {
          if (busy !== "restore") setPending(null);
        }}
        title="Restore this backup?"
        subtitle={pending ? pending.fileName : ""}
        size="narrow"
      >
        {pending ? (
          <div className="d-flex flex-column gap-3">
            <ul className="list-unstyled small mb-0 d-flex flex-column gap-1">
              {pending.scope !== "library" ? (
                <li className="d-flex justify-content-between gap-2">
                  <span className="text-secondary">Accounts</span>
                  <span className="mono">{pending.accounts}</span>
                </li>
              ) : null}
              {pending.scope !== "accounts" ? (
                <>
                  <li className="d-flex justify-content-between gap-2">
                    <span className="text-secondary">Courses</span>
                    <span className="mono">{pending.courses}</span>
                  </li>
                  <li className="d-flex justify-content-between gap-2">
                    <span className="text-secondary">Materials</span>
                    <span className="mono">{pending.materials}</span>
                  </li>
                </>
              ) : null}
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Downloaded</span>
                <span className="mono">{pending.exportedAt ? new Date(pending.exportedAt).toLocaleString() : "unknown"}</span>
              </li>
            </ul>
            <p className="small text-secondary mb-0">
              {pending.scope === "accounts"
                ? "This replaces every student account. Courses, materials and branding stay exactly as they are."
                : pending.scope === "library"
                ? "This replaces the library and site content. Student accounts stay exactly as they are."
                : "This replaces accounts and library together."}{" "}
              A copy of the current {SCOPE_LABEL[pending.scope]} is downloaded to your computer before anything changes.
            </p>
            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setPending(null)} disabled={busy === "restore"}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmRestore} disabled={busy === "restore"}>
                {busy === "restore" ? "Restoring…" : "Restore now"}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
