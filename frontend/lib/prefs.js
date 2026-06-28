const KEY = "launchcontrol:prefs";

const DEFAULTS = {
  notifyOnComplete: false,
  language: "en",
};

export function getPrefs() {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
