import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, History, Loader2, RotateCcw, Save } from "lucide-react";
import { api } from "../services/api";
import { useNotifications } from "../lib/notifications";
import { useTranslation } from "../lib/i18n/context";

const PREVIEW_DEBOUNCE_MS = 400;

/**
 * Prompt studio: edit each agent's system instruction and user prompt, and
 * see the rendered result as you type.
 *
 * Prompts used to be Python literals, so the only way to see what an agent was
 * actually asked — after variable substitution, with a real brief — was to add
 * a print statement and redeploy. The preview here renders the *unsaved*
 * editor content server-side, using the same renderer the pipeline uses, so
 * what you see is what the agent will get.
 */
export default function PromptStudio() {
  const { t } = useTranslation();
  const { notify } = useNotifications();

  const [index, setIndex] = useState(null);
  const [selected, setSelected] = useState(null);
  const [template, setTemplate] = useState(null);
  const [draft, setDraft] = useState({ system: "", user: "" });
  const [variables, setVariables] = useState({});
  const [preview, setPreview] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const previewTimer = useRef(null);

  const dirty = useMemo(
    () => Boolean(template) && (draft.system !== template.system || draft.user !== template.user),
    [draft, template]
  );

  useEffect(() => {
    let cancelled = false;
    api
      .listPrompts()
      .then((data) => {
        if (cancelled) return;
        setIndex(data);
        setSelected((current) => current || data.templates?.[0]?.name || null);
      })
      .catch((err) => !cancelled && setLoadError(err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTemplate = useCallback(async (name) => {
    if (!name) return;
    const [full, history] = await Promise.all([
      api.getPrompt(name),
      api.getPromptVersions(name).catch(() => ({ versions: [] })),
    ]);
    setTemplate(full);
    setDraft({ system: full.system, user: full.user });
    setVariables({ ...full.samples });
    setVersions(history.versions || []);
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadTemplate(selected).catch((err) => setLoadError(err));
  }, [selected, loadTemplate]);

  // Live preview: debounced so a burst of keystrokes is one request.
  useEffect(() => {
    if (!selected || !template) return undefined;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setPreviewing(true);
      try {
        setPreview(
          await api.previewPrompt(selected, {
            variables,
            system: draft.system,
            user: draft.user,
          })
        );
      } catch {
        /* the notification layer already reported it */
      } finally {
        setPreviewing(false);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(previewTimer.current);
  }, [selected, template, draft, variables]);

  async function save() {
    setSaving(true);
    try {
      const saved = await api.savePrompt(selected, draft);
      setTemplate(saved);
      setVersions((await api.getPromptVersions(selected)).versions || []);
      notify({
        tone: "success",
        title: t("promptStudio.savedTitle"),
        message: t("promptStudio.savedDetail", { name: selected, version: saved.version }),
      });
    } catch {
      /* reported by the notification layer */
    } finally {
      setSaving(false);
    }
  }

  async function revert(version) {
    setSaving(true);
    try {
      const reverted = await api.revertPrompt(selected, version);
      setTemplate(reverted);
      setDraft({ system: reverted.system, user: reverted.user });
      setVersions((await api.getPromptVersions(selected)).versions || []);
    } catch {
      /* reported by the notification layer */
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="empty-state">
        <Loader2 size={22} className="spin" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="error-banner">
        <span>{loadError.message}</span>
      </div>
    );
  }

  const readOnly = index && index.editable === false;

  return (
    <div className="stack" style={{ maxWidth: 1000 }}>
      <div>
        <div className="eyebrow">{t("promptStudio.eyebrow")}</div>
        <h1 style={{ fontSize: 30, marginTop: 8 }}>{t("promptStudio.title")}</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 16, marginTop: 8 }}>
          {t("promptStudio.subtitle")}
        </p>
      </div>

      {readOnly && (
        <div className="error-banner">
          <span style={{ fontSize: 15 }}>{t("promptStudio.readOnly")}</span>
        </div>
      )}

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {(index?.templates || []).map((item) => (
          <button
            key={item.name}
            className={`btn btn-sm ${item.name === selected ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setSelected(item.name)}
          >
            <FileText size={14} /> {item.name} <span className="mono">v{item.version}</span>
          </button>
        ))}
      </div>

      {template && (
        <>
          <div className="panel panel-pad panel-colorful">
            <div className="row-between" style={{ marginBottom: 12 }}>
              <span className="eyebrow">{t("promptStudio.variables")}</span>
              {preview?.missing?.length > 0 && (
                <span className="badge error">
                  {t("promptStudio.missing", { list: preview.missing.join(", ") })}
                </span>
              )}
            </div>
            <div className="grid-2" style={{ gap: 10 }}>
              {(preview?.missing?.length
                ? [...new Set([...Object.keys(variables), ...preview.missing])]
                : Object.keys(variables)
              ).map((key) => (
                <label key={key} style={{ display: "block" }}>
                  <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    {key}
                  </span>
                  <input
                    className="input"
                    value={variables[key] ?? ""}
                    onChange={(e) => setVariables((v) => ({ ...v, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="grid-2" style={{ gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
            <div className="stack" style={{ gap: 12 }}>
              <Editor
                label={t("promptStudio.systemInstruction")}
                value={draft.system}
                rows={14}
                readOnly={readOnly}
                onChange={(system) => setDraft((d) => ({ ...d, system }))}
              />
              <Editor
                label={t("promptStudio.userPrompt")}
                value={draft.user}
                rows={10}
                readOnly={readOnly}
                onChange={(user) => setDraft((d) => ({ ...d, user }))}
              />
              <div className="row-between">
                <span style={{ fontSize: 14, color: "var(--text-dim)" }}>
                  {dirty ? t("promptStudio.unsaved") : t("promptStudio.saved")}
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={save}
                  disabled={!dirty || saving || readOnly}
                >
                  {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}{" "}
                  {t("promptStudio.saveVersion")}
                </button>
              </div>
            </div>

            <div className="panel panel-pad" style={{ position: "sticky", top: 16 }}>
              <div className="row-between" style={{ marginBottom: 12 }}>
                <span className="eyebrow">{t("promptStudio.preview")}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {previewing ? "…" : `${preview?.characters ?? 0} chars`}
                </span>
              </div>
              <PreviewBlock title={t("promptStudio.systemInstruction")} text={preview?.system} />
              <PreviewBlock title={t("promptStudio.userPrompt")} text={preview?.user} />
            </div>
          </div>

          <div className="panel panel-pad">
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              <History size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              {t("promptStudio.history")}
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {versions.map((v) => (
                <div key={v.version} className="row-between">
                  <span className="mono" style={{ fontSize: 13 }}>
                    v{v.version} · {v.checksum} · {new Date(v.updated_at).toLocaleString()}
                  </span>
                  {v.current ? (
                    <span className="badge ok">{t("promptStudio.current")}</span>
                  ) : (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => revert(v.version)}
                      disabled={saving || readOnly}
                    >
                      <RotateCcw size={14} /> {t("promptStudio.revert")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Editor({ label, value, rows, readOnly, onChange }) {
  return (
    <label style={{ display: "block" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <textarea
        className="input mono"
        style={{ width: "100%", minHeight: rows * 20, fontSize: 13, lineHeight: 1.5, resize: "vertical" }}
        rows={rows}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </label>
  );
}

function PreviewBlock({ title, text }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="mono" style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 6 }}>
        {title}
      </div>
      <pre
        className="mono"
        style={{
          margin: 0,
          padding: "10px 12px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          fontSize: 13,
          whiteSpace: "pre-wrap",
          maxHeight: 260,
          overflow: "auto",
        }}
      >
        {text || "—"}
      </pre>
    </div>
  );
}
