const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function apiFetch(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    const message = (data && data.message) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function registerUser(payload) {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function loginUser(payload) {
  return apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getMe(token) {
  return apiFetch("/api/users/me", { method: "GET", token });
}

export function getAdminStats(token) {
  return apiFetch("/api/admin/stats", { method: "GET", token });
}

export function adminListUsers(token) {
  return apiFetch("/api/admin/users", { method: "GET", token });
}

export function adminDeleteUser(token, id) {
  return apiFetch(`/api/admin/users/${id}`, { method: "DELETE", token });
}

export function adminCleanupUsers(token) {
  return apiFetch("/api/admin/users/cleanup", { method: "POST", token });
}

export function adminGetLogs(token, { eventType = "", page = 1, limit = 50, from = "", to = "" } = {}) {
  const params = new URLSearchParams();
  if (eventType) params.set("event_type", eventType);
  if (page) params.set("page", String(page));
  if (limit) params.set("limit", String(limit));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return apiFetch(`/api/admin/logs${qs ? `?${qs}` : ""}`, { method: "GET", token });
}

export function adminGetMetrics(token, { days = 7 } = {}) {
  const qs = days ? `?days=${days}` : "";
  return apiFetch(`/api/admin/metrics${qs}`, { method: "GET", token });
}

export function getRobot(token) {
  return apiFetch("/api/robots", { method: "GET", token });
}

export function robotTransition(token, nextState) {
  return apiFetch("/api/robots/transition", {
    method: "POST",
    token,
    body: JSON.stringify({ nextState })
  });
}

// Tasks
export function createTask(token, payload, { auto = true } = {}) {
  const qs = auto ? "" : "?auto=false";
  return apiFetch(`/api/tasks${qs}`, {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function listTasks(token) {
  return apiFetch("/api/tasks", { method: "GET", token });
}

export function getTaskFeasibility(token, id) {
  return apiFetch(`/api/tasks/${id}/feasibility`, { method: "GET", token });
}

// Internal helper: used to auto-trigger scheduling without exposing a UI button.
export function scheduleNextTask(token) {
  return apiFetch("/api/tasks/schedule", { method: "POST", token });
}

export function assignTask(token, id) {
  return apiFetch(`/api/tasks/${id}/assign`, { method: "PATCH", token });
}

// Admin-only: swap current ASSIGNED task for another pending one
export function overrideSwapTask(token, id) {
  return apiFetch(`/api/tasks/${id}/override`, { method: "PATCH", token });
}

export function startTask(token, id) {
  return apiFetch(`/api/tasks/${id}/start`, { method: "PATCH", token });
}

export function completeTask(token, id, { auto = true } = {}) {
  const qs = auto ? "" : "?auto=false";
  return apiFetch(`/api/tasks/${id}/complete${qs}`, { method: "PATCH", token });
}