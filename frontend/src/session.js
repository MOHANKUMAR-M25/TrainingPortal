// ============================================================
// Anonymous session id — a stable id per browser used to
// correlate visits and form activity in analytics.
// ============================================================

const KEY = "gt_session_id";

export function getSessionId() {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(KEY, id);
  }
  return id;
}
