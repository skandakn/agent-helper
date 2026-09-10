import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Database, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { api } from "../services/api";
import { useTranslation } from "../lib/i18n/context";
import JsonBlock from "./JsonBlock";

/**
 * Memory inspector.
 *
 * Memory search returning nothing was indistinguishable from memory silently
 * running on an empty in-process fallback — the backend logged the fallback at
 * warning level and the console never knew. This panel shows which backend is
 * actually answering, per collection, what bootstrap did to each one, how many
 * records are really stored, and lets you run the parity self-test that checks
 * the fallback behaves like Qdrant.
 */
export default function MemoryInspector() {
  const { t } = useTranslation();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [parity, setParity] = useState(null);
  const [running, setRunning] = useState(false);
  const [openCollection, setOpenCollection] = useState(null);
  const [points, setPoints] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await api.getMemoryStatus());
    } catch {
      /* reported by the notification layer */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function openPoints(name) {
    if (openCollection === name) {
      setOpenCollection(null);
      setPoints(null);
      return;
    }
    setOpenCollection(name);
    setPoints(null);
    try {
      setPoints(await api.getMemoryPoints(name, 10));
    } catch {
      /* reported by the notification layer */
    }
  }

  async function runParity() {
    setRunning(true);
    try {
      setParity(await api.runMemoryParity());
    } catch {
      /* reported by the notification layer */
    } finally {
      setRunning(false);
    }
  }

  if (loading && !status) {
    return (
      <div className="empty-state">
        <Loader2 size={20} className="spin" />
      </div>
    );
  }

  if (!status) return null;

  const degraded = (status.degraded_collections || []).length > 0;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="panel panel-pad panel-colorful">
        <div className="row-between" style={{ marginBottom: 14 }}>
          <span className="eyebrow">
            <Database size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            {t("memoryInspector.title")}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? "spin" : ""} /> {t("common.checkNow")}
          </button>
        </div>

        <dl style={{ margin: 0 }}>
          <div className="kv">
            <dt>{t("memoryInspector.backend")}</dt>
            <dd>
              <span className={`badge ${status.backend === "qdrant" ? "ok" : "warn"}`}>
                <span className={`status-dot ${status.backend === "qdrant" ? "ok" : ""}`} />
                {status.backend}
              </span>
              {status.qdrant_url && (
                <span className="mono" style={{ marginLeft: 10, fontSize: 13, color: "var(--text-dim)" }}>
                  {status.qdrant_url}
                </span>
              )}
            </dd>
          </div>
          <div className="kv">
            <dt>{t("memoryInspector.embedding")}</dt>
            <dd className="mono">
              {status.embedding_model} · {status.embedding_dim}d
            </dd>
          </div>
          <div className="kv">
            <dt>{t("memoryInspector.storedRecords")}</dt>
            <dd className="mono">{status.total_points}</dd>
          </div>
        </dl>

        {degraded && (
          <div className="error-banner" style={{ marginTop: 14 }}>
            <span style={{ fontSize: 15 }}>
              {t("memoryInspector.degraded", { list: status.degraded_collections.join(", ") })}
            </span>
          </div>
        )}
      </div>

      <div className="panel panel-pad">
        <div className="eyebrow" style={{ marginBottom: 12 }}>
          {t("memoryInspector.collections")}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {status.collections.map((collection) => {
            const boot = status.bootstrap?.collections?.[collection.name];
            return (
              <div key={collection.name}>
                <div
                  className="row-between"
                  style={{
                    gap: 12,
                    padding: "10px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    background: "var(--bg-elevated)",
                    cursor: "pointer",
                  }}
                  onClick={() => openPoints(collection.name)}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className={`status-dot ${collection.backend === "qdrant" ? "ok" : ""}`} />
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{collection.name}</span>
                      {boot && <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{boot.action}</span>}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>
                      {boot?.detail || collection.description}
                    </div>
                  </div>
                  <span className="mono" style={{ fontSize: 14, flexShrink: 0 }}>
                    {collection.points}
                  </span>
                </div>
                {openCollection === collection.name && (
                  <div style={{ padding: "10px 12px" }}>
                    {!points ? (
                      <Loader2 size={16} className="spin" />
                    ) : points.points.length === 0 ? (
                      <span style={{ fontSize: 14, color: "var(--text-dim)" }}>
                        {t("memoryInspector.empty")}
                      </span>
                    ) : (
                      <div className="stack" style={{ gap: 8 }}>
                        {points.points.map((point) => (
                          <JsonBlock key={point.id} data={point.payload} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel panel-pad">
        <div className="row-between" style={{ marginBottom: 12 }}>
          <span className="eyebrow">
            <ShieldCheck size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            {t("memoryInspector.parity")}
          </span>
          <button className="btn btn-sm" onClick={runParity} disabled={running}>
            {running ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}{" "}
            {t("memoryInspector.runParity")}
          </button>
        </div>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
          {t("memoryInspector.parityDesc")}
        </p>

        {parity && (
          <div style={{ marginTop: 14 }}>
            <div className="row" style={{ gap: 10, marginBottom: 10 }}>
              <span className={`badge ${parity.ok ? "ok" : "error"}`}>
                {parity.passed}/{parity.total}
              </span>
              <span style={{ fontSize: 14, color: "var(--text-dim)" }}>{parity.note}</span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {parity.checks.map((check) => (
                <div key={check.check} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  {check.passed ? (
                    <CheckCircle2 size={15} color="var(--ok)" style={{ flexShrink: 0, marginTop: 2 }} />
                  ) : (
                    <XCircle size={15} color="var(--error)" style={{ flexShrink: 0, marginTop: 2 }} />
                  )}
                  <span style={{ fontSize: 14 }}>
                    {check.check}
                    <span style={{ color: "var(--text-dim)" }}> — {check.detail}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
