// The home screen reads the same cards on the website and on the phone, and the rules for
// which of them a given reader sees live here so both surfaces agree with the server.

export const HOME_KINDS = [
  ["announcement", "Important announcement"],
  ["news", "News"],
  ["event", "Upcoming event"],
  ["update", "Wollo Share update"],
  ["promo", "Promotional advertisement"],
  ["premium", "Premium subscription promotion"]
];

export const HOME_PLACEMENTS = [
  ["hero", "Top of home"],
  ["carousel", "Rotating banner"],
  ["feed", "Home feed"],
  ["library", "Website library"],
  ["premium", "Premium page"]
];

export const HOME_STATUSES = [
  ["draft", "Draft"],
  ["pending", "Pending approval"],
  ["published", "Published"],
  ["scheduled", "Scheduled"],
  ["expired", "Expired"],
  ["archived", "Archived"]
];

// Advertisements are the paid-for kind, so they carry the "Advertisement" label and never
// dress up as a university announcement.
export function isAdCard(card) {
  return card?.kind === "promo" || card?.kind === "premium";
}

export function newHomeCard(seed = {}) {
  return {
    id: `hc-${Date.now().toString(36)}-${Math.floor(Math.random() * 9000 + 1000)}`,
    kind: "announcement",
    placement: "feed",
    status: "draft",
    title: "",
    summary: "",
    body: "",
    imageUrl: "",
    linkUrl: "",
    ctaLabel: "",
    badge: "",
    author: "",
    style: "card",
    pinned: false,
    active: true,
    premiumOnly: false,
    order: 0,
    audience: { scope: "all", colleges: [], departments: [], years: [] },
    publishedAt: "",
    expiresAt: "",
    impressions: 0,
    clicks: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...seed
  };
}

// What the clock says about a stored status, exactly as the server computes it.
export function cardState(card, now = Date.now()) {
  if (!card) return "draft";
  if (card.status === "archived" || card.status === "draft" || card.status === "pending") return card.status;
  const from = Date.parse(String(card.publishedAt || ""));
  if (card.publishedAt && Number.isFinite(from) && from > now) return "scheduled";
  const until = Date.parse(String(card.expiresAt || ""));
  if (card.expiresAt && Number.isFinite(until) && until <= now) return "expired";
  return "published";
}

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export function cardForReader(card, account, premium) {
  if (card.premiumOnly && !premium) return false;
  const audience = card.audience || { scope: "all" };
  if (!audience.scope || audience.scope === "all") return true;
  if (!account) return false;
  if (audience.scope === "college")
    return !audience.colleges?.length || audience.colleges.some((label) => same(label, account.college));
  if (audience.scope === "department")
    return !audience.departments?.length || audience.departments.some((label) => same(label, account.department));
  return !audience.years?.length || audience.years.some((label) => same(label, account.academicYear));
}

export function isLive(card, reader = {}, now = Date.now()) {
  return cardState(card, now) === "published" && card.active !== false && cardForReader(card, reader.account, reader.premium);
}

function byOrder(a, b) {
  return (
    Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
    Number(a.order) - Number(b.order) ||
    String(b.publishedAt || b.updatedAt || "").localeCompare(String(a.publishedAt || a.updatedAt || ""))
  );
}

// The screen asks for strips, not for a list it has to sort out itself. A strip with no
// cards is left empty and its section is skipped, so nothing on the home screen is a hole.
export function feedCards(cards, reader = {}, now = Date.now()) {
  const live = (Array.isArray(cards) ? cards : []).filter((card) => isLive(card, reader, now));
  const ads = live.filter(isAdCard);
  const editorial = live.filter((card) => !isAdCard(card));
  return {
    hero: live.filter((card) => card.placement === "hero" && !isAdCard(card)),
    carousel: ads.filter((card) => card.placement === "carousel" || card.placement === "hero"),
    pinned: editorial.filter((card) => card.pinned),
    announcements: editorial.filter((card) => card.kind === "announcement" && !card.pinned),
    news: editorial.filter((card) => card.kind === "news"),
    events: editorial.filter((card) => card.kind === "event"),
    updates: editorial.filter((card) => card.kind === "update"),
    library: live.filter((card) => card.placement === "library"),
    premium: live.filter((card) => card.placement === "premium"),
    feed: editorial.filter((card) => card.placement === "feed" || card.placement === "library"),
    ads,
    all: live.slice().sort(byOrder),
    byId: new Map(live.map((card) => [card.id, card]))
  };
}

/* A card's address is its title, so a shared link reads as /news/exam-timetable-2026. A title
   with no latin characters in it — Amharic, for instance — falls back to the card id. */
export function cardSlug(card) {
  const words = String(card?.title || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .replace(/-+$/, "");
  return words || String(card?.id || "").replace(/[^A-Za-z0-9_-]/g, "");
}

export function findCardBySlug(cards, slug) {
  if (!slug) return null;
  const list = Array.isArray(cards) ? cards : [];
  return list.find((card) => card.id === slug) || list.find((card) => cardSlug(card) === slug) || null;
}

export function statusLabel(status) {
  return (HOME_STATUSES.find(([key]) => key === status) || [, status])[1];
}

export function kindLabel(kind) {
  return (HOME_KINDS.find(([key]) => key === kind) || [, kind])[1];
}

export function placementLabel(placement) {
  return (HOME_PLACEMENTS.find(([key]) => key === placement) || [, placement])[1];
}
