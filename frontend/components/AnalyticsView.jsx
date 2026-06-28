import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { api } from "../services/api";
import { useEventStore } from "../store/event";
import { STAGES } from "../lib/stages";
import { useTranslation } from "../lib/i18n/context";
import { BarChart, DonutChart, CHART_COLORS } from "./Charts";
import JsonBlock from "./JsonBlock";

const STATUS_COLORS = {
  draft: "#6b7594",
  planning: "#ff7a33",
  ready: "#4fb6e8",
  launched: "#3ddc97",
};

export default function AnalyticsView() {
  const { t } = useTranslation();
  const { recent } = useEventStore();
  const [backendSummary, setBackendSummary] = useState(null);
  const [backendError, setBackendError] = useState(null);

  useEffect(() => {
    api.getAnalyticsSummary().then(setBackendSummary).catch(setBackendError);
  }, []);

  const byStatus = recent.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {});

  const stageAverages = STAGES.map((s, i) => {
    const values = recent.map((m) => m.progress?.[s.key] || 0);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    return {
      ...s,
      avg: Math.round(avg),
      label: t(`stages.${s.key}.label`),
      color: CHART_COLORS[i],
    };
  });

  const barData = stageAverages.map((s) => ({
    label: s.label,
    short: s.code,
    value: s.avg,
    color: s.color,
  }));

  const donutData = Object.entries(byStatus).map(([status, count]) => ({
    label: t(`status.${status}`) || status,
    value: count,
    color: STATUS_COLORS[status] || CHART_COLORS[0],
  }));

  return (
    <div className="stack" style={{ maxWidth: 960, gap: 24 }}>
      <div>
        <div className="eyebrow">{t("analytics.eyebrow")}</div>
        <h1 style={{ fontSize: 30, marginTop: 8 }}>{t("analytics.title")}</h1>
      </div>

      <div className="grid-3">
        <StatCard label={t("analytics.totalMissions")} value={recent.length} accent="accent-4" />
        <StatCard
          label={t("analytics.launchedReady")}
          value={(byStatus.launched || 0) + (byStatus.ready || 0)}
          accent="accent-3"
        />
        <StatCard label={t("analytics.inFlight")} value={byStatus.planning || 0} accent="accent-1" />
      </div>

      <div className="grid-2">
        <div className="panel panel-pad panel-colorful">
          <div className="eyebrow" style={{ marginBottom: 16 }}>{t("analytics.stageChart")}</div>
          {recent.length === 0 ? (
            <EmptyNote text={t("analytics.noMissions")} />
          ) : (
            <BarChart data={barData} height={240} />
          )}
        </div>

        <div className="panel panel-pad panel-colorful">
          <div className="eyebrow" style={{ marginBottom: 16 }}>{t("analytics.statusChart")}</div>
          {recent.length === 0 ? (
            <EmptyNote text={t("analytics.noMissions")} />
          ) : (
            <DonutChart data={donutData} size={220} totalLabel={t("charts.total")} />
          )}
        </div>
      </div>

      <div className="panel panel-pad panel-colorful">
        <div className="eyebrow" style={{ marginBottom: 16 }}>{t("analytics.stageCompletion")}</div>
        {recent.length === 0 ? (
          <EmptyNote text={t("analytics.noMissions")} />
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            {stageAverages.map((s) => (
              <div key={s.key}>
                <div className="row-between" style={{ fontSize: 15, marginBottom: 6 }}>
                  <span style={{ color: "var(--text-muted)" }}>
                    <span className="mono" style={{ color: s.color }}>{s.code}</span> {s.label}
                  </span>
                  <span className="mono" style={{ fontSize: 15 }}>{s.avg}%</span>
                </div>
                <div className="manifest-track" style={{ marginTop: 0 }}>
                  <div
                    className="manifest-fill"
                    style={{ width: `${s.avg}%`, background: `linear-gradient(90deg, ${s.color}, ${s.color}88)` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel panel-pad">
        <div className="eyebrow" style={{ marginBottom: 16 }}>{t("analytics.missionsByStatus")}</div>
        {recent.length === 0 ? (
          <EmptyNote text={t("analytics.noMissions")} />
        ) : (
          <div className="row" style={{ gap: 20, flexWrap: "wrap" }}>
            {Object.entries(byStatus).map(([status, count]) => {
              const badgeMap = { planning: "running", ready: "info", launched: "ok", draft: "" };
              return (
                <div key={status} className="row" style={{ gap: 10 }}>
                  <span className={`badge ${badgeMap[status] || ""}`}>{t(`status.${status}`) || status}</span>
                  <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{count}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel panel-pad">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <span className="eyebrow">{t("analytics.backendAnalytics")}</span>
          {!backendSummary && !backendError && (
            <span className="mono" style={{ fontSize: 13, color: "var(--text-dim)" }}>{t("common.loading")}</span>
          )}
        </div>
        {backendSummary && <JsonBlock data={backendSummary} />}
        {backendError && (
          <p style={{ fontSize: 15, color: "var(--text-dim)" }}>
            <BarChart3 size={15} style={{ verticalAlign: "-2px", marginRight: 8 }} />
            {t("analytics.noBackend")}
          </p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className={`panel panel-pad panel-colorful stat-card ${accent}`}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>{label}</div>
      <div className="stat-card-value">{value}</div>
    </div>
  );
}

function EmptyNote({ text }) {
  return <p style={{ fontSize: 15, color: "var(--text-dim)" }}>{text}</p>;
}
