import React from "react";

export default function Highlight({ text = "", query = "" }) {
  const needle = String(query).trim();
  if (!needle) return <>{text}</>;
  const lower = String(text).toLowerCase();
  const target = needle.toLowerCase();
  const parts = [];
  let cursor = 0;
  let index = lower.indexOf(target, cursor);
  let key = 0;
  while (index !== -1) {
    if (index > cursor) parts.push(<span key={`p${key++}`}>{text.slice(cursor, index)}</span>);
    parts.push(
      <mark key={`m${key++}`} className="bg-warning bg-opacity-25 text-reset px-1 rounded">
        {text.slice(index, index + needle.length)}
      </mark>
    );
    cursor = index + needle.length;
    index = lower.indexOf(target, cursor);
  }
  if (cursor < text.length) parts.push(<span key={`p${key++}`}>{text.slice(cursor)}</span>);
  return <>{parts}</>;
}
