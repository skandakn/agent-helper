import Link from "next/link";
import { Rocket, ShieldCheck } from "lucide-react";

export default function AuthSetupNotice({ mode = "sign-in" }) {
  const title = mode === "sign-up" ? "Create your Launch Control account" : "Sign in to Launch Control";

  return (
    <main className="auth-page">
      <section className="auth-panel panel panel-colorful">
        <div className="auth-brand">
          <div className="brand-mark">
            <Rocket size={18} strokeWidth={2.4} />
          </div>
          <div>
            <div className="brand-title">Launch Control</div>
            <div className="brand-sub">Clerk auth setup</div>
          </div>
        </div>

        <div className="stack">
          <span className="badge warn">
            <ShieldCheck size={14} />
            API keys needed
          </span>
          <h1>{title}</h1>
          <p className="auth-copy">
            Clerk is wired into this app. Add your Clerk keys to enable the hosted sign-in and sign-up forms.
          </p>
        </div>

        <ol className="auth-steps">
          <li>Create a Clerk application in the Clerk Dashboard.</li>
          <li>Copy the Publishable key and Secret key from API Keys.</li>
          <li>Add them to <code>frontend/.env.local</code>.</li>
          <li>Add <code>CLERK_ISSUER_URL</code> to the backend env for strict API verification.</li>
          <li>Restart the Next.js dev server.</li>
        </ol>

        <pre className="auth-code">{`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<publishable key from Clerk>
CLERK_SECRET_KEY=<secret key from Clerk>
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard`}</pre>

        <div className="auth-actions">
          <Link className="btn btn-primary" href="/dashboard">
            Open dashboard
          </Link>
          <Link className="btn btn-ghost" href={mode === "sign-up" ? "/sign-in" : "/sign-up"}>
            {mode === "sign-up" ? "Use sign in" : "Use sign up"}
          </Link>
        </div>
      </section>
    </main>
  );
}
