function titleCase(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isHexColor(v) {
  return typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);
}

/**
 * Renders arbitrary nested JSON (the kind a Gemini agent hands back —
 * shape varies run to run) as readable sections, bullet lists, mini
 * cards, and color swatches, without assuming a fixed schema.
 */
export default function JsonBlock({ data, depth = 0 }) {
  if (data === null || data === undefined) {
    return <span style={{ color: "var(--text-dim)", fontSize: 13 }}>—</span>;
  }

  if (typeof data === "string" || typeof data === "number") {
    if (isHexColor(data)) {
      return (
        <div className="row" style={{ gap: 8 }}>
          <div className="swatch" style={{ width: 32, height: 32, flexShrink: 0, background: data }} />
          <span className="mono" style={{ fontSize: 12.5 }}>{data}</span>
        </div>
      );
    }
    return <p style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--text)" }}>{String(data)}</p>;
  }

  if (typeof data === "boolean") {
    return <span className={`badge ${data ? "ok" : "error"}`}>{data ? "Yes" : "No"}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span style={{ color: "var(--text-dim)", fontSize: 13 }}>None listed.</span>;
    }
    if (data.every((d) => typeof d === "string" || typeof d === "number")) {
      return (
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          {data.map((d, i) => (
            <li key={i} style={{ fontSize: 13.5, color: "var(--text)" }}>
              {String(d)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <div className="stack" style={{ gap: 10 }}>
        {data.map((item, i) => (
          <div key={i} className="panel panel-pad" style={{ background: "var(--bg-elevated)" }}>
            <JsonBlock data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  // plain object
  const entries = Object.entries(data);
  return (
    <div className="stack" style={{ gap: depth === 0 ? 18 : 10 }}>
      {entries.map(([k, v]) => (
        <div key={k}>
          <div className="label">{titleCase(k)}</div>
          <JsonBlock data={v} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}
