import { CheckCircle2, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { MAX_WAKE_MS, WARMUP } from "../lib/coldstart";
import { useTranslation } from "../lib/i18n/context";

/**
 * "Waking the backend up" banner.
 *
 * A cold start on Render's free tier takes tens of seconds. Without this the
 * console showed a red "unreachable" pill for that whole window, which reads
 * as a broken deployment rather than a sleeping one.
 */
export default function ColdStartBanner({ warmup }) {
  const { t } = useTranslation();
  const { phase, elapsedMs, progress, lastWakeMs, retry } = warmup;

  if (phase === WARMUP.IDLE) return null;

  const seconds = Math.round(elapsedMs / 1000);

  if (phase === WARMUP.WARM) {
    return (
      <Shell tone="ok">
        <CheckCircle2 size={18} color="var(--ok)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 15 }}>{t("coldStart.readyTitle")}</strong>{" "}
          <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
            {t("coldStart.readyDetail", { seconds: Math.round((lastWakeMs || 0) / 1000) })}
          </span>
        </div>
      </Shell>
    );
  }

  if (phase === WARMUP.FAILED) {
    return (
      <Shell tone="error">
        <CloudOff size={18} color="var(--error)" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 15 }}>{t("coldStart.failedTitle")}</strong>{" "}
          <span style={{ fontSize: 14, color: "var(--text-muted)" }}>
            {t("coldStart.failedDetail", { seconds: Math.round(MAX_WAKE_MS / 1000) })}
          </span>
        </div>
        <button className="btn btn-sm" onClick={retry} style={{ flexShrink: 0 }}>
          <RefreshCw size={14} /> {t("common.checkNow")}
        </button>
      </Shell>
    );
  }

  return (
    <Shell tone="warn">
      <Loader2 size={18} className="spin" style={{ flexShrink: 0, color: "var(--info)" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row-between" style={{ gap: 12 }}>
          <strong style={{ fontSize: 15 }}>{t("coldStart.wakingTitle")}</strong>
          <span className="mono" style={{ fontSize: 13, color: "var(--text-dim)", flexShrink: 0 }}>
            {seconds}s
          </span>
        </div>
        <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
          {t("coldStart.wakingDetail")}
        </div>
        <div
          className="manifest-track"
          style={{ marginTop: 10, height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("coldStart.wakingTitle")}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background: "linear-gradient(90deg, var(--info), var(--purple))",
              transition: "width 0.5s linear",
            }}
          />
        </div>
      </div>
    </Shell>
  );
}

const TONE_BORDER = {
  ok: "rgba(61,220,151,0.4)",
  warn: "var(--border-strong)",
  error: "rgba(255,92,122,0.35)",
};

function Shell({ tone, children }) {
  return (
    <div
      className="panel panel-pad"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        marginBottom: 18,
        borderColor: TONE_BORDER[tone] || TONE_BORDER.warn,
      }}
    >
      {children}
    </div>
  );
}
