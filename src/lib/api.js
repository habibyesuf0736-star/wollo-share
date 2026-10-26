const JSON_HEADERS = { "Content-Type": "application/json" };

function authHeaders(session) {
  return session ? { ...JSON_HEADERS, Authorization: `Bearer ${session}` } : { ...JSON_HEADERS };
}

async function request(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...JSON_HEADERS, ...(options.headers || {}) } });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok && (!payload || payload.ok !== true)) {
    const message = (payload && payload.error) || `Request failed (${res.status})`;
    // Keep server flags such as needsVerification so a screen can react to them.
    return { ...(payload || {}), ok: false, status: res.status, error: message };
  }
  return payload || { ok: true };
}

export function fetchState(session) {
  return request("/api/state", { headers: session ? { Authorization: `Bearer ${session}` } : {} });
}

export function pushState(payload, session) {
  return request("/api/state", { method: "PUT", headers: authHeaders(session), body: JSON.stringify(payload) });
}

// Replays an admin save that was interrupted by a reload. Runs while the page is
// alive, so a normal request is used (the state body is larger than the keepalive cap).
export async function replayPendingState(payload, session) {
  try {
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: authHeaders(session),
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch {
    return { ok: false, error: "Could not replay the saved changes." };
  }
}

export function login(identifier, password) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password })
  });
}

export function registerAccount(details) {
  return request("/api/auth/register", { method: "POST", body: JSON.stringify(details) });
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
    const res = await fetch("/api/admin/backup/accounts.csv", { headers: authHeaders(session) });
    if (!res.ok) return { ok: false, error: `Request failed (${res.status})` };
    return { ok: true, text: await res.text() };
  } catch {
    return { ok: false, error: "Could not download the accounts list." };
  }
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

export function consumeDownloadCredit(session) {
  return request("/api/downloads/consume-credit", { method: "POST", headers: authHeaders(session) });
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
