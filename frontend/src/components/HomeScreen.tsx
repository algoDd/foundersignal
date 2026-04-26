import { ArrowRight, Clock3, Play } from "lucide-react";
import { MarketPulseLogo } from "./MarketPulseLogo";

interface SessionSummary {
  created_at: string;
  id: string;
  idea?: string;
  title?: string;
}

interface HomeScreenProps {
  idea: string;
  isOrchestrating: boolean;
  placeholder: string;
  sessions: SessionSummary[];
  userEmail: string;
  onIdeaChange: (value: string) => void;
  onLoadSession: (sessionId: string) => void;
  onSignOut: () => void;
  onStartAnalysis: () => void;
}

function formatSessionDate(date: string) {
  return new Date(date).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function HomeScreen({
  idea,
  isOrchestrating,
  placeholder,
  sessions,
  userEmail,
  onIdeaChange,
  onLoadSession,
  onSignOut,
  onStartAnalysis,
}: HomeScreenProps) {
  const recentSessions = sessions.slice(0, 4);
  const firstName = userEmail.split("@")[0];

  return (
    <div className="landing home-shell">
      <div className="home-page">
        <header className="home-topbar">
          <div className="home-brand">
            <MarketPulseLogo size={32} />
            <span className="home-brand-name">MarketPulse</span>
          </div>
          <div className="home-user">
            <span className="home-user-label">{firstName}</span>
            <button className="btn-ghost" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </header>

        <div className="home-grid">
          <section className="home-hero">
            <h1 className="home-title">What do you want to bring to market?</h1>
            <p className="home-sub">
              A new startup, an existing product, or just a feature — describe what you're building and who it's for. We'll research the market, map competitors, and run simulated customer interviews.
            </p>

            <textarea
              value={idea}
              onChange={(event) => onIdeaChange(event.target.value)}
              placeholder={placeholder}
              rows={5}
              className="landing-textarea home-prompt-textarea"
            />
            <div className="home-prompt-actions">
              <button className="btn-primary" onClick={onStartAnalysis} disabled={!idea.trim() || isOrchestrating}>
                {isOrchestrating ? <Play size={16} /> : <ArrowRight size={16} />}
                {isOrchestrating ? "Running..." : "Analyse"}
              </button>
            </div>
          </section>

          <aside className="home-sidebar">
            <div className="home-sidebar-card">
              <div className="home-sidebar-header">
                <div className="home-sidebar-title">Previous sessions</div>
                {sessions.length > 0 && (
                  <div className="home-session-count">{sessions.length}</div>
                )}
              </div>

              {recentSessions.length === 0 ? (
                <div className="home-empty">
                  <Clock3 size={18} />
                  <div>
                    <div className="home-empty-title">Nothing here yet</div>
                    <div className="home-empty-text">Your past analyses will show up here.</div>
                  </div>
                </div>
              ) : (
                <div className="home-session-list">
                  {recentSessions.map((session, index) => (
                    <button
                      key={session.id}
                      className="home-session-card"
                      onClick={() => onLoadSession(session.id)}
                    >
                      <div className="home-session-rank">0{index + 1}</div>
                      <div className="home-session-copy">
                        <div className="home-session-idea">{session.title?.trim() || session.idea?.trim() || "Untitled"}</div>
                        <div className="home-session-meta">{formatSessionDate(session.created_at)}</div>
                      </div>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
