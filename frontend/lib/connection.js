/**
 * Explicit connection/health state machine.
 *
 * The console previously carried a tri-state `online: null | true | false`
 * where `null` meant three different things at once — "not checked yet",
 * "check in flight", and "check failed in a way we did not model" — and it
 * rendered all three as UNKNOWN. This module names every state, defines the
 * legal transitions between them, and derives the state from the backend's
 * dependency-aware /health contract rather than from a bare boolean.
 */

export const CONNECTION = {
  /** No probe has been dispatched yet. The only transient state. */
  UNKNOWN: "unknown",
  /** A probe is in flight. */
  CHECKING: "checking",
  /** Backend answered and every required dependency is healthy. */
  ONLINE: "online",
  /** Backend answered but something is running on a fallback. */
  DEGRADED: "degraded",
  /** Backend answered but a required dependency is down, or startup failed. */
  IMPAIRED: "impaired",
  /** No answer: timeout, DNS/CORS failure, or an HTTP error response. */
  UNREACHABLE: "unreachable",
  /** This device has no network at all — not the backend's fault. */
  OFFLINE: "offline",
};

/**
 * Legal transitions. Anything not listed is a bug in the caller, and
 * `nextConnectionState` will log it in development rather than silently
 * accepting an impossible move.
 */
export const TRANSITIONS = {
  [CONNECTION.UNKNOWN]: [CONNECTION.CHECKING, CONNECTION.OFFLINE],
  [CONNECTION.CHECKING]: [
    CONNECTION.ONLINE,
    CONNECTION.DEGRADED,
    CONNECTION.IMPAIRED,
    CONNECTION.UNREACHABLE,
    CONNECTION.OFFLINE,
  ],
  [CONNECTION.ONLINE]: [CONNECTION.CHECKING, CONNECTION.OFFLINE],
  [CONNECTION.DEGRADED]: [CONNECTION.CHECKING, CONNECTION.OFFLINE],
  [CONNECTION.IMPAIRED]: [CONNECTION.CHECKING, CONNECTION.OFFLINE],
  [CONNECTION.UNREACHABLE]: [CONNECTION.CHECKING, CONNECTION.OFFLINE],
  [CONNECTION.OFFLINE]: [CONNECTION.CHECKING, CONNECTION.UNKNOWN],
};

export function nextConnectionState(current, target) {
  const allowed = TRANSITIONS[current] || [];
  if (current === target || allowed.includes(target)) return target;
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[connection] illegal transition ${current} -> ${target}`);
  }
  return target;
}

/** States in which the app should treat the backend as usable. */
export function isUsable(state) {
  return state === CONNECTION.ONLINE || state === CONNECTION.DEGRADED;
}

/** States that warrant a red indicator rather than an amber one. */
export function isFailure(state) {
  return (
    state === CONNECTION.UNREACHABLE ||
    state === CONNECTION.IMPAIRED ||
    state === CONNECTION.OFFLINE
  );
}

export function badgeClass(state) {
  if (isUsable(state)) return state === CONNECTION.DEGRADED ? "warn" : "ok";
  if (isFailure(state)) return "error";
  return "warn";
}

export const STATE_LABEL_KEYS = {
  [CONNECTION.UNKNOWN]: "connection.unchecked",
  [CONNECTION.CHECKING]: "connection.checking",
  [CONNECTION.ONLINE]: "connection.online",
  [CONNECTION.DEGRADED]: "connection.degraded",
  [CONNECTION.IMPAIRED]: "connection.impaired",
  [CONNECTION.UNREACHABLE]: "connection.unreachable",
  [CONNECTION.OFFLINE]: "connection.deviceOffline",
};

export function stateLabelKey(state) {
  return STATE_LABEL_KEYS[state] || "connection.unchecked";
}

/**
 * Map a probe result (see services/health.js) onto a connection state.
 *
 * When the probe carried a deep /health payload the dependency report decides
 * the state; otherwise reachability alone does.
 */
export function deriveConnectionState(probe) {
  if (!probe) return CONNECTION.UNKNOWN;
  if (probe.outcome === "offline") return CONNECTION.OFFLINE;
  if (!probe.ok) return CONNECTION.UNREACHABLE;

  const report = probe.payload;
  if (!report || typeof report.status !== "string") return CONNECTION.ONLINE;

  switch (report.status) {
    case "ok":
      return CONNECTION.ONLINE;
    case "degraded":
      return CONNECTION.DEGRADED;
    case "down":
    case "starting":
      return CONNECTION.IMPAIRED;
    default:
      return CONNECTION.ONLINE;
  }
}

/** Dependency rows from a deep report, normalised for rendering. */
export function dependenciesOf(probe) {
  const deps = probe?.payload?.dependencies;
  if (!Array.isArray(deps)) return [];
  return deps.map((dep) => ({
    name: String(dep.name || "unknown"),
    status: String(dep.status || "ok"),
    required: Boolean(dep.required),
    latencyMs: typeof dep.latency_ms === "number" ? dep.latency_ms : null,
    detail: String(dep.detail || ""),
    degradedMode: dep.degraded_mode || null,
  }));
}

/**
 * One-line summary of why the connection is not simply ONLINE.
 * Returns an empty string when there is nothing to explain.
 */
export function explain(state, probe) {
  if (state === CONNECTION.OFFLINE) return "This device reports no network connection.";
  if (state === CONNECTION.UNREACHABLE) return probe?.reason || "The backend did not answer.";
  const failing = dependenciesOf(probe).filter(
    (dep) => dep.status === "degraded" || dep.status === "down"
  );
  if (!failing.length) return "";
  return failing.map((dep) => `${dep.name}: ${dep.detail}`).join(" ");
}
