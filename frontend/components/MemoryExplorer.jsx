import { useState } from "react";
import { Search, Loader2, DatabaseZap } from "lucide-react";
import { api } from "../services/api";
import { useTranslation } from "../lib/i18n/context";
import JsonBlock from "./JsonBlock";

const COLLECTION_KEYS = [
  "event_templates",
  "sponsor_templates",
  "marketing_assets",
  "campaign_history",
  "user_preferences",
];

export default function MemoryExplorer() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [collection, setCollection] = useState(COLLECTION_KEYS[0]);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchedFor, setSearchedFor] = useState(null);

  async function runSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchMemory(query.trim(), { collection, topK: 8 });
      setResults(Array.isArray(res) ? res : res?.results || []);
      setSearchedFor({ query: query.trim(), collection });
    } catch (err) {
      setError(err);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 800 }}>
      <div>
        <div className="eyebrow">{t("memoryExplorer.eyebrow")}</div>
        <h1 style={{ fontSize: 30, marginTop: 8 }}>{t("memoryExplorer.title")}</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 16, marginTop: 8 }}>
          {t("memoryExplorer.subtitle")}
        </p>
      </div>

      <div className="panel panel-pad panel-colorful">
        <div className="grid-2" style={{ gridTemplateColumns: "1fr 240px", marginBottom: 14 }}>
          <input
            className="input"
            placeholder={t("memoryExplorer.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
          />
          <select className="select" value={collection} onChange={(e) => setCollection(e.target.value)}>
            {COLLECTION_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`collections.${key}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="row-between">
          <span style={{ fontSize: 14, color: "var(--text-dim)" }}>
            {t("memoryExplorer.collection")}: {t(`collections.${collection}`)}
          </span>
          <button className="btn btn-primary btn-sm" onClick={runSearch} disabled={loading || !query.trim()}>
            {loading ? <Loader2 size={15} className="spin" /> : <Search size={15} />} {t("memoryExplorer.search")}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error.message || "Search failed."}</span>
        </div>
      )}

      {!error && results === null && !loading && (
        <div className="empty-state">
          <DatabaseZap size={24} style={{ color: "var(--info)", marginBottom: 12 }} />
          <p>{t("memoryExplorer.noResults")}</p>
        </div>
      )}

      {results && results.length === 0 && (
        <div className="empty-state">
          <p>{t("memoryExplorer.noResults")}</p>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="stack">
          {results.map((r) => (
            <div key={r.id} className="panel panel-pad panel-colorful">
              <div className="row-between" style={{ marginBottom: 12 }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {String(r.id).slice(0, 12)}
                </span>
                <RelevanceBar score={r.score} />
              </div>
              <JsonBlock data={r.payload} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RelevanceBar({ score }) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  return (
    <div className="row" style={{ gap: 10 }}>
      <div style={{ width: 80, height: 6, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, var(--info), var(--purple))" }} />
      </div>
      <span className="mono" style={{ fontSize: 13, color: "var(--text-dim)" }}>
        {pct}%
      </span>
    </div>
  );
}
