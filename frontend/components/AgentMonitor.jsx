import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { ChevronDown, ChevronRight, CheckCircle2, FileWarning, Rocket, RadioTower } from "lucide-react";
import { connectToEvent } from "../services/websocket";
import { api } from "../services/api";
import { useEventStore } from "../store/event";
import { STAGES } from "../lib/stages";
import { getPrefs } from "../lib/prefs";
import { useTranslation } from "../lib/i18n/context";

const STAGE_KEYS = STAGES.map((stage) => stage.key);

function completeProgress() {
  return Object.fromEntries(STAGE_KEYS.map((key) => [key, 100]));
}

function normalizeProgress(progress = {}, status) {
  if (status === "ready" || status === "launched") return completeProgress();
  return Object.fromEntries(
    Object.entries(progress || {}).filter(([key]) => STAGE_KEYS.includes(key))
  );
}

export default function AgentMonitor() {
  const router = useRouter();
  const { t } = useTranslation();
  const { event_id } = router.query;
  const { recent, updateRecentMission } = useEventStore();

  const [progress, setProgress] = useState({});
  const [stageData, setStageData] = useState({});
  const [eventRecord, setEventRecord] = useState(null);
  const [finalPackage, setFinalPackage] = useState(null);
  const [link, setLink] = useState("connecting");
  const [expanded, setExpanded] = useState(null);
  const [failure, setFailure] = useState(null);
  const pollRef = useRef(null);

  const mission = recent.find((m) => String(m.id) === String(event_id)) || eventRecord;

  useEffect(() => {
    if (!router.isReady || event_id || recent.length === 0) return;
    router.replace(`/agent-monitor?event_id=${recent[0].id}`);
  }, [router.isReady, event_id, recent, router]);

  useEffect(() => {
    if (!event_id) return;

    setProgress({});
    setStageData({});
    setEventRecord(null);
    setFinalPackage(null);
    setFailure(null);
    setLink("connecting");

    api.getEvent(event_id).then(setEventRecord).catch(() => {
      /* local-only missions may not have a backend record yet */
    });

    const handle = connectToEvent(event_id, {
      onOpen: () => setLink("live"),
      onClose: () => setLink((s) => (s === "live" ? "reconnecting" : s)),
      onError: () => setLink((s) => (s === "live" ? "reconnecting" : s)),
      onMessage: (msg) => {
        if (!msg || !msg.stage) return;

        if (msg.stage === "done") {
          const doneProgress = completeProgress();
          setProgress((p) => ({ ...p, ...doneProgress }));
          setFinalPackage(msg.data);
          updateRecentMission(event_id, { status: "ready", progress: doneProgress });
          if (getPrefs().notifyOnComplete && typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "granted") {
              new Notification(t("agentMonitor.packageCompiled"), {
                body: `${t("dashboard.mission")} #${event_id}`,
              });
            }
          }
          return;
        }

        if (STAGE_KEYS.includes(msg.stage)) {
          const pct = msg.status === "completed" ? 100 : Math.max(0, Math.min(99, Number(msg.pct) || 0));
          setProgress((p) => ({ ...p, [msg.stage]: pct }));
        }

        if (msg.data && Object.keys(msg.data).length) {
          setStageData((d) => ({ ...d, ...msg.data }));
        }
        if (msg.stage === "failed") {
          setFailure(msg.message || null);
          updateRecentMission(event_id, { status: "failed" });
          clearInterval(pollRef.current);
        }
      },
    });

    async function refreshStatus() {
      try {
        const status = await api.getEventStatus(event_id);
        const nextProgress = normalizeProgress(status?.progress, status?.status);
        if (Object.keys(nextProgress).length) {
          setProgress((p) => ({ ...p, ...nextProgress }));
          updateRecentMission(event_id, { status: status.status, progress: nextProgress });
        } else if (status?.status) {
          updateRecentMission(event_id, { status: status.status });
        }
        if (status?.status === "ready" || status?.status === "launched") {
          const response = await api.getEventOutput(event_id);
          const output = response?.output || response;
          if (output && Object.keys(output).length) {
            const doneProgress = completeProgress();
            setFinalPackage(output);
            setProgress((p) => ({ ...p, ...doneProgress }));
            updateRecentMission(event_id, { status: status.status, progress: doneProgress });
          }
          clearInterval(pollRef.current);
        } else if (status?.status === "failed") {
          setFailure(status.last_error || null);
          updateRecentMission(event_id, { status: "failed" });
          clearInterval(pollRef.current);
        }
      } catch {
        /* status endpoint may not be ready yet */
      }
    }

    refreshStatus();
    pollRef.current = setInterval(refreshStatus, 6000);

    return () => {
      handle.close();
      clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event_id]);

  useEffect(() => {
    if (!event_id || Object.keys(progress).length === 0) return;
    updateRecentMission(event_id, { progress });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, event_id]);

  if (!event_id) {
    return <NoMissionSelected missions={recent} t={t} />;
  }

  return (
    <div className="stack" style={{ maxWidth: 800 }}>
      <div className="row-between">
        <div>
          <div className="eyebrow">{t("dashboard.mission")} #{event_id}</div>
          <h1 style={{ fontSize: 30, marginTop: 8 }}>{mission?.theme || t("agentMonitor.pipeline")}</h1>
        </div>
        <LinkStatus state={link} t={t} />
      </div>

      <div className="panel panel-pad panel-colorful">
        <div className="manifest">
          {STAGES.map((s) => {
            const pct = progress[s.key] || 0;
            const status = pct >= 100 ? "complete" : pct > 0 ? "running" : "";
            const isOpen = expanded === s.key;
            const data = stageData[s.key];
            const stageLabel = t(`stages.${s.key}.label`);
            const stageVerb = t(`stages.${s.key}.verb`);

            return (
              <div key={s.key} className={`manifest-row ${status}`}>
                <span className="manifest-spine" />
                <span className="manifest-code">{s.code}</span>
                <div className="manifest-body">
                  <div
                    className="row-between"
                    style={{ cursor: data ? "pointer" : "default" }}
                    onClick={() => data && setExpanded(isOpen ? null : s.key)}
                  >
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>{stageLabel}</div>
                      <div style={{ fontSize: 14, color: "var(--text-dim)" }}>
                        {status === "complete"
                          ? t("agentMonitor.clear")
                          : status === "running"
                            ? `${stageVerb}…`
                            : t("agentMonitor.standby")}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 10 }}>
                      <span className="mono" style={{ fontSize: 14, color: "var(--text-dim)" }}>
                        {pct}%
                      </span>
                      {data ? (
                        isOpen ? (
                          <ChevronDown size={16} color="var(--text-dim)" />
                        ) : (
                          <ChevronRight size={16} color="var(--text-dim)" />
                        )
                      ) : null}
                    </div>
                  </div>
                  <div className="manifest-track">
                    <div className="manifest-fill" style={{ width: `${pct}%` }} />
                  </div>

                  {isOpen && data && <StagePreview stageKey={s.key} data={data} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {failure !== null && (
        <div className="error-banner">
          <FileWarning size={17} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 16 }}>
            {t("agentMonitor.workflowFailed")}
            {failure ? `: ${failure}` : ""}{" "}
            <Link href="/create-event" style={{ textDecoration: "underline", color: "var(--info)" }}>
              {t("agentMonitor.tryAgain")}
            </Link>
            .
          </span>
        </div>
      )}

      {finalPackage && (
        <div className="panel panel-pad panel-colorful" style={{ borderColor: "rgba(61,220,151,0.4)" }}>
          <div className="row" style={{ gap: 12, marginBottom: 12 }}>
            <CheckCircle2 size={22} color="var(--ok)" />
            <h3 style={{ fontSize: 18 }}>{t("agentMonitor.packageCompiled")}</h3>
          </div>
          <p style={{ fontSize: 16, color: "var(--text-muted)", marginBottom: 18 }}>
            {t("agentMonitor.packageReady")}
          </p>
          <Link href={`/campaign-builder?event_id=${event_id}`} className="btn btn-primary">
            {t("agentMonitor.openCampaign")}
          </Link>
        </div>
      )}
    </div>
  );
}

function LinkStatus({ state, t }) {
  const meta = {
    connecting: { label: t("agentMonitor.connecting"), cls: "warn" },
    live: { label: t("agentMonitor.liveLink"), cls: "ok" },
    reconnecting: { label: t("agentMonitor.reconnecting"), cls: "error" },
  }[state] || { label: state.toUpperCase(), cls: "" };

  return (
    <span className={`badge ${meta.cls}`}>
      <RadioTower size={13} /> {meta.label}
    </span>
  );
}

function NoMissionSelected({ missions, t }) {
  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <div className="eyebrow">{t("agentMonitor.eyebrow")}</div>
      <h1 style={{ fontSize: 30 }}>{t("agentMonitor.noMission")}</h1>
      {missions.length === 0 ? (
        <div className="empty-state">
          <p style={{ marginBottom: 22 }}>{t("agentMonitor.launchFirst")}</p>
          <Link href="/create-event" className="btn btn-primary">
            <Rocket size={16} /> {t("common.newLaunch")}
          </Link>
        </div>
      ) : (
        <div className="grid-cards">
          {missions.map((m) => (
            <Link key={m.id} href={`/agent-monitor?event_id=${m.id}`} className="panel panel-pad panel-colorful">
              <div className="eyebrow">{t("dashboard.mission")} #{m.id}</div>
              <div style={{ fontWeight: 600, marginTop: 8, fontSize: 17 }}>{m.theme}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StagePreview({ stageKey, data }) {
  const text = (() => {
    try {
      if (stageKey === "research" && data.trends) return `${data.trends.length} trends - ${data.sponsor_targets?.length || 0} sponsor leads - ${data.competitors?.length || 0} comparable events`;
      if (stageKey === "branding" && data.selected_name) return `"${data.selected_name}" - ${data.tagline || ""}`;
      if (stageKey === "content" && data.outreach_emails) return `${data.outreach_emails.length} email drafts - rubric + pitch deck outline ready`;
      if (stageKey === "social_media" && data.posts) return `${data.duration_weeks || 4}-week campaign drafted with ${data.posts.length} posts`;
      if (stageKey === "operations" && data.tasks) return `${data.tasks.length} tasks - budget broken into ${data.budget_breakdown?.length || 0} categories`;
      if (stageKey === "critic" && data.overall !== undefined) return `Overall score ${data.overall}/10 - ${data.approved ? "approved" : "needs another pass"}`;
    } catch {
      /* fall through */
    }
    return null;
  })();

  return (
    <div
      style={{
        marginTop: 12,
        padding: "12px 14px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        fontSize: 15,
        color: "var(--text-muted)",
      }}
    >
      {text || <pre className="mono" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(data, null, 2).slice(0, 500)}</pre>}
    </div>
  );
}
