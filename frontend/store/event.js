import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const EventContext = createContext(null);

const RECENT_KEY_PREFIX = "launchcontrol:recent-missions";

export function EventProvider({ children, userKey = "anonymous" }) {
  const [current, setCurrent] = useState(null);
  const [recent, setRecent] = useState([]);
  const [hydrated, setHydrated] = useState(false);

  const storageKey = useMemo(() => `${RECENT_KEY_PREFIX}:${userKey || "anonymous"}`, [userKey]);

  useEffect(() => {
    setHydrated(false);
    try {
      const raw = window.localStorage.getItem(storageKey);
      setRecent(raw ? JSON.parse(raw) : []);
    } catch {
      setRecent([]);
    }
    setCurrent(null);
    setHydrated(true);
  }, [storageKey]);

  const persist = useCallback(
    (next) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore quota / privacy-mode errors */
      }
    },
    [storageKey]
  );

  const addRecentMission = useCallback(
    (mission) => {
      setRecent((prev) => {
        const next = [mission, ...prev.filter((m) => String(m.id) !== String(mission.id))].slice(0, 30);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const updateRecentMission = useCallback(
    (id, patch) => {
      setRecent((prev) => {
        const next = prev.map((m) => (String(m.id) === String(id) ? { ...m, ...patch } : m));
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const removeRecentMission = useCallback(
    (id) => {
      setRecent((prev) => {
        const next = prev.filter((m) => String(m.id) !== String(id));
        persist(next);
        return next;
      });
      setCurrent((prev) => (String(prev?.id) === String(id) ? null : prev));
    },
    [persist]
  );

  const clearRecent = useCallback(() => {
    setRecent([]);
    persist([]);
    setCurrent(null);
  }, [persist]);

  return (
    <EventContext.Provider
      value={{
        current,
        setCurrent,
        recent,
        hydrated,
        addRecentMission,
        updateRecentMission,
        removeRecentMission,
        clearRecent,
        userKey,
      }}
    >
      {children}
    </EventContext.Provider>
  );
}

export function useEventStore() {
  const ctx = useContext(EventContext);
  if (!ctx) throw new Error("useEventStore must be used within EventProvider");
  return ctx;
}
