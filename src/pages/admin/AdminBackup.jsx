import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Database, Download, ShieldCheck, Upload } from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import Modal from "../../components/Modal.jsx";
import StatCard from "../../components/StatCard.jsx";
import * as api from "../../lib/api.js";

function fileStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function saveJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function readBackupFile(parsed) {
  const state = parsed && typeof parsed.state === "object" && parsed.state ? parsed.state : parsed;
  if (!state || !Array.isArray(state.coursesData) || !Array.isArray(state.usersData)) return null;
  if (!state.coursesData.length || !state.usersData.length) return null;
  const materials = state.coursesData.reduce((sum, course) => sum + ((course && course.materials) || []).length, 0);
  return {
    exportedAt: parsed.exportedAt || "",
    accounts: state.usersData.length,
    courses: state.coursesData.length,
    materials
  };
}

export default function AdminBackup() {
  const { session, toast } = useApp();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null);
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

  const download = async () => {
    setBusy("download");
    setError("");
    const doc = await api.getBackup(session.authToken);
    setBusy("");
    if (!doc || doc.ok === false || !doc.state) {
      setError((doc && doc.error) || "The server did not return a backup file.");
      return;
    }
    saveJsonFile(`wollo-share-backup-${fileStamp()}.json`, doc);
    setInfo((prev) => (prev ? { ...prev, counts: doc.counts || prev.counts, storage: doc.storage || prev.storage } : prev));
    toast("Backup downloaded. Keep the file somewhere safe.");
  };

  const pickFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      const parsed = JSON.parse(await file.text());
      const summary = readBackupFile(parsed);
      if (!summary) {
        setError("That file is not a Wollo Share backup — it has no accounts or courses in it.");
        return;
      }
      setPending({ ...summary, fileName: file.name, backup: parsed });
    } catch {
      setError("That file could not be read as JSON. Pick the .json backup you downloaded earlier.");
    }
  };

  const confirmRestore = async () => {
    if (!pending) return;
    setBusy("restore");
    setError("");
    try {
      // The current data is saved to disk first, so a wrong file is always undoable.
      const current = await api.getBackup(session.authToken);
      if (current && current.ok !== false && current.state) {
        saveJsonFile(`wollo-share-before-restore-${fileStamp()}.json`, current);
      }
      const res = await api.restoreBackup(pending.backup, session.authToken);
      if (!res || res.ok === false) {
        setError((res && res.error) || "The server refused the restore, so nothing was changed.");
        setBusy("");
        return;
      }
      setPending(null);
      setBusy("");
      toast(`Restored ${res.restored.accounts} accounts, ${res.restored.courses} courses and ${res.restored.materials} materials.`);
      setTimeout(() => window.location.reload(), 900);
    } catch {
      setError("The restore request failed, so nothing was changed.");
      setBusy("");
    }
  };

  const counts = (info && info.counts) || {};
  const storageLabel = info ? (info.storage === "supabase" ? "Supabase database" : "Server file") : "…";

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
          <StatCard value={counts.accounts ?? "…"} label="Accounts stored" />
        </div>
        <div className="col-6 col-md-3">
          <StatCard value={counts.courses ?? "…"} label="Courses stored" />
        </div>
        <div className="col-6 col-md-3">
          <StatCard value={counts.materials ?? "…"} label="Materials stored" />
        </div>
        <div className="col-6 col-md-3">
          <StatCard value={Number.isFinite(info && info.contentRevision) ? info.contentRevision : "…"} label="Saved revision" />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100 d-flex flex-column">
            <div className="d-flex align-items-center gap-2 mb-1">
              <Download size={18} aria-hidden="true" />
              <h3 className="h6 mb-0">Download the current data</h3>
            </div>
            <p className="small text-secondary">
              Saves everything as one JSON file: all {counts.accounts ?? "—"} accounts, {counts.courses ?? "—"} courses,{" "}
              {counts.materials ?? "—"} materials with their links, page text, branding, ratings and student submissions.
            </p>
            <p className="small text-secondary mb-3">
              <ShieldCheck size={14} className="me-1 align-text-bottom" aria-hidden="true" />
              Living in the {storageLabel}
              {info && info.updatedAt ? ` · last saved ${new Date(info.updatedAt).toLocaleString()}` : ""}.
            </p>
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-2 mt-auto align-self-start" onClick={download} disabled={busy === "download"}>
              <Download size={15} aria-hidden="true" />
              {busy === "download" ? "Preparing…" : "Download backup"}
            </button>
          </div>
        </div>

        <div className="col-12 col-lg-6">
          <div className="card p-3 h-100 d-flex flex-column">
            <div className="d-flex align-items-center gap-2 mb-1">
              <Upload size={18} aria-hidden="true" />
              <h3 className="h6 mb-0">Restore from a backup</h3>
            </div>
            <p className="small text-secondary">
              Use this if data is lost or damaged. The current data is downloaded to your computer first, then the
              backup replaces every account, course and material on the server.
            </p>
            <div className="banner warn small mb-3" role="note">
              <span>Restoring replaces what is live now. Only use a file you downloaded from this site.</span>
            </div>
            <input ref={fileInputRef} type="file" accept="application/json,.json" className="d-none" onChange={pickFile} />
            <button type="button" className="btn btn-outline-secondary d-inline-flex align-items-center gap-2 mt-auto align-self-start" onClick={() => fileInputRef.current && fileInputRef.current.click()} disabled={busy === "restore"}>
              <Upload size={15} aria-hidden="true" />
              Choose backup file…
            </button>
          </div>
        </div>
      </div>

      <div className="card p-3">
        <div className="d-flex align-items-center gap-2 mb-2">
          <Database size={16} aria-hidden="true" />
          <h3 className="h6 mb-0">Where your data lives</h3>
        </div>
        <ul className="small text-secondary mb-0 ps-3 d-flex flex-column gap-1">
          <li>Every admin change, new account and profile edit is written to the shared database immediately.</li>
          <li>Materials are stored with their course, including file links, semester, rating and side materials.</li>
          <li>A backup file holds account sign-in data so accounts survive a restore — keep it private, like a password.</li>
        </ul>
      </div>

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
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Accounts</span>
                <span className="mono">{pending.accounts}</span>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Courses</span>
                <span className="mono">{pending.courses}</span>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Materials</span>
                <span className="mono">{pending.materials}</span>
              </li>
              <li className="d-flex justify-content-between gap-2">
                <span className="text-secondary">Downloaded</span>
                <span className="mono">{pending.exportedAt ? new Date(pending.exportedAt).toLocaleString() : "unknown"}</span>
              </li>
            </ul>
            <p className="small text-secondary mb-0">
              This replaces the live data with the contents of the file. A copy of the current data is downloaded to
              your computer before anything changes.
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
