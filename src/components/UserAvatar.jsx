import React, { useState } from "react";

function initialsOf(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "WS";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

export default function UserAvatar({ photo, name, size, alt }) {
  // Tracking the photo in the same state as the load failure means a fresh upload
  // clears the failure during that render — an effect could land after onError and
  // re-arm a permanently broken image.
  const [tracked, setTracked] = useState({ photo, broken: false });
  if (tracked.photo !== photo) setTracked({ photo, broken: false });

  const px = size ? { width: size, height: size } : {};

  if (photo && !tracked.broken) {
    return (
      <span className="ws-user-avatar has-photo" style={px}>
        <img
          src={photo}
          alt={alt || `${name || "Your"} profile photo`}
          onError={() => setTracked({ photo, broken: true })}
        />
      </span>
    );
  }

  return (
    <span
      className="ws-user-avatar"
      style={{ ...px, fontSize: size ? `${Math.round(size * 0.36)}px` : undefined }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}
