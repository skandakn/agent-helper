import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onApiError } from "../services/api";
import { isApiError } from "../services/errors";

const NotificationContext = createContext(null);

const DEFAULT_TTL_MS = { error: 12000, warning: 8000, success: 4000, info: 6000 };

let nextId = 0;

/**
 * One place where failures become something the person can see.
 *
 * Every API failure already flows through `onApiError`, so components no
 * longer each decide whether to render `err.message`, swallow it, or leave a
 * spinner running. Repeated failures of the same kind collapse into one toast
 * with a count instead of stacking — a backend that is down produces one
 * notice, not one per poll tick.
 */
export function NotificationProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  // key -> id, resolved before the state update. A React 18 state updater runs
  // during the next render, not at call time, so an id assigned inside one is
  // not available to the code that schedules the auto-dismiss timer.
  const idsByKey = useRef(new Map());

  const dismiss = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    for (const [key, value] of idsByKey.current) {
      if (value === id) idsByKey.current.delete(key);
    }
  }, []);

  const notify = useCallback(
    ({ tone = "info", title, message, dedupeKey, action = null, ttlMs }) => {
      const key = dedupeKey || `${tone}:${title}:${message}`;
      const existingId = idsByKey.current.get(key);
      const id = existingId ?? (nextId += 1);
      if (existingId === undefined) idsByKey.current.set(key, id);

      setItems((current) => {
        const existing = current.find((item) => item.id === id);
        if (existing) {
          return current.map((item) =>
            item.id === id ? { ...item, count: item.count + 1, message, at: Date.now() } : item
          );
        }
        return [
          ...current.slice(-4),
          { id, key, tone, title, message, action, count: 1, at: Date.now() },
        ];
      });

      const life = ttlMs ?? DEFAULT_TTL_MS[tone] ?? DEFAULT_TTL_MS.info;
      if (life > 0) {
        const previous = timers.current.get(id);
        if (previous) clearTimeout(previous);
        // Repeats of the same notification extend its life rather than letting
        // it disappear while failures are still arriving.
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), life)
        );
      }
      return id;
    },
    [dismiss]
  );

  // Drain the API client's error stream into toasts.
  useEffect(
    () =>
      onApiError((err) => {
        if (!isApiError(err)) return;
        notify({
          tone: err.kind === "offline" ? "warning" : "error",
          title: TITLES[err.kind] || TITLES.unknown,
          message: err.message,
          // One toast per failure kind + endpoint, however many times it fires.
          dedupeKey: `api:${err.kind}:${err.path}`,
        });
      }),
    [notify]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ items, notify, dismiss }), [items, notify, dismiss]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationTray items={items} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

const TITLES = {
  offline: "You're offline",
  timeout: "The backend didn't answer in time",
  network: "Can't reach the backend",
  unauthorized: "Your session expired",
  forbidden: "Not allowed",
  not_found: "Not found",
  validation: "Check the form",
  conflict: "Someone else changed this",
  rate_limited: "Too many requests",
  server: "The backend hit an error",
  unknown: "Something went wrong",
};

const TONE_COLOR = {
  error: "var(--error)",
  warning: "var(--warn, #f5a524)",
  success: "var(--ok)",
  info: "var(--info)",
};

function NotificationTray({ items, onDismiss }) {
  if (!items.length) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: "min(420px, calc(100vw - 32px))",
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          className="panel panel-pad"
          style={{
            borderLeft: `3px solid ${TONE_COLOR[item.tone] || TONE_COLOR.info}`,
            padding: "12px 14px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          }}
        >
          <div className="row-between" style={{ gap: 12, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {item.title}
                {item.count > 1 && (
                  <span className="mono" style={{ color: "var(--text-dim)", marginLeft: 8, fontSize: 12 }}>
                    ×{item.count}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4, wordBreak: "break-word" }}>
                {item.message}
              </div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onDismiss(item.id)}
              aria-label="Dismiss notification"
              style={{ flexShrink: 0 }}
            >
              ×
            </button>
          </div>
          {item.action && (
            <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={item.action.onClick}>
              {item.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
