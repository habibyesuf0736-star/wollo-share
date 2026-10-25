import React from "react";
import { SearchX } from "lucide-react";

export default function EmptyState({ title, description, action, icon }) {
  return (
    <div className="ws-empty">
      <span className="ws-empty-icon" aria-hidden="true">
        {icon || <SearchX size={24} />}
      </span>
      <h3 className="h6">{title}</h3>
      {description ? <p className="text-secondary small">{description}</p> : null}
      {action}
    </div>
  );
}
