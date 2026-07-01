import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, AlertTriangle, ArrowUpRight, Trash2 } from "lucide-react";
import { api } from "../services/api";
import { useEventStore } from "../store/event";
import { STAGES, formatDate } from "../lib/stages";
import { useTranslation } from "../lib/i18n/context";
import { BarChart, Sparkline, StatRing, CHART_COLORS } from "./Charts";
import { localizeText } from "./JsonBlock";

export default function Dashboard() {
  const { t, lang } = useTranslation();
  const { recent, hydrated, removeRecentMission, userKey } = useEventStore();
  const [remote, setRemote] = useState(null);
  const [remoteError, setRemoteError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setRemote(null);
    setRemoteError(null);
    api
      .listEvents()
      .then((data) => mounted && setRemote(Array.isArray(data) ? data : data?.events || null))
      .catch((err) => mounted && setRemoteError(err))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [userKey]);

  const missions = remote && remote.length ? remote : recent;
  const showingLocalOnly = !remote || remote.length === 0;

  const activeCount = missions.filter((m) => ["planning", "running", "reviewing"].includes(m.status)).length;
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
    const map = { planning: "running", running: "running", reviewing: "warn", ready: "info", launched: "ok", failed: "error", draft: "" };
    return map[status] || "";
  }

  async function handleDeleteMission(id) {
    if (!window.confirm(deleteCopy(lang, "confirm"))) return;
    setDeletingId(id);
    try {
      await api.deleteEvent(id);
    } catch (err) {
      if (err?.status && err.status !== 404) {
        alert(err.message || deleteCopy(lang, "failed"));
        setDeletingId(null);
        return;
      }
    }
    removeRecentMission(id);
    setRemote((prev) => (Array.isArray(prev) ? prev.filter((mission) => String(mission.id) !== String(id)) : prev));
    setDeletingId(null);
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
            <MissionCard
              key={m.id}
              mission={m}
              t={t}
              lang={lang}
              statusLabel={statusLabel}
              statusBadge={statusBadge}
              deleting={String(deletingId) === String(m.id)}
              onDelete={handleDeleteMission}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MissionCard({ mission, t, lang, statusLabel, statusBadge, deleting, onDelete }) {
  const progress = mission.progress || {};
  const theme = localizeText(mission.theme || t("dashboard.untitled"), lang);
  const brief = missionCardBrief(mission, lang, t);

  return (
    <div className="panel panel-pad panel-colorful" style={{ display: "block" }}>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <span className="eyebrow">{t("dashboard.mission")} #{mission.id}</span>
        <div className="row" style={{ gap: 8 }}>
          <span className={`badge ${statusBadge(mission.status)}`}>{statusLabel(mission.status)}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={deleting}
            title={deleteCopy(lang, "delete")}
            aria-label={deleteCopy(lang, "delete")}
            onClick={() => onDelete(mission.id)}
            style={{ padding: 7, color: "var(--error)" }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <h3 style={{ fontSize: 19, marginBottom: 8 }}>{theme}</h3>
      <p
        style={{
          fontSize: 15,
          color: "var(--text-muted)",
          marginBottom: 18,
          minHeight: 36,
          display: "-webkit-box",
          WebkitLineClamp: 5,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {brief}
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
        <Link href={`/agent-monitor?event_id=${mission.id}`} className="row" style={{ gap: 5, color: "var(--text-muted)" }}>
          {t("common.openMonitor")} <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function deleteCopy(lang, key) {
  const labels = {
    en: { delete: "Delete mission", confirm: "Delete this mission? This cannot be undone.", failed: "Could not delete this mission." },
    hi: { delete: "मिशन हटाएं", confirm: "यह मिशन हटाएं? इसे वापस नहीं किया जा सकता।", failed: "मिशन हटाया नहीं जा सका।" },
    kn: { delete: "ಮಿಷನ್ ಅಳಿಸಿ", confirm: "ಈ ಮಿಷನ್ ಅಳಿಸಬೇಕೇ? ಇದನ್ನು ಹಿಂದಿರುಗಿಸಲಾಗುವುದಿಲ್ಲ.", failed: "ಮಿಷನ್ ಅಳಿಸಲಾಗಲಿಲ್ಲ." },
    te: { delete: "మిషన్ తొలగించు", confirm: "ఈ మిషన్‌ను తొలగించాలా? దీన్ని తిరిగి తీసుకురాలేరు.", failed: "మిషన్‌ను తొలగించలేకపోయాం." },
    ta: { delete: "மிஷனை நீக்கு", confirm: "இந்த மிஷனை நீக்கவா? இதை மீண்டும் பெற முடியாது.", failed: "மிஷனை நீக்க முடியவில்லை." },
    ml: { delete: "മിഷൻ ഇല്ലാതാക്കുക", confirm: "ഈ മിഷൻ ഇല്ലാതാക്കണോ? ഇത് തിരികെ കൊണ്ടുവരാൻ കഴിയില്ല.", failed: "മിഷൻ ഇല്ലാതാക്കാൻ കഴിഞ്ഞില്ല." },
    ur: { delete: "مشن حذف کریں", confirm: "کیا یہ مشن حذف کریں؟ اسے واپس نہیں کیا جا سکتا۔", failed: "مشن حذف نہیں ہو سکا۔" },
  };
  return labels[lang]?.[key] || labels.en[key];
}

function missionCardBrief(mission, lang, t) {
  const theme = localizeText(mission.theme || t("dashboard.untitled"), lang);
  const audience = mission.audience ? localizeText(mission.audience, lang) : "";
  const days = mission.constraints?.duration_days;
  const dayText = days ? `${days} ${t("common.days")}` : "";
  const details = [audience, dayText].filter(Boolean).join(" · ");

  const summaries = {
    hi: `${theme} के लिए लॉन्च पैकेज, जिसमें शोध, ब्रांडिंग, कंटेंट, सोशल अभियान और संचालन योजना शामिल है।${details ? ` ${details}` : ""}`,
    kn: `${theme}ಗಾಗಿ ಸಂಶೋಧನೆ, ಬ್ರಾಂಡಿಂಗ್, ವಿಷಯ, ಸಾಮಾಜಿಕ ಅಭಿಯಾನ ಮತ್ತು ಕಾರ್ಯಾಚರಣೆ ಯೋಜನೆಯೊಂದಿಗೆ ಪೂರ್ಣ ಲಾಂಚ್ ಪ್ಯಾಕೇಜ್.${details ? ` ${details}` : ""}`,
    te: `${theme} కోసం పరిశోధన, బ్రాండింగ్, కంటెంట్, సోషల్ క్యాంపెయిన్ మరియు ఆపరేషన్స్ ప్లాన్‌తో పూర్తి లాంచ్ ప్యాకేజీ.${details ? ` ${details}` : ""}`,
    ta: `${theme}க்கான ஆராய்ச்சி, பிராண்டிங், உள்ளடக்கம், சமூக பிரச்சாரம் மற்றும் செயல்பாட்டு திட்டத்துடன் முழு லாஞ்ச் தொகுப்பு.${details ? ` ${details}` : ""}`,
    ml: `${theme}ക്കായി ഗവേഷണം, ബ്രാൻഡിംഗ്, ഉള്ളടക്കം, സോഷ്യൽ ക്യാമ്പെയ്ൻ, പ്രവർത്തന പദ്ധതി എന്നിവയുള്ള പൂർണ്ണ ലോഞ്ച് പാക്കേജ്.${details ? ` ${details}` : ""}`,
    ur: `${theme} کے لیے تحقیق، برانڈنگ، مواد، سوشل مہم اور آپریشنز پلان کے ساتھ مکمل لانچ پیکیج۔${details ? ` ${details}` : ""}`,
  };

  if (lang !== "en" && summaries[lang]) return summaries[lang];
  return localizeText(mission.goals || mission.audience || t("dashboard.noBrief"), lang);
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
