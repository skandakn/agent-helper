const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

/** Link states surfaced to the UI. */
export const LINK = {
  CONNECTING: "connecting",
  LIVE: "live",
  RECONNECTING: "reconnecting",
  OFFLINE: "offline",
  CLOSED: "closed",
};

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 20000;
/** Heartbeat cadence and the silence after which we assume a half-open socket. */
const PING_INTERVAL_MS = 25000;
const SILENCE_TIMEOUT_MS = 70000;

/**
 * Full-jitter exponential backoff (AWS's "Exponential Backoff and Jitter").
 * The old client used a bare `2 ** attempt`, so every monitor tab reconnected
 * in lockstep after a backend restart.
 */
export function backoffDelay(attempt, random = Math.random) {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(random() * ceiling);
}

/**
 * Open a resilient subscription to /ws/{eventId}.
 *
 * Beyond reconnecting, this tracks the highest progress `seq` it has seen and
 * re-subscribes with `?since=<seq>`, so frames emitted while the socket was
 * down are replayed instead of lost. Previously a drop during the branding
 * stage left the monitor showing later stages at 0% forever, because their
 * completion frames had gone to a socket that no longer existed.
 *
 * @param {string|number} eventId
 * @param {{
 *   onMessage?: (msg: object) => void,
 *   onState?: (state: string, meta: object) => void,
 *   onReplayGap?: (meta: object) => void,
 *   since?: number,
 * }} handlers
 */
export function connectToEvent(eventId, { onMessage, onState, onReplayGap, since = 0 } = {}) {
  let socket = null;
  let closedByClient = false;
  let attempt = 0;
  let retryTimer = null;
  let pingTimer = null;
  let silenceTimer = null;
  let lastSeq = Number(since) || 0;
  let state = null;

  function setState(next, meta = {}) {
    if (state === next && !meta.force) return;
    state = next;
    onState && onState(next, { attempt, lastSeq, ...meta });
  }

  function clearTimers() {
    if (retryTimer) clearTimeout(retryTimer);
    if (pingTimer) clearInterval(pingTimer);
    if (silenceTimer) clearTimeout(silenceTimer);
    retryTimer = pingTimer = silenceTimer = null;
  }

  function noteTraffic() {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      // Nothing at all for over a minute, not even a pong: the socket is
      // half-open (proxy idle timeout, sleeping laptop). readyState still
      // says OPEN, so force a close to trigger the reconnect path.
      if (socket && socket.readyState === WebSocket.OPEN) socket.close();
    }, SILENCE_TIMEOUT_MS);
  }

  function scheduleReconnect() {
    if (closedByClient) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setState(LINK.OFFLINE);
      return; // the "online" listener reconnects immediately instead
    }
    attempt += 1;
    const delay = backoffDelay(attempt);
    setState(LINK.RECONNECTING, { nextRetryMs: delay, force: true });
    retryTimer = setTimeout(open, delay);
  }

  function open() {
    if (closedByClient) return;
    setState(attempt === 0 ? LINK.CONNECTING : LINK.RECONNECTING);

    try {
      socket = new WebSocket(`${WS_BASE}/ws/${eventId}?since=${lastSeq}`);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      attempt = 0;
      setState(LINK.LIVE, { force: true });
      noteTraffic();
      pingTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) socket.send("ping");
      }, PING_INTERVAL_MS);
    };

    socket.onmessage = (e) => {
      noteTraffic();
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return; /* ignore malformed frame */
      }

      if (msg.stage === "pong") return;

      if (typeof msg.seq === "number" && msg.seq > lastSeq) lastSeq = msg.seq;

      if (msg.stage === "connected") {
        const replay = msg.replay || {};
        // The server could not prove it still held every frame we missed —
        // the caller should reconcile from REST rather than trust the stream.
        if (replay.complete === false) {
          onReplayGap && onReplayGap({ ...replay, lastSeq });
        }
        return;
      }

      onMessage && onMessage(msg);
    };

    socket.onerror = () => {
      /* onclose always follows; reconnect is handled there */
    };

    socket.onclose = () => {
      if (pingTimer) clearInterval(pingTimer);
      if (silenceTimer) clearTimeout(silenceTimer);
      pingTimer = silenceTimer = null;
      if (closedByClient) {
        setState(LINK.CLOSED);
        return;
      }
      scheduleReconnect();
    };
  }

  function reconnectNow() {
    if (closedByClient) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    attempt = 0;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    open();
  }

  const onOnline = () => reconnectNow();
  const onOffline = () => setState(LINK.OFFLINE);
  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") reconnectNow();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
  }

  open();

  return {
    /** Highest progress seq received so far. */
    get lastSeq() {
      return lastSeq;
    },
    /** Let the caller seed the cursor from a REST reconciliation. */
    setLastSeq(seq) {
      if (typeof seq === "number" && seq > lastSeq) lastSeq = seq;
    },
    reconnectNow,
    close() {
      closedByClient = true;
      clearTimers();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        document.removeEventListener("visibilitychange", onVisibility);
      }
      socket && socket.close();
    },
  };
}
