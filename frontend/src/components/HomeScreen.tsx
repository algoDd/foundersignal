import { ArrowRight, Clock3, History, Play, Sparkles, TrendingUp, Zap } from "lucide-react";

interface SessionSummary {
  created_at: string;
  id: string;
  idea?: string;
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
            <div className="landing-icon">
              <Zap size={24} />
            </div>
            <div>
              <div className="home-brand-name">FounderSignal</div>
              <div className="home-brand-sub">Your startup diligence cockpit</div>
            </div>
          </div>
          <div className="home-user">
            <div className="home-user-copy">
              <span className="home-user-label">Signed in as</span>
              <strong>{firstName}</strong>
            </div>
            <button className="btn-ghost" onClick={onSignOut}>
              Sign Out
            </button>
          </div>
        </header>

        <div className="home-grid">
          <section className="home-hero">
            <div className="home-badge">
              <Sparkles size={14} />
              Dashboard-first founder workflow
            </div>
            <h1 className="home-title">Describe your startup idea and turn it into a visual, reviewable signal chain.</h1>
            <p className="home-sub">
              Start with ideation, review the strongest takeaways, resume any saved session, and build toward a fast
              2-minute demo story.
            </p>

            <div className="home-prompt-card">
              <div className="home-prompt-header">
                <div>
                  <div className="home-prompt-label">Describe your startup idea</div>
                  <div className="home-prompt-sub">
                    One clear paragraph is enough. We will handle refinement, market research, competition, UX, and interviews.
                  </div>
                </div>
                <div className="home-prompt-chip">
                  <TrendingUp size={13} />
                  Idea to signal chain
                </div>
              </div>
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
                  {isOrchestrating ? "Running analysis..." : "Get Signals"}
                </button>
                <div className="home-prompt-meta">
                  <span>Idea refinement first</span>
                  <span>Human checkpoints built in</span>
                </div>
              </div>
            </div>

            <div className="home-value-grid">
              <div className="home-value-card">
                <div className="home-value-icon">
                  <Sparkles size={16} />
                </div>
                <div>
                  <div className="home-value-title">Crisp idea refinement</div>
                  <div className="home-value-text">Readable, checkpoint-driven outputs instead of giant agent dumps.</div>
                </div>
              </div>
              <div className="home-value-card">
                <div className="home-value-icon">
                  <TrendingUp size={16} />
                </div>
                <div>
                  <div className="home-value-title">Visual stage dashboards</div>
                  <div className="home-value-text">Switch between dashboards and deeper reading whenever you want.</div>
                </div>
              </div>
              <div className="home-value-card">
                <div className="home-value-icon">
                  <History size={16} />
                </div>
                <div>
                  <div className="home-value-title">Resume any chain</div>
                  <div className="home-value-text">Saved sessions stay ready for review, interviews, and iteration.</div>
                </div>
              </div>
            </div>
          </section>

          <aside className="home-sidebar">
            <div className="home-sidebar-card">
              <div className="home-sidebar-header">
                <div>
                  <div className="home-sidebar-title">Previous sessions</div>
                  <div className="home-sidebar-sub">Open a saved chain and continue from the exact stage you left.</div>
                </div>
                <div className="home-session-count">{sessions.length}</div>
              </div>

              {recentSessions.length === 0 ? (
                <div className="home-empty">
                  <Clock3 size={18} />
                  <div>
                    <div className="home-empty-title">No saved sessions yet</div>
                    <div className="home-empty-text">Run your first idea and it will appear here for quick resume.</div>
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
                        <div className="home-session-idea">{session.idea?.trim() || "Untitled session"}</div>
                        <div className="home-session-meta">{formatSessionDate(session.created_at)}</div>
                      </div>
                      <ArrowRight size={15} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="home-sidebar-card home-tech-card">
              <div className="home-sidebar-title">Hackathon stack</div>
              <div className="home-tech-list">
                <span>Gemini for multi-agent reasoning</span>
                <span>Tavily for research and live web context</span>
                <span>Firestore for resume and stage persistence</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
