const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  const hostname = typeof window !== "undefined" && window.location ? window.location.hostname : "127.0.0.1";
  return `http://${hostname || "127.0.0.1"}:5000`;
};

const API_URL = getApiUrl();

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

export function getLogs(
  token,
  { module = "", severity = "", eventType = "", search = "", startDate = "", endDate = "", page = 1, limit = 25 } = {}
) {
  const params = new URLSearchParams();
  if (module) params.set("module", module);
  if (severity) params.set("severity", severity);
  if (eventType) params.set("eventType", eventType);
  if (search) params.set("search", search);
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  if (page) params.set("page", String(page));
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return apiFetch(`/api/logs${qs ? `?${qs}` : ""}`, { method: "GET", token });
}

export function getLogSummary(token) {
  return apiFetch("/api/logs/summary", { method: "GET", token });
}

export function getRobot(token) {
  return apiFetch("/api/robots", { method: "GET", token });
}

export function getRobotTaskStatus(token) {
  return apiFetch("/api/robots/task-status", { method: "GET", token });
}

export function resetRobotState(token, id) {
  return apiFetch(`/api/robots/${id}/reset`, { method: "PUT", token });
}

export function sendRobotCommand(token, command) {
  return apiFetch("/api/robot/send", {
    method: "POST",
    token,
    body: JSON.stringify({ command })
  });
}

export function logRobotZoneArrival(token, zoneCode) {
  return apiFetch("/api/robot/zone-arrival", {
    method: "POST",
    token,
    body: JSON.stringify({ zoneCode })
  });
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

export function listTaskQueue(token) {
  return apiFetch("/api/tasks/queue", { method: "GET", token });
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

export function getDashboardOverview(token) {
  return apiFetch("/api/dashboard/overview", { method: "GET", token });
}
