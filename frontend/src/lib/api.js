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
    const message =
      res.status === 401
        ? "Session expired. Please sign in again."
        : (data && data.message) || `Request failed (${res.status})`;
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

export function getSystemStats(token) {
  return apiFetch("/api/system/stats", { method: "GET", token });
}

export function getSystemLogs(token, { eventType = "", page = 1, limit = 50, from = "", to = "", task_id = "" } = {}) {
  const params = new URLSearchParams();
  if (eventType) params.set("event_type", eventType);
  if (page) params.set("page", String(page));
  if (limit) params.set("limit", String(limit));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (task_id) params.set("task_id", task_id);
  const qs = params.toString();
  return apiFetch(`/api/system/logs${qs ? `?${qs}` : ""}`, { method: "GET", token });
}

export function getRobot(token) {
  return apiFetch("/api/robots", { method: "GET", token });
}

export function getZones(token) {
  return apiFetch("/api/zones", { method: "GET", token });
}

export function robotTransition(token, nextState) {
  return apiFetch("/api/robots/transition", {
    method: "POST",
    token,
    body: JSON.stringify({ nextState })
  });
}

export function setRobotAutoMode(token, autoMode) {
  return apiFetch("/api/robots/auto-mode", {
    method: "PATCH",
    token,
    body: JSON.stringify({ autoMode })
  });
}

// Tasks
export function createTask(token, payload) {
  return apiFetch(`/api/tasks`, {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function createTasksBulk(token, payload) {
  return apiFetch(`/api/tasks/bulk`, {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function listTasks(token) {
  return apiFetch("/api/tasks", { method: "GET", token });
}

export function assignTask(token, id) {
  return apiFetch(`/api/tasks/${id}/assign`, { method: "PATCH", token });
}

export function completeTask(token, id) {
  return apiFetch(`/api/tasks/${id}/complete`, { method: "PATCH", token });
}

export function deleteTask(token, id) {
  return apiFetch(`/api/tasks/${id}`, { method: "DELETE", token });
}
