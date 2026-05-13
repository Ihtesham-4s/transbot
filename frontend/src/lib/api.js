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

// Inventory
export function createProduct(token, payload) {
  return apiFetch("/api/products", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function listProducts(token) {
  return apiFetch("/api/products", { method: "GET", token });
}

export function getProduct(token, id) {
  return apiFetch(`/api/products/${id}`, { method: "GET", token });
}

export function updateProduct(token, id, payload) {
  return apiFetch(`/api/products/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(payload)
  });
}

export function deleteProduct(token, id) {
  return apiFetch(`/api/products/${id}`, { method: "DELETE", token });
}

export function stockIn(token, payload) {
  return apiFetch("/api/stock/in", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function stockOut(token, payload) {
  return apiFetch("/api/stock/out", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function stockTransfer(token, payload) {
  return apiFetch("/api/stock/transfer", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function listStockMovements(token, { limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return apiFetch(`/api/stock/movements${qs ? `?${qs}` : ""}`, { method: "GET", token });
}

export function getInventorySummary(token) {
  return apiFetch("/api/inventory/summary", { method: "GET", token });
}

export function getLowStockProducts(token) {
  return apiFetch("/api/inventory/low-stock", { method: "GET", token });
}

export function getOverstockProducts(token) {
  return apiFetch("/api/inventory/overstock", { method: "GET", token });
}

export function getReorderSuggestions(token) {
  return apiFetch("/api/inventory/reorder-suggestions", { method: "GET", token });
}

// Order fulfillment
export function getOrders(token) {
  return apiFetch("/api/orders", { method: "GET", token });
}

export function getOrder(token, id) {
  return apiFetch(`/api/orders/${id}`, { method: "GET", token });
}

export function createOrder(token, payload) {
  return apiFetch("/api/orders", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function cancelOrder(token, id) {
  return apiFetch(`/api/orders/${id}/cancel`, { method: "PUT", token });
}

export function generatePickList(token, orderId) {
  return apiFetch(`/api/orders/${orderId}/picklist`, {
    method: "POST",
    token,
    body: JSON.stringify({})
  });
}

export function getPickLists(token) {
  return apiFetch("/api/picklists", { method: "GET", token });
}

export function getPickList(token, id) {
  return apiFetch(`/api/picklists/${id}`, { method: "GET", token });
}

export function completePickList(token, id) {
  return apiFetch(`/api/picklists/${id}/complete`, {
    method: "POST",
    token,
    body: JSON.stringify({})
  });
}

export function getFulfillmentSummary(token) {
  return apiFetch("/api/fulfillment/summary", { method: "GET", token });
}

export function getDashboardOverview(token) {
  return apiFetch("/api/dashboard/overview", { method: "GET", token });
}
