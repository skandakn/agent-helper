import { Component } from "react";
import Link from "next/link";
import { FileWarning } from "lucide-react";

/**
 * Single error boundary for the app shell.
 *
 * Before this, a render-time exception anywhere in a page — a malformed
 * package field, an undefined lookup in a stage preview — unmounted the whole
 * React tree and left the person on a blank white page with no way back.
 * React does not catch async errors, so this covers render/lifecycle failures;
 * request failures are handled by the typed API client and the notification
 * layer instead.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[launch-control] render error", error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="stack" style={{ maxWidth: 680, padding: 24 }}>
        <div className="eyebrow" style={{ color: "var(--error)" }}>
          CONSOLE ERROR
        </div>
        <h1 style={{ fontSize: 28 }}>This page hit an error it couldn&apos;t recover from</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 16 }}>
          Nothing on the backend was affected — a running mission keeps going and its progress is
          replayed when you reopen the monitor.
        </p>
        <pre
          className="mono"
          style={{
            margin: 0,
            padding: "12px 14px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontSize: 13,
            whiteSpace: "pre-wrap",
            color: "var(--text-dim)",
          }}
        >
          {String(error?.message || error)}
        </pre>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={this.reset}>
            <FileWarning size={15} /> Try again
          </button>
          <Link className="btn btn-ghost btn-sm" href="/dashboard" onClick={this.reset}>
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }
}
