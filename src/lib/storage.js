export const STORAGE_KEYS = {
  COURSES: "wollo_lib_courses_v3",
  USERS: "wollo_lib_users_v1",
  TEXTS: "wollo_lib_texts_v3",
  APPEARANCE: "wollo_lib_appearance_v3",
  USER_RATINGS: "wollo_lib_user_ratings_v1",
  DOWNLOAD_POLICY: "wollo_lib_download_policy_v1",
  CURRENT_SESSION: "wollo_lib_active_user_session_v1",
  VISITOR_SHARED_COUNT: "wollo_lib_visitor_shared_count_v2",
  VISITOR_PER_DOWNLOAD_PROGRESS: "wollo_lib_visitor_per_dl_v4",
  LAST_SUBMITTED_MAT_NAME: "wollo_lib_last_submitted_mat_v1",
  LAST_CONTRIBUTOR_NAME: "wollo_lib_last_contributor_name_v1",
  LAST_CONTRIBUTOR_DEPT: "wollo_lib_last_contributor_dept_v1",
  DISMISSED_ADS: "wollo_ads_dismissed_v1",
  PENDING_DOWNLOAD: "wollo_lib_pending_dl_v1",
  PENDING_ADMIN_STATE: "wollo_lib_admin_pending_state_v1",
  VIDEO_PROGRESS: "wollo_lib_video_progress_v1"
};

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — local mirror is best-effort */
  }
}

export function readNumber(key, fallback = 0) {
  try {
    const parsed = parseInt(localStorage.getItem(key) || "", 10);
    return Number.isNaN(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function writeNumber(key, value) {
  try {
    localStorage.setItem(key, String(Number(value) || 0));
  } catch {
    /* ignore */
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// Sessions used to live in sessionStorage, so restarting the machine signed the student out.
// Reading the old copy once — and dropping it as we read — lets a browser that is already
// signed in move across to localStorage without signing in again.
export function takeTabJson(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
