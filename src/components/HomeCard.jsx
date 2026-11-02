import React, { useEffect, useRef } from "react";
import { safeAdLink } from "./AdSlot.jsx";
import { isAdCard, kindLabel } from "../lib/homeFeed.js";
import * as api from "../lib/api.js";

// One view per card per page load. The server rate-limits too, but a long scroll should not
// fire a request for every card that crosses the fold a second time.
const counted = new Set();

export function cardDate(card) {
  const at = Date.parse(String(card?.publishedAt || card?.createdAt || ""));
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function HomeCard({ card, onOpen, compact }) {
  const ref = useRef(null);
  const link = safeAdLink(card.linkUrl);
  const ad = isAdCard(card);
  // An ad with a destination goes to that destination; anything else opens the article,
  // even when the writer also pasted a link, because the body is the point.
  const opensArticle = Boolean(card.body) || !link;

  useEffect(() => {
    const node = ref.current;
    if (!node || !card.id || counted.has(card.id) || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        counted.add(card.id);
        api.trackHomeCard(card.id, "impression");
        observer.disconnect();
      },
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [card.id]);

  const media = card.imageUrl ? (
    <img className="ws-feed-media" src={card.imageUrl} alt="" loading="lazy" decoding="async" />
  ) : null;

  return (
    <article
      ref={ref}
      className={`ws-feed-card is-${card.style || "card"}${ad && !card.imageUrl ? " is-ad" : ""}${compact ? " is-compact" : ""}`}
      onClick={opensArticle ? () => onOpen(card) : undefined}
      onKeyDown={
        opensArticle
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(card);
              }
            }
          : undefined
      }
      tabIndex={opensArticle ? 0 : undefined}
      role={opensArticle ? "button" : undefined}
    >
      {media}
      <div className="ws-feed-body">
        <div className="ws-feed-tags">
          {ad ? <span className="ws-ad-flag">Advertisement</span> : <span className="badge rounded-pill text-bg-light">{kindLabel(card.kind)}</span>}
          {card.badge && !/^advertisement$/i.test(card.badge) ? <span className="badge rounded-pill text-bg-light">{card.badge}</span> : null}
          {card.premiumOnly ? <span className="badge rounded-pill text-bg-warning">Premium</span> : null}
          {cardDate(card) ? <span className="small text-secondary">{cardDate(card)}</span> : null}
        </div>
        <h4>{card.title || "Untitled"}</h4>
        {card.summary ? <p>{card.summary}</p> : null}
        <div className="d-flex flex-wrap gap-2 align-items-center mt-1">
          {opensArticle ? <span className="btn btn-sm btn-soft">Read more</span> : null}
          {link ? (
            <a
              className={`btn btn-sm ${opensArticle ? "btn-outline-secondary" : "btn-primary"}`}
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(event) => {
                event.stopPropagation();
                api.trackHomeCard(card.id, "click");
              }}
            >
              {card.ctaLabel || "Open"}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
