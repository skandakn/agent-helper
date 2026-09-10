import { probeBackend } from "./health";
import { ApiError, ERROR_KIND, formatDetail, kindForStatus } from "./errors";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const STAGE_KEYS = ["research", "branding", "content", "social_media", "operations", "critic"];

let authTokenProvider = null;
let clientScope = "anonymous";

export function setAuthTokenProvider(provider) {
  authTokenProvider = typeof provider === "function" ? provider : null;
}

export function setApiClientScope(scope) {
  clientScope = sanitizeClientScope(scope || "anonymous");
}

function sanitizeClientScope(scope) {
  return String(scope || "anonymous").replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 160) || "anonymous";
}

function createClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getClientId() {
  const scope = sanitizeClientScope(clientScope);
  if (typeof window === "undefined" || !window.localStorage) return scope;

  const key = `launchcontrol:client-id:${scope}`;
  try {
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = createClientId();
      window.localStorage.setItem(key, id);
    }
    return `${scope}:${id}`;
  } catch {
    return scope;
  }
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

const DEFAULT_TIMEOUT_MS = 20000;
/** Retries applied to safe, idempotent requests only. */
const RETRYABLE_METHODS = new Set(["GET", "HEAD"]);
const MAX_ATTEMPTS = 3;

/**
 * Anyone who wants to see every API failure — the notification layer
 * subscribes here so error reporting does not have to be repeated at each
 * call site.
 */
const errorListeners = new Set();

export function onApiError(listener) {
  errorListeners.add(listener);
  return () => errorListeners.delete(listener);
}

function reportError(err) {
  errorListeners.forEach((listener) => {
    try {
      listener(err);
    } catch {
      /* a broken listener must not break the request path */
    }
  });
  return err;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const retries = RETRYABLE_METHODS.has(method) && options.retry !== false ? MAX_ATTEMPTS : 1;

  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await attemptRequest(path, options, method);
    } catch (err) {
      lastError = err;
      const canRetry = attempt < retries && err.retryable && err.kind !== ERROR_KIND.OFFLINE;
      if (!canRetry) break;
      // Exponential backoff with jitter, so a backend that just came back up
      // does not take a thundering herd from every open tab.
      await sleep(Math.round(Math.random() * 300 * 2 ** (attempt - 1)) + 150);
    }
  }
  // Background pollers pass `silent` so a sleeping backend produces one banner
  // from the health probe rather than a toast every tick.
  throw options.silent ? lastError : reportError(lastError);
}

async function attemptRequest(path, options, method) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new ApiError(ERROR_KIND.OFFLINE, "This device is offline.", { path });
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const external = options.signal;
  const forwardAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", forwardAbort, { once: true });
  }

  let res;
  try {
    const token = authTokenProvider ? await authTokenProvider() : null;
    res = await fetchWithOptionalToken(path, options, token, controller.signal);
  } catch (err) {
    const timedOut = controller.signal.aborted && !external?.aborted;
    if (timedOut) {
      throw new ApiError(
        ERROR_KIND.TIMEOUT,
        `${BASE}${path} did not answer within ${Math.round(timeoutMs / 1000)}s.`,
        { path, cause: err }
      );
    }
    throw new ApiError(ERROR_KIND.NETWORK, `Couldn't reach the backend at ${BASE}.`, {
      path,
      cause: err,
    });
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener("abort", forwardAbort);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = formatDetail(body.detail ?? body.message ?? detail) || detail;
    } catch {
      /* body wasn't JSON */
    }
    throw new ApiError(kindForStatus(res.status), detail || `Request failed (${res.status})`, {
      status: res.status,
      detail,
      path,
    });
  }

  if (res.status === 204) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function fetchWithOptionalToken(path, options, token, signal) {
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const { timeoutMs, retry, silent, signal: _ignored, ...fetchOptions } = options;
  return fetch(`${BASE}${path}`, {
    ...fetchOptions,
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-Launch-Client-Id": getClientId(),
      ...authHeaders,
      ...(options.headers || {}),
    },
  });
}

export const api = {
  baseUrl: BASE,

  /**
   * Reachability probe for the system-status pill and the Settings panel.
   *
   * Always resolves inside `timeoutMs` and reports why it failed, so callers
   * never have to sit on an indeterminate "unknown" state while a sleeping
   * instance wakes up.
   */
  async getHealth(options = {}) {
    return probeBackend(BASE, options);
  },

  /** Boolean form kept for call sites that only need reachable / not. */
  async checkHealth(options = {}) {
    const probe = await probeBackend(BASE, options);
    return probe.ok;
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

  async getEventStatus(eventId, { silent = false } = {}) {
    return request(`/events/${eventId}/status`, { silent });
  },

  async getEventOutput(eventId) {
    return request(`/events/${eventId}/output`);
  },

  /**
   * Buffered progress frames after `since` — the REST twin of the WebSocket
   * replay, used when a socket cannot be established or when the server could
   * not prove its replay was complete.
   */
  async getEventProgress(eventId, since = 0, { silent = true } = {}) {
    return request(`/events/${eventId}/progress?since=${Number(since) || 0}`, { silent });
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

  // ── prompt templates ─────────────────────────────────────────────
  async listPrompts() {
    return request("/prompts");
  },

  async getPrompt(name) {
    return request(`/prompts/${encodeURIComponent(name)}`);
  },

  async getPromptVersions(name) {
    return request(`/prompts/${encodeURIComponent(name)}/versions`);
  },

  /** Render a template (optionally unsaved editor content) without storing it. */
  async previewPrompt(name, { variables = {}, system, user } = {}) {
    return request(`/prompts/${encodeURIComponent(name)}/preview`, {
      method: "POST",
      body: JSON.stringify({ variables, system, user }),
    });
  },

  async savePrompt(name, { system, user, description }) {
    return request(`/prompts/${encodeURIComponent(name)}`, {
      method: "PUT",
      body: JSON.stringify({ system, user, description }),
    });
  },

  async revertPrompt(name, version) {
    return request(`/prompts/${encodeURIComponent(name)}/revert/${version}`, { method: "POST" });
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
