import { CalendarDays, CalendarX2 } from "lucide-react";
import { useTranslation } from "../lib/i18n/context";
import { PHASE, daysUntil, eventPhase, formatEventDate } from "../lib/eventSchedule";

/**
 * Event date line: weekday, date and time, plus where the event stands.
 * An event whose day has passed is marked "Event over".
 */
export default function EventSchedule({ date, compact = false }) {
  const { t, lang } = useTranslation();
  const formatted = formatEventDate(date, lang);

  if (!formatted) {
    return compact ? null : (
      <div className="row" style={{ gap: 8, color: "var(--text-dim)", fontSize: 14 }}>
        <CalendarDays size={15} /> {t("eventSchedule.noDate")}
      </div>
    );
  }

  const phase = eventPhase(date);
  const days = daysUntil(date);
  const Icon = phase === PHASE.OVER ? CalendarX2 : CalendarDays;

  let badge;
  if (phase === PHASE.OVER) {
    badge = <span className="badge error">{t("eventSchedule.over")}</span>;
  } else if (phase === PHASE.TODAY) {
    badge = <span className="badge ok">{t("eventSchedule.today")}</span>;
  } else {
    badge = (
      <span className="badge info">
        {days === 1 ? t("eventSchedule.tomorrow") : t("eventSchedule.inDays", { n: days })}
      </span>
    );
  }

  return (
    <div
      className="row"
      data-event-phase={phase}
      style={{
        gap: 8,
        flexWrap: "wrap",
        fontSize: compact ? 13 : 15,
        color: phase === PHASE.OVER ? "var(--text-dim)" : "var(--text-muted)",
      }}
    >
      <Icon size={compact ? 14 : 16} style={{ flexShrink: 0 }} />
      <span>
        <strong style={{ color: phase === PHASE.OVER ? "var(--text-dim)" : "var(--text)" }}>{formatted.weekday}</strong>
        {`, ${formatted.date} · ${formatted.time}`}
      </span>
      {badge}
    </div>
  );
}
