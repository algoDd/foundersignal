import { Shield, Sparkles, Zap } from "lucide-react";

interface AuthScreenProps {
  authEmail: string;
  authLoading: boolean;
  authMode: "sign-in" | "sign-up";
  authPassword: string;
  error: string | null;
  onEmailChange: (value: string) => void;
  onModeChange: (mode: "sign-in" | "sign-up") => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
}

export function AuthScreen({
  authEmail,
  authLoading,
  authMode,
  authPassword,
  error,
  onEmailChange,
  onModeChange,
  onPasswordChange,
  onSubmit,
}: AuthScreenProps) {
  return (
    <div className="landing auth-shell">
      <div className="auth-layout">
        <section className="auth-story">
          <div className="landing-icon">
            <Zap size={26} />
          </div>
          <div className="auth-eyebrow">FounderSignal</div>
          <h1 className="auth-title">Build founder conviction with research, interviews, and live signals.</h1>
          <p className="auth-sub">
            Sign in to save every stage in Firestore, resume unfinished chains, and turn research into a polished
            hackathon-ready story.
          </p>
          <div className="auth-feature-list">
            <div className="auth-feature-item">
              <Sparkles size={16} />
              <span>Gemini-powered multi-agent startup analysis</span>
            </div>
            <div className="auth-feature-item">
              <Shield size={16} />
              <span>User-scoped saved sessions with secure email auth</span>
            </div>
            <div className="auth-feature-item">
              <Zap size={16} />
              <span>Tavily research, interview simulation, and visual dashboards</span>
            </div>
          </div>
        </section>

        <section className="landing-card auth-card">
          <div className="auth-toggle">
            <button
              className={`btn-ghost auth-toggle-btn${authMode === "sign-in" ? " active" : ""}`}
              onClick={() => onModeChange("sign-in")}
            >
              Sign In
            </button>
            <button
              className={`btn-ghost auth-toggle-btn${authMode === "sign-up" ? " active" : ""}`}
              onClick={() => onModeChange("sign-up")}
            >
              Sign Up
            </button>
          </div>

          <div>
            <h2 className="landing-title" style={{ fontSize: "1.4rem" }}>
              {authMode === "sign-in" ? "Welcome back" : "Create your workspace"}
            </h2>
            <p className="landing-sub">
              {authMode === "sign-in"
                ? "Pick up where you left off and reopen saved chains."
                : "Create an account to save every stage and revisit it anytime."}
            </p>
          </div>

          <input
            className="landing-textarea"
            style={{ minHeight: 0, height: 52 }}
            type="email"
            value={authEmail}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="Email"
            autoComplete="email"
          />
          <input
            className="landing-textarea"
            style={{ minHeight: 0, height: 52 }}
            type="password"
            value={authPassword}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="Password"
            autoComplete={authMode === "sign-in" ? "current-password" : "new-password"}
          />

          {error ? <div className="auth-error">{error}</div> : null}

          <button
            className="btn-primary btn-full"
            onClick={onSubmit}
            disabled={authLoading || !authEmail.trim() || authPassword.length < 8}
          >
            {authLoading ? "Please wait..." : authMode === "sign-in" ? "Sign In" : "Create Account"}
          </button>
        </section>
      </div>
    </div>
  );
}
