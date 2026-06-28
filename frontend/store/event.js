import { createContext, useCallback, useContext, useEffect, useState } from "react";

const EventContext = createContext(null);

const RECENT_KEY = "launchcontrol:recent-missions";

/**
 * Holds the mission (hackathon "event") currently being viewed, plus a
 * locally-cached list of missions launched from this browser. The cache
 * exists so the Dashboard has something real to show even if the backend
 * doesn't yet implement a `GET /events` listing endpoint (see README) —
 * it is never fabricated data, only what this browser actually launched.
 */
export function EventProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const [recent, setRecent] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {
      /* localStorage unavailable — degrade silently */
    }
    setHydrated(true);
  }, []);

  const persist = useCallback((next) => {
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, []);

  const addRecentMission = useCallback(
    (mission) => {
      setRecent((prev) => {
        const next = [mission, ...prev.filter((m) => m.id !== mission.id)].slice(0, 30);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const updateRecentMission = useCallback(
    (id, patch) => {
      setRecent((prev) => {
        const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m));
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearRecent = useCallback(() => {
    setRecent([]);
    persist([]);
  }, [persist]);

  return (
    <EventContext.Provider
      value={{ current, setCurrent, recent, hydrated, addRecentMission, updateRecentMission, clearRecent }}
    >
      {children}
    </EventContext.Provider>
  );
}

export function useEventStore() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error("useEventStore must be used within an EventProvider");
  return ctx;
}
