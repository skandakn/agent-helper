/**
 * Backend reachability probe.
 *
 * The old `api.checkHealth()` did `await fetch(BASE + "/health")` with no
 * timeout and collapsed the answer into a boolean. On Render's free tier the
 * API sleeps after ~15 minutes of inactivity and a cold request can hang for
 * 50+ seconds, so the caller's `online` state stayed `null` for the whole
 * wake-up window and the Settings page rendered a resting "Unknown". It also
 * counted any status below 500 as reachable, so a 404 from a mistyped
 * NEXT_PUBLIC_API_URL was reported as a healthy backend.
 *
 * This module always resolves within `timeoutMs` and always says *why*.
 */

export const DEFAULT_PROBE_TIMEOUT_MS = 8000;

/** Why a probe ended the way it did. */
export const PROBE_OUTCOME = {
  ok: "ok",
  httpError: "http_error",
  timeout: "timeout",
  network: "network",
  offline: "offline",
};

function now() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function browserIsOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function result(partial) {
  return {
    ok: false,
    outcome: PROBE_OUTCOME.network,
    httpStatus: null,
    latencyMs: null,
    reason: "",
    payload: null,
    checkedAt: new Date().toISOString(),
    ...partial,
  };
}

/**
 * Probe `GET {baseUrl}/health`.
 *
 * Never throws and never hangs: an aborted or failed request resolves to a
 * result object describing the failure.
 *
 * @param {string} baseUrl
 * @param {{ timeoutMs?: number, signal?: AbortSignal }} options
 * @returns {Promise<{ok: boolean, outcome: string, httpStatus: number|null,
 *   latencyMs: number|null, reason: string, payload: object|null, checkedAt: string}>}
 */
export async function probeBackend(
  baseUrl,
  { timeoutMs = DEFAULT_PROBE_TIMEOUT_MS, signal, deep = false } = {}
) {
  if (browserIsOffline()) {
    return result({
      outcome: PROBE_OUTCOME.offline,
      reason: "This device reports no network connection.",
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forwardAbort, { once: true });
  }

  const started = now();
  try {
    const res = await fetch(`${baseUrl}/health${deep ? "?deep=true" : ""}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    const latencyMs = Math.round(now() - started);

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      /* /health may return a non-JSON body; reachability is what matters here */
    }

    // A deep probe answers 503 when a required dependency is down. The backend
    // is still *reachable*, and the payload says exactly what is wrong, so we
    // keep it rather than collapsing it into a generic transport failure.
    if (res.status === 503 && payload && typeof payload.status === "string") {
      return result({
        ok: true,
        outcome: PROBE_OUTCOME.ok,
        httpStatus: res.status,
        latencyMs,
        payload,
        reason: "",
      });
    }

    if (res.ok) {
      return result({
        ok: true,
        outcome: PROBE_OUTCOME.ok,
        httpStatus: res.status,
        latencyMs,
        payload,
        reason: "",
      });
    }

    return result({
      outcome: PROBE_OUTCOME.httpError,
      httpStatus: res.status,
      latencyMs,
      payload,
      reason: describeHttpFailure(res.status, baseUrl),
    });
  } catch (err) {
    const latencyMs = Math.round(now() - started);
    // The caller aborted deliberately — report it as a timeout only if our own
    // timer fired, otherwise the caller is unmounting and does not care.
    const aborted = err && (err.name === "AbortError" || controller.signal.aborted);
    if (aborted && signal && signal.aborted) {
      return result({ outcome: PROBE_OUTCOME.network, latencyMs, reason: "Check cancelled." });
    }
    if (aborted) {
      return result({
        outcome: PROBE_OUTCOME.timeout,
        latencyMs,
        reason: `No answer from ${baseUrl} within ${Math.round(timeoutMs / 1000)}s. A sleeping free-tier instance can take longer than this to wake.`,
      });
    }
    return result({
      outcome: PROBE_OUTCOME.network,
      latencyMs,
      reason: `Could not reach ${baseUrl}. Check that the API is deployed and that its CORS origins include this site.`,
    });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", forwardAbort);
  }
}

function describeHttpFailure(status, baseUrl) {
  if (status === 404) {
    return `${baseUrl}/health returned 404. NEXT_PUBLIC_API_URL is probably not pointing at the API root.`;
  }
  if (status === 401 || status === 403) {
    return `${baseUrl}/health returned ${status}. The backend is up but is rejecting unauthenticated requests.`;
  }
  if (status >= 500) {
    return `${baseUrl}/health returned ${status}. The backend started but is failing its own health check.`;
  }
  return `${baseUrl}/health returned ${status}.`;
}

/** Short, stable label key for a probe outcome. */
export function probeLabelKey(probe) {
  if (!probe) return "connection.unchecked";
  if (probe.ok) return "connection.reachable";
  if (probe.outcome === PROBE_OUTCOME.timeout) return "connection.timedOut";
  if (probe.outcome === PROBE_OUTCOME.offline) return "connection.deviceOffline";
  if (probe.outcome === PROBE_OUTCOME.httpError) return "connection.errorResponse";
  return "connection.unreachable";
}
