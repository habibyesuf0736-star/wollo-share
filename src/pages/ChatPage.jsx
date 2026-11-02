import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  Flag,
  Image as ImageIcon,
  LogIn,
  MessageSquare,
  Pin,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  Undo2,
  WifiOff,
  X
} from "lucide-react";
import * as api from "../lib/api.js";
import { bannerDataUrl } from "../lib/imagePick.js";
import { useApp } from "../store/AppContext.jsx";
import EmptyState from "../components/EmptyState.jsx";
import UserAvatar from "../components/UserAvatar.jsx";

// A room with no queue is a room that loses what a student typed when the signal drops,
// which on a campus network is the same as a broken feature.
const QUEUE_KEY = "wollo_chat_queue_v1";
const BODY_LIMIT = 1200;

const REPORT_REASONS = ["Spam or advertising", "Insulting or abusive", "Wrong faculty or material", "Personal information shared", "Something else"];

function readQueue() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-20)));
  } catch {
    // A private-mode browser simply forgets the queue; the message stays on screen.
  }
}

function clockOf(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function dayOf(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function sameDay(a, b) {
  return dayOf(a) === dayOf(b);
}

function ChatSignIn() {
  const { goLogin, goLibrary } = useApp();
  return (
    <div className="ws-page">
      <div className="card p-4 text-center mx-auto" style={{ maxWidth: 560 }}>
        <MessageSquare size={28} className="mb-2 text-secondary" aria-hidden="true" />
        <h1 className="h5">The chatroom is for Wollo Share students</h1>
        <p className="small text-secondary">
          One university-wide room, so a question about a course reaches the people who took it. Sign in to read and post.
        </p>
        <div className="d-flex justify-content-center gap-2">
          <button type="button" className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2" onClick={() => goLogin("signin")}>
            <LogIn size={15} aria-hidden="true" />
            Sign in
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={goLibrary}>
            Back to library
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message, mine, staff, replyTarget, onReply, onReport, onDelete, onPin }) {
  const [reason, setReason] = useState("");
  const [reporting, setReporting] = useState(false);

  if (message.deleted) {
    return (
      <li className="ws-chat-row is-deleted">
        <p className="small text-secondary mb-0 fst-italic">
          This message was removed{message.reply_to_name ? ` in a thread with ${message.reply_to_name}` : ""}.
        </p>
      </li>
    );
  }

  return (
    <li className={`ws-chat-row${mine ? " is-mine" : ""}${message.pinned ? " is-pinned" : ""}`}>
      <UserAvatar photo={mine ? undefined : undefined} name={message.author_name} size={34} alt="" />
      <div className="ws-chat-bubble">
        <div className="ws-chat-meta">
          <strong className="ws-chat-name">{mine ? "You" : message.author_name}</strong>
          <span className="ws-chat-time" title={dayOf(message.created_at)}>
            {clockOf(message.created_at)}
          </span>
          {message.pinned ? (
            <span className="badge rounded-pill text-bg-primary ws-chat-pin-flag">
              <Pin size={10} className="me-1 align-text-bottom" aria-hidden="true" />
              pinned
            </span>
          ) : null}
        </div>

        {message.reply_to_name ? (
          <div className="ws-chat-reply-line small text-secondary">
            replying to {message.reply_to_name}
          </div>
        ) : null}

        {message.body ? <p className="ws-chat-text mb-0">{message.body}</p> : null}

        {message.image ? (
          <a className="ws-chat-image-link" href={message.image} target="_blank" rel="noreferrer noopener">
            <img className="ws-chat-image" src={message.image} alt={`Picture from ${message.author_name}`} loading="lazy" decoding="async" />
          </a>
        ) : null}

        <div className="ws-chat-tools">
          <button type="button" className="btn btn-sm border-0 bg-transparent ws-chat-tool" onClick={() => onReply(message)}>
            Reply
          </button>
          {mine ? (
            <button type="button" className="btn btn-sm border-0 bg-transparent ws-chat-tool" onClick={() => onDelete(message)}>
              <Trash2 size={12} className="me-1 align-text-bottom" aria-hidden="true" />
              Delete
            </button>
          ) : null}
          {staff ? (
            <>
              <button type="button" className="btn btn-sm border-0 bg-transparent ws-chat-tool" onClick={() => onPin(message, !message.pinned)}>
                <Pin size={12} className="me-1 align-text-bottom" aria-hidden="true" />
                {message.pinned ? "Unpin" : "Pin"}
              </button>
              {!mine ? (
                <button type="button" className="btn btn-sm border-0 bg-transparent ws-chat-tool" onClick={() => onDelete(message)}>
                  <ShieldAlert size={12} className="me-1 align-text-bottom" aria-hidden="true" />
                  Remove
                </button>
              ) : null}
            </>
          ) : null}
          {!mine ? (
            <button
              type="button"
              className="btn btn-sm border-0 bg-transparent ws-chat-tool"
              aria-expanded={reporting}
              onClick={() => {
                setReporting((open) => !open);
                setReason(REPORT_REASONS[0]);
              }}
            >
              <Flag size={12} className="me-1 align-text-bottom" aria-hidden="true" />
              Report
            </button>
          ) : null}
        </div>

        {reporting ? (
          <div className="ws-chat-report">
            <label className="form-label small fw-semibold mb-1" htmlFor={`rep-${message.id}`}>
              What is wrong with it?
            </label>
            <div className="d-flex gap-2 flex-wrap">
              <select
                id={`rep-${message.id}`}
                className="form-select form-select-sm flex-grow-1"
                style={{ minWidth: 180 }}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {REPORT_REASONS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-sm btn-coral"
                onClick={() => {
                  setReporting(false);
                  onReport(message, reason);
                }}
              >
                Send report
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setReporting(false)}>
                <X size={13} className="me-1 align-text-bottom" aria-hidden="true" />
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {replyTarget === message.id ? <span className="small text-secondary">Selected for reply — write below.</span> : null}
      </div>
    </li>
  );
}

export default function ChatPage() {
  const { session, activeUser, isStaff, studentPreview, toast, goLibrary, chatRules } = useApp();
  const staff = isStaff && !studentPreview;

  const [messages, setMessages] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [restricted, setRestricted] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(typeof navigator !== "undefined" ? navigator.onLine === false : false);

  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(() => readQueue());

  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);

  const listRef = useRef(null);
  const fileRef = useRef(null);
  const stickToBottom = useRef(true);
  const cursor = useRef({ since: "", rev: 0 });
  const alive = useRef(true);

  const mute = restricted.find((a) => a.kind === "mute") || null;
  const blocked = restricted.some((a) => a.kind === "ban" || a.kind === "suspend");

  const mergeMessages = useCallback((incoming) => {
    if (!incoming || !incoming.length) return;
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      incoming.forEach((m) => byId.set(m.id, m));
      return Array.from(byId.values()).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    });
  }, []);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError("");
    const res = await api.readChat(session.authToken);
    setLoading(false);
    if (!res || res.ok === false) {
      setError((res && res.error) || "The chatroom could not be reached.");
      return;
    }
    const rows = Array.isArray(res.messages) ? res.messages : [];
    setMessages(rows);
    setPinned(Array.isArray(res.pinned) ? res.pinned : []);
    setStats(res.stats || null);
    setRestricted(Array.isArray(res.restricted) ? res.restricted : []);
    setHasMore(Boolean(res.hasMore));
    const last = rows[rows.length - 1];
    cursor.current = { since: last ? last.created_at : "", rev: cursor.current.rev };
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  // Jump to the newest line on arrival, then only follow new traffic when the student was
  // already at the bottom — reading history should not be yanked away mid-scroll.
  useEffect(() => {
    if (loading || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [loading]);

  useEffect(() => {
    if (loading || !stickToBottom.current || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return undefined;
    const onScroll = () => {
      stickToBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  // One held request per open room. A missed beat simply re-requests; the queue and the
  // server are the source of truth, so a dropped poll can only delay a line, not lose it.
  useEffect(() => {
    if (!session || loading || offline) return undefined;
    alive.current = true;

    (async () => {
      while (alive.current && session) {
        const res = await api.watchChat(session.authToken, { since: cursor.current.since, rev: cursor.current.rev });
        if (!alive.current) break;
        if (!res || res.ok === false) {
          if (res && res.offline) {
            setOffline(true);
            break;
          }
          await new Promise((wait) => setTimeout(wait, 5000));
          continue;
        }
        cursor.current.rev = Number(res.rev) || cursor.current.rev;
        if (res.changed) {
          if (Array.isArray(res.messages) && res.messages.length) {
            const newest = res.messages[res.messages.length - 1];
            if (newest && newest.created_at > cursor.current.since) cursor.current.since = newest.created_at;
            mergeMessages(res.messages);
          }
          if (Array.isArray(res.pinned)) setPinned(res.pinned);
          if (Array.isArray(res.removed) && res.removed.length) {
            const gone = new Set(res.removed);
            setMessages((prev) => prev.map((m) => (gone.has(m.id) ? { ...m, deleted: true, body: "", image: null } : m)));
          }
        }
      }
    })();

    return () => {
      alive.current = false;
    };
  }, [session, loading, offline, mergeMessages]);

  // Connectivity is a fact about the browser, not about the server, so the banner is
  // driven by the events and the queue is drained the moment the link comes back.
  useEffect(() => {
    const onOnline = () => {
      setOffline(false);
      load();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [load]);

  const flushQueue = useCallback(async () => {
    const waiting = readQueue();
    if (!waiting.length || !session) return;
    const still = [];
    for (const item of waiting) {
      const res = await api.sendChat({ body: item.body, image: item.image, replyTo: item.replyTo }, session.authToken);
      if (res && res.ok !== false) {
        mergeMessages([res.message]);
        setQueued(readQueue().filter((q) => q.token !== item.token));
      } else if (res && res.status === 403) {
        // A mute landed while the phone was off the network; keep it no longer.
        toast(res.error || "You cannot post from this account right now.");
      } else {
        still.push(item);
      }
    }
    writeQueue(still);
    setQueued(still);
  }, [mergeMessages, session, toast]);

  useEffect(() => {
    if (!offline && queued.length) flushQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

  const send = async (event) => {
    if (event) event.preventDefault();
    const text = body.trim();
    if (!text && !image) return;
    if (blocked) {
      toast("This account cannot post in the chatroom.");
      return;
    }
    setError("");

    if (offline || mute) {
      // A mute is a server rule and the send would be refused, so the line is kept locally
      // and shown as pending rather than pretending it reached the room.
      const item = { token: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, body: text, image, replyTo: replyTo ? replyTo.id : null, queuedAt: new Date().toISOString() };
      const next = [...readQueue(), item];
      writeQueue(next);
      setQueued(next);
      setBody("");
      setImage("");
      setReplyTo(null);
      toast(offline ? "Saved on this device — it sends when you are back online." : "Kept for you; you are muted until the ban lifts.");
      return;
    }

    setSending(true);
    const res = await api.sendChat({ body: text, image, replyTo: replyTo ? replyTo.id : null }, session.authToken);
    setSending(false);
    if (!res || res.ok === false) {
      setError((res && res.error) || "Your message was not sent.");
      return;
    }
    setBody("");
    setImage("");
    setReplyTo(null);
    stickToBottom.current = true;
    mergeMessages([res.message]);
  };

  const attach = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      setImage(await bannerDataUrl(file, { out: 1024, quality: 0.72 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That picture could not be opened.");
    }
  };

  const older = async () => {
    const first = messages[0];
    if (!first) return;
    setLoadingOlder(true);
    const res = await api.readChat(session.authToken, { before: first.created_at });
    setLoadingOlder(false);
    if (!res || res.ok === false) {
      toast((res && res.error) || "Older messages could not be loaded.");
      return;
    }
    const rows = Array.isArray(res.messages) ? res.messages : [];
    setHasMore(Boolean(res.hasMore));
    if (!rows.length) {
      setHasMore(false);
      return;
    }
    const node = listRef.current;
    const before = node ? node.scrollHeight : 0;
    mergeMessages(rows);
    requestAnimationFrame(() => {
      if (node) node.scrollTop = node.scrollHeight - before;
    });
  };

  const act = async (action, ...args) => {
    const res = await action(...args, session.authToken);
    if (!res || res.ok === false) {
      toast((res && res.error) || "That did not go through.");
      return false;
    }
    return true;
  };

  const removeMessage = async (message) => {
    if (!(await act(api.deleteChatMessage, message.id))) return;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, deleted: true, body: "", image: null } : m)));
    toast("Message removed.");
  };

  const pinMessage = async (message, pinnedNext) => {
    if (!(await act(api.pinChatMessage, message.id, pinnedNext))) return;
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, pinned: pinnedNext } : m)));
    setPinned((prev) => (pinnedNext ? [{ ...message, pinned: true }, ...prev.filter((p) => p.id !== message.id)].slice(0, 5) : prev.filter((p) => p.id !== message.id)));
  };

  const reportMessage = async (message, reason) => {
    const res = await api.reportChatMessage(message.id, reason, session.authToken);
    toast((res && res.message) || (res && res.error) || "Reported.");
  };

  const runSearch = useCallback(
    async (term) => {
      if (!term.trim()) {
        setResults(null);
        return;
      }
      const res = await api.searchChat(term, session.authToken);
      setResults(res && res.ok !== false && Array.isArray(res.messages) ? res.messages : []);
    },
    [session]
  );

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return undefined;
    }
    const timer = setTimeout(() => runSearch(query), 350);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  const grouped = useMemo(() => messages, [messages]);

  if (!session) return <ChatSignIn />;

  const visible = results || grouped;

  return (
    <div className="ws-page ws-chat-page">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
        <div>
          <span className="ws-section-kicker">Wollo Share community</span>
          <h1 className="h3 mb-1">Chatroom</h1>
          <p className="small text-secondary mb-0">
            {stats ? `${stats.messages} messages in the room · ${stats.today} today` : "One room for every signed-in student."}
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <input
            className="form-control form-control-sm"
            style={{ maxWidth: 240 }}
            placeholder="Search the room"
            aria-label="Search chatroom messages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : ""} aria-hidden="true" />
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button type="button" className="btn btn-sm btn-soft" onClick={goLibrary}>
            Back to library
          </button>
        </div>
      </div>

      {offline ? (
        <div className="banner warn mb-2" role="status">
          <WifiOff size={15} aria-hidden="true" />
          <span>You are offline. Anything you write is kept on this device and sent when the connection returns.</span>
        </div>
      ) : null}

      {mute && !offline ? (
        <div className="banner warn mb-2" role="status">
          <Ban size={15} aria-hidden="true" />
          <span>
            You are muted{mute.until ? ` until ${String(mute.until).slice(0, 16).replace("T", " ")}` : ""}.
            {mute.reason ? ` Reason: ${mute.reason}.` : ""}
          </span>
        </div>
      ) : null}

      {blocked ? (
        <div className="banner warn mb-2" role="alert">
          <ShieldAlert size={15} aria-hidden="true" />
          <span>This account is not allowed to post in the chatroom. You can still read it.</span>
        </div>
      ) : null}

      {error ? (
        <div className="banner warn mb-2" role="alert">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {chatRules && chatRules.length ? (
        <details className="card p-2 p-md-3 mb-2">
          <summary className="small fw-semibold">Chatroom rules</summary>
          <ol className="small mb-0 ps-3 mt-2">
            {chatRules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </details>
      ) : null}

      {pinned.length && !results ? (
        <div className="card p-2 p-md-3 mb-2 ws-chat-pinned" aria-label="Pinned announcements">
          {pinned.map((item) => (
            <div key={item.id} className="d-flex flex-wrap gap-2 align-items-start small py-1">
              <Pin size={13} className="mt-1 flex-shrink-0" aria-hidden="true" />
              <strong className="flex-shrink-0">{item.author_name}:</strong>
              <span className="flex-grow-1">{item.body}</span>
              <span className="text-secondary">{dayOf(item.created_at)}</span>
            </div>
          ))}
        </div>
      ) : null}

      {queued.length ? (
        <div className="card p-2 mb-2 d-flex flex-wrap align-items-center gap-2" role="status" aria-label="Messages waiting to send">
          <strong className="small">{queued.length} message{queued.length === 1 ? "" : "s"} waiting to send</strong>
          {!offline ? (
            <button type="button" className="btn btn-sm btn-primary ms-auto" onClick={flushQueue}>
              Send now
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => {
              writeQueue([]);
              setQueued([]);
            }}
          >
            <Undo2 size={13} className="me-1 align-text-bottom" aria-hidden="true" />
            Discard
          </button>
        </div>
      ) : null}

      {results ? (
        <p className="small text-secondary">
          <Search size={13} className="me-1 align-text-bottom" aria-hidden="true" />
          {results.length} match{results.length === 1 ? "" : "es"} for “{query.trim()}”.
          <button type="button" className="btn btn-sm border-0 bg-transparent text-primary p-0 ms-2" onClick={() => { setQuery(""); setResults(null); }}>
            Clear search
          </button>
        </p>
      ) : null}

      <div className="card p-0 ws-chat-shell">
        <div className="ws-chat-list" ref={listRef} role="log" aria-live="polite" aria-relevant="additions" aria-label="Chatroom messages">
          {!loading && !visible.length ? (
            <EmptyState
              icon={<MessageSquare size={24} />}
              title={results ? "Nothing matches that search" : "The room is quiet"}
              description={results ? "Try a shorter word, or clear the search to see the room." : "Be the first to say something — ask about a course, or share what you found."}
            />
          ) : null}

          {!results && hasMore ? (
            <button type="button" className="btn btn-sm btn-outline-secondary align-self-center my-2" onClick={older} disabled={loadingOlder}>
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          ) : null}

          <ul className="list-unstyled mb-0 d-flex flex-column gap-2 p-2 p-md-3">
            {visible.map((message, index) => {
              const previous = visible[index - 1];
              const showDay = !previous || !sameDay(previous.created_at, message.created_at);
              return (
                <React.Fragment key={message.id}>
                  {showDay ? (
                    <li className="ws-chat-day" role="presentation">
                      <span>{dayOf(message.created_at)}</span>
                    </li>
                  ) : null}
                  <ChatBubble
                    message={message}
                    mine={message.author_id === session.id}
                    staff={staff}
                    replyTarget={replyTo ? replyTo.id : null}
                    onReply={(m) => {
                      setReplyTo({ id: m.id, name: m.author_name, snippet: m.body.slice(0, 80) });
                      stickToBottom.current = true;
                    }}
                    onReport={reportMessage}
                    onDelete={removeMessage}
                    onPin={pinMessage}
                  />
                </React.Fragment>
              );
            })}
          </ul>
        </div>

        <form className="ws-chat-composer border-top p-2 p-md-3" onSubmit={send}>
          {replyTo ? (
            <div className="d-flex flex-wrap align-items-center gap-2 small mb-2">
              <span className="badge rounded-pill text-bg-light border">
                replying to {replyTo.name}
              </span>
              {replyTo.snippet ? <span className="text-secondary text-truncate" style={{ maxWidth: 320 }}>{replyTo.snippet}</span> : null}
              <button type="button" className="btn btn-sm border-0 bg-transparent p-0 ms-auto" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          ) : null}

          {image ? (
            <div className="d-flex align-items-center gap-2 mb-2">
              <img className="ws-chat-image ws-chat-image-pending" src={image} alt="Picture attached to your message" />
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setImage("")}>
                <X size={13} className="me-1 align-text-bottom" aria-hidden="true" />
                Remove picture
              </button>
            </div>
          ) : null}

          <div className="d-flex gap-2 align-items-end">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary flex-shrink-0 d-inline-flex align-items-center gap-1"
              onClick={() => fileRef.current && fileRef.current.click()}
              disabled={Boolean(blocked)}
            >
              <ImageIcon size={14} aria-hidden="true" />
              Picture
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="d-none" aria-label="Attach a picture" onChange={attach} />
            <label className="visually-hidden" htmlFor="chatBody">
              Your message
            </label>
            <textarea
              id="chatBody"
              className="form-control"
              rows={2}
              maxLength={BODY_LIMIT}
              placeholder="Say something to the room… (Enter sends, Shift+Enter starts a new line)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button type="submit" className="btn btn-primary btn-sm flex-shrink-0 d-inline-flex align-items-center gap-1" disabled={sending || blocked || (!body.trim() && !image)}>
              {sending ? <RefreshCw size={14} className="spin" aria-hidden="true" /> : <Send size={14} aria-hidden="true" />}
              {sending ? "Sending…" : "Send"}
            </button>
          </div>

          <p className="small text-secondary mb-0 mt-2 d-flex flex-wrap align-items-center gap-2">
            {staff ? (
              <>
                <ShieldAlert size={13} aria-hidden="true" />
                <span>You are moderating: pin, remove and report handling are open to you.</span>
              </>
            ) : (
              <>
                <Check size={13} aria-hidden="true" />
                <span>Only signed-in students see this room. Reports go straight to the support team.</span>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
