import React, { useEffect, useState } from "react";
import { ArrowLeft, Download, ExternalLink, FileText, FolderOpen, RefreshCw, Share2, Trash2 } from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { listDocs, dropDoc, docUri } from "../app/docs.js";
import { formatFileSize } from "../lib/utils.js";

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(bytes)) return "";
  return formatFileSize(bytes);
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

const TYPE_EXT_LABELS = { pdf: "PDF", docx: "Word document", pptx: "Presentation", text: "Text file", html: "HTML" };

function FileIcon({ kind }) {
  return (
    <span className={`file-badge t-${kind === "pdf" ? "PDF" : kind === "docx" ? "DOC" : kind === "pptx" ? "PPT" : "Other"}`}>
      <FileText size={16} strokeWidth={1.9} aria-hidden="true" />
      <span>{(TYPE_EXT_LABELS[kind] || kind || "File").toUpperCase()}</span>
    </span>
  );
}

function isNative() {
  return typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.() === true;
}

function DownloadItem({ doc, onOpen, onShare, onDelete }) {
  const [busy, setBusy] = useState("");

  const handleOpen = async () => {
    setBusy("open");
    await onOpen(doc);
    setBusy("");
  };

  const handleShare = async () => {
    setBusy("share");
    await onShare(doc);
    setBusy("");
  };

  const handleDelete = async () => {
    setBusy("delete");
    await onDelete(doc);
    setBusy("");
  };

  return (
    <article className="ws-download-row">
      <FileIcon kind={doc.kind} />
      <div className="ws-download-info">
        <strong className="ws-download-name">{doc.name || "Document"}</strong>
        {doc.course ? <span className="small text-secondary">{doc.course}</span> : null}
        <div className="ws-download-meta">
          <span>{TYPE_EXT_LABELS[doc.kind] || doc.kind || "file"}</span>
          {doc.size ? <span>·</span> : null}
          {doc.size ? <span>{formatBytes(doc.size)}</span> : null}
          {doc.at ? <span>·</span> : null}
          {doc.at ? <span>{formatDate(doc.at)}</span> : null}
        </div>
      </div>
      <div className="ws-download-actions">
        <button
          type="button"
          className="btn btn-sm btn-soft d-inline-flex align-items-center gap-1"
          onClick={handleOpen}
          disabled={Boolean(busy)}
          title="Open file"
        >
          {busy === "open" ? <RefreshCw size={13} className="spin" aria-hidden="true" /> : <FolderOpen size={13} aria-hidden="true" />}
          Open
        </button>
        {isNative() ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
            onClick={handleShare}
            disabled={Boolean(busy)}
            title="Share file"
          >
            {busy === "share" ? <RefreshCw size={13} className="spin" aria-hidden="true" /> : <Share2 size={13} aria-hidden="true" />}
            Share
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-sm btn-coral d-inline-flex align-items-center gap-1"
          onClick={handleDelete}
          disabled={Boolean(busy)}
          title="Remove from downloads"
        >
          {busy === "delete" ? <RefreshCw size={13} className="spin" aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />}
          Remove
        </button>
      </div>
    </article>
  );
}

export default function DownloadsPage() {
  const { session, goLibrary, toast } = useApp();
  const [docs, setDocs] = useState(() => listDocs());

  // docs.js dispatches a "wollo:docs" event when the index changes.
  useEffect(() => {
    const refresh = () => setDocs(listDocs());
    window.addEventListener("wollo:docs", refresh);
    return () => window.removeEventListener("wollo:docs", refresh);
  }, []);

  if (!session) {
    return (
      <div className="ws-page">
        <div className="card p-4 mx-auto text-center" style={{ maxWidth: 520 }}>
          <Download size={28} className="mb-2 text-secondary" aria-hidden="true" />
          <h1 className="h5">Sign in to see your downloads</h1>
          <button type="button" className="btn btn-primary mt-2" onClick={() => window.history.back()}>Go back</button>
        </div>
      </div>
    );
  }

  const handleOpen = async (doc) => {
    // On native, try to hand the URI directly to the OS file opener.
    if (isNative()) {
      try {
        const uri = await docUri(doc.key);
        if (uri) {
          try {
            // FileOpener plugin is not bundled — use Capacitor's App.openUrl instead.
            await window.Capacitor?.Plugins?.App?.openUrl?.({ url: uri });
            return;
          } catch {
            // openUrl not available; fall through to the in-app reader
          }
        }
      } catch {
        // ignore, fall through
      }
    }
    // Web and native fallback: fire the wollo:openread event that AppShell listens for.
    // If no listener, inform the student the file was saved before the reader was available.
    const event = new CustomEvent("wollo:openread", { detail: doc });
    const handled = window.dispatchEvent(event);
    if (!handled) {
      toast("Could not open this file. Try downloading it again from the library.");
    }
  };

  const handleShare = async (doc) => {
    try {
      const uri = await docUri(doc.key);
      if (!uri) {
        toast("Could not find the file on this device.");
        return;
      }
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: doc.name, files: [uri] });
    } catch (err) {
      toast(err?.message || "Could not share the file.");
    }
  };

  const handleDelete = async (doc) => {
    await dropDoc(doc.key);
    setDocs(listDocs());
    toast(`"${doc.name}" removed from your downloads.`);
  };

  const totalSize = docs.reduce((sum, d) => sum + (Number(d.size) || 0), 0);

  return (
    <div className="ws-page">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div>
          <button type="button" className="btn btn-link btn-sm p-0 mb-1 d-inline-flex align-items-center gap-1 text-secondary" onClick={goLibrary}>
            <ArrowLeft size={14} aria-hidden="true" /> Back to library
          </button>
          <h1 className="h3 mb-1 d-flex align-items-center gap-2">
            <Download size={22} aria-hidden="true" />
            Downloaded files
          </h1>
          <p className="small text-secondary mb-0">
            {docs.length} {docs.length === 1 ? "file" : "files"}
            {totalSize ? ` · ${formatBytes(totalSize)} total` : ""}
            {" "}· available offline
          </p>
        </div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => setDocs(listDocs())}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
          {docs.length > 0 ? (
            <button
              type="button"
              className="btn btn-sm btn-coral d-inline-flex align-items-center gap-1"
              onClick={async () => {
                if (!window.confirm("Remove all downloaded files from this device?")) return;
                for (const doc of docs) await dropDoc(doc.key);
                setDocs([]);
                toast("All downloads cleared.");
              }}
            >
              <Trash2 size={14} aria-hidden="true" /> Clear all
            </button>
          ) : null}
        </div>
      </div>

      {docs.length === 0 ? (
        <EmptyState
          icon={Download}
          title="No files downloaded yet"
          body="Open any material in the library and tap 'Save for offline' to keep it here for when you have no internet."
          action={
            <button type="button" className="btn btn-primary" onClick={goLibrary}>
              <ExternalLink size={15} className="me-1 align-text-bottom" aria-hidden="true" />
              Browse the library
            </button>
          }
        />
      ) : (
        <div className="ws-download-list">
          {docs.map((doc) => (
            <DownloadItem key={doc.key} doc={doc} onOpen={handleOpen} onShare={handleShare} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
