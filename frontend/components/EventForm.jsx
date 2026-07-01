import { useState } from "react";
import { useRouter } from "next/router";
import { ArrowRight, ArrowLeft, Rocket, Loader2 } from "lucide-react";
import { api, normalizeConstraints } from "../services/api";
import { useEventStore } from "../store/event";
import { formatCurrencyINR } from "../lib/stages";
import { useTranslation } from "../lib/i18n/context";

export default function EventForm() {
  const router = useRouter();
  const { t } = useTranslation();
  const { addRecentMission, setCurrent } = useEventStore();

  const STEPS = [
    { code: "01", label: t("createEvent.stepBrief") },
    { code: "02", label: t("createEvent.stepConstraints") },
    { code: "03", label: t("createEvent.stepReview") },
  ];

  const DEFAULTS = {
    theme: "",
    goals: "",
    audience: "",
    constraints: { budget_inr: 500000, duration_days: 60, team_size: 5 },
  };

  const [step, setStep] = useState(0);
  const [form, setForm] = useState(DEFAULTS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setConstraint = (key, value) =>
    setForm((f) => ({ ...f, constraints: { ...f.constraints, [key]: value } }));

  const durationDays = clampNumber(form.constraints.duration_days, 1, 730, 60);
  const teamSize = clampNumber(form.constraints.team_size, 1, 50, 5);
  const budgetInr = clampNumber(form.constraints.budget_inr, 0, Number.MAX_SAFE_INTEGER, 500000);
  const canAdvance =
    step === 0
      ? form.theme.trim().length > 0
      : step === 1
        ? form.constraints.duration_days !== "" && form.constraints.team_size !== ""
        : true;

  function normalizeFormConstraints() {
    return normalizeConstraints({
      ...form.constraints,
      budget_inr: budgetInr,
      duration_days: durationDays,
      team_size: teamSize,
    });
  }

  async function handleLaunch() {
    setSubmitting(true);
    setError(null);
    try {
      const theme = form.theme.trim();
      const goals =
        form.goals.trim() || "Generate a complete launch-ready hackathon campaign package.";
      const audience =
        form.audience.trim() ||
        "builders, students, sponsors, mentors, judges, and community partners";
      const constraints = normalizeFormConstraints();
      const payload = { project_id: 1, theme, goals, audience, constraints };
      const res = await api.launchEvent(payload);
      const mission = {
        id: res.event_id,
        runId: res.run_id,
        theme,
        goals,
        audience,
        constraints,
        status: res.status || "planning",
        createdAt: new Date().toISOString(),
        progress: {},
      };
      setCurrent(mission);
      addRecentMission(mission);
      router.push(`/agent-monitor?event_id=${res.event_id}`);
    } catch (err) {
      setError(err.message || t("createEvent.launchFailed"));
      setSubmitting(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 680 }}>
      <div>
        <div className="eyebrow">{t("createEvent.eyebrow")}</div>
        <h1 style={{ fontSize: 30, marginTop: 8 }}>{t("createEvent.title")}</h1>
        <p style={{ color: "var(--text-muted)", marginTop: 8, fontSize: 16 }}>
          {t("createEvent.subtitle")}
        </p>
      </div>

      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        {STEPS.map((s, i) => (
          <div
            key={s.code}
            className="row"
            style={{
              gap: 10,
              padding: "10px 14px",
              borderRadius: 10,
              border: `1px solid ${i === step ? "var(--accent)" : "var(--border)"}`,
              background: i === step ? "var(--accent-soft)" : "transparent",
              color: i === step ? "var(--accent-strong)" : i < step ? "var(--ok)" : "var(--text-dim)",
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            <span className="mono" style={{ fontSize: 12 }}>{s.code}</span>
            {s.label}
          </div>
        ))}
      </div>

      <div className="panel panel-pad panel-colorful">
        {step === 0 && (
          <div className="stack">
            <div>
              <label className="label">{t("createEvent.eventTheme")}</label>
              <input
                className="input"
                placeholder={t("createEvent.themePlaceholder")}
                value={form.theme}
                onChange={(e) => set("theme", e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="label">{t("createEvent.goals")}</label>
              <textarea
                className="textarea"
                placeholder={t("createEvent.goalsPlaceholder")}
                value={form.goals}
                onChange={(e) => set("goals", e.target.value)}
              />
            </div>
            <div>
              <label className="label">{t("createEvent.audience")}</label>
              <input
                className="input"
                placeholder={t("createEvent.audiencePlaceholder")}
                value={form.audience}
                onChange={(e) => set("audience", e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="stack">
            <div>
              <label className="label">{t("createEvent.budget")}</label>
              <input
                type="number"
                className="input"
                value={form.constraints.budget_inr}
                onChange={(e) => setConstraint("budget_inr", e.target.value)}
                onBlur={() => setConstraint("budget_inr", budgetInr)}
              />
              <span style={{ fontSize: 14, color: "var(--text-dim)" }}>
                {formatCurrencyINR(budgetInr)}
              </span>
            </div>
            <div className="grid-2">
              <div>
                <label className="label">{t("createEvent.duration")}</label>
                <input
                  type="number"
                  min="1"
                  max="730"
                  className="input"
                  value={form.constraints.duration_days}
                  onChange={(e) => setConstraint("duration_days", e.target.value)}
                  onBlur={() => setConstraint("duration_days", durationDays)}
                />
                <span style={{ fontSize: 14, color: "var(--text-dim)" }}>
                  1-730 {t("common.days")}
                </span>
              </div>
              <div>
                <label className="label">{t("createEvent.teamSize")}</label>
                <input
                  type="number"
                  className="input"
                  value={form.constraints.team_size}
                  onChange={(e) => setConstraint("team_size", e.target.value)}
                  onBlur={() => setConstraint("team_size", teamSize)}
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <dl style={{ margin: 0 }}>
              <div className="kv">
                <dt>{t("createEvent.theme")}</dt>
                <dd>{form.theme || "—"}</dd>
              </div>
              <div className="kv">
                <dt>{t("createEvent.goals")}</dt>
                <dd>{form.goals || "—"}</dd>
              </div>
              <div className="kv">
                <dt>{t("createEvent.audience")}</dt>
                <dd>{form.audience || "—"}</dd>
              </div>
              <div className="kv">
                <dt>{t("createEvent.budget")}</dt>
                <dd>{formatCurrencyINR(budgetInr)}</dd>
              </div>
              <div className="kv">
                <dt>{t("createEvent.duration")}</dt>
                <dd>{durationDays} {t("common.days")}</dd>
              </div>
              <div className="kv">
                <dt>{t("createEvent.teamSize")}</dt>
                <dd>{teamSize}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      <div className="row-between">
        <button className="btn btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft size={16} /> {t("common.back")}
        </button>

        {step < STEPS.length - 1 ? (
          <button className="btn btn-primary" disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
            {t("common.next")} <ArrowRight size={16} />
          </button>
        ) : (
          <button className="btn btn-primary" disabled={submitting} onClick={handleLaunch}>
            {submitting ? (
              <>
                <Loader2 size={16} className="spin" /> {t("common.launching")}
              </>
            ) : (
              <>
                <Rocket size={16} /> {t("common.launch")}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function clampNumber(value, min, max, fallback) {
  if (value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
