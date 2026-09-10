import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import {
  CONNECTION,
  deriveConnectionState,
  dependenciesOf,
  explain,
  nextConnectionState,
} from "./connection";

/**
 * Drive the connection state machine from the backend's /health contract.
 *
 * Every consumer gets the same explicit state instead of re-deriving one from
 * a boolean. The hook single-flights its probes, aborts on unmount, and
 * re-checks immediately when the browser regains its network or the tab
 * becomes visible again — the two moments when a stale state is most likely.
 *
 * @param {{ intervalMs?: number, deep?: boolean, timeoutMs?: number }} options
 */
export function useConnection({ intervalMs = 20000, deep = true, timeoutMs = 10000 } = {}) {
  const [state, setState] = useState(CONNECTION.UNKNOWN);
  const [probe, setProbe] = useState(null);

  const stateRef = useRef(state);
  const inFlightRef = useRef(false);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  const move = useCallback((target) => {
    setState((current) => {
      const next = nextConnectionState(current, target);
      stateRef.current = next;
      return next;
    });
  }, []);

  const check = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    move(CONNECTION.CHECKING);

    try {
      const next = await api.getHealth({ signal: controller.signal, timeoutMs, deep });
      if (!mountedRef.current || controller.signal.aborted) return;
      setProbe(next);
      move(deriveConnectionState(next));
    } finally {
      inFlightRef.current = false;
    }
  }, [deep, move, timeoutMs]);

  useEffect(() => {
    mountedRef.current = true;
    check();
    const id = setInterval(check, intervalMs);

    const onOnline = () => check();
    const onOffline = () => move(CONNECTION.OFFLINE);
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") check();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearInterval(id);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [check, intervalMs, move]);

  return {
    state,
    probe,
    check,
    dependencies: dependenciesOf(probe),
    explanation: explain(state, probe),
    checking: state === CONNECTION.CHECKING,
  };
}
