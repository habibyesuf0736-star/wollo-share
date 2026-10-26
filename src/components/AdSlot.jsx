import React from "react";
import { useApp } from "../store/AppContext.jsx";

export const AD_STYLES = [
  { key: "banner", label: "Banner", hint: "Image beside the text" },
  { key: "card", label: "Card", hint: "Image on top, centred" },
  { key: "poster", label: "Poster", hint: "Full image with overlay" },
  { key: "ticker", label: "Ticker", hint: "Slim scrolling strip" }
];

export function safeAdLink(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim()) ? url.trim() : "";
}

function adVars(ad) {
  const style = {};
  if (ad.color) style["--ad-a"] = ad.color;
  if (ad.inkColor) style["--ad-ink"] = ad.inkColor;
  style["--ad-fit"] = ad.imageFit === "contain" ? "contain" : "cover";
  return style;
}

export function AdCard({ ad, onClose, preview, onAction }) {
  const link = safeAdLink(ad.linkUrl);
  const style = ad.style && AD_STYLES.some((s) => s.key === ad.style) ? ad.style : "banner";
  const title = ad.title || "Announcement";

  return (
    <article
      className={`ad-card is-${style}${preview ? " is-preview" : ""}${link ? " is-linked" : ""}`}
      style={adVars(ad)}
      role="complementary"
      aria-label="Announcement"
    >
      <span className="ad-media" aria-hidden="true">
        {ad.imageUrl ? <img src={ad.imageUrl} alt="" /> : <span className="ad-media-empty">Wollo Share</span>}
      </span>

      <div className="ad-body">
        <span className="ad-kicker">
          <span className="ad-dot" aria-hidden="true" />
          {ad.badge || "Advertisement"}
        </span>
        <strong className="ad-title">{title}</strong>
        {ad.text ? <p className="ad-text">{ad.text}</p> : null}
        {link ? (
          <a className="ad-cta" href={link} target="_blank" rel="noopener nofollow">
            {ad.ctaLabel || "Learn more"}
            <ArrowGlyph />
          </a>
        ) : onAction ? (
          <button type="button" className="ad-cta is-button" onClick={onAction}>
            {ad.ctaLabel || "Learn more"}
            <ArrowGlyph />
          </button>
        ) : ad.ctaLabel ? (
          <span className="ad-cta is-static">{ad.ctaLabel}</span>
        ) : null}
      </div>

      {onClose ? (
        <button type="button" className="ad-close" title="Hide for this session" onClick={onClose}>
          ✕
        </button>
      ) : null}
    </article>
  );
}

function ArrowGlyph() {
  return <span className="ad-cta-arrow" aria-hidden="true">→</span>;
}

export default function AdSlot({ placement }) {
  const { ads, isAdmin, dismissedAds, dismissAd } = useApp();
  const visible = ads.filter((ad) => ad.active && ad.placement === placement);
  const shown = isAdmin ? visible : visible.filter((ad) => !dismissedAds.includes(ad.id));
  if (!shown.length) return null;

  return (
    <div className="d-flex flex-column gap-2 my-3">
      {shown.map((ad) => (
        <AdCard key={ad.id} ad={ad} onClose={isAdmin ? null : () => dismissAd(ad.id)} />
      ))}
    </div>
  );
}
