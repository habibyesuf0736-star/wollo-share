import React from "react";
import { Megaphone, X } from "lucide-react";
import { useApp } from "../store/AppContext.jsx";

export default function AnnouncementBanner() {
  const { banner, bannerDismissed, dismissBanner, isAdmin } = useApp();
  if (!banner.enabled || !banner.text) return null;
  if (bannerDismissed && !isAdmin) return null;

  return (
    <div className={`banner ${banner.theme || "info"} mb-3`} role="status">
      <span>
        <Megaphone size={16} aria-hidden="true" /> {banner.text}
      </span>
      {isAdmin ? (
        <span className="mono" style={{ fontSize: 10 }}>admin preview</span>
      ) : (
        <button type="button" className="ws-modal-close" onClick={dismissBanner} aria-label="Dismiss announcement">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
