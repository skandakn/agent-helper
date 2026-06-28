const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

/**
 * Opens a WebSocket to /ws/{eventId} and auto-reconnects with backoff if the
 * connection drops (e.g. the backend restarts mid-run). Returns a handle
 * with .close() to tear it down deliberately.
 */
export function connectToEvent(eventId, { onMessage, onOpen, onClose, onError } = {}) {
  let socket = null;
  let closedByClient = false;
  let attempt = 0;
  let retryTimer = null;

  function open() {
    socket = new WebSocket(`${WS_BASE}/ws/${eventId}`);

    socket.onopen = (e) => {
      attempt = 0;
      onOpen && onOpen(e);
    };

    socket.onmessage = (e) => {
      try {
        onMessage && onMessage(JSON.parse(e.data));
      } catch {
        /* ignore malformed frame */
      }
    };

    socket.onerror = (e) => {
      onError && onError(e);
    };

    socket.onclose = (e) => {
      onClose && onClose(e);
      if (!closedByClient) {
        attempt += 1;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        retryTimer = setTimeout(open, delay);
      }
    };
  }

  open();

  return {
    close() {
      closedByClient = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket && socket.close();
    },
  };
}
