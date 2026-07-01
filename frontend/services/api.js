const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const STAGE_KEYS = ["research", "branding", "content", "social_media", "operations", "critic"];

let authTokenProvider = null;

export function setAuthTokenProvider(provider) {
  authTokenProvider = typeof provider === "function" ? provider : null;
}

function completeProgress() {
  return Object.fromEntries(STAGE_KEYS.map((key) => [key, 100]));
}

export function normalizeConstraints(constraints = {}) {
  const budget = constraints.budget ?? constraints.budget_inr ?? 500000;
  const duration = constraints.duration_days ?? 60;
  const teamSize = constraints.team_size ?? 5;
  return {
    ...constraints,
    budget: Number(budget) || 0,
    budget_inr: Number(budget) || 0,
    duration_days: clampNumber(duration, 1, 730, 60),
    team_size: clampNumber(teamSize, 1, 50, 5),
    currency: constraints.currency || "INR",
  };
}

function clampNumber(value, min, max, fallback) {
  if (value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

export function normalizeEventRecord(event = {}) {
  const brief = event.brief || {};
  const constraints = normalizeConstraints(brief.constraints || event.constraints || {});
  const status = event.status || "planning";
  const progress =
    event.progress && Object.keys(event.progress).length
      ? event.progress
      : status === "ready" || status === "launched"
        ? completeProgress()
        : {};

  return {
    ...event,
    id: event.id ?? event.event_id,
    theme: event.theme || brief.theme || event.title || "",
    goals: event.goals || brief.goals || "",
    audience: event.audience || brief.audience || "",
    constraints,
    status,
    progress,
    createdAt: event.createdAt || event.created_at,
    updatedAt: event.updatedAt || event.updated_at,
  };
}

function normalizeLaunchPayload(payload = {}) {
  const theme = (payload.theme || "").trim();
  const goals =
    (payload.goals || "").trim() || "Generate a complete launch-ready hackathon campaign package.";
  const audience =
    (payload.audience || "").trim() ||
    "builders, students, sponsors, mentors, judges, and community partners";
  return {
    ...payload,
    theme,
    goals,
    audience,
    constraints: normalizeConstraints(payload.constraints || {}),
  };
}

async function request(path, options = {}) {
  let res;
  try {
    const token = authTokenProvider ? await authTokenProvider() : null;
    res = await fetchWithOptionalToken(path, options, token);
    if (res.status === 401 && token) {
      res = await fetchWithOptionalToken(path, options, null);
    }
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
      detail = formatApiError(body.detail || body.message || detail);
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

function fetchWithOptionalToken(path, options, token) {
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders, ...(options.headers || {}) },
    ...options,
  });
}

function formatApiError(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        const path = Array.isArray(item?.loc) ? item.loc.join(".") : "";
        const message = item?.msg || JSON.stringify(item);
        return path ? `${path}: ${message}` : message;
      })
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    return detail.message || detail.msg || JSON.stringify(detail);
  }
  return String(detail || "Request failed");
}

export const api = {
  baseUrl: BASE,

  /** Lightweight reachability probe for the system-status pill. */
  async checkHealth() {
    try {
      const res = await fetch(`${BASE}/health`, { method: "GET" });
      return res.ok || res.status < 500;
    } catch {
      return false;
    }
  },

  // ── missions (events) ────────────────────────────────────────────
  // The frontend also keeps a local cache so the dashboard remains useful
  // when the backend is offline.
  async listEvents(projectId = 1) {
    const data = await request(`/events?project_id=${projectId}`);
    return Array.isArray(data) ? data.map(normalizeEventRecord) : data;
  },

  async launchEvent(payload) {
    return request("/events/launch", { method: "POST", body: JSON.stringify(normalizeLaunchPayload(payload)) });
  },

  async getEvent(eventId) {
    return normalizeEventRecord(await request(`/events/${eventId}`));
  },

  async deleteEvent(eventId) {
    return request(`/events/${eventId}`, { method: "DELETE" });
  },

  async getEventStatus(eventId) {
    return request(`/events/${eventId}/status`);
  },

  async getEventOutput(eventId) {
    return request(`/events/${eventId}/output`);
  },

  // Used by Campaign Builder's save/edit path.
  async updateEvent(eventId, patch) {
    return request(`/events/${eventId}/output`, { method: "PATCH", body: JSON.stringify(patch) });
  },

  // ── memory explorer ──────────────────────────────────────────────
  async searchMemory(query, { collection, topK = 5 } = {}) {
    const params = new URLSearchParams({ query, top_k: String(topK) });
    if (collection) params.set("collection", collection);
    return request(`/memory/search?${params.toString()}`);
  },

  // ── analytics ─────────────────────────────────────────────────────
  async getAnalyticsSummary() {
    return request("/analytics/overview");
  },

  // ── settings ──────────────────────────────────────────────────────
  async getSettings() {
    return request("/settings");
  },

  async saveSettings(payload) {
    return request("/settings", { method: "PUT", body: JSON.stringify(payload) });
  },
};
