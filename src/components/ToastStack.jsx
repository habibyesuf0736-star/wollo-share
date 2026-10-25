import React from "react";
import { useApp } from "../store/AppContext.jsx";

export default function ToastStack() {
  const { toasts, dismissToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} type="button" className="ws-toast text-start" onClick={() => dismissToast(t.id)}>
          <span className="ws-toast-dot" aria-hidden="true" />
          {t.message}
        </button>
      ))}
    </div>
  );
}
