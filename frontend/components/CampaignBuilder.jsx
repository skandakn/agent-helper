import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Download, Copy, Check, FileWarning } from "lucide-react";
import { api } from "../services/api";
import { useEventStore } from "../store/event";
import { useTranslation } from "../lib/i18n/context";
import JsonBlock from "./JsonBlock";
import { BarChart, CHART_COLORS } from "./Charts";
import { formatCurrencyINR } from "../lib/stages";

const TAB_KEYS = ["research", "branding", "content", "social_media", "operations", "critique"];

export default function CampaignBuilder() {
  const router = useRouter();
  const { t } = useTranslation();
  const { recent } = useEventStore();
  const queryId = router.query.event_id;

  const fallbackId = useMemo(() => {
    if (queryId) return queryId;
    const ready = recent.find((m) => m.status === "ready" || m.status === "launched");
    return ready?.id || recent[0]?.id;
  }, [queryId, recent]);

  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("branding");

  useEffect(() => {
    if (!fallbackId) return;
    setLoading(true);
    setError(null);
    setPkg(null);
    api
      .getEventOutput(fallbackId)
      .then((response) => {
        // The API wraps the launch package in an { event_id, status, output }
        // envelope — unwrap it so pkg.branding / pkg.research / etc. resolve.
        const output = response?.output || {};
        if (Object.keys(output).length === 0) {
          // Nothing has been generated yet, or the run failed before the
          // orchestrator persisted a final package. Treat this the same as
          // a fetch error so the person sees the "still running" banner
          // instead of a panel full of empty dashes.
          const err = new Error(
            response?.status === "failed" ? "This mission's workflow failed before finishing." : ""
          );
          throw err;
        }
        setPkg(output);
        const firstAvailable = TAB_KEYS.find((key) => output[key]);
        if (firstAvailable) setTab(firstAvailable);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, [fallbackId]);

  if (!fallbackId) {
    return (
      <div className="empty-state panel-colorful" style={{ maxWidth: 560 }}>
        <p style={{ marginBottom: 22, fontSize: 18 }}>{t("campaignBuilder.noMission")}</p>
        <Link href="/create-event" className="btn btn-primary">
          {t("common.newLaunch")}
        </Link>
      </div>
    );
  }

  const mission = recent.find((m) => String(m.id) === String(fallbackId));

  function tabLabel(key) {
    if (key === "critique") return t("stages.critic.label");
    return t(`stages.${key}.label`);
  }

  return (
    <div className="stack" style={{ maxWidth: 880, gap: 24 }}>
      <div className="row-between">
        <div>
          <div className="eyebrow">{t("dashboard.mission")} #{fallbackId}</div>
          <h1 style={{ fontSize: 30, marginTop: 8 }}>{mission?.theme || t("campaignBuilder.launchPackage")}</h1>
        </div>
        {pkg && (
          <button className="btn btn-primary btn-sm" onClick={() => downloadJson(pkg, `mission-${fallbackId}-package.json`)}>
            <Download size={16} /> {t("campaignBuilder.exportPackage")}
          </button>
        )}
      </div>

      {loading && <LoadingPanel />}

      {error && (
        <div className="error-banner">
          <FileWarning size={17} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 16 }}>
            {error.message || t("campaignBuilder.loadError")} {t("campaignBuilder.stillRunning")}{" "}
            <Link href={`/agent-monitor?event_id=${fallbackId}`} style={{ textDecoration: "underline", color: "var(--info)" }}>
              {t("campaignBuilder.agentMonitor")}
            </Link>
            .
          </span>
        </div>
      )}

      {pkg && (
        <>
          <div className="tabs">
            {TAB_KEYS.filter((key) => pkg[key]).map((key) => (
              <button key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
                {tabLabel(key)}
              </button>
            ))}
          </div>

          <div className="panel panel-pad panel-colorful">
            <div className="row-between" style={{ marginBottom: 18 }}>
              <span className="eyebrow">{tabLabel(tab)}</span>
              <CopyButton value={pkg[tab]} t={t} />
            </div>

            {tab === "critique" ? <CritiqueView data={pkg.critique} t={t} /> : <SectionView tabKey={tab} data={pkg[tab]} t={t} />}
          </div>
        </>
      )}
    </div>
  );
}

function SectionView({ tabKey, data, t }) {
  if (tabKey === "operations" && data?.budget && typeof data.budget === "object") {
    const { budget, ...rest } = data;
    return (
      <div className="stack">
        <BudgetChart budget={budget} t={t} />
        <div className="divider" />
        <JsonBlock data={rest} />
      </div>
    );
  }
  return <JsonBlock data={data} />;
}

function BudgetChart({ budget, t }) {
  const entries = Object.entries(budget).filter(([, v]) => typeof v === "number");
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const barData = entries.map(([k, v], i) => ({
    label: k.replace(/_/g, " "),
    short: k.slice(0, 3).toUpperCase(),
    value: Math.round((v / max) * 100),
    color: CHART_COLORS[i % CHART_COLORS.length],
    raw: v,
  }));

  return (
    <div>
      <div className="label">{t("campaignBuilder.budgetBreakdown")}</div>
      <BarChart data={barData} height={200} />
      <div className="stack" style={{ gap: 10, marginTop: 16 }}>
        {entries.map(([k, v], i) => (
          <div key={k}>
            <div className="row-between" style={{ fontSize: 15, marginBottom: 6 }}>
              <span style={{ color: "var(--text-muted)" }}>{k.replace(/_/g, " ")}</span>
              <span className="mono" style={{ fontSize: 15 }}>{formatCurrencyINR(v)}</span>
            </div>
            <div className="manifest-track" style={{ marginTop: 0 }}>
              <div
                className="manifest-fill"
                style={{
                  width: `${(v / max) * 100}%`,
                  background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}, ${CHART_COLORS[(i + 1) % CHART_COLORS.length]})`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CritiqueView({ data, t }) {
  if (!data) return <span style={{ color: "var(--text-dim)", fontSize: 16 }}>{t("campaignBuilder.noCritique")}</span>;
  const { scores, overall, issues, suggestions, approved, ...rest } = data;

  const scoreBarData =
    scores && typeof scores === "object"
      ? Object.entries(scores).map(([k, v], i) => ({
          label: k.replace(/_/g, " "),
          short: k.slice(0, 2).toUpperCase(),
          value: Math.round(Number(v) * 10),
          color: CHART_COLORS[i % CHART_COLORS.length],
        }))
      : [];

  return (
    <div className="stack" style={{ gap: 20 }}>
      {scoreBarData.length > 0 && (
        <div>
          <div className="label">{t("campaignBuilder.scoreChart")}</div>
          <BarChart data={scoreBarData} height={220} />
        </div>
      )}

      {scores && typeof scores === "object" && (
        <div className="grid-2">
          {Object.entries(scores).map(([k, v], i) => (
            <ScoreBar key={k} label={k.replace(/_/g, " ")} value={Number(v)} color={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </div>
      )}

      {overall !== undefined && (
        <div className="row-between panel panel-pad panel-colorful" style={{ borderColor: approved ? "rgba(61,220,151,0.4)" : "rgba(242,201,76,0.4)" }}>
          <span style={{ fontWeight: 600, fontSize: 17 }}>{t("campaignBuilder.overallScore")}</span>
          <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: approved ? "var(--ok)" : "var(--warn)" }}>
            {overall}/10
          </span>
        </div>
      )}

      {approved !== undefined && (
        <span className={`badge ${approved ? "ok" : "warn"}`} style={{ width: "fit-content", fontSize: 13 }}>
          {approved ? t("campaignBuilder.approvedForLaunch") : t("campaignBuilder.needsAnotherPass")}
        </span>
      )}

      {issues && (
        <div>
          <div className="label">{t("campaignBuilder.issuesFlagged")}</div>
          <JsonBlock data={issues} depth={1} />
        </div>
      )}

      {suggestions && (
        <div>
          <div className="label">{t("campaignBuilder.suggestedFixes")}</div>
          <JsonBlock data={suggestions} depth={1} />
        </div>
      )}

      {Object.keys(rest).length > 0 && <JsonBlock data={rest} />}
    </div>
  );
}

function ScoreBar({ label, value, color }) {
  const pct = Math.max(0, Math.min(10, value)) * 10;
  const barColor = value >= 7 ? "var(--ok)" : value >= 4 ? "var(--warn)" : "var(--error)";
  return (
    <div>
      <div className="row-between" style={{ fontSize: 15, marginBottom: 6, textTransform: "capitalize" }}>
        <span style={{ color: "var(--text-muted)" }}>{label}</span>
        <span className="mono" style={{ fontSize: 15 }}>{value}/10</span>
      </div>
      <div className="manifest-track" style={{ marginTop: 0 }}>
        <div className="manifest-fill" style={{ width: `${pct}%`, background: color || barColor }} />
      </div>
    </div>
  );
}

function CopyButton({ value, t }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t("campaignBuilder.copied") : t("campaignBuilder.copyJson")}
    </button>
  );
}

function LoadingPanel() {
  return (
    <div className="panel panel-pad panel-colorful" style={{ opacity: 0.6 }}>
      <div style={{ height: 14, width: "30%", background: "var(--border)", borderRadius: 4, marginBottom: 16 }} />
      <div style={{ height: 12, width: "90%", background: "var(--border)", borderRadius: 4, marginBottom: 10 }} />
      <div style={{ height: 12, width: "75%", background: "var(--border)", borderRadius: 4 }} />
    </div>
  );
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
