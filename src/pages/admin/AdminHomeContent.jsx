import React, { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Megaphone,
  Pin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload
} from "lucide-react";
import { useApp } from "../../store/AppContext.jsx";
import Modal from "../../components/Modal.jsx";
import ConfirmModal from "../../components/ConfirmModal.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { bannerDataUrl } from "../../lib/imagePick.js";
import {
  HOME_KINDS,
  HOME_PLACEMENTS,
  HOME_STATUSES,
  cardState,
  isAdCard,
  kindLabel,
  newHomeCard,
  placementLabel,
  statusLabel
} from "../../lib/homeFeed.js";

const STYLES = [
  ["card", "Card"],
  ["banner", "Wide banner"],
  ["poster", "Poster"]
];

const SCOPES = [
  ["all", "Everyone"],
  ["college", "One college"],
  ["department", "One department"],
  ["year", "One academic year"]
];

function toLocalInput(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fromLocalInput = (value) => (value ? new Date(value).toISOString() : "");

const stateTone = {
  published: "text-bg-success",
  scheduled: "text-bg-info",
  pending: "text-bg-warning",
  draft: "text-bg-secondary",
  expired: "text-bg-secondary",
  archived: "text-bg-dark"
};

export default function AdminHomeContent() {
  const { homeContent, coursesData, usersData, isAdmin, isStaff, saveHomeCard, deleteHomeCard, moveHomeCard, refreshContent, toast } = useApp();
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [pickOpen, setPickOpen] = useState(false);
  const fileInput = useRef(null);

  const colleges = useMemo(() => Array.from(new Set(coursesData.map((c) => c.college).filter(Boolean))).sort(), [coursesData]);
  const departments = useMemo(() => Array.from(new Set(usersData.map((u) => u.department).filter(Boolean))).sort(), [usersData]);
  const years = useMemo(() => Array.from(new Set(usersData.map((u) => u.academicYear).filter(Boolean))).sort(), [usersData]);

  const rows = useMemo(() => {
    const list = homeContent.slice().sort((a, b) => {
      if (Boolean(b.pinned) !== Boolean(a.pinned)) return b.pinned ? 1 : -1;
      return Number(a.order) - Number(b.order) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
    if (filter === "all") return list;
    if (filter === "ads") return list.filter(isAdCard);
    if (filter === "live") return list.filter((card) => cardState(card) === "published" && card.active !== false);
    return list.filter((card) => card.placement === filter || card.kind === filter || card.status === filter);
  }, [filter, homeContent]);

  const openCard = (seed = {}) => {
    setEditing(newHomeCard({ order: (homeContent.length + 1) * 10, ...seed }));
  };

  // An advertisement is only an ordinary card with the paid-for kind and a rotating slot,
  // so this button pre-fills exactly that and the administrator writes the rest.
  const openAd = () => {
    openCard({
      kind: "promo",
      placement: "carousel",
      status: "published",
      publishedAt: new Date().toISOString(),
      badge: "Advertisement",
      ctaLabel: "Learn more"
    });
  };

  const liveAds = useMemo(() => homeContent.filter((card) => isAdCard(card) && cardState(card) === "published" && card.active !== false), [homeContent]);

  const patch = (next) => setEditing((prev) => ({ ...prev, ...next }));

  const save = async (statusOverride) => {
    if (!editing) return;
    const card = { ...editing, ...(statusOverride ? { status: statusOverride } : {}) };
    if (!String(card.title || "").trim()) {
      toast("Add a title first.");
      return;
    }
    setBusy("save");
    const res = await saveHomeCard(card);
    setBusy("");
    if (res && res.ok !== false) {
      setEditing(null);
      toast(statusOverride === "published" ? "Published to the home screen." : "Saved.");
    }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setBusy(`del-${confirmDelete.id}`);
    const res = await deleteHomeCard(confirmDelete.id);
    setBusy("");
    if (res && res.ok !== false) {
      if (editing && editing.id === confirmDelete.id) setEditing(null);
      toast("Card deleted.");
    }
    setConfirmDelete(null);
  };

  const quickSave = async (card, patchValues, note) => {
    setBusy(`pub-${card.id}`);
    const res = await saveHomeCard({ ...card, ...patchValues });
    setBusy("");
    if (res && res.ok !== false && note) toast(note);
  };

  const move = async (card, direction) => {
    setBusy(`move-${card.id}`);
    await moveHomeCard(card.id, direction);
    setBusy("");
  };

  const toggle = async (card, key) => {
    setBusy(`toggle-${card.id}`);
    const res = await saveHomeCard({ ...card, [key]: !card[key] });
    setBusy("");
    if (res && res.ok === false && res.error) return;
    if (key === "active") toast(card.active ? "Hidden from students" : "Visible again");
  };

  const chooseImage = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file || !editing) return;
    setBusy("image");
    try {
      const dataUrl = await bannerDataUrl(file);
      patch({ imageUrl: dataUrl });
      toast("Picture added.");
    } catch (error) {
      toast(error.message || "That picture was not usable.");
    }
    setBusy("");
  };

  const audienceList =
    editing?.audience?.scope === "college"
      ? { options: colleges, key: "colleges" }
      : editing?.audience?.scope === "department"
        ? { options: departments, key: "departments" }
        : editing?.audience?.scope === "year"
          ? { options: years, key: "years" }
          : null;

  const toggleAudience = (label) => {
    if (!audienceList) return;
    const current = editing.audience[audienceList.key] || [];
    patch({
      audience: {
        ...editing.audience,
        [audienceList.key]: current.includes(label) ? current.filter((item) => item !== label) : [...current, label]
      }
    });
  };

  return (
    <div className="d-flex flex-column gap-3">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div>
          <span className="ws-section-kicker">Wollo Share · home screen</span>
          <h2 className="h4 mb-1">Home screen content</h2>
          <p className="small text-secondary mb-0">
            One set of cards for the website and the Android app. Drafts, expired cards and the view counters never reach a student.
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={refreshContent}>
            <RefreshCw size={14} className="me-1 align-text-bottom" aria-hidden="true" />
            Refresh
          </button>
          {isStaff ? (
            <button type="button" className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1" onClick={() => openCard()}>
              <Plus size={14} aria-hidden="true" />
              New card
            </button>
          ) : null}
        </div>
      </div>

      <div className="card p-3 d-flex flex-column gap-2 ws-ad-console">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <span className="ws-section-kicker">Advertisements</span>
            <h3 className="h6 mb-1 mt-1">Show an advert on the home page</h3>
            <p className="small text-secondary mb-0">
              {liveAds.length
                ? `${liveAds.length} ${liveAds.length === 1 ? "advertisement is" : "advertisements are"} running now — students see them in the rotating strip under the library.`
                : "Nothing is running now. Publish one and it appears in the rotating strip on the home page and in the app."}
            </p>
          </div>
          {isStaff ? (
            <button type="button" className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1" onClick={openAd}>
              <Megaphone size={14} aria-hidden="true" />
              New advertisement
            </button>
          ) : null}
        </div>
        {liveAds.length ? (
          <div className="ws-ad-console-row">
            {liveAds.map((card) => (
              <button key={card.id} type="button" className="ws-ad-console-chip" onClick={() => setEditing({ ...card })}>
                {card.imageUrl ? <img src={card.imageUrl} alt="" /> : <span className="ws-ad-console-mark" aria-hidden="true"><Megaphone size={12} /></span>}
                <span className="text-truncate">{card.title}</span>
                <span className="ws-ad-console-where">{placementLabel(card.placement)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <nav className="admin-nav" aria-label="Home content filters">
        {[["all", "All"], ["live", "Live now"], ["ads", "Advertisements"], ...HOME_PLACEMENTS, ...HOME_STATUSES.slice(0, 4)].map(([key, label]) => (
          <button key={key} type="button" className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="d-flex flex-column gap-2">
        {rows.map((card) => {
          const state = cardState(card);
          return (
            <div key={card.id} className="card p-3 d-flex flex-column gap-2">
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                <div className="d-flex gap-2 align-items-start" style={{ minWidth: 0 }}>
                  {card.imageUrl ? (
                    <img src={card.imageUrl} alt="" width={64} height={44} className="rounded-2 object-fit-cover flex-shrink-0" style={{ objectFit: "cover" }} />
                  ) : (
                    <span className="rounded-2 d-flex align-items-center justify-content-center flex-shrink-0" style={{ width: 64, height: 44, background: "var(--surface-subtle, #f1f4ee)" }} aria-hidden="true">
                      <Megaphone size={16} className="text-secondary" />
                    </span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="fw-semibold text-truncate">
                      {card.pinned ? <Pin size={13} className="me-1 align-text-bottom" aria-hidden="true" /> : null}
                      {card.title || "Untitled"}
                    </div>
                    <div className="small text-secondary">
                      {kindLabel(card.kind)} · {placementLabel(card.placement)} · {STYLES.find(([k]) => k === card.style)?.[1] || card.style}
                      {card.audience?.scope && card.audience.scope !== "all"
                        ? ` · ${(card.audience[collegeKey(card.audience.scope)] || []).join(", ") || card.audience.scope}`
                        : ""}
                      {card.premiumOnly ? " · Premium only" : ""}
                    </div>
                    {card.summary ? <div className="small text-truncate">{card.summary}</div> : null}
                  </div>
                </div>
                <div className="d-flex flex-column align-items-end gap-1">
                  <div className="d-flex gap-1">
                    <span className={`badge rounded-pill ${stateTone[state] || "text-bg-secondary"}`}>{statusLabel(state)}</span>
                    {card.active === false ? <span className="badge rounded-pill text-bg-danger">Off</span> : null}
                  </div>
                  <div className="small text-secondary mono">
                    {Number(card.impressions || 0)} views · {Number(card.clicks || 0)} clicks
                  </div>
                </div>
              </div>

              <div className="d-flex flex-wrap align-items-center gap-1">
                <div className="btn-group btn-group-sm" role="group" aria-label="Order">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => move(card, "up")} disabled={busy === `move-${card.id}`} aria-label="Move earlier">
                    <ArrowUp size={13} />
                  </button>
                  <button type="button" className="btn btn-outline-secondary" onClick={() => move(card, "down")} disabled={busy === `move-${card.id}`} aria-label="Move later">
                    <ArrowDown size={13} />
                  </button>
                </div>
                {isStaff ? (
                  <button type="button" className="btn btn-sm btn-soft" onClick={() => setEditing({ ...card })}>
                    Edit
                  </button>
                ) : null}
                {isStaff ? (
                  <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => toggle(card, "pinned")} disabled={busy === `toggle-${card.id}`}>
                    <Pin size={13} aria-hidden="true" />
                    {card.pinned ? "Unpin" : "Pin"}
                  </button>
                ) : null}
                {isStaff ? (
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => toggle(card, "active")} disabled={busy === `toggle-${card.id}`}>
                    {card.active === false ? "Enable" : "Disable"}
                  </button>
                ) : null}
                {isAdmin && card.status !== "published" ? (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => quickSave(card, { status: "published" }, "Published to the home screen.")} disabled={busy === `pub-${card.id}`}>
                    Publish
                  </button>
                ) : null}
                {isAdmin && card.status === "published" ? (
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => quickSave(card, { status: "draft" }, "Taken off the home screen.")} disabled={busy === `pub-${card.id}`}>
                    Unpublish
                  </button>
                ) : null}
                {isAdmin ? (
                  <button type="button" className="btn btn-sm btn-outline-danger ms-auto" onClick={() => setConfirmDelete(card)} disabled={busy === `del-${card.id}`}>
                    <Trash2 size={13} className="me-1 align-text-bottom" aria-hidden="true" />
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {!rows.length ? (
        <EmptyState
          icon={<Megaphone size={24} />}
          title="Nothing here yet"
          description="Create an announcement, a news card, an event or an advertisement and it appears on the home screen of the website and the app."
        />
      ) : null}

      <Modal
        open={Boolean(editing)}
        title={isAdCard(editing) ? (editing.title ? "Edit advertisement" : "New advertisement") : editing && homeContent.some((c) => c.id === editing.id) ? "Edit card" : "New card"}
        subtitle="Preview on the right is what a student sees."
        onClose={() => setEditing(null)}
        size="lg"
      >
        {editing ? (
          <div className="row g-3">
            <div className="col-12 col-lg-7">
              <div className="d-flex flex-column gap-3">
                <div className="row g-2">
                  <div className="col-12 col-md-6">
                    <Label text="Type">
                      <select className="form-select form-select-sm" value={editing.kind} onChange={(e) => patch({ kind: e.target.value })}>
                        {HOME_KINDS.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Label>
                  </div>
                  <div className="col-12 col-md-6">
                    <Label text="Where it shows">
                      <select className="form-select form-select-sm" value={editing.placement} onChange={(e) => patch({ placement: e.target.value })}>
                        {HOME_PLACEMENTS.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Label>
                  </div>
                  <div className="col-12 col-md-4">
                    <Label text="Look">
                      <select className="form-select form-select-sm" value={editing.style} onChange={(e) => patch({ style: e.target.value })}>
                        {STYLES.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Label>
                  </div>
                  <div className="col-12 col-md-8">
                    <Label text="Status">
                      <select
                        className="form-select form-select-sm"
                        value={editing.status}
                        disabled={!isAdmin && ["published", "scheduled"].includes(editing.status)}
                        onChange={(e) => patch({ status: e.target.value })}
                      >
                        {HOME_STATUSES.map(([key, label]) => (
                          <option key={key} value={key} disabled={!isAdmin && ["published", "scheduled"].includes(key)}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Label>
                  </div>
                </div>

                <Label text="Title">
                  <input className="form-control form-control-sm" maxLength={140} value={editing.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Registration opens Monday" />
                </Label>
                <Label text="Short description">
                  <textarea className="form-control form-control-sm" rows={2} maxLength={280} value={editing.summary} onChange={(e) => patch({ summary: e.target.value })} placeholder="One line a student reads before deciding to open it." />
                </Label>
                <Label text="Full article">
                  <textarea className="form-control form-control-sm" rows={5} maxLength={6000} value={editing.body} onChange={(e) => patch({ body: e.target.value })} placeholder="Tap the card to read this." />
                </Label>

                <div className="row g-2">
                  <div className="col-12 col-md-8">
                    <Label text="Destination link">
                      <input className="form-control form-control-sm" maxLength={400} value={editing.linkUrl} onChange={(e) => patch({ linkUrl: e.target.value })} placeholder="https://… or /premium" />
                    </Label>
                  </div>
                  <div className="col-6 col-md-4">
                    <Label text="Button label">
                      <input className="form-control form-control-sm" maxLength={40} value={editing.ctaLabel} onChange={(e) => patch({ ctaLabel: e.target.value })} placeholder="Read more" />
                    </Label>
                  </div>
                </div>

                <div className="row g-2">
                  <div className="col-12 col-md-6">
                    <Label text="Shows from">
                      <input type="datetime-local" className="form-control form-control-sm" value={toLocalInput(editing.publishedAt)} onChange={(e) => patch({ publishedAt: fromLocalInput(e.target.value) })} />
                    </Label>
                  </div>
                  <div className="col-12 col-md-6">
                    <Label text="Stops after">
                      <input type="datetime-local" className="form-control form-control-sm" value={toLocalInput(editing.expiresAt)} onChange={(e) => patch({ expiresAt: fromLocalInput(e.target.value) })} />
                    </Label>
                  </div>
                </div>

                <div className="d-flex flex-wrap gap-3">
                  <Check text="Pinned to the top" checked={Boolean(editing.pinned)} onChange={(v) => patch({ pinned: v })} />
                  <Check text="Turned on" checked={editing.active !== false} onChange={(v) => patch({ active: v })} />
                  <Check text="Premium accounts only" checked={Boolean(editing.premiumOnly)} onChange={(v) => patch({ premiumOnly: v })} />
                </div>

                <Label text="Who sees it">
                  <select className="form-select form-select-sm" value={editing.audience?.scope || "all"} onChange={(e) => patch({ audience: { ...editing.audience, scope: e.target.value } })}>
                    {SCOPES.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Label>
                {audienceList ? (
                  <div className="d-flex flex-wrap gap-1">
                    {mergeChoices(audienceList.options, editing.audience[audienceList.key]).map((label) => (
                      <button
                        key={label}
                        type="button"
                        className={`btn btn-sm ${((editing.audience[audienceList.key] || []).includes(label) && "btn-primary") || "btn-outline-secondary"}`}
                        onClick={() => toggleAudience(label)}
                      >
                        {label}
                      </button>
                    ))}
                    {!(editing.audience[audienceList.key] || []).length ? (
                      <span className="small text-secondary align-self-center">Nothing ticked, so every {editing.audience.scope} is included.</span>
                    ) : null}
                  </div>
                ) : null}

                <div className="d-flex flex-wrap align-items-center gap-2">
                  <button type="button" className="btn btn-sm btn-soft d-inline-flex align-items-center gap-1" onClick={() => setPickOpen(true)} disabled={!editing.imageUrl}>
                    <Eye size={14} aria-hidden="true" />
                    Preview as student
                  </button>
                  <span className="small text-secondary">{editing.imageUrl ? "Picture attached." : "No picture — the card still works as plain text."}</span>
                </div>
              </div>
            </div>

            <div className="col-12 col-lg-5">
              <div className="card p-3 d-flex flex-column gap-3">
                <div>
                  <div className="small fw-semibold mb-1">Banner or cover picture</div>
                  <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="d-none" onChange={chooseImage} />
                  {editing.imageUrl ? (
                    <>
                      <img src={editing.imageUrl} alt="" className="w-100 rounded-2 mb-2" style={{ objectFit: "cover", maxHeight: 180 }} />
                      <div className="d-flex gap-2">
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => fileInput.current?.click()} disabled={busy === "image"}>
                          <Upload size={13} className="me-1 align-text-bottom" aria-hidden="true" />
                          Replace
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => patch({ imageUrl: "" })}>
                          Remove
                        </button>
                      </div>
                    </>
                  ) : (
                    <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => fileInput.current?.click()} disabled={busy === "image"}>
                      <Upload size={14} aria-hidden="true" />
                      {busy === "image" ? "Preparing…" : "Upload picture"}
                    </button>
                  )}
                  <div className="small text-secondary mt-1">PNG, JPG or WebP. Resized in the browser before it is saved.</div>
                </div>

                <div>
                  <div className="small fw-semibold mb-2">Live preview</div>
                  <CardPreview card={editing} />
                </div>

                <div className="d-flex flex-wrap gap-2 mt-auto">
                  <button type="button" className="btn btn-sm btn-primary d-inline-flex align-items-center gap-1" onClick={() => save()} disabled={busy === "save"}>
                    <Save size={14} aria-hidden="true" />
                    {busy === "save" ? "Saving…" : "Save"}
                  </button>
                  {isAdmin ? (
                    <button type="button" className="btn btn-sm btn-success" onClick={() => save("published")} disabled={busy === "save"}>
                      Save and publish
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setEditing(null)}>
                    Close
                  </button>
                </div>
                {!isAdmin ? <div className="small text-secondary">Support team saves drafts; only an administrator can publish them.</div> : null}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={pickOpen} title="Student preview" subtitle="Exactly the strip the home screen draws for this card." onClose={() => setPickOpen(false)}>
        {editing ? <CardPreview card={editing} tall /> : null}
      </Modal>

      <ConfirmModal
        open={Boolean(confirmDelete)}
        title="Delete this card?"
        message={confirmDelete ? `"${confirmDelete.title || "Untitled"}" is removed from the website and the app.` : ""}
        confirmLabel="Delete"
        onConfirm={remove}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function collegeKey(scope) {
  return scope === "college" ? "colleges" : scope === "department" ? "departments" : "years";
}

const mergeChoices = (options, chosen) => Array.from(new Set([...(options || []), ...(chosen || [])]));

function Label({ text, children }) {
  return (
    <label className="d-flex flex-column gap-1 small fw-semibold">
      {text}
      {children}
    </label>
  );
}

function Check({ text, checked, onChange }) {
  return (
    <div className="form-check form-switch d-flex align-items-center gap-2 mb-0">
      <input className="form-check-input m-0" type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="small fw-semibold">{text}</span>
    </div>
  );
}

function CardPreview({ card, tall }) {
  const wide = card.style === "banner" || tall;
  return (
    <article className={`ws-home-preview ${wide ? "ws-home-preview-wide" : ""}`} aria-label="Card preview">
      {card.imageUrl ? <img src={card.imageUrl} alt="" className="ws-home-preview-img" /> : null}
      <div className="ws-home-preview-body">
        <div className="d-flex flex-wrap gap-1 align-items-center">
          {isAdCard(card) ? <span className="ws-ad-flag">Advertisement</span> : null}
          {card.badge ? <span className="badge rounded-pill text-bg-light">{card.badge}</span> : null}
          {card.premiumOnly ? <span className="badge rounded-pill text-bg-warning">Premium</span> : null}
        </div>
        <h4 className="h6 mb-1">{card.title || "Your title appears here"}</h4>
        <p className="small text-secondary mb-2">{card.summary || "A one-line description under the title."}</p>
        {card.ctaLabel || card.linkUrl ? <span className="btn btn-sm btn-primary">{card.ctaLabel || "Open"}</span> : null}
      </div>
    </article>
  );
}
