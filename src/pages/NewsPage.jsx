import React, { useMemo, useState } from "react";
import { ArrowLeft, Search, Share2, Link2, CalendarDays, User } from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import { cardSlug, findCardBySlug, isAdCard, kindLabel } from "../lib/homeFeed.js";
import { safeAdLink } from "../components/AdSlot.jsx";
import HomeCard, { cardDate } from "../components/HomeCard.jsx";
import EmptyState from "../components/EmptyState.jsx";

const CATEGORIES = [
  ["", "Everything"],
  ["announcement", "Announcements"],
  ["news", "News"],
  ["event", "Events"],
  ["update", "Wollo Share"]
];

export default function NewsPage() {
  const { homeFeed, view } = useApp();
  const editorial = useMemo(() => (homeFeed?.all || []).filter((card) => !isAdCard(card)), [homeFeed]);
  const article = view.slug ? findCardBySlug(editorial, view.slug) : null;

  if (view.slug) return article ? <Article card={article} all={editorial} /> : <Gone />;
  return <Index cards={editorial} />;
}

function Index({ cards }) {
  const { goNews } = useApp();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (kind && card.kind !== kind) return false;
      if (!needle) return true;
      return `${card.title} ${card.summary} ${card.body} ${card.badge}`.toLowerCase().includes(needle);
    });
  }, [cards, query, kind]);

  const featured = results.find((card) => card.pinned) || results[0];
  const rest = results.filter((card) => card !== featured);
  // A category with nothing live in it is not offered as a filter, so no chip leads to a hole.
  const available = CATEGORIES.filter(([key]) => !key || cards.some((card) => card.kind === key));

  return (
    <div className="ws-page">
      <div className="ws-section-head" style={{ marginTop: 0, borderTop: 0 }}>
        <div>
          <span className="ws-section-kicker">Wollo Share · newsroom</span>
          <h1 className="h3 mb-1 mt-1">News and announcements</h1>
          <p className="small text-secondary mb-0">
            University, college and department announcements, academic events and updates to Wollo Share.
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <span className="ws-search" style={{ minWidth: 220 }}>
            <span className="ws-search-icon" aria-hidden="true">
              <Search size={15} />
            </span>
            <input
              className="form-control form-control-sm"
              placeholder="Search news"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search news"
            />
          </span>
          <select className="form-select form-select-sm" style={{ width: "auto" }} value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Filter by category">
            {available.map(([key, label]) => (
              <option key={key || "all"} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {featured ? (
        <div className="mb-3">
          <HomeCard card={featured} onOpen={goNews} />
        </div>
      ) : null}

      {rest.length ? (
        <div className="ws-feed-row">
          {rest.map((card) => (
            <HomeCard key={card.id} card={card} onOpen={goNews} />
          ))}
        </div>
      ) : null}

      {!cards.length ? (
        <EmptyState
          title="Nothing published yet"
          description="When the Wollo Share team publishes an announcement it appears here and on the home screen."
        />
      ) : null}

      {cards.length && !results.length ? (
        <EmptyState title="No article matches" description="Try a different word, or clear the category filter." />
      ) : null}
    </div>
  );
}

function Article({ card, all }) {
  const { goNews, toast } = useApp();
  const link = safeAdLink(card.linkUrl);
  const related = all.filter((item) => item.id !== card.id && item.kind === card.kind).slice(0, 3);
  const paragraphs = String(card.body || "").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  const share = async () => {
    const url = `${window.location.origin}/news/${cardSlug(card)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: card.title, text: card.summary, url });
        return;
      } catch {
        /* the reader closed the sheet — copying is the fallback, not an error */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast(url);
    }
  };

  return (
    <div className="ws-page">
      <button type="button" className="btn btn-sm btn-soft mb-3" onClick={() => goNews(null)}>
        <ArrowLeft size={14} className="me-1 align-text-bottom" aria-hidden="true" /> All news
      </button>

      <article className="ws-article card p-3 p-md-4">
        {card.imageUrl ? <img src={card.imageUrl} alt="" /> : null}
        <div className="ws-feed-tags">
          <span className="badge rounded-pill text-bg-light">{kindLabel(card.kind)}</span>
          {card.badge && !/^advertisement$/i.test(card.badge) ? <span className="badge rounded-pill text-bg-light">{card.badge}</span> : null}
        </div>
        <h1 className="h4 mb-0">{card.title || "Untitled"}</h1>
        <div className="d-flex flex-wrap gap-3 small text-secondary">
          {cardDate(card) ? (
            <span>
              <CalendarDays size={13} className="me-1 align-text-bottom" aria-hidden="true" />
              {cardDate(card)}
            </span>
          ) : null}
          {card.author ? (
            <span>
              <User size={13} className="me-1 align-text-bottom" aria-hidden="true" />
              {card.author}
            </span>
          ) : null}
        </div>
        {card.summary ? <p className="lead small mb-0">{card.summary}</p> : null}
        {paragraphs.length ? paragraphs.map((part, index) => <p key={index}>{part}</p>) : null}
        {!paragraphs.length && !card.summary ? <p className="text-secondary">There is nothing more to this item than the line on the card.</p> : null}
        {link ? (
          <a className="btn btn-sm btn-primary align-self-start" href={link} target="_blank" rel="noreferrer noopener">
            <Link2 size={14} className="me-1 align-text-bottom" aria-hidden="true" />
            {card.ctaLabel || "Open the linked page"}
          </a>
        ) : null}
        <div className="d-flex gap-2 mt-1">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={share}>
            <Share2 size={14} className="me-1 align-text-bottom" aria-hidden="true" /> Share
          </button>
        </div>
      </article>

      {related.length ? (
        <section className="mt-4" aria-label="Related articles">
          <div className="ws-section-head">
            <div>
              <h2 className="h6 mb-0">Related</h2>
            </div>
          </div>
          <div className="ws-feed-row">
            {related.map((item) => (
              <HomeCard key={item.id} card={item} onOpen={goNews} compact />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Gone() {
  const { goNews } = useApp();
  return (
    <div className="ws-page">
      <EmptyState title="That item is no longer published" description="It may have been archived by the team, or the address may be mistyped." />
      <button type="button" className="btn btn-sm btn-soft mt-2" onClick={() => goNews(null)}>
        <ArrowLeft size={14} className="me-1 align-text-bottom" aria-hidden="true" /> Back to all news
      </button>
    </div>
  );
}
