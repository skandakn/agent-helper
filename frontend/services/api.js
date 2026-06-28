const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
  } catch (err) {
    const e = new Error(`Couldn't reach the backend at ${BASE}. Is it running?`);
    e.cause = err;
    e.network = true;
    throw e;
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* body wasn't JSON */
    }
    const err = new Error(detail || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export const api = {
  baseUrl: BASE,

  /** Lightweight reachability probe for the system-status pill. */
  async checkHealth() {
    try {
      const res = await fetch(`${BASE}/`, { method: "GET" });
      return res.ok || res.status < 500;
    } catch {
      return false;
    }
  },

  // ── missions (events) ────────────────────────────────────────────
  // NOTE: GET /events is not in the original backend spec — see README
  // "API contract" section. The frontend tries it and falls back to the
  // locally-cached recent-missions list if it's not implemented yet.
  async listEvents(projectId = 1) {
    return request(`/events?project_id=${projectId}`);
  },

  async launchEvent(payload) {
    return request("/events/launch", { method: "POST", body: JSON.stringify(payload) });
  },

  async getEventStatus(eventId) {
    return request(`/events/${eventId}/status`);
  },

  async getEventOutput(eventId) {
    return request(`/events/${eventId}/output`);
  },

  // Not in the original spec — used by Campaign Builder's "Save changes".
  async updateEvent(eventId, patch) {
    return request(`/events/${eventId}`, { method: "PATCH", body: JSON.stringify(patch) });
  },

  // ── memory explorer ──────────────────────────────────────────────
  async searchMemory(query, { collection, topK = 5 } = {}) {
    const params = new URLSearchParams({ query, top_k: String(topK) });
    if (collection) params.set("collection", collection);
    return request(`/memory/search?${params.toString()}`);
  },

  // ── analytics ─────────────────────────────────────────────────────
  async getAnalyticsSummary() {
    return request("/analytics/summary");
  },

  // ── settings ──────────────────────────────────────────────────────
  async getSettings() {
    return request("/settings");
  },

  async saveSettings(payload) {
    return request("/settings", { method: "PUT", body: JSON.stringify(payload) });
  },
};
