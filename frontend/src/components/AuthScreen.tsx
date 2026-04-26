import { Shield, Sparkles, Zap } from "lucide-react";
import { MarketPulseLogo } from "./MarketPulseLogo";

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
          <MarketPulseLogo size={48} />
          <div className="auth-eyebrow">MarketPulse</div>
          <h1 className="auth-title">See how the market reacts to your product before you enter it.</h1>
          <p className="auth-sub">
            Validate your idea with real market signals, simulated customer interviews, and competitive research — all
            before you commit a single line of code.
          </p>
          <div className="auth-chips">
            <span className="auth-chip"><Sparkles size={12} />AI-driven research</span>
            <span className="auth-chip"><Shield size={12} />Simulated customers</span>
            <span className="auth-chip"><Zap size={12} />Visual dashboards</span>
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
              {authMode === "sign-in" ? "Welcome back" : "Get started for free"}
            </h2>
            <p className="landing-sub">
              {authMode === "sign-in"
                ? "Continue your validation — pick up right where you left off."
                : "Create an account and start validating your idea in minutes."}
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
