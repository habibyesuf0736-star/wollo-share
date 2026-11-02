import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useApp } from "../store/AppContext.jsx";
import HomeCard from "./HomeCard.jsx";

function useReducedMotion() {
  const [reduce, setReduce] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return undefined;
    const onChange = (event) => setReduce(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduce;
}

/* The rotating advertisement strip. It advances on a timer, and stops the moment anyone is
   reading it, tabbing into it, or has asked their system for less motion — a banner that moves
   under a reader's cursor is a banner they cannot click. */
export function AdCarousel() {
  const { homeFeed, goNews } = useApp();
  const cards = homeFeed?.carousel || [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();
  const region = useRef(null);

  useEffect(() => setIndex(0), [cards.length]);

  useEffect(() => {
    if (paused || reduce || cards.length < 2) return undefined;
    const timer = setInterval(() => setIndex((value) => (value + 1) % cards.length), 6000);
    return () => clearInterval(timer);
  }, [paused, reduce, cards.length]);

  if (!cards.length) return null;

  return (
    <section
      ref={region}
      className="ws-carousel mt-4"
      aria-label="Advertisements"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="ws-carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {cards.map((card, position) => (
          <div className="ws-carousel-slide" key={card.id} aria-hidden={position !== index} inert={position !== index}>
            <HomeCard card={card} onOpen={goNews} />
          </div>
        ))}
      </div>
      {cards.length > 1 ? (
        <div className="ws-carousel-dots" role="tablist" aria-label="Choose an advertisement">
          {cards.map((card, position) => (
            <button
              key={card.id}
              type="button"
              role="tab"
              aria-current={position === index}
              aria-label={`Advertisement ${position + 1} of ${cards.length}`}
              onClick={() => setIndex(position)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* News and announcements on the home screen: pinned first, then whatever else is live, and the
   whole section disappears when an administrator has published nothing — never an empty frame. */
export function HomeNews({ limit = 6 }) {
  const { homeFeed, goNews } = useApp();
  const cards = useMemo(() => {
    const seen = new Set();
    return [...(homeFeed?.pinned || []), ...(homeFeed?.news || []), ...(homeFeed?.announcements || []), ...(homeFeed?.events || []), ...(homeFeed?.updates || [])].filter(
      (card) => (seen.has(card.id) ? false : seen.add(card.id))
    );
  }, [homeFeed]);

  if (!cards.length) return null;

  return (
    <section className="mt-4" aria-label="News and announcements">
      <div className="ws-section-head">
        <div>
          <h2>News and announcements</h2>
          <p className="small text-secondary mb-0 mt-1">
            University, college and department news, picked out for you.
          </p>
        </div>
        <button type="button" className="btn btn-sm btn-soft" onClick={() => goNews(null)}>
          View all news
          <ArrowRight size={14} className="ms-1 align-text-bottom" aria-hidden="true" />
        </button>
      </div>
      <div className="ws-feed-row">
        {cards.slice(0, limit).map((card) => (
          <HomeCard key={card.id} card={card} onOpen={goNews} />
        ))}
      </div>
    </section>
  );
}
