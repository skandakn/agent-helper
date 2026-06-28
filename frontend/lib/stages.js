// The orchestration pipeline, in execution order. Matches the stage names
// emitted by the backend's progress_callback in orchestrator.py.
export const STAGES = [
  { key: "research", code: "R1", label: "Research", verb: "Scouting the landscape" },
  { key: "branding", code: "B2", label: "Branding", verb: "Naming the thing" },
  { key: "content", code: "C3", label: "Content", verb: "Drafting the copy" },
  { key: "social_media", code: "S4", label: "Social", verb: "Plotting the campaign" },
  { key: "operations", code: "O5", label: "Operations", verb: "Building the runsheet" },
  { key: "critic", code: "QA", label: "Critic", verb: "Reviewing the package" },
];

export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

// event.status enum from the Postgres schema: draft | planning | ready | launched
export const MISSION_STATUS = {
  draft: { label: "Draft", badge: "" },
  planning: { label: "In flight", badge: "running" },
  ready: { label: "Ready", badge: "info" },
  launched: { label: "Launched", badge: "ok" },
};

export function missionStatusMeta(status) {
  return MISSION_STATUS[status] || { label: status || "Unknown", badge: "" };
}

export function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(value);
  }
}

export function formatCurrencyINR(value) {
  if (value === undefined || value === null || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
