import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, Sparkles, Target, Zap, CheckCircle2, Cpu, BarChart3,
  Layout, Layers, Globe, Search, ArrowRight, Clock, BarChart2,
  Users, Settings, ChevronRight, Volume2, Square, Plus, Radio,
  TrendingUp, FileText, Download,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const TOTAL_INTERVIEWS = 5; // matches the 5 hardcoded archetypes in customer_validation_agent.py

const AGENTS = [
  { id: 'refine',      label: 'Idea Refinement',    icon: Sparkles,  endpoint: '/refine' },
  { id: 'market',      label: 'Market Research',     icon: Activity,  endpoint: '/market' },
  { id: 'competitors', label: 'Competitor Analysis', icon: Target,    endpoint: '/competitors' },
  { id: 'ux',          label: 'User Journey',         icon: Layers,    endpoint: '/ux' },
  { id: 'ui',          label: 'Visual Prototype',     icon: Layout,    endpoint: '/ui' },
  { id: 'visibility',  label: 'AI Visibility',        icon: Globe,     endpoint: '/visibility' },
  { id: 'scoring',     label: 'Validation Score',     icon: BarChart3, endpoint: '/scoring' },
];

// ── TTS hook ──────────────────────────────────────────────────────────────
function useTTS() {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef   = useRef<AudioBufferSourceNode | null>(null);
  const readerRef   = useRef<ReadableStreamDefaultReader | null>(null);

  const stop = useCallback(() => {
    readerRef.current?.cancel().catch(() => {});
    readerRef.current = null;
    sourceRef.current?.stop();
    sourceRef.current = null;
    setState('idle');
  }, []);

  const play = useCallback(async (text: string, archetype: string, gender: string) => {
    stop();
    setState('loading');
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const res = await fetch('http://localhost:8000/api/v1/agents/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, archetype, gender }),
      });
      if (!res.ok) throw new Error('TTS request failed');
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
      for (const c of chunks) { merged.set(c, offset); offset += c.length; }
      const audioBuffer = await ctx.decodeAudioData(merged.buffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      sourceRef.current = source;
      source.onended = () => setState('idle');
      setState('playing');
      source.start();
    } catch (e) {
      console.error('TTS error', e);
      setState('idle');
    }
  }, [stop]);

  return { state, play, stop };
}

// ── Idea prompt bar ────────────────────────────────────────────────────────
function IdeaPromptBar({ idea, isOrchestrating, onIdeaChange, onRerun }: {
  idea: string;
  isOrchestrating: boolean;
  onIdeaChange: (v: string) => void;
  onRerun: () => void;
}) {
  const [committed, setCommitted] = useState(idea);
  const [focused, setFocused] = useState(false);
  const changed = idea !== committed;
  const handleRerun = () => { setCommitted(idea); onRerun(); };
  return (
    <div className={`idea-bar${focused ? ' focused' : ''}${changed ? ' changed' : ''}`}>
      <div style={{ flex: 1 }}>
        <div className="idea-bar-label">Your Idea</div>
        <textarea
          value={idea}
          onChange={e => onIdeaChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={2}
          className="idea-bar-textarea"
        />
      </div>
      <button
        className="btn-primary"
        onClick={handleRerun}
        disabled={isOrchestrating || !idea.trim() || !changed}
        style={{ opacity: !changed ? 0.35 : 1, transition: 'opacity 0.2s', flexShrink: 0, alignSelf: 'center' }}
      >
        {isOrchestrating ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <ArrowRight size={15} />}
        {isOrchestrating ? 'Running…' : 'Modify'}
      </button>
    </div>
  );
}

// ── Donut chart ────────────────────────────────────────────────────────────
function DonutChart({ value, max, label }: { value: number; max: number; label: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const pct  = max > 0 ? Math.min(value / max, 1) : 0;
  const dash = pct * circ;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <div className="donut-ring">
        <svg className="donut-svg" width="90" height="90" viewBox="0 0 90 90">
          <circle cx="45" cy="45" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
          <circle
            cx="45" cy="45" r={r} fill="none"
            stroke="var(--primary)" strokeWidth="8"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="donut-center">
          {value > 999 ? `${(value/1000).toFixed(1)}k` : value}
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [idea, setIdea]               = useState('');
  const [results, setResults]         = useState<Record<string, string>>({});
  const [status, setStatus]           = useState<Record<string, 'pending'|'running'|'completed'|'error'>>({});
  const [tokens, setTokens]           = useState<Record<string, number>>({});
  const [searches, setSearches]       = useState<Record<string, any[]>>({});
  const [activeTab, setActiveTab]     = useState('overview');
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [interviews, setInterviews]   = useState<any[]>([]);
  const [selectedInterviewIndex, setSelectedInterviewIndex] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const interviewBuffers              = useRef<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [sessions, setSessions]       = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [leftSection, setLeftSection] = useState<'pipeline'|'history'>('pipeline');
  const [searchQuery, setSearchQuery] = useState('');
  const tts = useTTS();

  const totalTokens   = Object.values(tokens).reduce((a, v) => a + v, 0);
  const totalSearches = Object.values(searches).reduce((a, v) => a + (v?.length || 0), 0);
  const hasResults    = Object.keys(results).length > 0;

  useEffect(() => { fetchSessions(); }, []);

  // ── Data fetchers ────────────────────────────────────────────────────────
  const fetchSessions = async () => {
    try {
      const r = await fetch('http://localhost:8000/api/v1/agents/sessions');
      setSessions(await r.json());
    } catch {}
  };

  const loadSession = async (sessionId: string) => {
    try {
      const r = await fetch(`http://localhost:8000/api/v1/agents/sessions/${sessionId}`);
      const d = await r.json();
      setIdea(d.input.idea);
      setCurrentSessionId(d.report_id);
      setResults(d.results_map || {});
      setStatus(d.status_map  || {});
      setTokens(d.tokens_map  || {});
      setSearches(d.searches_map || {});
      setActiveTab('overview');
    } catch {}
  };

  const saveCurrentSession = async (r: any, s: any, t: any, se: any) => {
    try {
      const id = currentSessionId || Math.random().toString(36).slice(7);
      await fetch('http://localhost:8000/api/v1/agents/sessions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: id, input: { idea }, results_map: r, status_map: s,
          tokens_map: t, searches_map: se, created_at: new Date().toISOString(),
        }),
      });
      setCurrentSessionId(id);
      fetchSessions();
    } catch {}
  };

  // ── Streaming ────────────────────────────────────────────────────────────
  const streamAgent = async (agentId: string, payload: any): Promise<string> => {
    setStatus(p => ({ ...p, [agentId]: 'running' }));
    setActiveTab(agentId);
    setResults(p => ({ ...p, [agentId]: '' }));
    try {
      const res = await fetch(
        `http://localhost:8000/api/v1/agents${AGENTS.find(a => a.id === agentId)?.endpoint}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      if (!res.ok) throw new Error(`Agent ${agentId} failed`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');
      const dec = new TextDecoder();
      let full = '', buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.chunk)    { full += d.chunk; setResults(p => ({ ...p, [agentId]: full })); }
            if (d.tokens)   setTokens(p => ({ ...p, [agentId]: d.tokens }));
            if (d.searches) setSearches(p => ({ ...p, [agentId]: d.searches }));
            if (d.error)    { setStatus(p => ({ ...p, [agentId]: 'error' })); throw new Error(d.error); }
          } catch {}
        }
      }
      setStatus(p => p[agentId] === 'error' ? p : { ...p, [agentId]: 'completed' });
      return full;
    } catch (e: any) {
      setStatus(p => ({ ...p, [agentId]: 'error' }));
      throw e;
    }
  };

  const startInterviews = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setInterviews([]);
    interviewBuffers.current = {};
    setActiveTab('interviews');
    try {
      const res = await fetch('http://localhost:8000/api/v1/agents/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refined_idea: results['refine'], market_research: results['market'],
          competitors: results['competitors'], ux: results['ux'],
          ui: results['ui'], visibility: results['visibility'], scoring: results['scoring'],
        }),
      });
      if (!res.ok) throw new Error('Simulation failed');
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');
      const dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const d = JSON.parse(line.slice(6));
          if (d.user) {
            const uname = d.user.context?.name || d.user.name;
            if (d.chunk) {
              interviewBuffers.current[uname] = (interviewBuffers.current[uname] || '') + d.chunk;
              const acc = interviewBuffers.current[uname];
              setInterviews(prev => {
                const idx = prev.findIndex(i => (i.user.context?.name || i.user.name) === uname);
                if (idx >= 0) { const u = [...prev]; u[idx] = { ...u[idx], response: acc }; return u; }
                if (prev.length === 0) setSelectedInterviewIndex(0);
                return [...prev, { user: d.user, response: acc, is_complete: false }];
              });
            }
            if (d.is_complete) {
              setInterviews(prev => {
                const idx = prev.findIndex(i => (i.user.context?.name || i.user.name) === uname);
                if (idx >= 0) { const u = [...prev]; u[idx] = { ...u[idx], is_complete: true }; return u; }
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

  const startAnalysis = async () => {
    if (isOrchestrating || !idea.trim()) return;
    setIsOrchestrating(true);
    setResults({}); setStatus({}); setTokens({}); setSearches({});
    setGlobalError(null);
    try {
      const refined = await streamAgent('refine', { idea });
      await new Promise(r => setTimeout(r, 500));
      const [market, comp] = await Promise.all([
        streamAgent('market',      { refined_idea: refined }),
        streamAgent('competitors', { refined_idea: refined }),
      ]);
      const [ux] = await Promise.all([
        streamAgent('ux',      { refined_idea: refined, market_research: market }),
        streamAgent('scoring', { refined_idea: refined, market_research: market, competitor_research: comp }),
      ]);
      await new Promise(r => setTimeout(r, 500));
      await streamAgent('visibility', { refined_idea: refined, competitor_research: comp });
      await streamAgent('ui',         { refined_idea: refined, ux_flow: ux });
      await saveCurrentSession(results, status, tokens, searches);
    } catch (e: any) {
      setGlobalError(e.message || 'Pipeline interrupted.');
    } finally {
      setIsOrchestrating(false);
    }
  };

  // ── Landing ──────────────────────────────────────────────────────────────
  if (!hasResults && !isOrchestrating) {
    return (
      <div className="landing">
        <div className="landing-card">
          <div className="landing-icon"><Zap size={26} /></div>
          <h1 className="landing-title">FounderSignal</h1>
          <p className="landing-sub">Validate your startup idea with a multi-agent AI research pipeline.</p>
          <textarea
            value={idea}
            onChange={e => setIdea(e.target.value)}
            placeholder="Describe your startup idea…"
            rows={4}
            className="landing-textarea"
          />
          <button className="btn-primary btn-full" onClick={startAnalysis} disabled={!idea.trim()}>
            <Sparkles size={18} /> Start Full Market Validation
          </button>
        </div>
      </div>
    );
  }

  // ── Nav items ─────────────────────────────────────────────────────────────
  const allNavItems = [
    { id: 'overview',    label: 'Dashboard',   icon: BarChart2, status: 'overview' as const },
    ...AGENTS.map(a => ({ id: a.id, label: a.label, icon: a.icon, status: status[a.id] || 'pending' as any })),
    { id: 'interviews',  label: 'Interviews',  icon: Users,     status: (isSimulating ? 'running' : interviews.length > 0 ? 'completed' : 'pending') as any },
  ];

  const completedCount = AGENTS.filter(a => status[a.id] === 'completed').length;

  // ── Shell ─────────────────────────────────────────────────────────────────
  return (
    <div className="shell">

      {/* ── Left nav ── */}
      <nav className="left-nav">
        <div className="nav-brand">
          <div className="nav-brand-icon"><Zap size={16} /></div>
          <span className="nav-brand-name">FounderSignal</span>
        </div>

        <div className="nav-body">
          {/* section toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            <button
              className={`btn-ghost${leftSection === 'pipeline' ? '' : ''}`}
              onClick={() => setLeftSection('pipeline')}
              style={{
                flex: 1, justifyContent: 'center', fontSize: '0.76rem',
                background: leftSection === 'pipeline' ? 'var(--primary-light)' : 'transparent',
                color: leftSection === 'pipeline' ? 'var(--primary)' : 'var(--text-secondary)',
                borderColor: leftSection === 'pipeline' ? 'var(--primary-border)' : 'var(--border)',
              }}
            >
              <BarChart2 size={13} /> Pipeline
            </button>
            <button
              className="btn-ghost"
              onClick={() => setLeftSection('history')}
              style={{
                flex: 1, justifyContent: 'center', fontSize: '0.76rem',
                background: leftSection === 'history' ? 'var(--primary-light)' : 'transparent',
                color: leftSection === 'history' ? 'var(--primary)' : 'var(--text-secondary)',
                borderColor: leftSection === 'history' ? 'var(--primary-border)' : 'var(--border)',
              }}
            >
              <Clock size={13} /> History
            </button>
          </div>

          {leftSection === 'pipeline' ? (
            <>
              {allNavItems.map(item => {
                const Icon = item.icon;
                const s = item.status;
                const clickable = item.id === 'overview' || s === 'completed' || s === 'running'
                  || (item.id === 'interviews' && (interviews.length > 0 || isSimulating));
                const badge = s === 'running' ? 'running' : s === 'completed' ? 'done' : s === 'error' ? 'error' : null;
                return (
                  <button
                    key={item.id}
                    className={`nav-item${activeTab === item.id ? ' active' : ''}${!clickable ? ' muted' : ''}`}
                    onClick={() => clickable && setActiveTab(item.id)}
                    disabled={!clickable}
                  >
                    <Icon size={15} />
                    <span className="nav-item-label">{item.label}</span>
                    {badge && (
                      <span className={`nav-badge ${badge}`}>
                        {badge === 'running' ? '●' : badge === 'done' ? '✓' : '!'}
                      </span>
                    )}
                    {activeTab === item.id && <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.4 }} />}
                  </button>
                );
              })}
            </>
          ) : (
            <>
              {sessions.length === 0 ? (
                <div style={{ padding: '32px 8px', color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <Clock size={22} />No saved sessions
                </div>
              ) : sessions.map(s => (
                <button
                  key={s.id}
                  className={`nav-item session-row${currentSessionId === s.id ? ' active' : ''}`}
                  onClick={() => loadSession(s.id)}
                >
                  <div className="session-idea">{s.idea}</div>
                  <div className="session-date">{new Date(s.created_at).toLocaleDateString()}</div>
                </button>
              ))}
            </>
          )}
        </div>

        <div className="nav-divider" />
        <div style={{ padding: '4px 12px 8px' }}>
          <button className="nav-item" style={{ opacity: 0.55 }}>
            <Settings size={15} /><span className="nav-item-label">Settings</span>
          </button>
        </div>

        <div className="nav-credits">
          <div className="nav-credits-title">Powered by</div>
          <div className="nav-credit-item">
            <div className="nav-credit-dot" style={{ background: '#7c3aed' }} />
            Voice agents by <span className="nav-credit-brand">Gradium</span>
          </div>
          <div className="nav-credit-item">
            <div className="nav-credit-dot" style={{ background: '#0284c7' }} />
            Market research by <span className="nav-credit-brand">Tavily</span>
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
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="topbar-right">
            <div className="stat-chip"><Cpu size={13} /> {totalTokens.toLocaleString()} tokens</div>
            <div className="stat-chip"><Search size={13} /> {totalSearches} searches</div>
            <button className="btn-new" onClick={() => { setIdea(''); setResults({}); setStatus({}); setCurrentSessionId(null); }}>
              <Plus size={14} /> New Analysis
            </button>
            <div className="topbar-avatar">
              <div className="topbar-avatar-img">F</div>
              <div>
                <div className="topbar-avatar-name">Founder</div>
                <div className="topbar-avatar-role">Analyst</div>
              </div>
            </div>
          </div>
        </div>

        {/* Page inner */}
        <div className="page-inner">

          {/* Idea prompt bar — always visible */}
          <IdeaPromptBar idea={idea} isOrchestrating={isOrchestrating} onIdeaChange={setIdea} onRerun={startAnalysis} />

          {/* Error banner */}
          {globalError && (
            <div className="error-box fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Pipeline interrupted</strong>
                <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>{globalError}</p>
              </div>
              <button className="btn-ghost" onClick={() => setGlobalError(null)}>Dismiss</button>
            </div>
          )}

          {/* ── Overview / Dashboard ── */}
          {activeTab === 'overview' && (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Row 1: agent status + stats donut */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 300px', gap: 18 }}>

                {/* Today's Tasks — agent status */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <div className="card-title-icon" style={{ background: 'rgba(108,99,255,0.10)' }}>
                        <FileText size={14} color="var(--primary)" />
                      </div>
                      Agent Status
                    </div>
                    <button className="see-all" onClick={() => setActiveTab(AGENTS.find(a => status[a.id] === 'completed')?.id || 'refine')}>
                      See All
                    </button>
                  </div>
                  <div className="task-list">
                    {AGENTS.slice(0, 4).map(agent => {
                      const s = status[agent.id] || 'pending';
                      const Icon = agent.icon;
                      return (
                        <div
                          key={agent.id}
                          className={`task-item${activeTab === agent.id ? ' active-task' : ''}`}
                          onClick={() => (s === 'completed' || s === 'running') && setActiveTab(agent.id)}
                          style={{ cursor: s === 'completed' || s === 'running' ? 'pointer' : 'default' }}
                        >
                          <div className="task-icon"><Icon size={14} /></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="task-name">{agent.label}</div>
                            <div className="task-desc">
                              {s === 'running' ? 'Streaming…' : s === 'completed' ? `${tokens[agent.id]?.toLocaleString() || 0} tokens` : 'Not started'}
                            </div>
                          </div>
                          <span className={`task-status-badge ${s}`}>
                            {s === 'running' ? 'Running' : s === 'completed' ? 'Done' : s === 'error' ? 'Error' : 'Pending'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Today's Meetings — interview status */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <div className="card-title-icon" style={{ background: 'rgba(34,197,94,0.10)' }}>
                        <Users size={14} color="#16a34a" />
                      </div>
                      Customer Interviews
                    </div>
                    {interviews.length > 0 && (
                      <button className="see-all" onClick={() => setActiveTab('interviews')}>See All</button>
                    )}
                  </div>
                  {interviews.length === 0 ? (
                    <div className="interview-cta" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>Simulate Customer Interviews</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3 }}>
                          Run 5 synthetic user interviews based on your full research dossier
                        </div>
                      </div>
                      <button className="btn-primary" onClick={startInterviews} disabled={isSimulating || !results['refine']}>
                        {isSimulating ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Users size={14} />}
                        {isSimulating ? 'Generating…' : 'Start Interviews'}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {interviews.slice(0, 3).map((int, idx) => (
                        <div
                          key={idx}
                          className="meeting-card"
                          onClick={() => { setActiveTab('interviews'); setSelectedInterviewIndex(idx); }}
                        >
                          <div className="meeting-title">{int.user.context?.name || int.user.name}</div>
                          <div className="meeting-sub">
                            <Users size={11} />
                            {int.user.archetype}
                            {int.is_complete
                              ? <CheckCircle2 size={11} color="var(--success)" style={{ marginLeft: 'auto' }} />
                              : <div className="spinner" style={{ width: 11, height: 11, marginLeft: 'auto' }} />}
                          </div>
                        </div>
                      ))}
                      {interviews.length > 3 && (
                        <button className="see-all" style={{ textAlign: 'left', padding: '4px 0' }} onClick={() => setActiveTab('interviews')}>
                          +{interviews.length - 3} more interviews
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Stats donut */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <div className="card-title-icon" style={{ background: 'rgba(245,158,11,0.10)' }}>
                        <TrendingUp size={14} color="#d97706" />
                      </div>
                      Pipeline Stats
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
                    <DonutChart value={completedCount} max={AGENTS.length} label="done" />
                    <div className="stats-legend" style={{ width: '100%' }}>
                      <div className="stats-legend-item">
                        <div className="stats-legend-dot" style={{ background: 'var(--primary)' }} />
                        <span>Completed</span>
                        <span className="stats-legend-val">{completedCount} / {AGENTS.length}</span>
                      </div>
                      <div className="stats-legend-item">
                        <div className="stats-legend-dot" style={{ background: 'var(--warning)' }} />
                        <span>Tokens used</span>
                        <span className="stats-legend-val">{totalTokens.toLocaleString()}</span>
                      </div>
                      <div className="stats-legend-item">
                        <div className="stats-legend-dot" style={{ background: '#38bdf8' }} />
                        <span>Web searches</span>
                        <span className="stats-legend-val">{totalSearches}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: pipeline progress cards */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <div className="card-title-icon" style={{ background: 'rgba(108,99,255,0.10)' }}>
                      <Activity size={14} color="var(--primary)" />
                    </div>
                    Pipeline Progress
                  </div>
                </div>
                <div className="event-cards">
                  {AGENTS.map(agent => {
                    const s = status[agent.id] || 'pending';
                    const Icon = agent.icon;
                    const pct = s === 'completed' ? 100 : s === 'running' ? 60 : 0;
                    return (
                      <div
                        key={agent.id}
                        className="event-card"
                        style={{ cursor: s === 'completed' ? 'pointer' : 'default', borderColor: s === 'running' ? 'var(--primary-border)' : 'var(--border)' }}
                        onClick={() => s === 'completed' && setActiveTab(agent.id)}
                      >
                        <div className="event-card-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Icon size={12} /> {s === 'running' ? 'In Progress' : s === 'completed' ? 'Complete' : 'Pending'}
                        </div>
                        <div className="event-card-title">{agent.label}</div>
                        {s !== 'pending' && (
                          <>
                            <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                            <div className="progress-pct">{pct}%</div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Row 3: Status + Recent Sessions side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 18 }}>

                {/* Status */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <div className="card-title-icon" style={{ background: 'rgba(108,99,255,0.10)' }}>
                        <Radio size={14} color="var(--primary)" />
                      </div>
                      Status
                    </div>
                  </div>
                  <div className="alert-list">
                    {AGENTS.filter(a => status[a.id] === 'error').map(a => (
                      <div key={a.id} className="alert-item">
                        <div className="alert-dot error" />
                        <div className="alert-text"><span className="alert-link">{a.label}</span> failed. Click to retry.</div>
                      </div>
                    ))}
                    {AGENTS.filter(a => status[a.id] === 'running').map(a => (
                      <div key={a.id} className="alert-item">
                        <div className="alert-dot warning" />
                        <div className="alert-text"><span className="alert-link">{a.label}</span> is streaming results…</div>
                      </div>
                    ))}
                    {AGENTS.filter(a => status[a.id] === 'error').length === 0 &&
                     AGENTS.filter(a => status[a.id] === 'running').length === 0 && (
                      <div className="alert-item">
                        <div className="alert-dot info" />
                        <div className="alert-text">All systems nominal. {completedCount} of {AGENTS.length} agents complete.</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recent sessions */}
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">
                      <div className="card-title-icon" style={{ background: 'rgba(56,189,248,0.10)' }}>
                        <Clock size={14} color="#0284c7" />
                      </div>
                      Recent Sessions
                    </div>
                    <button className="see-all" onClick={() => setLeftSection('history')}>See All</button>
                  </div>
                  {sessions.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '12px 0' }}>No saved sessions yet.</div>
                  ) : (
                    <div className="templates-grid">
                      {sessions.slice(0, 4).map(s => (
                        <div
                          key={s.id}
                          className={`template-card${currentSessionId === s.id ? ' active-session' : ''}`}
                          onClick={() => loadSession(s.id)}
                        >
                          <div className="template-tag">Session</div>
                          <div className="template-name" style={{ fontSize: '0.8rem' }}>{s.idea?.slice(0, 50) || 'Untitled'}</div>
                          <div className="template-desc">{new Date(s.created_at).toLocaleDateString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Agent result tabs ── */}
          {activeTab !== 'overview' && activeTab !== 'interviews' && (
            <div className="content-card fade-in">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button
                  className="btn-ghost"
                  style={{ gap: 6 }}
                  disabled={!results[activeTab]}
                  title="Download as Markdown"
                  onClick={() => {
                    const label = AGENTS.find(a => a.id === activeTab)?.label || activeTab;
                    const blob = new Blob([results[activeTab]], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${label.toLowerCase().replace(/\s+/g, '-')}.md`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download size={13} /> Download
                </button>
              </div>
              <div className="markdown-content">
                <ReactMarkdown>{results[activeTab] || ''}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* ── Interviews tab ── */}
          {activeTab === 'interviews' && (
            <div className="interview-wrap fade-in">
              <div className="interview-list">
                {/* Real interviews that have arrived */}
                {interviews.map((int, idx) => (
                  <button
                    key={idx}
                    className={`interview-row${selectedInterviewIndex === idx ? ' active' : ''}`}
                    onClick={() => setSelectedInterviewIndex(idx)}
                  >
                    <div className="interview-avatar">{(int.user.context?.name || int.user.name)?.[0]?.toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="interview-name">{int.user.context?.name || int.user.name}</div>
                      <div className="interview-role">{int.user.archetype}</div>
                    </div>
                    {int.is_complete
                      ? <CheckCircle2 size={13} style={{ marginLeft: 'auto', color: 'var(--success)', flexShrink: 0 }} />
                      : <div className="spinner" style={{ width: 12, height: 12, marginLeft: 'auto', flexShrink: 0 }} />}
                  </button>
                ))}
                {/* Skeleton placeholders for interviews not yet streamed */}
                {isSimulating && Array.from({ length: TOTAL_INTERVIEWS - interviews.length }).map((_, i) => (
                  <div key={`skeleton-${i}`} className="interview-row interview-skeleton">
                    <div className="interview-avatar skeleton-avatar" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="skeleton-line" style={{ width: '70%', height: 11, marginBottom: 5 }} />
                      <div className="skeleton-line" style={{ width: '50%', height: 9 }} />
                    </div>
                    <div className="skeleton-dot" />
                  </div>
                ))}
              </div>

              <div className="interview-detail">
                {selectedInterviewIndex !== null && interviews[selectedInterviewIndex] ? (
                  <>
                    <div className="interview-detail-header">
                      <div className="interview-avatar large">
                        {(interviews[selectedInterviewIndex].user.context?.name || interviews[selectedInterviewIndex].user.name)?.[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                          {interviews[selectedInterviewIndex].user.context?.name || interviews[selectedInterviewIndex].user.name}
                        </h2>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                          {interviews[selectedInterviewIndex].user.archetype} · {interviews[selectedInterviewIndex].user.context?.role}
                        </div>
                      </div>
                      {interviews[selectedInterviewIndex].response && interviews[selectedInterviewIndex].is_complete && (
                        tts.state === 'playing'
                          ? <button className="btn-ghost tts-btn" onClick={tts.stop} title="Stop"><Square size={13} />Stop</button>
                          : tts.state === 'loading'
                            ? <button className="btn-ghost tts-btn" disabled title="Loading audio…"><div className="spinner" style={{ width: 13, height: 13 }} />Loading…</button>
                            : <button className="btn-ghost tts-btn" onClick={() => tts.play(interviews[selectedInterviewIndex].response, interviews[selectedInterviewIndex].user.archetype, interviews[selectedInterviewIndex].user.context?.gender || '')} title="Listen"><Volume2 size={13} />Listen</button>
                      )}
                    </div>
                    {interviews[selectedInterviewIndex].response
                      ? <div className="markdown-content"><ReactMarkdown>{interviews[selectedInterviewIndex].response}</ReactMarkdown></div>
                      : <div className="in-progress"><div className="spinner" style={{ width: 15, height: 15 }} /> Interview in progress…</div>}
                  </>
                ) : isSimulating
                  ? <div className="in-progress"><div className="spinner" style={{ width: 15, height: 15 }} /> Preparing interviews…</div>
                  : <div className="in-progress" style={{ opacity: 0.4 }}>Select an interview from the list</div>}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
