import { useState, useEffect } from 'react';
import { Activity, Sparkles, Target, Zap, CheckCircle2, Cpu, BarChart3, Layout, Layers, Globe, Search, ArrowRight, Clock, Trash2, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// Config
const AGENTS = [
  { id: 'refine', label: 'Idea Refinement', icon: Sparkles, endpoint: '/refine' },
  { id: 'market', label: 'Market Research', icon: Activity, endpoint: '/market' },
  { id: 'competitors', label: 'Competitor Analysis', icon: Target, endpoint: '/competitors' },
  { id: 'ux', label: 'User Journey', icon: Layers, endpoint: '/ux' },
  { id: 'ui', label: 'Visual Prototype', icon: Layout, endpoint: '/ui' },
  { id: 'visibility', label: 'AI Visibility', icon: Globe, endpoint: '/visibility' },
  { id: 'scoring', label: 'Validation Score', icon: BarChart3, endpoint: '/scoring' },
];

function App() {
  const [idea, setIdea] = useState('');
  const [results, setResults] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, 'pending' | 'running' | 'completed' | 'error'>>({});
  const [tokens, setTokens] = useState<Record<string, number>>({});
  const [searches, setSearches] = useState<Record<string, any[]>>({});
  const [usage, setUsage] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('refine');
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [selectedInterviewIndex, setSelectedInterviewIndex] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const totalTokens = Object.values(tokens).reduce((acc, val) => acc + val, 0);
  const totalSearches = Object.values(searches).reduce((acc, val) => acc + (val?.length || 0), 0);

  useEffect(() => {
    fetchUsage();
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/agents/sessions');
      const data = await res.json();
      setSessions(data);
    } catch (e) {
      console.error('Failed to fetch sessions', e);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/agents/sessions/${sessionId}`);
      const data = await res.json();
      
      // Hydrate state
      setIdea(data.input.idea);
      setCurrentSessionId(data.report_id);
      
      const newResults: any = {};
      const newStatus: any = {};
      const newTokens: any = {};
      const newSearches: any = {};
      
      // Map back from schemas
      if (data.refined_idea) {
        newResults.refine = results['refine']; // Special handling for Markdown format
        newStatus.refine = 'completed';
      }
      
      // Simple hydration for most fields
      setResults(data.results_map || {}); 
      setStatus(data.status_map || {});
      setTokens(data.tokens_map || {});
      setSearches(data.searches_map || {});
      
      setActiveTab('overview');
      setIsSidebarOpen(false);
    } catch (e) {
      console.error('Failed to load session', e);
    }
  };

  const saveCurrentSession = async (finalResults: any, finalStatus: any, finalTokens: any, finalSearches: any) => {
    try {
      const reportId = currentSessionId || Math.random().toString(36).substring(7);
      const payload = {
        report_id: reportId,
        input: { idea },
        results_map: finalResults,
        status_map: finalStatus,
        tokens_map: finalTokens,
        searches_map: finalSearches,
        created_at: new Date().toISOString()
      };
      
      await fetch('http://localhost:8000/api/v1/agents/sessions/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      setCurrentSessionId(reportId);
      fetchSessions();
    } catch (e) {
      console.error('Failed to save session', e);
    }
  };

  const fetchUsage = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/agents/usage');
      const data = await res.json();
      setUsage(data);
    } catch (e) {
      console.error('Failed to fetch usage', e);
    }
  };

  const streamAgent = async (agentId: string, payload: any): Promise<string> => {
    setStatus(prev => ({ ...prev, [agentId]: 'running' }));
    setActiveTab(agentId);
    setResults(prev => ({ ...prev, [agentId]: '' }));

    try {
      const response = await fetch(`http://localhost:8000/api/v1/agents${AGENTS.find(a => a.id === agentId)?.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Agent ${agentId} failed`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.replace('data: ', ''));
              if (data.chunk) {
                fullContent += data.chunk;
                setResults(prev => ({ ...prev, [agentId]: fullContent }));
              }
              if (data.tokens) {
                setTokens(prev => ({ ...prev, [agentId]: data.tokens }));
              }
              if (data.searches) {
                setSearches(prev => ({ ...prev, [agentId]: data.searches }));
              }
              if (data.error) {
                setStatus(prev => ({ ...prev, [agentId]: 'error' }));
                setResults(prev => ({ ...prev, [agentId]: `### ❌ Error\n${data.error}` }));
                throw new Error(data.error);
              }
            } catch (e) {
              console.warn('Failed to parse SSE data', e);
            }
          }
        }
      }

      setStatus(prev => {
        if (prev[agentId] === 'error') return prev;
        return { ...prev, [agentId]: 'completed' };
      });
      return fullContent;
    } catch (err: any) {
      console.error(`Error in ${agentId}:`, err);
      setStatus(prev => ({ ...prev, [agentId]: 'error' }));
      throw err;
    }
  };

  const startInterviews = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setInterviews([]);
    setActiveTab('interviews');

    try {
      const response = await fetch('http://localhost:8000/api/v1/agents/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          refined_idea: results['refine'],
          market_research: results['market'],
          competitors: results['competitors'],
          ux: results['ux'],
          ui: results['ui'],
          visibility: results['visibility'],
          scoring: results['scoring']
        }),
      });

      if (!response.ok) throw new Error('Simulation failed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.replace('data: ', ''));
            
            if (data.user) {
              setInterviews(prev => {
                const existing = prev.findIndex(i => i.user.name === data.user.name);
                if (existing >= 0) {
                  const updated = [...prev];
                  if (data.chunk) updated[existing].response += data.chunk;
                  if (data.is_complete) updated[existing].is_complete = true;
                  return updated;
                } else {
                  if (prev.length === 0) setSelectedInterviewIndex(0);
                  return [...prev, { user: data.user, response: data.chunk || '', is_complete: false }];
                }
              });
            }
          }
        }
      }
    } catch (e: any) {
      console.error('Simulation error', e);
      setGlobalError(e.message);
    } finally {
      setIsSimulating(false);
    }
  };

  const startAnalysis = async () => {
    if (isOrchestrating) return;
    if (!idea.trim()) return;
    
    setIsOrchestrating(true);
    setResults({});
    setStatus({});
    setTokens({});
    setSearches({});
    setGlobalError(null);
    
    try {
      // 1. Refine (The Main Stage)
      const refinedText = await streamAgent('refine', { idea });
      
      await new Promise(r => setTimeout(r, 500));

      // 2. Market & Competitors (Parallel - Burst of 2)
      const [marketText, compText] = await Promise.all([
        streamAgent('market', { refined_idea: refinedText }),
        streamAgent('competitors', { refined_idea: refinedText })
      ]);
      
      // 3. UX & Scoring (Parallel - Burst of 2)
      // These are heavy logic steps
      const [uxText] = await Promise.all([
        streamAgent('ux', { refined_idea: refinedText, market_research: marketText }),
        streamAgent('scoring', { refined_idea: refinedText, market_research: marketText, competitor_research: compText })
      ]);

      await new Promise(r => setTimeout(r, 500));

      // 4. Visibility (Sequential)
      // Separated to avoid hitting concurrent limits
      await streamAgent('visibility', { refined_idea: refinedText, competitor_research: compText });
      
      // 5. UI (Depends on UX)
      await streamAgent('ui', { refined_idea: refinedText, ux_flow: uxText });

      await fetchUsage();
      await saveCurrentSession(results, status, tokens, searches);
    } catch (err: any) {
      console.error('Orchestration stopped due to stage failure:', err);
      setGlobalError(err.message || 'The analysis pipeline was interrupted. Please check individual stages for details.');
    } finally {
      setIsOrchestrating(false);
    }
  };

  const isOverviewAvailable = status['refine'] === 'completed' && (status['market'] === 'completed' || status['competitors'] === 'completed');  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* Session History Sidebar */}
      <div 
        style={{ 
          width: isSidebarOpen ? '320px' : '0px', 
          background: 'white', 
          borderRight: isSidebarOpen ? '1px solid #f1f5f9' : 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 50
        }}
      >
        <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', opacity: isSidebarOpen ? 1 : 0 }}>
           <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Project History</h3>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', opacity: isSidebarOpen ? 1 : 0 }}>
           {sessions.length === 0 ? (
             <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                <Clock size={32} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                <p style={{ fontSize: '0.85rem' }}>Your history is empty.</p>
             </div>
           ) : (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessions.map(s => (
                  <div 
                    key={s.id} 
                    onClick={() => loadSession(s.id)}
                    style={{ 
                      padding: '16px', 
                      borderRadius: '12px', 
                      background: currentSessionId === s.id ? 'var(--accent-glow)' : '#f8fafc',
                      cursor: 'pointer',
                      border: `1px solid ${currentSessionId === s.id ? 'var(--accent)' : 'transparent'}`,
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                       {s.idea}
                    </div>
                    <div className="flex-between">
                       <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                         {new Date(s.created_at).toLocaleDateString()}
                       </span>
                       {s.score && <span className="badge success">{s.score}</span>}
                    </div>
                  </div>
                ))}
             </div>
           )}
        </div>

        {/* Sidebar Toggle Handle */}
        <div 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{ 
            position: 'absolute', 
            right: '-32px', 
            top: '50%', 
            transform: 'translateY(-50%)',
            background: 'white',
            width: '32px',
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: '1px solid #f1f5f9',
            borderLeft: 'none',
            borderRadius: '0 12px 12px 0',
            boxShadow: '4px 0 12px rgba(0,0,0,0.05)'
          }}
        >
          {isSidebarOpen ? <ChevronLeft size={18} /> : <Clock size={18} />}
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f8fafc', position: 'relative' }}>
        
        {/* Global Error Banner */}
        {globalError && (
          <div className="error-box fade-in" style={{ margin: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: '16px', zIndex: 100 }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Activity size={24} color="var(--danger)" />
                <div>
                   <h3 style={{ margin: 0, fontSize: '0.9rem' }}>Analysis Interrupted</h3>
                   <p style={{ margin: 0, fontSize: '0.8rem' }}>{globalError}</p>
                </div>
             </div>
             <button className="btn-small" onClick={() => setGlobalError(null)}>Dismiss</button>
          </div>
        )}

        {(!isOrchestrating && Object.keys(results).length === 0) ? (
          <div className="landing-hero fade-in">
            <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
              <div className="flex-center" style={{ marginBottom: '32px' }}>
                <div className="tile-icon" style={{ width: '64px', height: '64px', background: 'var(--accent)', color: 'white' }}>
                  <Zap size={32} />
                </div>
              </div>
              <h1 style={{ fontSize: '3.5rem', marginBottom: '16px', fontWeight: 800 }}>FounderSignal</h1>
              <p style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '48px' }}>
                Validate your startup idea with a multi-agent AI research pipeline.
              </p>

              <div className="glass-panel" style={{ padding: '40px' }}>
                <textarea 
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="Paste your raw startup idea here..."
                  style={{ width: '100%', height: '150px', marginBottom: '24px', fontSize: '1.1rem' }}
                />
                <button 
                  className="btn-primary" 
                  onClick={startAnalysis}
                  disabled={isOrchestrating || !idea.trim()}
                  style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}
                >
                  {isOrchestrating ? <div className="spinner" style={{ width: '20px', height: '20px' }}></div> : <Sparkles size={20} />}
                  {isOrchestrating ? 'Agents are Researching...' : 'Start Full Market Validation'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '40px', maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header / Stats */}
            <header className="flex-between" style={{ marginBottom: '40px' }}>
              <div>
                <h1 className="text-gradient" style={{ margin: 0 }}>FounderSignal</h1>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Live Validation Engine</p>
              </div>
              <div className="flex-center gap-3">
                <div className="token-badge"><Cpu size={14} /> {totalTokens.toLocaleString()} Tokens</div>
                <div className="token-badge"><Search size={14} /> {totalSearches} Searches</div>
              </div>
            </header>

            {/* Agent Progress Tiles */}
            <div className="dashboard-tiles" style={{ marginBottom: '40px' }}>
              {AGENTS.map((agent) => {
                const s = status[agent.id] || 'pending';
                const Icon = agent.icon;
                return (
                  <div 
                    key={agent.id} 
                    className={`dashboard-tile ${activeTab === agent.id ? 'active' : ''} ${s === 'completed' ? 'clickable' : ''}`}
                    onClick={() => (s === 'completed' || s === 'running') && setActiveTab(agent.id)}
                    style={{ cursor: (s === 'completed' || s === 'running') ? 'pointer' : 'default' }}
                  >
                    <div className={`tile-icon ${s === 'running' ? 'running' : s === 'completed' ? 'done' : ''}`}>
                      {s === 'completed' ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <h4 style={{ fontSize: '0.8rem', margin: 0 }}>{agent.label}</h4>
                      <p style={{ fontSize: '0.65rem', margin: 0, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{s}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '32px' }}>
              {/* Tabs Navigation */}
              <div style={{ width: '240px', flexShrink: 0 }}>
                <div className="glass-panel" style={{ padding: '20px', position: 'sticky', top: '40px' }}>
                  <h3 style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '16px' }}>Dashboard</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button onClick={() => setActiveTab('overview')} className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}>
                      <Layers size={16} /> Overview
                    </button>
                    {AGENTS.map(a => status[a.id] && (
                      <button key={a.id} onClick={() => setActiveTab(a.id)} className={`nav-item ${activeTab === a.id ? 'active' : ''}`}>
                        <a.icon size={16} /> {a.label}
                      </button>
                    ))}
                    <button 
                      onClick={() => setActiveTab('interviews')} 
                      className={`nav-item ${activeTab === 'interviews' ? 'active' : ''} ${interviews.length === 0 ? 'pending' : ''}`}
                      disabled={interviews.length === 0 && !isSimulating}
                    >
                      <Activity size={16} /> Interviews
                    </button>
                  </div>
                </div>
              </div>

              {/* Viewport Area */}
              <div style={{ flex: 1 }}>
                <div className="glass-panel" style={{ padding: '32px', minHeight: '600px' }}>
                  {activeTab === 'overview' ? (
                    <div className="fade-in">
                       <h2 style={{ marginBottom: '24px' }}>Executive Summary</h2>
                       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                          {results['refine'] && (
                            <div className="glass-panel" style={{ gridColumn: 'span 2', background: 'white' }}>
                              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                <Sparkles size={18} color="var(--accent)" /> Vision
                              </h3>
                              <ReactMarkdown>{results['refine'].split('##')[1]?.slice(0, 500) || results['refine'].slice(0, 200)}</ReactMarkdown>
                            </div>
                          )}
                          {results['scoring'] && (
                            <div className="glass-panel" style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent)' }}>
                               <h3>Verdict</h3>
                               <ReactMarkdown>{results['scoring'].split('## OVERALL VALIDATION SCORE')[1]?.split('##')[0] || 'Pending'}</ReactMarkdown>
                            </div>
                          )}
                       </div>
                       
                       <div style={{ marginTop: '40px', padding: '32px', textAlign: 'center', borderTop: '1px solid #f1f5f9' }}>
                          <h3 style={{ marginBottom: '12px' }}>Simulate User Feedback</h3>
                          <button 
                            className="btn-primary" 
                            onClick={startInterviews}
                            disabled={isSimulating}
                            style={{ margin: '0 auto' }}
                          >
                            {isSimulating ? <div className="spinner"></div> : <Activity size={20} />}
                            {isSimulating ? 'Generating...' : 'Simulate 5 Interviews'}
                          </button>
                       </div>
                    </div>
                  ) : activeTab === 'interviews' ? (
                    <div className="fade-in" style={{ display: 'flex', gap: '24px' }}>
                       <div style={{ width: '250px', borderRight: '1px solid #f1f5f9' }}>
                          {interviews.map((int, idx) => (
                            <div 
                              key={idx} 
                              onClick={() => setSelectedInterviewIndex(idx)}
                              style={{ padding: '12px', borderRadius: '8px', cursor: 'pointer', background: selectedInterviewIndex === idx ? '#f1f5f9' : 'transparent' }}
                            >
                              <div style={{ fontWeight: 600 }}>{int.user.context.name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{int.user.archetype}</div>
                            </div>
                          ))}
                       </div>
                       <div style={{ flex: 1 }}>
                          {selectedInterviewIndex !== null && interviews[selectedInterviewIndex] ? (
                            <div>
                               <h2>{interviews[selectedInterviewIndex].user.context.name}</h2>
                               <ReactMarkdown>{interviews[selectedInterviewIndex].response}</ReactMarkdown>
                            </div>
                          ) : <p>Select an interview to view feedback</p>}
                       </div>
                    </div>
                  ) : (
                    <div className="markdown-content">
                       <ReactMarkdown>{results[activeTab] || ''}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {!isOrchestrating && (
              <div style={{ textAlign: 'center', marginTop: '40px' }}>
                <button onClick={() => { setIdea(''); setResults({}); setStatus({}); setCurrentSessionId(null); }} style={{ background: 'white', border: '1px solid #e2e8f0' }}>
                  Start New Validation
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
