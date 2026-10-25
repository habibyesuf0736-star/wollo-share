import React, { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({ open, title, subtitle, onClose, children, size = "" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && onClose) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ws-backdrop show" role="dialog" aria-modal="true" aria-label={title} onMouseDown={onClose}>
      <div className={`ws-modal ${size}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="ws-modal-head">
          <div style={{ minWidth: 0 }}>
            <h3 className="h5 mb-0">{title}</h3>
            {subtitle ? <p className="text-secondary small mb-0 mt-1">{subtitle}</p> : null}
          </div>
          <button type="button" className="ws-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
