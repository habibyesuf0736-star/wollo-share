const JSON_HEADERS = { "Content-Type": "application/json" };

// Installed on a phone the surface is served from the device's own origin, so a root-relative
// path would ask the local asset server for API data. The site is spelled out for that one
// caller; in a browser window.location.origin is the site already, so nothing changes there.
export function apiOrigin() {
  if (typeof window === "undefined") return "";
  if (window.Capacitor?.isNativePlatform?.() === true) return "https://wollo-share.vercel.app";
  return window.location.origin;
}

function endpoint(path) {
  return /^https?:/i.test(path) ? path : apiOrigin() + path;
}

function authHeaders(session) {
  return session ? { ...JSON_HEADERS, Authorization: `Bearer ${session}` } : { ...JSON_HEADERS };
}

async function request(url, options = {}) {
  // A phone with no signal must not wait forever on a request that will never be answered:
  // the deadline lets the screen fall back to its offline wording instead of hanging.
  const { timeoutMs = 20000, ...fetchOptions } = options;
  const call = endpoint(url);
  let response = null;
  try {
    response = await race(fetch(call, { ...fetchOptions, headers: { ...JSON_HEADERS, ...(fetchOptions.headers || {}) } }), timeoutMs);
  } catch {
    response = null;
  }
  if (!response) return { ok: false, status: 0, offline: true, error: "No connection." };
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok && (!payload || payload.ok !== true)) {
    const message = (payload && payload.error) || `Request failed (${response.status})`;
    // Keep server flags such as needsRecovery so a screen can react to them.
    return { ...(payload || {}), ok: false, status: response.status, error: message };
  }
  return payload || { ok: true };
}

// A settled value, or null once the deadline passes. A dead network rejects almost at once and
// a hanging one resolves never, so both have to end up in the caller's offline branch.
function race(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

export function fetchState(session, timeoutMs) {
  return request("/api/state", { timeoutMs, headers: session ? { Authorization: `Bearer ${session}` } : {} });
}

export function pushState(payload, session) {
  return request("/api/state", { method: "PUT", headers: authHeaders(session), body: JSON.stringify(payload) });
}

// Replays an admin save that was interrupted by a reload. Runs while the page is alive, so
// it gets a longer deadline than a read — the state body is larger than the keepalive cap.
export function replayPendingState(payload, session) {
  return request("/api/state", {
    method: "PUT",
    timeoutMs: 30000,
    headers: authHeaders(session),
    body: JSON.stringify(payload)
  });
}

export function login(identifier, password) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password })
  });
}

export function verifySignInCode(identifier, code) {
  return request("/api/auth/two-factor/verify", {
    method: "POST",
    body: JSON.stringify({ identifier, code })
  });
}

export function resendSignInCode(identifier) {
  return request("/api/auth/two-factor/resend", {
    method: "POST",
    body: JSON.stringify({ identifier })
  });
}

export function registerAccount(details) {
  return request("/api/auth/register", { method: "POST", body: JSON.stringify(details) });
}

// Sign in on a second screen: the desk asks for a code and shows it as a QR, a phone
// that is already signed in approves it, and the desk collects its session by polling.
export function startQrLogin(label) {
  return request("/api/qr-login/start", { method: "POST", body: JSON.stringify({ label }) });
}

export function pollQrLogin(id) {
  return request(`/api/qr-login/status?id=${encodeURIComponent(id)}`);
}

export function approveQrLogin(id, session) {
  return request("/api/qr-login/approve", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ id })
  });
}

// What the scanning phone is allowed to see about a code: the device it names, never a session.
export function previewQrLogin(id, session) {
  return request(`/api/qr-login/preview?id=${encodeURIComponent(id)}`, { headers: authHeaders(session) });
}

export function verifyEmail(email, code) {
  return request("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ email, code }) });
}

export function resendVerificationCode(email) {
  return request("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ email, resend: true }) });
}

export function updateProfile(details, session) {
  return request("/api/profile", { method: "PATCH", headers: authHeaders(session), body: JSON.stringify(details) });
}

export function listLoginDevices(session) {
  return request("/api/account/devices", { headers: authHeaders(session) });
}

export function revokeLoginDevice(deviceId, session) {
  return request("/api/account/devices/revoke", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ deviceId })
  });
}

export function signOutOtherDevices(session) {
  return request("/api/account/devices/sign-out-all", { method: "POST", headers: authHeaders(session), body: "{}" });
}

export function listVerifications(session) {
  return request("/api/admin/verifications", { headers: authHeaders(session) });
}

export function approveVerification(userId, session) {
  return request(`/api/admin/verifications/${encodeURIComponent(userId)}/approve`, {
    method: "POST",
    headers: authHeaders(session)
  });
}

export function shareVerificationCode(userId, session) {
  return request(`/api/admin/verifications/${encodeURIComponent(userId)}/code`, {
    method: "POST",
    headers: authHeaders(session)
  });
}

export function getBackup(session, scope = "all") {
  return request(`/api/admin/backup?scope=${encodeURIComponent(scope)}`, { headers: authHeaders(session) });
}

export function getBackupInfo(session) {
  return request("/api/admin/backup/info", { headers: authHeaders(session) });
}

export async function getAccountsCsv(session) {
  try {
    const res = await fetch(endpoint("/api/admin/backup/accounts.csv"), { headers: authHeaders(session) });
    if (!res.ok) return { ok: false, error: `Request failed (${res.status})` };
    return { ok: true, text: await res.text() };
  } catch {
    return { ok: false, error: "Could not download the accounts list." };
  }
}

export async function getSubmissionsCsv(session) {
  try {
    const res = await fetch(endpoint("/api/admin/backup/submissions.csv"), { headers: authHeaders(session) });
    if (!res.ok) return { ok: false, error: `Request failed (${res.status})` };
    return { ok: true, text: await res.text() };
  } catch {
    return { ok: false, error: "Could not download the sent materials list." };
  }
}

export function assignUserRole(userId, role, session) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ role })
  });
}

export function createTicket(payload, session) {
  return request("/api/support/tickets", { method: "POST", headers: authHeaders(session), body: JSON.stringify(payload) });
}

export function listMyTickets(session) {
  return request("/api/support/tickets/mine", { headers: authHeaders(session) });
}

export function listTickets(session) {
  return request("/api/support/tickets", { headers: authHeaders(session) });
}

export function replyTicket(ticketId, text, session) {
  return request(`/api/support/tickets/${encodeURIComponent(ticketId)}/reply`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ text })
  });
}

export function closeTicket(ticketId, session) {
  return request(`/api/support/tickets/${encodeURIComponent(ticketId)}/close`, {
    method: "POST",
    headers: authHeaders(session)
  });
}

export function requestPremiumPlan(plan, reference, session) {
  return request("/api/premium/requests", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ plan, reference })
  });
}

export function approvePremiumRequest(ticketId, session) {
  return request(`/api/premium/requests/${encodeURIComponent(ticketId)}/approve`, {
    method: "POST",
    headers: authHeaders(session)
  });
}

export function addCourseMaterial(courseId, material, session) {
  return request(`/api/courses/${encodeURIComponent(courseId)}/materials`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(material)
  });
}

export function createStaffCourse(payload, session) {
  return request("/api/staff/courses", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(payload)
  });
}

export function importStaffLibrary(backup, session) {
  return request("/api/staff/library/import", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(backup)
  });
}

export function seedFreshmanMaterials(dryRun, session) {
  return request("/api/support/freshman/seed", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ dryRun })
  });
}

export function restoreBackup(backup, session) {
  return request("/api/admin/restore", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(backup)
  });
}

export function createStudentAccount(details, session) {
  return request("/api/admin/users", { method: "POST", headers: authHeaders(session), body: JSON.stringify(details) });
}

export function rateMaterial(courseId, materialId, stars, session) {
  return request(`/api/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}/rate`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ stars })
  });
}

export function saveSideMaterial(courseId, materialId, sideMaterial, session) {
  return request(
    `/api/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(materialId)}/side-materials`,
    { method: "POST", headers: authHeaders(session), body: JSON.stringify(sideMaterial) }
  );
}

export function deleteSideMaterialApi(courseId, materialId, sideMaterialId, session) {
  return request(
    `/api/courses/${encodeURIComponent(courseId)}/materials/${encodeURIComponent(
      materialId
    )}/side-materials/${encodeURIComponent(sideMaterialId)}`,
    { method: "DELETE", headers: authHeaders(session) }
  );
}

export function resetDatabase(session) {
  return request("/api/reset", { method: "POST", headers: authHeaders(session) });
}

export function deleteAccount(userId, session) {
  return request(`/api/users/${encodeURIComponent(userId)}`, { method: "DELETE", headers: authHeaders(session) });
}

export function requestRecovery(email) {
  return request("/api/auth/password-recovery/request", { method: "POST", body: JSON.stringify({ email }) });
}

export function completeRecovery({ email, code, newPassword }) {
  return request("/api/auth/password-recovery/complete", {
    method: "POST",
    body: JSON.stringify({ email, code, newPassword })
  });
}

export function listRecoveryRequests(session) {
  return request("/api/admin/password-recovery-requests", { headers: authHeaders(session) });
}

export function issueRecoveryCode(requestId, session) {
  return request(`/api/admin/password-recovery-requests/${encodeURIComponent(requestId)}/code`, {
    method: "POST",
    headers: authHeaders(session)
  });
}

export function closeRecoveryRequest(requestId, session) {
  return request(`/api/admin/password-recovery-requests/${encodeURIComponent(requestId)}/close`, {
    method: "POST",
    headers: authHeaders(session)
  });
}

export function deleteRecoveryRequest(requestId, session) {
  return request(`/api/admin/password-recovery-requests/${encodeURIComponent(requestId)}`, {
    method: "DELETE",
    headers: authHeaders(session)
  });
}

export function clearFinishedRecoveryRequests(session) {
  return request("/api/admin/password-recovery-requests/clear", {
    method: "POST",
    headers: authHeaders(session)
  });
}

export function getMailStatus(session) {
  return request("/api/admin/mail-status", { headers: authHeaders(session) });
}

export function getMailSettings(session) {
  return request("/api/admin/mail-settings", { headers: authHeaders(session) });
}

export function saveMailSettings(payload, session) {
  return request("/api/admin/mail-settings", {
    method: "PUT",
    headers: authHeaders(session),
    body: JSON.stringify(payload)
  });
}

export function sendTestEmail(to, session) {
  return request("/api/admin/mail/test", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ to })
  });
}

export function saveVideoProgress(payload, session) {
  return request("/api/progress/video", { method: "POST", headers: authHeaders(session), body: JSON.stringify(payload) });
}

export function submitMaterial(submission, session) {
  return request("/api/materials/submissions", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(submission)
  });
}

export function listMaterialSubmissions(session) {
  return request("/api/admin/material-submissions", { headers: authHeaders(session) });
}

export function listMySubmissions(session) {
  return request("/api/materials/submissions/mine", { headers: authHeaders(session) });
}

export function authorizeDownload(payload, session) {
  return request("/api/downloads/authorize", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(payload)
  });
}

export function adjustUserCredits(userId, delta, session) {
  return request(`/api/admin/users/${encodeURIComponent(userId)}/credits`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ delta })
  });
}

export function updateMaterialSubmission(submissionId, patch, session) {
  return request(`/api/admin/material-submissions/${encodeURIComponent(submissionId)}`, {
    method: "PATCH",
    headers: authHeaders(session),
    body: JSON.stringify(patch)
  });
}

export function approveMaterialSubmission(submissionId, payload, session) {
  return request(`/api/admin/material-submissions/${encodeURIComponent(submissionId)}/approve`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(payload || {})
  });
}

export function rejectMaterialSubmission(submissionId, reason, session) {
  return request(`/api/admin/material-submissions/${encodeURIComponent(submissionId)}/reject`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ reason })
  });
}

/* --------------------------------------------------------- home screen content */

export function saveHomeCard(card, session) {
  return request("/api/admin/home/content", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(card)
  });
}

export function deleteHomeCard(cardId, session) {
  return request("/api/admin/home/content/delete", {
    method: "POST",
    timeoutMs: 30000,
    headers: authHeaders(session),
    body: JSON.stringify({ id: cardId })
  });
}

export function moveHomeCard(cardId, direction, session) {
  return request("/api/admin/home/content/move", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ id: cardId, direction })
  });
}

// A view or a tap is reported and then forgotten: a screen must never wait on a counter.
export function trackHomeCard(cardId, event, session) {
  return request("/api/home/stats", {
    method: "POST",
    timeoutMs: 6000,
    headers: authHeaders(session),
    body: JSON.stringify({ id: cardId, event })
  }).catch(() => null);
}

/* --------------------------------------------------------- payment methods */

export function savePaymentMethod(method, session) {
  return request("/api/admin/payment-methods", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(method)
  });
}

export function deletePaymentMethod(methodId, session) {
  return request("/api/admin/payment-methods/delete", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ id: methodId })
  });
}

/* --------------------------------------------------------- premium payments */

export function submitPremiumPayment(payload, session) {
  return request("/api/premium/payments", {
    method: "POST",
    // The picture rides in the body, so this is the one premium call that needs room.
    timeoutMs: 60000,
    headers: authHeaders(session),
    body: JSON.stringify(payload)
  });
}

export function resubmitPremiumPayment(paymentId, payload, session) {
  return request(`/api/premium/payments/${encodeURIComponent(paymentId)}/resubmit`, {
    method: "POST",
    timeoutMs: 60000,
    headers: authHeaders(session),
    body: JSON.stringify(payload)
  });
}

export function cancelPremiumPayment(paymentId, session) {
  return request(`/api/premium/payments/${encodeURIComponent(paymentId)}/cancel`, {
    method: "POST",
    headers: authHeaders(session)
  });
}

export function readPremiumScreenshot(paymentId, session) {
  return request(`/api/premium/payments/${encodeURIComponent(paymentId)}/screenshot`, {
    method: "GET",
    timeoutMs: 45000,
    headers: authHeaders(session)
  });
}

export function decidePremiumPayment(paymentId, payload, session) {
  return request(`/api/admin/premium/payments/${encodeURIComponent(paymentId)}/decision`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(payload)
  });
}

export function listAuditLog(session) {
  return request("/api/admin/audit", { method: "GET", headers: authHeaders(session) });
}

/* -------------------------------------------------------------- profile email */

export function requestEmailChange(email, session) {
  return request("/api/profile/email", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ email })
  });
}

export function confirmEmailChange(code, session) {
  return request("/api/profile/email/confirm", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ code })
  });
}

/* ------------------------------------------------------------------- chatroom */

export function readChat(session, options = {}) {
  const params = new URLSearchParams();
  if (options.before) params.set("before", options.before);
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  return request(`/api/chat${query ? `?${query}` : ""}`, { method: "GET", headers: authHeaders(session) });
}

// One held request replaces the two-seconds-every-poll the room would otherwise need, so
// the deadline has to outlive the server's own wait window.
export function watchChat(session, { since = "", rev = 0 } = {}) {
  const params = new URLSearchParams();
  if (since) params.set("since", since);
  if (rev) params.set("rev", String(rev));
  return request(`/api/chat/updates?${params}`, {
    method: "GET",
    timeoutMs: 32000,
    headers: authHeaders(session)
  });
}

export function searchChat(term, session) {
  return request(`/api/chat/search?q=${encodeURIComponent(term)}`, { method: "GET", headers: authHeaders(session) });
}

export function sendChat(payload, session) {
  return request("/api/chat", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(payload)
  });
}

export function reportChatMessage(messageId, reason, session) {
  return request(`/api/chat/${encodeURIComponent(messageId)}/report`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ reason })
  });
}

export function deleteChatMessage(messageId, session) {
  return request(`/api/chat/${encodeURIComponent(messageId)}`, { method: "DELETE", headers: authHeaders(session) });
}

export function pinChatMessage(messageId, pinned, session) {
  return request(`/api/chat/${encodeURIComponent(messageId)}/pin`, {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ pinned })
  });
}

export function readChatReports(session, includeReviewed = false) {
  return request(`/api/chat/reports${includeReviewed ? "?all=1" : ""}`, { method: "GET", headers: authHeaders(session) });
}

export function resolveChatReport(reportId, session) {
  return request(`/api/chat/reports/${encodeURIComponent(reportId)}/resolve`, {
    method: "POST",
    headers: authHeaders(session)
  });
}

export function restrictChatUser(payload, session) {
  return request("/api/chat/actions", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(payload)
  });
}

export function liftChatAction(actionId, session) {
  return request(`/api/chat/actions/${encodeURIComponent(actionId)}`, { method: "DELETE", headers: authHeaders(session) });
}

/* --------------------------------------------------------- practice & examination */

function practiceQuery(filters = {}) {
  const params = new URLSearchParams();
  Object.keys(filters).forEach((key) => {
    const value = filters[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function listPracticeQuestions(filters, session) {
  return request(`/api/practice/questions${practiceQuery(filters)}`, { method: "GET", headers: authHeaders(session) });
}

export function getPracticeQuestion(id, session) {
  return request(`/api/practice/question/${encodeURIComponent(id)}`, { method: "GET", headers: authHeaders(session) });
}

export function listPracticeExams(courseId, session) {
  return request(`/api/practice/exams${practiceQuery(courseId ? { courseId } : {})}`, { method: "GET", headers: authHeaders(session) });
}

export function startPracticeExam(id, session) {
  return request(`/api/practice/exam/${encodeURIComponent(id)}`, { method: "GET", headers: authHeaders(session) });
}

export function submitPractice(payload, session) {
  return request("/api/practice/submit", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(payload)
  });
}

export function listPracticeAttempts(session) {
  return request("/api/practice/attempts", { method: "GET", headers: authHeaders(session) });
}

export function getPracticeLeaderboard(scope, session) {
  return request(`/api/practice/leaderboard?scope=${scope === "weekly" ? "weekly" : "overall"}`, {
    method: "GET",
    headers: authHeaders(session)
  });
}

export function listPracticeFavorites(session) {
  return request("/api/practice/favorites", { method: "GET", headers: authHeaders(session) });
}

export function togglePracticeFavorite(questionId, session) {
  return request("/api/practice/favorite", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify({ questionId })
  });
}

/* --------------------------------------------------------- practice admin */

export function listAdminPracticeQuestions(filters, session) {
  return request(`/api/admin/practice/questions${practiceQuery(filters)}`, { method: "GET", headers: authHeaders(session) });
}

export function createPracticeQuestion(body, session) {
  return request("/api/admin/practice/questions", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(body)
  });
}

export function updatePracticeQuestion(id, patch, session) {
  return request(`/api/admin/practice/questions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(session),
    body: JSON.stringify(patch)
  });
}

export function deletePracticeQuestion(id, session) {
  return request(`/api/admin/practice/questions/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders(session) });
}

export function listAdminPracticeExams(session) {
  return request("/api/admin/practice/exams", { method: "GET", headers: authHeaders(session) });
}

export function createPracticeExam(body, session) {
  return request("/api/admin/practice/exams", {
    method: "POST",
    headers: authHeaders(session),
    body: JSON.stringify(body)
  });
}

export function updatePracticeExam(id, patch, session) {
  return request(`/api/admin/practice/exams/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(session),
    body: JSON.stringify(patch)
  });
}

export function deletePracticeExam(id, session) {
  return request(`/api/admin/practice/exams/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders(session) });
}

export function getPracticeStats(session) {
  return request("/api/admin/practice/stats", { method: "GET", headers: authHeaders(session) });
}

export function listAdminPracticeAttempts(session) {
  return request("/api/admin/practice/attempts", { method: "GET", headers: authHeaders(session) });
}
