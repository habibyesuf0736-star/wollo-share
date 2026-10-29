import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { rankOptions } from "../lib/suggest.js";

const PANEL_MAX_HEIGHT = 264;
const PANEL_MIN_WIDTH = 260;

// A select you can type into: the typed text filters the list and near misses are
// suggested, but a value only changes by picking a row (or typing one exactly), so
// the field can never hold a department the catalog does not know.
export default function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select an option",
  className = "form-control",
  emptyLabel = "Nothing matches that spelling.",
  ariaLabel
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState(null);
  const inputRef = useRef(null);
  const listId = useId();
  const optionId = (index) => `${listId}-option-${index}`;

  const visible = useMemo(() => (open ? rankOptions(options, query) : options), [open, options, query]);

  const measure = () => {
    const field = inputRef.current;
    if (!field) return null;
    const rect = field.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return null;
    const gap = 6;
    const margin = 12;
    const below = window.innerHeight - rect.bottom - margin;
    const above = rect.top - margin;
    const openUp = below < 220 && above > below;
    const width = Math.min(Math.max(rect.width, PANEL_MIN_WIDTH), window.innerWidth - margin * 2);
    const left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
    const maxHeight = Math.max(160, Math.min(PANEL_MAX_HEIGHT, openUp ? above : below));
    return openUp
      ? { left, width, bottom: window.innerHeight - rect.top + gap, maxHeight }
      : { left, width, top: rect.bottom + gap, maxHeight };
  };

  // The panel is drawn in a portal so a card or modal with overflow hidden cannot
  // clip it; that means it has to follow the field while the page scrolls.
  useEffect(() => {
    if (!open) {
      setAnchor(null);
      return undefined;
    }
    const follow = () => {
      const next = measure();
      if (next) setAnchor(next);
      else setOpen(false);
    };
    follow();
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const current = visible.findIndex((option) => option.value === value);
    setActive(current >= 0 ? current : 0);
  }, [open, query, value, visible]);

  const openPanel = () => {
    if (open) return;
    setQuery("");
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const choose = (option) => {
    onChange(option.value);
    close();
  };

  const commitTyped = () => {
    const typed = query.trim().toLowerCase();
    if (!typed) {
      close();
      return;
    }
    const match = options.find(
      (option) => option.label.toLowerCase() === typed || String(option.value).toLowerCase() === typed
    );
    if (match) choose(match);
    else close();
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openPanel();
      else setActive((index) => Math.min(index + 1, visible.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (open) setActive((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && open) {
      // Enter picks the highlighted row instead of submitting the form behind it.
      event.preventDefault();
      const picked = visible[active];
      if (picked) choose(picked);
      else close();
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div className="ws-searchselect">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && visible[active] ? optionId(active) : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        className={className}
        placeholder={open && value ? value : placeholder}
        value={open ? query : value || ""}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={openPanel}
        onClick={openPanel}
        onKeyDown={handleKeyDown}
        onBlur={commitTyped}
      />
      <ChevronDown className="ws-searchselect-caret" size={15} aria-hidden="true" />
      {open && anchor
        ? createPortal(
            <div
              id={listId}
              role="listbox"
              aria-label={ariaLabel ? `${ariaLabel} suggestions` : "Suggestions"}
              className="ws-searchselect-panel"
              style={anchor}
            >
              {visible.length ? null : <div className="ws-searchselect-empty">{emptyLabel}</div>}
              {visible.map((option, index) => {
                const previousGroup = index > 0 ? visible[index - 1].group : null;
                const showGroup = !query && option.group && option.group !== previousGroup;
                return (
                  <React.Fragment key={option.value}>
                    {showGroup ? <div className="ws-searchselect-group">{option.group}</div> : null}
                    <div
                      id={optionId(index)}
                      role="option"
                      aria-selected={option.value === value}
                      className={`ws-searchselect-option${index === active ? " is-active" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => choose(option)}
                    >
                      <span className="ws-searchselect-label">{option.label}</span>
                      {query ? <span className="ws-searchselect-meta">{option.group}</span> : null}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
