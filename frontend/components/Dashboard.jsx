import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, AlertTriangle, ArrowUpRight } from "lucide-react";
import { api } from "../services/api";
import { useEventStore } from "../store/event";
import { STAGES, formatDate } from "../lib/stages";
import { useTranslation } from "../lib/i18n/context";
import { BarChart, Sparkline, StatRing, CHART_COLORS } from "./Charts";

export default function Dashboard() {
  const { t } = useTranslation();
  const { recent, hydrated } = useEventStore();
  const [remote, setRemote] = useState(null);
  const [remoteError, setRemoteError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .listEvents()
      .then((data) => mounted && setRemote(Array.isArray(data) ? data : data?.events || null))
      .catch((err) => mounted && setRemoteError(err))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const missions = remote && remote.length ? remote : recent;
  const showingLocalOnly = !remote || remote.length === 0;

  const activeCount = missions.filter((m) => m.status === "planning").length;
  const completedCount = missions.filter((m) => m.status === "ready" || m.status === "launched").length;
  const avgProgress = missions.length
    ? Math.round(
        missions.reduce((sum, m) => {
          const vals = STAGES.map((s) => m.progress?.[s.key] || 0);
          const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
          return sum + avg;
        }, 0) / missions.length
      )
    : 0;

  const sparkData = missions.slice(0, 8).map((m) => {
    const vals = STAGES.map((s) => m.progress?.[s.key] || 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });

  const stageChartData = STAGES.map((s, i) => {
    const values = missions.map((m) => m.progress?.[s.key] || 0);
    const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
    return { label: t(`stages.${s.key}.label`), short: s.code, value: avg, color: CHART_COLORS[i] };
  });

  function statusLabel(status) {
    return t(`status.${status}`) || t("status.unknown");
  }

  function statusBadge(status) {
    const map = { planning: "running", ready: "info", launched: "ok", draft: "" };
    return map[status] || "";
  }

  return (
    <div className="stack" style={{ gap: 28 }}>
      <div className="row-between">
        <div>
          <div className="eyebrow">{t("dashboard.eyebrow")}</div>
          <h1 style={{ fontSize: 30, marginTop: 8 }}>{t("dashboard.title")}</h1>
        </div>
        <Link href="/create-event" className="btn btn-primary">
          <Plus size={17} /> {t("common.newLaunch")}
        </Link>
      </div>

      {missions.length > 0 && (
        <div className="fleet-overview">
          <div className="panel panel-pad panel-colorful stat-card accent-1">
            <div className="eyebrow" style={{ marginBottom: 10 }}>{t("dashboard.activeMissions")}</div>
            <div className="stat-card-value">{activeCount}</div>
            {sparkData.length > 1 && <Sparkline values={sparkData} color="var(--accent)" />}
          </div>
          <div className="panel panel-pad panel-colorful stat-card accent-3">
            <div className="eyebrow" style={{ marginBottom: 10 }}>{t("dashboard.completedMissions")}</div>
            <div className="stat-card-value">{completedCount}</div>
          </div>
          <div className="panel panel-pad panel-colorful stat-card accent-2">
            <div className="eyebrow" style={{ marginBottom: 10 }}>{t("dashboard.avgProgress")}</div>
            <div className="row" style={{ gap: 16, alignItems: "center" }}>
              <StatRing value={avgProgress} color="var(--info)" label="" />
              <div className="stat-card-value" style={{ fontSize: 28 }}>{avgProgress}%</div>
            </div>
          </div>
          {missions.length > 0 && (
            <div className="panel panel-pad panel-colorful fleet-chart-panel" style={{ gridColumn: "span 1" }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>{t("dashboard.fleetOverview")}</div>
              <BarChart data={stageChartData} height={160} />
            </div>
          )}
        </div>
      )}

      {showingLocalOnly && !loading && (
        <div className="error-banner" style={{ borderColor: "var(--border-strong)", background: "var(--panel)", color: "var(--text-muted)" }}>
          <AlertTriangle size={17} style={{ marginTop: 1, flexShrink: 0, color: "var(--warn)" }} />
          <span>
            {t("dashboard.localOnly")}
            {remoteError && remoteError.network ? t("dashboard.unreachable") : ""}
          </span>
        </div>
      )}

      {!hydrated || loading ? (
        <SkeletonGrid />
      ) : missions.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-dim)", marginBottom: 10 }}>
            {t("dashboard.noMissions")}
          </div>
          <p style={{ marginBottom: 22 }}>{t("dashboard.emptyDesc")}</p>
          <Link href="/create-event" className="btn btn-primary">
            <Plus size={17} /> {t("dashboard.firstLaunch")}
          </Link>
        </div>
      ) : (
        <div className="grid-cards">
          {missions.map((m) => (
            <MissionCard key={m.id} mission={m} t={t} statusLabel={statusLabel} statusBadge={statusBadge} />
          ))}
        </div>
      )}
    </div>
  );
}

function MissionCard({ mission, t, statusLabel, statusBadge }) {
  const progress = mission.progress || {};

  return (
    <Link href={`/agent-monitor?event_id=${mission.id}`} className="panel panel-pad panel-colorful" style={{ display: "block" }}>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <span className="eyebrow">{t("dashboard.mission")} #{mission.id}</span>
        <span className={`badge ${statusBadge(mission.status)}`}>{statusLabel(mission.status)}</span>
      </div>

      <h3 style={{ fontSize: 19, marginBottom: 8 }}>{mission.theme || t("dashboard.untitled")}</h3>
      <p style={{ fontSize: 15, color: "var(--text-muted)", marginBottom: 18, minHeight: 36 }}>
        {mission.goals || mission.audience || t("dashboard.noBrief")}
      </p>

      <div className="row" style={{ gap: 6, marginBottom: 16 }}>
        {STAGES.map((s) => {
          const pct = progress[s.key] || 0;
          const cls = pct >= 100 ? "ok" : pct > 0 ? "running" : "";
          return (
            <span
              key={s.key}
              title={`${t(`stages.${s.key}.label`)}: ${pct}%`}
              className={`status-dot ${cls}`}
              style={{ width: 10, height: 10 }}
            />
          );
        })}
      </div>

      <div className="row-between" style={{ fontSize: 14, color: "var(--text-dim)" }}>
        <span className="mono">{formatDate(mission.createdAt || mission.created_at)}</span>
        <span className="row" style={{ gap: 5, color: "var(--text-muted)" }}>
          {t("common.openMonitor")} <ArrowUpRight size={14} />
        </span>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid-cards">
      {[0, 1, 2].map((i) => (
        <div key={i} className="panel panel-pad" style={{ opacity: 0.5 }}>
          <div style={{ height: 12, width: "40%", background: "var(--border)", borderRadius: 4, marginBottom: 16 }} />
          <div style={{ height: 20, width: "70%", background: "var(--border)", borderRadius: 4, marginBottom: 12 }} />
          <div style={{ height: 12, width: "90%", background: "var(--border)", borderRadius: 4, marginBottom: 22 }} />
          <div style={{ height: 10, width: "100%", background: "var(--border)", borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}
