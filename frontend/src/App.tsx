import { useState, useEffect } from 'react';
import { Activity, Sparkles, Target, Zap, CheckCircle2, Cpu, BarChart3, Layout, Layers, Globe, Search, ArrowRight } from 'lucide-react';
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
  const [globalError, setGlobalError] = useState<string | null>(null);
  
  const totalTokens = Object.values(tokens).reduce((acc, val) => acc + val, 0);
  const totalSearches = Object.values(searches).reduce((acc, val) => acc + (val?.length || 0), 0);

  useEffect(() => {
    fetchUsage();
  }, []);

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
    } catch (err) {
      console.error(err);
      setStatus(prev => ({ ...prev, [agentId]: 'error' }));
      throw err;
    }
  };

  const startAnalysis = async () => {
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
    } catch (err: any) {
      console.error('Orchestration stopped due to stage failure:', err);
      setGlobalError(err.message || 'The analysis pipeline was interrupted. Please check individual stages for details.');
    } finally {
      setIsOrchestrating(false);
    }
  };

  const isOverviewAvailable = status['refine'] === 'completed' && (status['market'] === 'completed' || status['competitors'] === 'completed');

  return (
    <div className="container">
      {/* Header */}
      <header className="flex-between" style={{ marginBottom: '40px' }}>
        <div>
          <h1 className="text-gradient" style={{ marginBottom: 0 }}>FounderSignal</h1>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Advanced Product Validation Suite</p>
        </div>
        
        <div className="flex-center gap-2">
           <div className="token-badge">
            <Cpu size={14} />
            {totalTokens.toLocaleString()} Tokens
          </div>
          <div className="token-badge" style={{ borderColor: 'var(--primary)' }}>
            <Search size={14} style={{ color: 'var(--primary)' }} />
            {totalSearches} Searches
          </div>
          {usage?.tavily?.remaining_credits !== undefined && (
            <div className="token-badge" style={{ borderColor: 'var(--success)' }}>
              <Globe size={14} style={{ color: 'var(--success)' }} />
              {usage.tavily.remaining_credits} Credits
            </div>
          )}
        </div>
      </header>

      {globalError && (
        <div className="error-box fade-in" style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShieldAlert size={24} />
              <div>
                 <h3 style={{ margin: 0, fontSize: '1rem' }}>Orchestration Failed</h3>
                 <p style={{ margin: 0, fontSize: '0.85rem' }}>{globalError}</p>
              </div>
           </div>
           <button 
             className="btn-small" 
             onClick={() => setGlobalError(null)}
             style={{ background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)' }}
           >
             Dismiss
           </button>
        </div>
      )}

      {/* Input Section */}
      {!isOrchestrating && Object.keys(results).length === 0 && (
        <div className="glass-panel fade-in" style={{ marginBottom: '40px' }}>
          <h2 style={{ marginBottom: '16px' }}>Validate Your Vision</h2>
          <textarea
            placeholder="Describe your startup idea, existing product, or new feature. Be as detailed as you like..."
            rows={5}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            style={{ marginBottom: '20px' }}
          />
          <div className="flex-between">
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <Zap size={14} style={{ display: 'inline', marginRight: '4px', color: 'var(--warning)' }}/>
              Running multi-agent analysis with real-time market data
            </p>
            <button onClick={startAnalysis} disabled={!idea.trim()}>
              Analyze Concept <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Main Analysis View */}
      {(isOrchestrating || Object.keys(results).length > 0) && (
        <div className="fade-in">
          
          {/* Progress Indicators */}
          <div className="dashboard-tiles" style={{ marginBottom: '32px' }}>
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
                    {s === 'completed' ? <CheckCircle2 size={18} /> : <Icon size={18} />}
                  </div>
                  <div>
                    <h4 style={{ fontSize: '0.85rem', margin: 0 }}>{agent.label}</h4>
                    <p style={{ fontSize: '0.7rem', margin: 0, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                      {s} {searches[agent.id]?.length > 0 ? `(${searches[agent.id].length} searches)` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tabbed Viewport */}
          <div className="glass-panel" style={{ minHeight: '600px', padding: '0' }}>
            <div className="tabs-header" style={{ padding: '16px 24px 0' }}>
              <button 
                className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => isOverviewAvailable && setActiveTab('overview')}
                disabled={!isOverviewAvailable}
                style={{ opacity: isOverviewAvailable ? 1 : 0.4 }}
              >
                Pipeline Overview
              </button>
              {AGENTS.map(a => status[a.id] && (
                <button 
                  key={a.id}
                  className={`tab-btn ${activeTab === a.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>

            <div style={{ padding: '32px' }}>
              {activeTab === 'overview' ? (
                <div className="fade-in">
                  <div style={{ marginBottom: '32px', textAlign: 'center' }}>
                    <h2 style={{ fontSize: '2rem', marginBottom: '8px' }}>Analysis Summary</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>High-level insights from the validation pipeline.</p>
                  </div>
                  
                  <div className="grid-layout">
                    {/* Refinement Summary */}
                    {results['refine'] && (
                      <div className="glass-panel" style={{ background: '#f8fafc', border: 'none' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '1rem' }}>
                          <Sparkles size={18} color="var(--primary)" /> Refined Vision
                        </h3>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          <ReactMarkdown>
                            {results['refine']?.includes('##') 
                              ? (results['refine'].split('##')[1]?.split('##')[0] || results['refine'].slice(0, 200))
                              : results['refine']?.slice(0, 200) || ''}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* Market Summary */}
                    {results['market'] && (
                      <div className="glass-panel" style={{ background: '#f8fafc', border: 'none' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '1rem' }}>
                          <Activity size={18} color="var(--success)" /> Market Landscape
                        </h3>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          <ReactMarkdown>
                            {results['market']?.includes('## Executive Summary')
                              ? (results['market'].split('## Executive Summary')[1]?.slice(0, 500) || results['market'].slice(0, 200))
                              : results['market']?.slice(0, 200) || ''}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}

                    {/* Scoring Summary */}
                    {results['scoring'] && (
                      <div className="glass-panel" style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent)' }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '1rem' }}>
                          <BarChart3 size={18} color="var(--accent)" /> The Verdict
                        </h3>
                        <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                           <ReactMarkdown>
                             {results['scoring']?.includes('## OVERALL VALIDATION SCORE')
                               ? (results['scoring'].split('## OVERALL VALIDATION SCORE')[1]?.split('##')[0] || 'Score Pending')
                               : 'Analysis partially completed'}
                           </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: '32px' }}>
                     <h3 style={{ marginBottom: '16px' }}>Detailed Stage Summaries</h3>
                     <div className="dashboard-tiles">
                        {AGENTS.map(a => results[a.id] && (
                          <div key={a.id} className="dashboard-tile" style={{ padding: '12px', background: '#f1f5f9' }}>
                            <div className="tile-icon done" style={{ width: '32px', height: '32px' }}><a.icon size={14}/></div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{a.label} Completed</div>
                          </div>
                        ))}
                     </div>
                  </div>
                </div>
              ) : (
                <div className="markdown-content fade-in">
                  <div className="flex-between" style={{ marginBottom: '24px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                       <div className="tile-icon" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
                          {AGENTS.find(a => a.id === activeTab)?.icon && <Zap size={20}/>}
                       </div>
                       <div>
                          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{AGENTS.find(a => a.id === activeTab)?.label}</h2>
                          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {status[activeTab] === 'running' ? 'Generating insights...' : 'Full analysis report'}
                          </p>
                       </div>
                    </div>
                    <div className="flex-center gap-2">
                       {tokens[activeTab] && <span className="badge primary">{tokens[activeTab].toLocaleString()} tokens</span>}
                       {searches[activeTab]?.length > 0 && <span className="badge success">{searches[activeTab].length} searches</span>}
                    </div>
                  </div>
                  
                  {searches[activeTab]?.length > 0 && (
                    <div className="warning-box">
                       <h4 style={{ fontSize: '0.8rem', marginBottom: '8px', textTransform: 'uppercase', color: 'var(--warning)' }}>Researching Live Context</h4>
                       <ul style={{ listStyle: 'none', padding: 0 }}>
                          {searches[activeTab].map((s, i) => (
                            <li key={i} style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                               <Search size={12} color="var(--warning)" /> {s.query} <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>({s.results_count} results)</span>
                            </li>
                          ))}
                       </ul>
                    </div>
                  )}

                  {status[activeTab] === 'error' && (
                    <div className="error-box fade-in">
                       <h3><ShieldAlert size={20} /> Execution Error</h3>
                       <p>{results[activeTab]?.replace('### ❌ Error\n', '') || 'An unexpected error occurred during agent execution.'}</p>
                    </div>
                  )}

                  {results[activeTab] && status[activeTab] !== 'error' ? (
                    <ReactMarkdown>{results[activeTab]}</ReactMarkdown>
                  ) : status[activeTab] !== 'error' && (
                    <div className="flex-center" style={{ height: '300px', flexDirection: 'column' }}>
                       <div className="loading-pulse" style={{ marginBottom: '24px' }}></div>
                       <p style={{ color: 'var(--text-secondary)' }}>Agent is thinking and researching...</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {!isOrchestrating && (
             <div style={{ textAlign: 'center', marginTop: '40px' }}>
                <button 
                  onClick={() => { setResults({}); setStatus({}); setIdea(''); setTokens({}); setSearches({}); setActiveTab('refine'); }} 
                  style={{ background: 'white', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', margin: '0 auto' }}
                >
                  Start New Validation
                </button>
             </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
