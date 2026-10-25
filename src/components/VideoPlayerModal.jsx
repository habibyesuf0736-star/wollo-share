import React, { useCallback, useEffect, useRef, useState } from "react";
import Modal from "./Modal.jsx";
import { useApp } from "../store/AppContext.jsx";
import { extractYouTubeVideoId } from "../lib/utils.js";
import { loadYouTubeApi } from "../lib/youtube.js";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function clock(totalSeconds) {
  const value = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function VideoPlayerModal() {
  const { videoTarget, setVideoTarget, coursesData, requestDownload, videoProgress, recordVideoProgress, session } = useApp();
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");

  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const wrapperRef = useRef(null);
  const persistRef = useRef(() => {});
  const lastSaveRef = useRef(0);

  const course = videoTarget ? coursesData.find((c) => c.id === videoTarget.courseId) : null;
  const mat = course ? (course.materials || []).find((m) => m.id === videoTarget.materialId) : null;
  const ytId = mat ? extractYouTubeVideoId(mat.url) : null;
  const progressKey = videoTarget ? `${videoTarget.courseId}::${videoTarget.materialId}` : "";
  const stored = videoProgress[progressKey];

  const persist = useCallback(() => {
    const player = playerRef.current;
    if (!player || !ready || !course || !mat) return;
    try {
      const total = Number(player.getDuration()) || 0;
      const seconds = Number(player.getCurrentTime()) || 0;
      if (total <= 0) return;
      recordVideoProgress(course.id, mat.id, { seconds, duration: total });
      lastSaveRef.current = Date.now();
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch {
      /* the player can be mid-teardown */
    }
  }, [course, mat, ready, recordVideoProgress]);

  persistRef.current = persist;

  // Build a fresh player whenever the lesson changes, resuming where the student stopped.
  useEffect(() => {
    if (!ytId) return undefined;
    let cancelled = false;
    const resumeAt = stored && !stored.completed && stored.seconds > 5 ? stored.seconds : 0;
    setReady(false);
    setPlaying(false);
    setError("");
    setCurrent(resumeAt);
    setDuration(stored && stored.duration ? stored.duration : 0);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mountRef.current) return;
        playerRef.current = new YT.Player(mountRef.current, {
          videoId: ytId,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            iv_load_policy: 3,
            start: Math.floor(resumeAt),
            origin: window.location.origin
          },
          events: {
            onReady: (event) => {
              if (cancelled) return;
              setReady(true);
              setVolume(Math.round((event.target.getVolume ? event.target.getVolume() : 100) || 100));
              setDuration(Number(event.target.getDuration()) || 0);
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const state = event.data;
              setPlaying(state === YT.PlayerState.PLAYING);
              if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED) {
                persistRef.current();
              }
            },
            onError: () => {
              if (!cancelled) setError("This video cannot be played here. Ask the administrator to check the lesson link.");
            }
          }
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "The video player could not be loaded.");
      });

    return () => {
      cancelled = true;
      persistRef.current();
      const player = playerRef.current;
      playerRef.current = null;
      if (player) {
        try {
          player.destroy();
        } catch {
          /* already detached */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId, videoTarget && videoTarget.materialId]);

  // One tick per second keeps the timeline in sync and saves progress every 5 seconds.
  useEffect(() => {
    if (!ready) return undefined;
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== "function") return;
      try {
        const seconds = Number(player.getCurrentTime()) || 0;
        const total = Number(player.getDuration()) || 0;
        setCurrent(seconds);
        if (total > 0) setDuration(total);
        if (Date.now() - lastSaveRef.current > 5000) persistRef.current();
      } catch {
        /* player not ready */
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [ready]);

  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player || typeof player.getPlayerState !== "function") return;
    if (player.getPlayerState() === 1) player.pauseVideo();
    else player.playVideo();
  }, []);

  const skip = useCallback((delta) => {
    const player = playerRef.current;
    if (!player || typeof player.getCurrentTime !== "function") return;
    const total = Number(player.getDuration()) || 0;
    const next = Math.min(Math.max(0, Number(player.getCurrentTime()) + delta), total || Number.MAX_SAFE_INTEGER);
    player.seekTo(next, true);
    setCurrent(next);
  }, []);

  const seekTo = useCallback((value) => {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(value, true);
    setCurrent(value);
  }, []);

  const changeVolume = useCallback((value) => {
    const player = playerRef.current;
    setVolume(value);
    if (player) {
      player.setVolume(value);
      if (value > 0) {
        player.unMute();
        setMuted(false);
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (muted) {
      player.unMute();
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  }, [muted]);

  const changeRate = useCallback((value) => {
    setRate(value);
    const player = playerRef.current;
    if (player && typeof player.setPlaybackRate === "function") player.setPlaybackRate(value);
  }, []);

  const enterFullscreen = useCallback(() => {
    const node = wrapperRef.current;
    if (!node) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (node.requestFullscreen) node.requestFullscreen().catch(() => {});
  }, []);

  // Keyboard shortcuts stay inside the player: they never scroll the page or
  // hijack typing in the companion-file search.
  useEffect(() => {
    if (!videoTarget) return undefined;
    const onKey = (event) => {
      const tag = String((event.target && event.target.tagName) || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      if (event.code === "Space" || event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        skip(10);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        skip(-10);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        changeVolume(Math.min(100, volume + 10));
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        changeVolume(Math.max(0, volume - 10));
      } else if (event.key.toLowerCase() === "m") {
        toggleMute();
      } else if (event.key.toLowerCase() === "f") {
        enterFullscreen();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [changeVolume, enterFullscreen, skip, toggle, toggleMute, videoTarget, volume]);

  if (!videoTarget || !course || !mat) return null;

  const lessonIndex = (course.materials || []).findIndex((m) => m.id === mat.id);
  const lessons = (course.materials || []).filter((m) => extractYouTubeVideoId(m.url) || m.type === "Video");
  const position = lessons.findIndex((m) => m.id === mat.id);
  const percent = duration > 0 ? Math.min(100, Math.round((current / duration) * 100)) : stored ? stored.percent : 0;

  const sideMatches = (mat.sideMaterials || []).filter((s) =>
    String(s.name || "").toLowerCase().includes(search.trim().toLowerCase())
  );

  const move = (direction) => {
    const next = lessons[position + direction];
    if (next) setVideoTarget({ courseId: course.id, materialId: next.id });
  };

  return (
    <Modal
      open
      onClose={() => setVideoTarget(null)}
      title={mat.name}
      subtitle={`${course.name} · ${mat.year || ""} ${mat.semester || ""} · lesson ${position + 1} of ${lessons.length || 1}`}
      size="wide"
    >
      <div className="row g-3">
        <div className="col-12 col-lg-8">
          <div className="ws-player" ref={wrapperRef}>
            <div className="ws-player-stage">
              {ytId ? <div ref={mountRef} className="ws-player-mount" /> : null}
              {!ytId ? <div className="ws-player-fallback">This lesson has no playable video link.</div> : null}
              {error ? <div className="ws-player-fallback">{error}</div> : null}
            </div>

            <div className="ws-player-controls">
              <div className="ws-player-row">
                <button type="button" className="ws-player-btn ws-player-primary" onClick={toggle} disabled={!ready}>
                  {playing ? "Pause" : "Play"}
                </button>
                <button type="button" className="ws-player-btn" onClick={() => skip(-10)} disabled={!ready} title="Back 10 seconds">
                  −10s
                </button>
                <button type="button" className="ws-player-btn" onClick={() => skip(10)} disabled={!ready} title="Forward 10 seconds">
                  +10s
                </button>
                <span className="ws-player-time mono">{clock(current)}</span>
                <input
                  className="ws-player-seek"
                  type="range"
                  min="0"
                  max={duration || 0}
                  step="0.5"
                  value={Math.min(current, duration || current)}
                  onChange={(event) => seekTo(Number(event.target.value))}
                  aria-label="Seek through the video"
                  disabled={!ready || !duration}
                />
                <span className="ws-player-time mono">{clock(duration)}</span>
                <span className="ws-player-percent mono">{percent}%</span>
              </div>

              <div className="ws-player-row ws-player-row-secondary">
                <button type="button" className="ws-player-btn" onClick={toggleMute} disabled={!ready}>
                  {muted || volume === 0 ? "Sound off" : "Sound on"}
                </button>
                <input
                  className="ws-player-volume"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={muted ? 0 : volume}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                  aria-label="Volume"
                  disabled={!ready}
                />
                <label className="ws-player-speed">
                  <span>Speed</span>
                  <select value={rate} onChange={(event) => changeRate(Number(event.target.value))} disabled={!ready}>
                    {SPEEDS.map((speed) => (
                      <option key={speed} value={speed}>
                        {speed}×
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="ws-player-btn" onClick={enterFullscreen} disabled={!ready}>
                  Full screen
                </button>
              </div>
            </div>
          </div>

          <div className="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={position <= 0} onClick={() => move(-1)}>
              ← Previous lesson
            </button>
            <span className="small text-secondary">
              {session ? "Progress saves to your account automatically." : "Sign in to save your progress across devices."}
              {savedAt ? ` Last saved ${savedAt}.` : ""}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={position >= lessons.length - 1}
              onClick={() => move(1)}
            >
              Next lesson →
            </button>
          </div>
          <p className="small text-secondary mt-1 mb-0">
            Shortcuts: Space play/pause · ← → 10s · ↑ ↓ volume · M mute · F full screen
          </p>
        </div>

        <div className="col-12 col-lg-4">
          <div className="card p-3 h-100">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h4 className="h6 mb-0">Companion materials</h4>
              <span className="tag">{(mat.sideMaterials || []).length}</span>
            </div>
            <input
              className="form-control form-control-sm mb-2"
              placeholder="Search companion files"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ul className="list-unstyled d-flex flex-column gap-2 mb-3" style={{ maxHeight: 240, overflowY: "auto" }}>
              {sideMatches.length ? (
                sideMatches.map((side) => (
                  <li key={side.id} className="d-flex justify-content-between align-items-center gap-2">
                    <span className="small text-truncate">
                      {side.name} <span className="text-secondary">· {side.type}</span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-soft py-0"
                      onClick={() => requestDownload(course.id, mat.id, side.id)}
                    >
                      Get
                    </button>
                  </li>
                ))
              ) : (
                <li className="small text-secondary">No companion files yet.</li>
              )}
            </ul>
            <div className="video-progress video-progress-lg">
              <span className="video-progress-track" aria-hidden="true">
                <span style={{ width: `${percent}%` }} />
              </span>
              <span className="video-progress-label">
                {percent >= 90 ? "Completed" : `${percent}% of this lesson watched`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
