import { useEffect, useState } from "react";
import { RefreshCw, Bell, Trash2, ShieldCheck } from "lucide-react";
import { api } from "../services/api";
import { useEventStore } from "../store/event";
import { getPrefs, setPrefs } from "../lib/prefs";
import { useTranslation } from "../lib/i18n/context";

export default function Settings() {
  const { t } = useTranslation();
  const { recent, clearRecent } = useEventStore();
  const [checking, setChecking] = useState(false);
  const [online, setOnline] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);
  const [prefs, setPrefsState] = useState(getPrefs());
  const [confirmClear, setConfirmClear] = useState(false);
  const [notifPermission, setNotifPermission] = useState("default");

  useEffect(() => {
    check();
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifPermission(Notification.permission);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function check() {
    setChecking(true);
    const ok = await api.checkHealth();
    setOnline(ok);
    setLastChecked(new Date());
    setChecking(false);
  }

  async function toggleNotify(value) {
    if (value && typeof window !== "undefined" && "Notification" in window) {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm !== "granted") value = false;
    }
    setPrefsState(setPrefs({ notifyOnComplete: value }));
  }

  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <div>
        <div className="eyebrow">{t("settings.eyebrow")}</div>
        <h1 style={{ fontSize: 30, marginTop: 8 }}>{t("settings.title")}</h1>
      </div>

      <div className="panel panel-pad panel-colorful">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <span className="eyebrow">{t("settings.connection")}</span>
          <button className="btn btn-ghost btn-sm" onClick={check} disabled={checking}>
            <RefreshCw size={15} className={checking ? "spin" : ""} /> {t("common.checkNow")}
          </button>
        </div>
        <dl style={{ margin: 0 }}>
          <div className="kv">
            <dt>{t("settings.apiBase")}</dt>
            <dd className="mono">{api.baseUrl}</dd>
          </div>
          <div className="kv">
            <dt>{t("settings.status")}</dt>
            <dd>
              <span className={`badge ${online === false ? "error" : online ? "ok" : ""}`}>
                <span className={`status-dot ${online === false ? "error" : online ? "ok" : ""}`} />
                {online === null ? t("common.unknown") : online ? t("settings.reachable") : t("settings.unreachable")}
              </span>
            </dd>
          </div>
          <div className="kv">
            <dt>{t("settings.lastChecked")}</dt>
            <dd>{lastChecked ? lastChecked.toLocaleTimeString() : "—"}</dd>
          </div>
        </dl>
        <p style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 14 }}>
          <ShieldCheck size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          {t("settings.securityNote")}
        </p>
      </div>

      <div className="panel panel-pad">
        <div className="eyebrow" style={{ marginBottom: 16 }}>{t("settings.notifications")}</div>
        <div className="row-between">
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{t("settings.notifyTitle")}</div>
            <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 4 }}>
              {t("settings.notifyDesc")}
              {notifPermission === "denied" && t("settings.notifyBlocked")}
            </div>
          </div>
          <Toggle checked={prefs.notifyOnComplete} onChange={toggleNotify} />
        </div>
      </div>

      <div className="panel panel-pad" style={{ borderColor: "rgba(255,92,122,0.35)" }}>
        <div className="eyebrow" style={{ marginBottom: 16, color: "var(--error)" }}>{t("settings.dangerZone")}</div>
        <div className="row-between">
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{t("settings.clearCache")}</div>
            <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 4 }}>
              {t("settings.clearDesc", { count: recent.length })}
            </div>
          </div>
          {confirmClear ? (
            <div className="row" style={{ gap: 10 }}>
              <button
                className="btn btn-sm"
                style={{ borderColor: "var(--error)", color: "var(--error)" }}
                onClick={() => {
                  clearRecent();
                  setConfirmClear(false);
                }}
              >
                {t("common.confirm")}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(false)}>
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            <button className="btn btn-sm" disabled={recent.length === 0} onClick={() => setConfirmClear(true)}>
              <Trash2 size={15} /> {t("common.clear")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 48,
        height: 28,
        borderRadius: 99,
        border: "1px solid var(--border-strong)",
        background: checked ? "linear-gradient(135deg, var(--accent), var(--pink))" : "var(--bg-elevated)",
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
        transition: "background 0.15s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: checked ? "#fff" : "var(--text-dim)",
          transition: "left 0.15s ease",
        }}
      />
    </button>
  );
}
