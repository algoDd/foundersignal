import { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity,
  Sparkles,
  Target,
  Zap,
  CheckCircle2,
  Cpu,
  BarChart3,
  Layout,
  Layers,
  Globe,
  Search,
  Clock,
  BarChart2,
  Users,
  Settings,
  ChevronRight,
  Volume2,
  Square,
  Plus,
  Radio,
  TrendingUp,
  Download,
  Moon,
  Sun,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { AuthScreen } from "./components/AuthScreen";
import { MarketPulseLogo } from "./components/MarketPulseLogo";
import { HomeScreen } from "./components/HomeScreen";
import { IdeaPromptBar } from "./components/IdeaPromptBar";
import StageDashboard from "./components/StageDashboard";
import { useTypewriterPlaceholder } from "./hooks/useTypewriterPlaceholder";
import InterviewChatModal from "./components/InterviewChatModal";
import {
  extractMarkdownSection,
  extractParagraphs,
  normalizeMarkdown,
} from "./utils/markdown";

const TOTAL_INTERVIEWS = 7; // minimum interviews shown; update to match backend archetype count
const API_BASE = "http://localhost:8000/api/v1";

const AGENTS = [
  {
    id: "refine",
    label: "Idea Refinement",
    icon: Sparkles,
    endpoint: "/refine",
  },
  {
    id: "market",
    label: "Market Research",
    icon: Activity,
    endpoint: "/market",
  },
  {
    id: "competitors",
    label: "Competitor Analysis",
    icon: Target,
    endpoint: "/competitors",
  },
  { id: "ux", label: "User Journey", icon: Layers, endpoint: "/ux" },
  { id: "ui", label: "Visual Prototype", icon: Layout, endpoint: "/ui" },
  {
    id: "visibility",
    label: "AI Visibility",
    icon: Globe,
    endpoint: "/visibility",
  },
  {
    id: "scoring",
    label: "Validation Score",
    icon: BarChart3,
    endpoint: "/scoring",
  },
];

// ── TTS hook ──────────────────────────────────────────────────────────────
function useTTS() {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);

  const stop = useCallback(() => {
    readerRef.current?.cancel().catch(() => {});
    readerRef.current = null;
    sourceRef.current?.stop();
    sourceRef.current = null;
    setState("idle");
  }, []);

  const play = useCallback(
    async (text: string, archetype: string, gender: string) => {
      stop();
      setState("loading");
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const res = await fetch("http://localhost:8000/api/v1/agents/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, archetype, gender }),
        });
        if (!res.ok) throw new Error("TTS request failed");
        const reader = res.body!.getReader();
        readerRef.current = reader;
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const merged = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          merged.set(c, offset);
          offset += c.length;
        }
        const audioBuffer = await ctx.decodeAudioData(merged.buffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        sourceRef.current = source;
        source.onended = () => setState("idle");
        setState("playing");
        source.start();
      } catch (e) {
        console.error("TTS error", e);
        setState("idle");
      }
    },
    [stop],
  );

  return { state, play, stop };
}

function deriveSessionTitle(session: any) {
  const directTitle = session?.title?.trim();
  if (directTitle) return directTitle;

  const directIdea = session?.idea?.trim();
  if (directIdea) return directIdea.slice(0, 90);

  const nestedIdea = session?.input?.idea?.trim();
  if (nestedIdea) return nestedIdea.slice(0, 90);

  const refineText = session?.results_map?.refine || "";
  const pitch = extractMarkdownSection(refineText, "Draft Pitch");
  if (pitch) return pitch.replace(/\n+/g, " ").slice(0, 90);

  return "Untitled session";
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [idea, setIdea] = useState("");
  const [results, setResults] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<
    Record<string, "pending" | "running" | "completed" | "error">
  >({});
  const [tokens, setTokens] = useState<Record<string, number>>({});
  const [searches, setSearches] = useState<Record<string, any[]>>({});
  const [activeTab, setActiveTab] = useState("overview");
  const [contentMode, setContentMode] = useState<"dashboard" | "reading">("dashboard");
  const [darkMode, setDarkMode] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [agentTimestamps, setAgentTimestamps] = useState<
    Record<string, { start: number; end?: number }>
  >({});
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [interviewReport, setInterviewReport] = useState<string>('');
  const [selectedInterviewIndex, setSelectedInterviewIndex] = useState<
    number | null
  >(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const interviewBuffers = useRef<Record<string, string>>({});
  const [chatHistories, setChatHistories] = useState<Record<string, {role: string, content: string}[]>>({});
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [leftSection, setLeftSection] = useState<"pipeline" | "history">(
    "pipeline",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(
    () => localStorage.getItem("fs_auth_token"),
  );
  const [authUser, setAuthUser] = useState<{ email: string; uid: string } | null>(
    () => {
      const raw = localStorage.getItem("fs_auth_user");
      return raw ? JSON.parse(raw) : null;
    },
  );
  const tts = useTTS();

  const totalTokens = Object.values(tokens).reduce((a, v) => a + v, 0);
  const totalSearches = Object.values(searches).reduce(
    (a, v) => a + (v?.length || 0),
    0,
  );
  const hasResults = Object.keys(results).length > 0;
  const activeMarkdown = results[activeTab] || "";
  const activeParagraphs = extractParagraphs(activeMarkdown, 2);
  const activeAgent = AGENTS.find((a) => a.id === activeTab);
  const activeSearches = searches[activeTab]?.length || 0;
  const activeTokens = tokens[activeTab] || 0;

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      darkMode ? "dark" : "light",
    );
  }, [darkMode]);

  useEffect(() => {
    if (activeTab !== "overview" && activeTab !== "interviews") {
      setContentMode("dashboard");
    }
  }, [activeTab]);

  useEffect(() => {
    fetchSessions();
  }, [authToken]);

  useEffect(() => {
    const bootstrapAuth = async () => {
      if (!authToken) return;
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) throw new Error("Auth expired");
        const user = await res.json();
        setAuthUser(user);
        localStorage.setItem("fs_auth_user", JSON.stringify(user));
      } catch {
        localStorage.removeItem("fs_auth_token");
        localStorage.removeItem("fs_auth_user");
        setAuthToken(null);
        setAuthUser(null);
      }
    };
    bootstrapAuth();
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;
    if (!idea.trim() && Object.keys(results).length === 0 && interviews.length === 0) return;

    const timer = window.setTimeout(() => {
      void saveCurrentSession(results, status, tokens, searches, interviews, interviewReport);
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [authToken, idea, results, status, tokens, searches, interviews, interviewReport]);

  const getHeaders = (includeJson = false) => {
    const headers: Record<string, string> = {};
    if (includeJson) headers["Content-Type"] = "application/json";
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    return headers;
  };


  // ── Data fetchers ────────────────────────────────────────────────────────
  const fetchSessions = async () => {
    if (!authToken) {
      setSessions([]);
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/agents/sessions`, {
        headers: getHeaders(),
      });
      if (!r.ok) throw new Error("Failed to load sessions");
      const rawSessions = await r.json();
      setSessions(
        rawSessions.map((session: any) => ({
          ...session,
          title: deriveSessionTitle(session),
          idea: session.idea || session.input?.idea || "",
        })),
      );
    } catch {}
  };

  const loadSession = async (sessionId: string) => {
    try {
      const r = await fetch(`${API_BASE}/agents/sessions/${sessionId}`, {
        headers: getHeaders(),
      });
      if (!r.ok) throw new Error("Failed to load session");
      const d = await r.json();
      setIdea(d.input?.idea || d.idea || "");
      setCurrentSessionId(d.report_id || sessionId);
      setResults(d.results_map || {});
      setStatus(d.status_map || {});
      setTokens(d.tokens_map || {});
      setSearches(d.searches_map || {});
      setInterviews(d.interviews || []);
      setInterviewReport(d.interview_report || "");
      setSelectedInterviewIndex((d.interviews || []).length ? 0 : null);
      setActiveTab("overview");
      setGlobalError(null);
    } catch (error: any) {
      setGlobalError(error?.message || "Unable to open this saved session.");
    }
  };

  const saveCurrentSession = async (
    r: any,
    s: any,
    t: any,
    se: any,
    interviewItems: any[] = interviews,
    reportText: string = interviewReport,
  ) => {
    if (!authToken) return;
    try {
      const id = currentSessionId || Math.random().toString(36).slice(7);
      await fetch(`${API_BASE}/agents/sessions/save`, {
        method: "POST",
        headers: getHeaders(true),
        body: JSON.stringify({
          report_id: id,
          title: idea.trim().slice(0, 90),
          input: { idea },
          results_map: r,
          status_map: s,
          tokens_map: t,
          searches_map: se,
          interviews: interviewItems,
          interview_report: reportText,
          created_at: new Date().toISOString(),
        }),
      });
      setCurrentSessionId(id);
      fetchSessions();
    } catch {}
  };

  const submitAuth = async () => {
    if (!authEmail.trim() || !authPassword.trim()) return;
    setAuthLoading(true);
    setGlobalError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authEmail.trim(),
          password: authPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Authentication failed");
      }
      localStorage.setItem("fs_auth_token", data.id_token);
      localStorage.setItem(
        "fs_auth_user",
        JSON.stringify({ uid: data.local_id, email: data.email }),
      );
      setAuthToken(data.id_token);
      setAuthUser({ uid: data.local_id, email: data.email });
      setAuthPassword("");
    } catch (e: any) {
      setGlobalError(e.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem("fs_auth_token");
    localStorage.removeItem("fs_auth_user");
    setAuthToken(null);
    setAuthUser(null);
    setSessions([]);
    setCurrentSessionId(null);
  };

  const goHome = () => {
    setIdea("");
    setResults({});
    setStatus({});
    setTokens({});
    setSearches({});
    setInterviews([]);
    setInterviewReport("");
    setSelectedInterviewIndex(null);
    setCurrentSessionId(null);
    setIsSimulating(false);
    setGlobalError(null);
    setActiveTab("overview");
    setContentMode("dashboard");
  };

  // ── Streaming ────────────────────────────────────────────────────────────
  const streamAgent = async (
    agentId: string,
    payload: any,
  ): Promise<string> => {
    setStatus((p) => ({ ...p, [agentId]: "running" }));
    setAgentTimestamps((p) => ({ ...p, [agentId]: { start: Date.now() } }));
    setResults((p) => ({ ...p, [agentId]: "" }));
    try {
      const res = await fetch(
        `http://localhost:8000/api/v1/agents${AGENTS.find((a) => a.id === agentId)?.endpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error(`Agent ${agentId} failed`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");
      const dec = new TextDecoder();
      let full = "",
        buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.chunk) {
              full += d.chunk;
              setResults((p) => ({ ...p, [agentId]: full }));
            }
            if (d.tokens) setTokens((p) => ({ ...p, [agentId]: d.tokens }));
            if (d.searches)
              setSearches((p) => ({ ...p, [agentId]: d.searches }));
            if (d.error) {
              setStatus((p) => ({ ...p, [agentId]: "error" }));
              throw new Error(d.error);
            }
          } catch {}
        }
      }
      setStatus((p) =>
        p[agentId] === "error" ? p : { ...p, [agentId]: "completed" },
      );
      setAgentTimestamps((p) => ({
        ...p,
        [agentId]: { ...p[agentId], end: Date.now() },
      }));
      return full;
    } catch (e: any) {
      setStatus((p) => ({ ...p, [agentId]: "error" }));
      throw e;
    }
  };

  const startInterviews = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setInterviews([]);
    setInterviewReport('');
    interviewBuffers.current = {};
    try {
      const res = await fetch(
        "http://localhost:8000/api/v1/agents/interviews",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            refined_idea: results["refine"],
            market_research: results["market"],
            competitors: results["competitors"],
            ux: results["ux"],
            ui: results["ui"],
            visibility: results["visibility"],
            scoring: results["scoring"],
          }),
        },
      );
      if (!res.ok) throw new Error("Simulation failed");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const d = JSON.parse(line.slice(6));
          if (d.is_report) {
            if (d.report_chunk) setInterviewReport(r => r + d.report_chunk);
          } else if (d.user) {
            const uname = d.user.context?.name || d.user.name;
            if (d.chunk) {
              interviewBuffers.current[uname] =
                (interviewBuffers.current[uname] || "") + d.chunk;
              const acc = interviewBuffers.current[uname];
              setInterviews((prev) => {
                const idx = prev.findIndex(
                  (i) => (i.user.context?.name || i.user.name) === uname,
                );
                if (idx >= 0) {
                  const u = [...prev];
                  u[idx] = { ...u[idx], response: acc };
                  return u;
                }
                if (prev.length === 0) setSelectedInterviewIndex(0);
                return [
                  ...prev,
                  { user: d.user, response: acc, is_complete: false },
                ];
              });
            }
            if (d.is_complete) {
              setInterviews((prev) => {
                const idx = prev.findIndex(
                  (i) => (i.user.context?.name || i.user.name) === uname,
                );
                if (idx >= 0) {
                  const u = [...prev];
                  u[idx] = { ...u[idx], is_complete: true };
                  return u;
                }
                return prev;
              });
            }
          }
        }
      }
    } catch (e: any) {
      setGlobalError(e.message);
    } finally {
      setIsSimulating(false);
    }
  };

  const sendFollowUp = async (question: string, interview: any) => {
    if (!question.trim() || chatLoading || !interview?.is_complete) return;
    const personaName = interview.user.context?.name || interview.user.name;
    setChatHistories(prev => ({
      ...prev,
      [personaName]: [...(prev[personaName] || []), { role: "user", content: question }],
    }));
    setChatInput("");
    setChatLoading(true);
    // Add a placeholder assistant message that we'll update as chunks arrive
    setChatHistories(prev => ({
      ...prev,
      [personaName]: [...(prev[personaName] || []), { role: "assistant", content: "" }],
    }));
    try {
      const res = await fetch("http://localhost:8000/api/v1/agents/interviews/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: interview.user,
          question,
          prior_response: interview.response || "",
          refined_idea: results["refine"] || "",
          market_research: results["market"] || "",
          competitors: results["competitors"] || "",
          ux: results["ux"] || "",
          ui: results["ui"] || "",
          visibility: results["visibility"] || "",
          scoring: results["scoring"] || "",
        }),
      });
      if (!res.ok) throw new Error("Follow-up request failed");
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No reader");
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const d = JSON.parse(line.slice(6));
          if (d.chunk) {
            setChatHistories(prev => {
              const history = [...(prev[personaName] || [])];
              const lastIdx = history.length - 1;
              if (lastIdx >= 0 && history[lastIdx].role === "assistant") {
                history[lastIdx] = { role: "assistant", content: history[lastIdx].content + d.chunk };
              }
              return { ...prev, [personaName]: history };
            });
          }
        }
      }
    } catch (e: any) {
      setChatHistories(prev => {
        const history = [...(prev[personaName] || [])];
        const lastIdx = history.length - 1;
        if (lastIdx >= 0 && history[lastIdx].role === "assistant" && history[lastIdx].content === "") {
          history[lastIdx] = { role: "assistant", content: "Sorry, something went wrong. Please try again." };
        }
        return { ...prev, [personaName]: history };
      });
    } finally {
      setChatLoading(false);
    }
  };

  const startAnalysis = async () => {
    if (isOrchestrating || !idea.trim()) return;
    setIsOrchestrating(true);
    setResults({});
    setStatus({});
    setTokens({});
    setSearches({});
    setInterviews([]);
    setInterviewReport('');
    setSelectedInterviewIndex(null);
    setAgentTimestamps({});
    setActiveTab("overview");
    setGlobalError(null);
    try {
      const refined = await streamAgent("refine", { idea });
      await new Promise((r) => setTimeout(r, 500));
      const [market, comp] = await Promise.all([
        streamAgent("market", { refined_idea: refined }),
        streamAgent("competitors", { refined_idea: refined }),
      ]);
      const [ux] = await Promise.all([
        streamAgent("ux", { refined_idea: refined, market_research: market }),
        streamAgent("scoring", {
          refined_idea: refined,
          market_research: market,
          competitor_research: comp,
        }),
      ]);
      await new Promise((r) => setTimeout(r, 500));
      await streamAgent("visibility", {
        refined_idea: refined,
        competitor_research: comp,
      });
      await streamAgent("ui", { refined_idea: refined, ux_flow: ux });
      await saveCurrentSession(results, status, tokens, searches);
    } catch (e: any) {
      setGlobalError(e.message || "Pipeline interrupted.");
    } finally {
      setIsOrchestrating(false);
    }
  };

  // ── Landing ──────────────────────────────────────────────────────────────
  const placeholder = useTypewriterPlaceholder();

  if (!authUser) {
    return (
      <AuthScreen
        authEmail={authEmail}
        authLoading={authLoading}
        authMode={authMode}
        authPassword={authPassword}
        error={globalError}
        onEmailChange={setAuthEmail}
        onModeChange={setAuthMode}
        onPasswordChange={setAuthPassword}
        onSubmit={submitAuth}
      />
    );
  }

  if (!hasResults && !isOrchestrating) {
    return (
      <HomeScreen
        idea={idea}
        isOrchestrating={isOrchestrating}
        placeholder={placeholder}
        sessions={sessions}
        userEmail={authUser.email}
        onIdeaChange={setIdea}
        onLoadSession={loadSession}
        onSignOut={signOut}
        onStartAnalysis={startAnalysis}
      />
    );
  }

  // ── Nav items ─────────────────────────────────────────────────────────────
  const allNavItems = [
    {
      id: "overview",
      label: "Overview",
      icon: BarChart2,
      status: "overview" as const,
    },
    ...AGENTS.map((a) => ({
      id: a.id,
      label: a.label,
      icon: a.icon,
      status: status[a.id] || ("pending" as any),
    })),
    {
      id: "interviews",
      label: "Interviews",
      icon: Users,
      status: (isSimulating
        ? "running"
        : interviews.length > 0
          ? "completed"
          : "pending") as any,
    },
  ];

  const completedCount = AGENTS.filter(
    (a) => status[a.id] === "completed",
  ).length;

  // ── Shell ─────────────────────────────────────────────────────────────────
  return (
    <div className="shell">
      {/* ── Left nav ── */}
      <nav className="left-nav">
        <div className="nav-brand">
          <MarketPulseLogo size={24} />
          <span className="nav-brand-name">MarketPulse</span>
        </div>

        <div className="nav-body">
          {/* section toggle */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            <button
              className={`btn-ghost${leftSection === "pipeline" ? "" : ""}`}
              onClick={() => setLeftSection("pipeline")}
              style={{
                flex: 1,
                justifyContent: "center",
                fontSize: "0.76rem",
                background:
                  leftSection === "pipeline"
                    ? "var(--primary-light)"
                    : "transparent",
                color:
                  leftSection === "pipeline"
                    ? "var(--primary)"
                    : "var(--text-secondary)",
                borderColor:
                  leftSection === "pipeline"
                    ? "var(--primary-border)"
                    : "var(--border)",
              }}
            >
              <BarChart2 size={13} /> Pipeline
            </button>
            <button
              className="btn-ghost"
              onClick={() => setLeftSection("history")}
              style={{
                flex: 1,
                justifyContent: "center",
                fontSize: "0.76rem",
                background:
                  leftSection === "history"
                    ? "var(--primary-light)"
                    : "transparent",
                color:
                  leftSection === "history"
                    ? "var(--primary)"
                    : "var(--text-secondary)",
                borderColor:
                  leftSection === "history"
                    ? "var(--primary-border)"
                    : "var(--border)",
              }}
            >
              <Clock size={13} /> History
            </button>
          </div>

          {leftSection === "pipeline" ? (
            <>
              {allNavItems.map((item) => {
                const Icon = item.icon;
                const s = item.status;
                const clickable =
                  item.id === "overview" ||
                  item.id === "interviews" ||
                  s === "completed" ||
                  s === "running";
                const badge =
                  s === "running"
                    ? "running"
                    : s === "completed"
                      ? "done"
                      : s === "error"
                        ? "error"
                        : null;
                return (
                  <button
                    key={item.id}
                    className={`nav-item${activeTab === item.id ? " active" : ""}${!clickable ? " muted" : ""}`}
                    onClick={() => clickable && setActiveTab(item.id)}
                    disabled={!clickable}
                  >
                    <Icon size={15} />
                    <span className="nav-item-label">{item.label}</span>
                    {badge && (
                      <span className={`nav-badge ${badge}`}>
                        {badge === "running"
                          ? "●"
                          : badge === "done"
                            ? "✓"
                            : "!"}
                      </span>
                    )}
                    {activeTab === item.id && (
                      <ChevronRight
                        size={12}
                        style={{ marginLeft: "auto", opacity: 0.4 }}
                      />
                    )}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {sessions.length === 0 ? (
                <div
                  style={{
                    padding: "32px 8px",
                    color: "var(--text-muted)",
                    fontSize: "0.82rem",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Clock size={22} />
                  No saved sessions
                </div>
              ) : (
                sessions.map((s) => (
                  <button
                    key={s.id}
                    className={`nav-item session-row${currentSessionId === s.id ? " active" : ""}`}
                    onClick={() => loadSession(s.id)}
                  >
                    <div className="session-idea">{s.title || s.idea}</div>
                    <div className="session-date">
                      {new Date(s.created_at).toLocaleDateString()}
                    </div>
                  </button>
                ))
              )}
            </>
          )}
        </div>

        <div className="nav-divider" />
        <div style={{ padding: "4px 12px 8px" }}>
          <button className="nav-item" style={{ opacity: 0.55 }}>
            <Settings size={15} />
            <span className="nav-item-label">Settings</span>
          </button>
        </div>

        <div className="nav-credits">
          <div className="nav-credits-title">Powered by</div>
          <div className="nav-credit-item">
            <div className="nav-credit-dot" style={{ background: "#7c3aed" }} />
            <span className="nav-credit-brand">Gradium:</span> Voice Agents
          </div>
          <div className="nav-credit-item">
            <div className="nav-credit-dot" style={{ background: "#0284c7" }} />
            <span className="nav-credit-brand">Tavily:</span> Market Research
          </div>
          <div className="nav-credit-item">
            <div className="nav-credit-dot" style={{ background: "#1a73e8" }} />
            <span className="nav-credit-brand">Google DeepMind:</span> LLMs
          </div>
          <div className="nav-credit-item">
            <div className="nav-credit-dot" style={{ background: "#10b981" }} />
            <span className="nav-credit-brand">Pioneer:</span> Synthetic Data
          </div>
        </div>
      </nav>

      {/* ── Main area ── */}
      <main className="main">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-search">
            <Search size={14} style={{ flexShrink: 0 }} />
            <input
              placeholder="Search agents, results…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="topbar-right">
            <div className="stat-chip">
              <Cpu size={13} /> {totalTokens.toLocaleString()} tokens
            </div>
            <div className="stat-chip">
              <Search size={13} /> {totalSearches} searches
            </div>
            <button
              className="theme-toggle"
              onClick={() => setDarkMode((d) => !d)}
              title={darkMode ? "Light mode" : "Dark mode"}
            >
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              className="btn-new"
              onClick={goHome}
            >
              <Plus size={14} /> New Idea
            </button>
            <div className="topbar-avatar">
              <div className="topbar-avatar-img">F</div>
              <div>
                <div className="topbar-avatar-name">{authUser.email.split("@")[0]}</div>
                <div className="topbar-avatar-role">Signed in</div>
              </div>
            </div>
            <button className="btn-ghost" onClick={signOut}>
              Sign Out
            </button>
          </div>
        </div>

        {/* Page inner */}
        <div className="page-inner">
          {/* Idea prompt bar — always visible */}
          <IdeaPromptBar
            idea={idea}
            isOrchestrating={isOrchestrating}
            onIdeaChange={setIdea}
            onRerun={startAnalysis}
          />

          {/* Error banner */}
          {globalError && (
            <div
              className="error-box fade-in"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <strong>Pipeline interrupted</strong>
                <p style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                  {globalError}
                </p>
              </div>
              <button
                className="btn-ghost"
                onClick={() => setGlobalError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ── Overview / Dashboard ── */}
          {activeTab === "overview" && (
            <div
              className="fade-in"
              style={{ display: "flex", flexDirection: "column", gap: 18 }}
            >
              {/* Row 1: Research Timeline + Customer Interviews + Pipeline Stats */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 300px",
                  gap: 18,
                }}
              >
                {/* Research Timeline */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <div
                        className="card-title-icon"
                        style={{ background: "rgba(108,99,255,0.10)" }}
                      >
                        <Activity size={14} color="var(--primary)" />
                      </div>
                      Research Timeline
                    </div>
                  </div>
                  <div className="timeline-track">
                    {AGENTS.map((agent, idx) => {
                      const s = status[agent.id] || "pending";
                      const ts = agentTimestamps[agent.id];
                      const duration =
                        ts?.start && ts?.end
                          ? ((ts.end - ts.start) / 1000).toFixed(0)
                          : null;
                      const startTime = ts?.start
                        ? new Date(ts.start).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : null;
                      const Icon = agent.icon;
                      const isLast = idx === AGENTS.length - 1;
                      return (
                        <div key={agent.id} className="timeline-item">
                          <div className="timeline-left">
                            <div className={`timeline-node ${s}`}>
                              {s === "completed" ? (
                                <CheckCircle2 size={12} />
                              ) : s === "running" ? (
                                <div
                                  className="spinner"
                                  style={{ width: 10, height: 10 }}
                                />
                              ) : (
                                <Icon size={11} />
                              )}
                            </div>
                            {!isLast && (
                              <div
                                className={`timeline-line ${s === "pending" ? "" : "active"}`}
                              />
                            )}
                          </div>
                          <div
                            className={`timeline-content${s === "completed" ? " clickable" : ""}`}
                            onClick={() =>
                              s === "completed" && setActiveTab(agent.id)
                            }
                          >
                            <div className="timeline-name">{agent.label}</div>
                            <div className="timeline-meta">
                              {startTime && <span>{startTime}</span>}
                              {duration && <span>{duration}s</span>}
                              {tokens[agent.id] ? (
                                <span>
                                  {tokens[agent.id].toLocaleString()} tokens
                                </span>
                              ) : null}
                              {searches[agent.id]?.length ? (
                                <span>
                                  {searches[agent.id].length} searches
                                </span>
                              ) : null}
                              {s === "pending" && (
                                <span style={{ color: "var(--text-muted)" }}>
                                  Pending
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Customer Interviews */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <div
                        className="card-title-icon"
                        style={{ background: "rgba(34,197,94,0.10)" }}
                      >
                        <Users size={14} color="#16a34a" />
                      </div>
                      Customer Interviews
                    </div>
                    {interviews.length > 0 && (
                      <button
                        className="see-all"
                        onClick={() => setActiveTab("interviews")}
                      >
                        See All
                      </button>
                    )}
                  </div>
                  {interviews.length === 0 ? (
                    <div
                      className="interview-cta"
                      style={{
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 10,
                      }}
                    >
                      {(() => {
                        const missing = [
                          !results['refine']      && 'Idea Refinement',
                          !results['market']      && 'Market Research',
                          !results['competitors'] && 'Competitor Analysis',
                          !results['ui']          && 'Visual Prototype',
                        ].filter(Boolean) as string[];
                        const canStart = missing.length === 0 && !isSimulating;
                        return (
                          <>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>Simulate Customer Interviews</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3 }}>
                                Run {TOTAL_INTERVIEWS} synthetic user interviews based on your full research dossier
                              </div>
                              {missing.length > 0 && !isSimulating && (
                                <div style={{ fontSize: '0.73rem', color: 'var(--warning)', marginTop: 6, fontWeight: 600 }}>
                                  Waiting for: {missing.join(', ')}
                                </div>
                              )}
                            </div>
                            <button
                              className="btn-primary"
                              onClick={startInterviews}
                              disabled={!canStart}
                            >
                              {isSimulating
                                ? <div className="spinner" style={{ width: 14, height: 14 }} />
                                : <Users size={14} />}
                              {isSimulating ? 'Generating…' : 'Start Interviews'}
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {interviews.slice(0, 5).map((int, idx) => (
                        <div
                          key={idx}
                          className="meeting-card"
                          onClick={() => {
                            setActiveTab("interviews");
                            setSelectedInterviewIndex(idx);
                          }}
                        >
                          <div className="meeting-title">
                            {int.user.context?.name || int.user.name}
                          </div>
                          <div className="meeting-sub">
                            <Users size={11} />
                            {int.user.archetype}
                            {int.is_complete ? (
                              <CheckCircle2
                                size={11}
                                color="var(--success)"
                                style={{ marginLeft: "auto" }}
                              />
                            ) : (
                              <div
                                className="spinner"
                                style={{
                                  width: 11,
                                  height: 11,
                                  marginLeft: "auto",
                                }}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                      {/* Single skeleton while next interview is expected */}
                      {isSimulating && (interviews.length === 0 || interviews[interviews.length - 1]?.is_complete) && interviews.length < 5 &&
                        [0].map((_, i) => (
                          <div
                            key={`sk-${i}`}
                            className="meeting-card"
                            style={{ pointerEvents: "none" }}
                          >
                            <div
                              className="skeleton-line"
                              style={{
                                width: "60%",
                                height: 11,
                                borderRadius: 4,
                              }}
                            />
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                marginTop: 6,
                              }}
                            >
                              <div
                                className="skeleton-line"
                                style={{
                                  width: "40%",
                                  height: 9,
                                  borderRadius: 4,
                                }}
                              />
                              <div
                                className="skeleton-dot"
                                style={{ marginLeft: "auto" }}
                              />
                            </div>
                          </div>
                        ))}
                      {interviews.length > 5 && (
                        <button
                          className="see-all"
                          style={{ textAlign: "left", padding: "4px 0" }}
                          onClick={() => setActiveTab("interviews")}
                        >
                          +{interviews.length - 5} more interviews
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Pipeline Stats — 3 stacked panels */}
                <div className="card" style={{ gap: 10 }}>
                  <div className="card-header">
                    <div className="card-title">
                      <div
                        className="card-title-icon"
                        style={{ background: "rgba(245,158,11,0.10)" }}
                      >
                        <TrendingUp size={14} color="#d97706" />
                      </div>
                      Pipeline Stats
                    </div>
                  </div>

                  {/* Panel 1 — Completed agents */}
                  <div className="stat-panel">
                    <div className="stat-panel-label">
                      <CheckCircle2 size={12} color="var(--success)" /> Agents
                      Completed
                    </div>
                    <div className="stat-panel-value">
                      {completedCount}
                      <span>/ {AGENTS.length}</span>
                    </div>
                    <div className="progress-bar" style={{ marginTop: 8 }}>
                      <div
                        className="progress-fill"
                        style={{
                          width: `${AGENTS.length > 0 ? (completedCount / AGENTS.length) * 100 : 0}%`,
                          background:
                            "linear-gradient(90deg, var(--success), #86efac)",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 4,
                        fontSize: "0.7rem",
                        color: "var(--text-muted)",
                        fontWeight: 500,
                      }}
                    >
                      <span>
                        {
                          AGENTS.filter((a) => status[a.id] === "running")
                            .length
                        }{" "}
                        running
                      </span>
                      <span>
                        {AGENTS.filter((a) => status[a.id] === "error").length}{" "}
                        failed
                      </span>
                    </div>
                  </div>

                  {/* Panel 2 — Tokens used */}
                  <div className="stat-panel">
                    <div className="stat-panel-label">
                      <Cpu size={12} color="var(--primary)" /> Tokens Used
                    </div>
                    <div className="stat-panel-value">
                      {totalTokens > 999
                        ? `${(totalTokens / 1000).toFixed(1)}k`
                        : totalTokens}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 4,
                        marginTop: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {AGENTS.filter((a) => tokens[a.id]).map((a) => {
                        const pct =
                          totalTokens > 0 ? tokens[a.id] / totalTokens : 0;
                        return (
                          <div
                            key={a.id}
                            title={`${a.label}: ${tokens[a.id].toLocaleString()} tokens`}
                            style={{
                              height: 6,
                              borderRadius: 3,
                              background: "var(--primary)",
                              opacity: 0.3 + pct * 0.7,
                              flex: `${tokens[a.id]} 0 0`,
                              minWidth: 4,
                              transition: "flex 0.4s ease",
                            }}
                          />
                        );
                      })}
                      {totalTokens === 0 && (
                        <div
                          style={{
                            height: 6,
                            borderRadius: 3,
                            background: "var(--border)",
                            flex: 1,
                          }}
                        />
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text-muted)",
                        marginTop: 4,
                        fontWeight: 500,
                      }}
                    >
                      across {Object.keys(tokens).length} agent
                      {Object.keys(tokens).length !== 1 ? "s" : ""}
                    </div>
                  </div>

                  {/* Panel 3 — Web searches */}
                  <div className="stat-panel">
                    <div className="stat-panel-label">
                      <Search size={12} color="#0284c7" /> Web Searches
                    </div>
                    <div
                      className="stat-panel-value"
                      style={{ color: "#0284c7" }}
                    >
                      {totalSearches}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        marginTop: 8,
                      }}
                    >
                      {AGENTS.filter((a) => searches[a.id]?.length).map((a) => (
                        <div
                          key={a.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--text-muted)",
                              width: 72,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontWeight: 500,
                            }}
                          >
                            {a.label}
                          </span>
                          <div
                            style={{
                              flex: 1,
                              height: 4,
                              background: "var(--border)",
                              borderRadius: 2,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                borderRadius: 2,
                                background: "#38bdf8",
                                width: `${totalSearches > 0 ? (searches[a.id].length / totalSearches) * 100 : 0}%`,
                                transition: "width 0.4s ease",
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--text-secondary)",
                              fontWeight: 600,
                              minWidth: 14,
                              textAlign: "right",
                            }}
                          >
                            {searches[a.id].length}
                          </span>
                        </div>
                      ))}
                      {totalSearches === 0 && (
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--text-muted)",
                            fontWeight: 500,
                          }}
                        >
                          No searches yet
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: Status + Recent Sessions */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 2fr",
                  gap: 18,
                }}
              >
                {/* Status — live pipeline activity */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <div
                        className="card-title-icon"
                        style={{ background: "rgba(108,99,255,0.10)" }}
                      >
                        <Radio size={14} color="var(--primary)" />
                      </div>
                      Status
                    </div>
                  </div>
                  {(() => {
                    const errors = AGENTS.filter(
                      (a) => status[a.id] === "error",
                    );
                    const running = AGENTS.filter(
                      (a) => status[a.id] === "running",
                    );
                    const completed = AGENTS.filter(
                      (a) => status[a.id] === "completed",
                    ).sort(
                      (a, b) =>
                        (agentTimestamps[b.id]?.end || 0) -
                        (agentTimestamps[a.id]?.end || 0),
                    );
                    const items = [...errors, ...running, ...completed].slice(
                      0,
                      3,
                    );

                    if (items.length === 0)
                      return (
                        <div className="alert-list">
                          <div className="alert-item">
                            <div className="alert-dot info" />
                            <div className="alert-text">
                              Pipeline not started yet.
                            </div>
                          </div>
                        </div>
                      );

                    return (
                      <div className="alert-list">
                        {items.map((a) => {
                          const s = status[a.id];
                          const ts = agentTimestamps[a.id];
                          const duration =
                            ts?.start && ts?.end
                              ? `${((ts.end - ts.start) / 1000).toFixed(0)}s`
                              : null;
                          return (
                            <div key={a.id} className="alert-item">
                              {s === "error" && (
                                <div className="alert-dot error" />
                              )}
                              {s === "running" && (
                                <div className="alert-dot warning" />
                              )}
                              {s === "completed" && (
                                <div
                                  className="alert-dot"
                                  style={{ background: "var(--success)" }}
                                />
                              )}
                              <div className="alert-text">
                                <span
                                  className="alert-link"
                                  style={{
                                    cursor:
                                      s === "completed" ? "pointer" : "default",
                                  }}
                                  onClick={() =>
                                    s === "completed" && setActiveTab(a.id)
                                  }
                                >
                                  {a.label}
                                </span>
                                {s === "error" && " failed."}
                                {s === "running" && " is streaming…"}
                                {s === "completed" && (
                                  <>
                                    {" "}
                                    completed{duration ? ` in ${duration}` : ""}
                                    .
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Recent sessions */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <div
                        className="card-title-icon"
                        style={{ background: "rgba(56,189,248,0.10)" }}
                      >
                        <Clock size={14} color="#0284c7" />
                      </div>
                      Recent Sessions
                    </div>
                    <button
                      className="see-all"
                      onClick={() => setLeftSection("history")}
                    >
                      See All
                    </button>
                  </div>
                  {sessions.length === 0 ? (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.82rem",
                        padding: "12px 0",
                      }}
                    >
                      No saved sessions yet.
                    </div>
                  ) : (
                    <div className="templates-grid">
                      {sessions.slice(0, 4).map((s) => (
                        <div
                          key={s.id}
                          className={`template-card${currentSessionId === s.id ? " active-session" : ""}`}
                          onClick={() => loadSession(s.id)}
                        >
                          <div className="template-tag">Session</div>
                          <div
                            className="template-name"
                            style={{ fontSize: "0.8rem" }}
                          >
                            {s.title?.slice(0, 50) || s.idea?.slice(0, 50) || "Untitled"}
                          </div>
                          <div className="template-desc">
                            {new Date(s.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Agent result tabs ── */}
          {activeTab !== "overview" && activeTab !== "interviews" && (
            <div className="content-card fade-in">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <div>
                  <div className="card-title" style={{ marginBottom: 4 }}>
                    {activeAgent?.label || activeTab}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Use the TL;DR view for the fastest signal, or switch into the full written analysis.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      className="btn-ghost"
                      onClick={() => setContentMode("dashboard")}
                      style={{
                        background: contentMode === "dashboard" ? "var(--primary-light)" : undefined,
                        borderColor: contentMode === "dashboard" ? "var(--primary-border)" : undefined,
                      }}
                    >
                      TL;DR
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => setContentMode("reading")}
                      style={{
                        background: contentMode === "reading" ? "var(--primary-light)" : undefined,
                        borderColor: contentMode === "reading" ? "var(--primary-border)" : undefined,
                      }}
                    >
                      Full Read
                    </button>
                  </div>
                  <button
                    className="btn-ghost"
                    style={{ gap: 6 }}
                    disabled={!results[activeTab]}
                    title="Download as Markdown"
                    onClick={() => {
                      const label = activeAgent?.label || activeTab;
                      const blob = new Blob([results[activeTab]], {
                        type: "text/markdown",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${label.toLowerCase().replace(/\s+/g, "-")}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    <Download size={13} /> Download
                  </button>
                </div>
              </div>
              {contentMode === "dashboard" ? (
                <StageDashboard
                  activeTab={activeTab}
                  activeTokens={activeTokens}
                  activeSearches={activeSearches}
                  markdown={activeMarkdown}
                  paragraph={activeParagraphs[0] || ""}
                  searches={searches[activeTab] || []}
                  status={status[activeTab] || "pending"}
                />
              ) : (
                <div className="markdown-content">
                  <ReactMarkdown>{normalizeMarkdown(results[activeTab] || "")}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* ── Interviews tab ── */}
          {activeTab === "interviews" && (() => {
            const missingForInterviews = [
              !results['refine']      && 'Idea Refinement',
              !results['market']      && 'Market Research',
              !results['competitors'] && 'Competitor Analysis',
              !results['ui']          && 'Visual Prototype',
            ].filter(Boolean) as string[];
            if (missingForInterviews.length > 0 && interviews.length === 0 && !isSimulating) {
              return (
                <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: '60px 32px', textAlign: 'center' }}>
                  <Users size={40} style={{ opacity: 0.25 }} />
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>Interviews not ready yet</div>
                  <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', maxWidth: 360 }}>
                    Customer interviews will run once the following steps are complete:
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {missingForInterviews.map((step) => (
                      <li key={step} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.83rem', color: 'var(--warning)', fontWeight: 600 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0 }} />
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} className="fade-in">
            <div className="interview-wrap">
              <div className="interview-list">
                {/* Real interviews that have arrived */}
                {interviews.map((int, idx) => (
                  <button
                    key={idx}
                    className={`interview-row${selectedInterviewIndex === idx ? " active" : ""}`}
                    onClick={() => setSelectedInterviewIndex(idx)}
                  >
                    <div className="interview-avatar">
                      {(int.user.context?.name ||
                        int.user.name)?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="interview-name">
                        {int.user.context?.name || int.user.name}
                      </div>
                      <div className="interview-role">{int.user.archetype}</div>
                    </div>
                    {int.is_complete ? (
                      <CheckCircle2
                        size={13}
                        style={{
                          marginLeft: "auto",
                          color: "var(--success)",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        className="spinner"
                        style={{
                          width: 12,
                          height: 12,
                          marginLeft: "auto",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </button>
                ))}
                {/* Single skeleton at the end while more interviews are expected */}
                {isSimulating && (interviews.length === 0 || interviews[interviews.length - 1]?.is_complete) && (
                  <div className="interview-row interview-skeleton">
                    <div className="interview-avatar skeleton-avatar" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="skeleton-line" style={{ width: "70%", height: 11, marginBottom: 5 }} />
                      <div className="skeleton-line" style={{ width: "50%", height: 9 }} />
                    </div>
                    <div className="skeleton-dot" />
                  </div>
                )}
              </div>

              <div className="interview-detail">
                {selectedInterviewIndex !== null &&
                interviews[selectedInterviewIndex] ? (
                  <>
                    <div className="interview-detail-header">
                      <div className="interview-avatar large">
                        {(interviews[selectedInterviewIndex].user.context
                          ?.name ||
                          interviews[selectedInterviewIndex].user
                            .name)?.[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>
                          {interviews[selectedInterviewIndex].user.context
                            ?.name ||
                            interviews[selectedInterviewIndex].user.name}
                        </h2>
                        <div
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--text-secondary)",
                            marginTop: 2,
                          }}
                        >
                          {interviews[selectedInterviewIndex].user.archetype} ·{" "}
                          {
                            interviews[selectedInterviewIndex].user.context
                              ?.role
                          }
                        </div>
                      </div>
                      {interviews[selectedInterviewIndex].response &&
                        interviews[selectedInterviewIndex].is_complete &&
                        (tts.state === "playing" ? (
                          <button
                            className="btn-ghost tts-btn"
                            onClick={tts.stop}
                            title="Stop"
                          >
                            <Square size={13} />
                            Stop
                          </button>
                        ) : tts.state === "loading" ? (
                          <button
                            className="btn-ghost tts-btn"
                            disabled
                            title="Loading audio…"
                          >
                            <div
                              className="spinner"
                              style={{ width: 13, height: 13 }}
                            />
                            Loading…
                          </button>
                        ) : (
                          <button
                            className="btn-ghost tts-btn"
                            onClick={() =>
                              tts.play(
                                interviews[selectedInterviewIndex].response,
                                interviews[selectedInterviewIndex].user
                                  .archetype,
                                interviews[selectedInterviewIndex].user.context
                                  ?.gender || "",
                              )
                            }
                            title="Listen"
                          >
                            <Volume2 size={13} />
                            Listen
                          </button>
                        ))}
                      {interviews[selectedInterviewIndex].is_complete && (
                        <button
                          className="btn-ghost tts-btn"
                          onClick={() => { setChatInput(""); setChatOpen(true); }}
                          title="Chat with this customer"
                        >
                          <Plus size={13} />
                          Chat
                        </button>
                      )}
                    </div>
                    {interviews[selectedInterviewIndex].response ? (
                      <div className="markdown-content">
                        <ReactMarkdown>
                          {normalizeMarkdown(interviews[selectedInterviewIndex].response)}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div className="in-progress">
                        <div
                          className="spinner"
                          style={{ width: 15, height: 15 }}
                        />{" "}
                        Interview in progress…
                      </div>
                    )}
                  </>
                ) : isSimulating ? (
                  <div className="in-progress">
                    <div
                      className="spinner"
                      style={{ width: 15, height: 15 }}
                    />{" "}
                    Preparing interviews…
                  </div>
                ) : (
                  <div className="in-progress" style={{ opacity: 0.4 }}>
                    Select an interview from the list
                  </div>
                )}
              </div>
            </div>

            {/* Synthesis report */}
            {(interviewReport || isSimulating) && (
              <div className="content-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div className="card-title" style={{ fontSize: '0.92rem' }}>
                    <div className="card-title-icon" style={{ background: 'rgba(70,57,71,0.10)' }}>
                      <BarChart3 size={14} color="var(--primary)" />
                    </div>
                    Interview Synthesis Report
                    {isSimulating && !interviewReport && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: 8 }}>
                        Generating after interviews complete…
                      </span>
                    )}
                    {isSimulating && interviewReport && (
                      <div className="spinner" style={{ width: 13, height: 13, marginLeft: 8 }} />
                    )}
                  </div>
                  {interviewReport && (
                    <button
                      className="btn-ghost"
                      style={{ gap: 6 }}
                      onClick={() => {
                        const blob = new Blob([interviewReport], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'interview-synthesis.md';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download size={13} /> Download
                    </button>
                  )}
                </div>
                {interviewReport
                  ? <div className="markdown-content"><ReactMarkdown>{normalizeMarkdown(interviewReport)}</ReactMarkdown></div>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[80, 60, 70, 50].map((w, i) => (
                        <div key={i} className="skeleton-line" style={{ width: `${w}%`, height: 12, borderRadius: 4 }} />
                      ))}
                    </div>
                }
              </div>
            )}
            </div>
            );
          })()}
        </div>
      </main>

      {/* ── Chat modal ── */}
      {chatOpen && selectedInterviewIndex !== null && interviews[selectedInterviewIndex] && (
        <InterviewChatModal
          interview={interviews[selectedInterviewIndex]}
          history={chatHistories[interviews[selectedInterviewIndex].user.context?.name || interviews[selectedInterviewIndex].user.name] || []}
          chatInput={chatInput}
          chatLoading={chatLoading}
          onInputChange={setChatInput}
          onSend={sendFollowUp}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
