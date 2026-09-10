import { useCallback, useEffect, useRef, useState } from "react";
import { CONNECTION, isUsable } from "./connection";

/**
 * Cold-start detection for a backend that sleeps.
 *
 * The API runs on Render's free tier, which spins an idle instance down and
 * cold-starts it on the next request. The first request after a quiet period
 * therefore takes tens of seconds, during which the console showed either a
 * red "unreachable" pill or nothing at all — both of which read as "this is
 * broken" rather than "this is waking up".
 *
 * The signal is a probe that is slow or fails on transport (timeout / network)
 * while the device itself is online. That is distinguishable from a genuine
 * outage only by waiting, so this keeps probing on a short cadence and shows
 * elapsed progress against an expected wake time, which it calibrates from the
 * last wake it actually observed.
 */

/** A probe still in flight after this long means the instance is waking. */
const SLOW_PROBE_MS = 1800;
/** How often to re-probe while waking. */
const RETRY_INTERVAL_MS = 3000;
/** Give up and call it an outage after this long. */
export const MAX_WAKE_MS = 120000;
/** Starting estimate before we have observed a wake on this device. */
const DEFAULT_EXPECTED_MS = 55000;
const STORAGE_KEY = "launchcontrol:last-wake-ms";

export const WARMUP = {
  IDLE: "idle",
  WAKING: "waking",
  WARM: "warm",
  FAILED: "failed",
};

function readExpectedWakeMs() {
  if (typeof window === "undefined") return DEFAULT_EXPECTED_MS;
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(stored) && stored > 2000 && stored < MAX_WAKE_MS) return stored;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_EXPECTED_MS;
}

function rememberWakeMs(ms) {
  if (typeof window === "undefined") return;
  try {
    // Smooth against one unlucky sample rather than overwriting outright.
    const previous = readExpectedWakeMs();
    window.localStorage.setItem(STORAGE_KEY, String(Math.round(previous * 0.5 + ms * 0.5)));
  } catch {
    /* storage unavailable */
  }
}

/** Transport failures that a sleeping instance produces. */
function looksLikeSleep(probe) {
  if (!probe || probe.ok) return false;
  return probe.outcome === "timeout" || probe.outcome === "network";
}

/**
 * Progress is an estimate, not a measurement — the backend cannot report how
 * far along its own boot is. It approaches but never reaches 100%, so the bar
 * completing always means the backend actually answered.
 */
export function estimateProgress(elapsedMs, expectedMs) {
  if (elapsedMs <= 0) return 0;
  const ratio = elapsedMs / Math.max(expectedMs, 1000);
  // Asymptotic: 63% at the expected time, ~86% at twice it, never 100.
  return Math.min(95, Math.round((1 - Math.exp(-ratio)) * 100));
}

/**
 * @param {{ state: string, probe: object|null, check: () => Promise<void> }} connection
 *   The shared connection machine from `useConnection`, so this adds no second
 *   polling loop in the steady state.
 */
export function useColdStart({ state, probe, check }) {
  const [phase, setPhase] = useState(WARMUP.IDLE);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastWakeMs, setLastWakeMs] = useState(null);

  const startedAtRef = useRef(null);
  const expectedRef = useRef(DEFAULT_EXPECTED_MS);
  const checkingSinceRef = useRef(null);

  useEffect(() => {
    expectedRef.current = readExpectedWakeMs();
  }, []);

  const beginWaking = useCallback(() => {
    if (startedAtRef.current != null) return;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setPhase(WARMUP.WAKING);
  }, []);

  const finish = useCallback((nextPhase) => {
    const started = startedAtRef.current;
    startedAtRef.current = null;
    checkingSinceRef.current = null;
    if (nextPhase === WARMUP.WARM && started != null) {
      const took = Date.now() - started;
      rememberWakeMs(took);
      expectedRef.current = readExpectedWakeMs();
      setLastWakeMs(took);
    }
    setPhase(nextPhase);
  }, []);

  // Decide, from the connection state, whether we are waking.
  useEffect(() => {
    if (isUsable(state)) {
      if (startedAtRef.current != null) finish(WARMUP.WARM);
      else checkingSinceRef.current = null;
      return;
    }

    if (state === CONNECTION.OFFLINE) {
      // The device has no network. Not a cold start.
      startedAtRef.current = null;
      checkingSinceRef.current = null;
      setPhase(WARMUP.IDLE);
      return;
    }

    if (state === CONNECTION.CHECKING) {
      if (checkingSinceRef.current == null) checkingSinceRef.current = Date.now();
      return;
    }

    if (state === CONNECTION.UNREACHABLE && looksLikeSleep(probe)) {
      beginWaking();
    }
  }, [state, probe, beginWaking, finish]);

  // A probe that has been in flight for a while is itself the signal.
  useEffect(() => {
    if (state !== CONNECTION.CHECKING) return undefined;
    const timer = setTimeout(() => {
      if (checkingSinceRef.current != null) beginWaking();
    }, SLOW_PROBE_MS);
    return () => clearTimeout(timer);
  }, [state, beginWaking]);

  // While waking: tick the elapsed clock and keep re-probing.
  useEffect(() => {
    if (phase !== WARMUP.WAKING) return undefined;

    const tick = setInterval(() => {
      const started = startedAtRef.current;
      if (started == null) return;
      const elapsed = Date.now() - started;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_WAKE_MS) finish(WARMUP.FAILED);
    }, 500);

    const retry = setInterval(() => {
      check();
    }, RETRY_INTERVAL_MS);

    return () => {
      clearInterval(tick);
      clearInterval(retry);
    };
  }, [phase, check, finish]);

  // Let the "it's up" confirmation linger briefly, then get out of the way.
  useEffect(() => {
    if (phase !== WARMUP.WARM) return undefined;
    const timer = setTimeout(() => setPhase(WARMUP.IDLE), 6000);
    return () => clearTimeout(timer);
  }, [phase]);

  return {
    phase,
    elapsedMs,
    lastWakeMs,
    expectedMs: expectedRef.current,
    progress: estimateProgress(elapsedMs, expectedRef.current),
    /** True when the backend reports it started serving very recently. */
    backendJustStarted: Boolean(probe?.payload?.cold_start),
    retry: check,
  };
}
