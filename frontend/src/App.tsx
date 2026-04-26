import { useState, useEffect, useRef } from 'react';
import { Activity, Sparkles, Target, Zap, CheckCircle2, Cpu, BarChart3, Layout, Layers, Globe, Search, ArrowRight, Clock, ChevronLeft, Quote, Radar, UserRound, Play, Pause } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

type SectionDecision = 'pending' | 'accepted' | 'revise';
type SectionReviewState = Record<string, { decision: SectionDecision; notes: string }>;
type ResearchReviewState = Record<'market' | 'competitors', string>;
type InterviewStatus = 'building' | 'ready' | 'interviewing' | 'complete';

type InterviewEntry = {
  user: {
    name: string;
    archetype: string;
    ocean?: Record<string, number>;
    context: {
      role?: string;
      background?: string;
      company_or_context?: string;
      values?: string[];
      pain_points?: string[];
      interview_style?: string;
      quote_seed?: string;
      [key: string]: any;
    };
  };
  response: string;
  is_complete: boolean;
  status: InterviewStatus;
  focus_points: string[];
  research_highlights?: Record<string, any>;
  followUps?: Array<{ question: string; answer: string; isStreaming?: boolean }>;
};

// Config
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

const parseRefinementSections = (markdown: string) => {
  const lines = markdown.split('\n');
  const sections: Array<{ key: string; title: string; content: string }> = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  const pushSection = () => {
    if (!currentTitle) return;
    sections.push({
      key: currentTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      title: currentTitle,
      content: currentLines.join('\n').trim()
    });
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      pushSection();
      currentTitle = line.replace('## ', '').trim();
      currentLines = [];
      continue;
    }
    if (line.startsWith('# ')) continue;
    currentLines.push(line);
  }

  pushSection();
  return sections;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractMarkdownSection = (markdown: string, heading: string) => {
  const escapedHeading = escapeRegex(heading);
  const pattern = new RegExp(`## ${escapedHeading}[\\s\\S]*?(?=\\n## |$)`, 'i');
  const match = markdown.match(pattern);
  if (!match) return '';
  return match[0].replace(new RegExp(`## ${escapedHeading}\\n?`, 'i'), '').trim();
};

const extractBulletItems = (markdown: string, heading: string, limit = 3) => {
  const section = extractMarkdownSection(markdown, heading);
  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- /, '').trim())
    .slice(0, limit);
};

const extractNumber = (text: string) => {
  const match = text.match(/(\d+(?:\.\d+)?(?:\s?[-–]\s?\d+(?:\.\d+)?)?\s?(?:%|x|B|M|K|bn|million|billion)?)/i);
  return match?.[1] || '';
};

const extractShortLines = (text: string, limit = 3) => {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .slice(0, limit);
};

const sentencePreview = (text: string, fallback: string, limit = 140) => {
  const clean = text.replace(/[*_`>#-]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, limit) : fallback;
};

const extractScore = (markdown: string, heading: string) => {
  const section = extractMarkdownSection(markdown, heading);
  const num = section.match(/(\d{1,3})/);
  return num ? Number(num[1]) : null;
};

const listify = (value: any, limit = 4) => {
  if (Array.isArray(value)) return value.filter(Boolean).slice(0, limit);
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit);
  }
  return [];
};

const summarizeInterview = (text: string) => {
  const clean = text.replace(/[#*_`>-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Interview summary will appear as the response streams in.';
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.slice(0, 2).join(' ').slice(0, 220);
};

const splitPlaybackSegments = (text: string) => {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const segments = paragraphs.flatMap((paragraph) => {
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    if (sentences.length <= 1) return [paragraph];
    const grouped: string[] = [];
    for (let i = 0; i < sentences.length; i += 2) {
      grouped.push(sentences.slice(i, i + 2).join(' '));
    }
    return grouped;
  });
  return segments.length ? segments : (text.trim() ? [text.trim()] : []);
};

function App() {
  const [idea, setIdea] = useState('');
  const [analysisStage, setAnalysisStage] = useState<'idle' | 'refining' | 'awaiting_approval' | 'awaiting_research_approval' | 'analyzing'>('idle');
  const [results, setResults] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, 'pending' | 'running' | 'completed' | 'error'>>({});
  const [tokens, setTokens] = useState<Record<string, number>>({});
  const [searches, setSearches] = useState<Record<string, any[]>>({});
  const [, setUsage] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('refine');
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [interviews, setInterviews] = useState<InterviewEntry[]>([]);
  const [selectedInterviewIndex, setSelectedInterviewIndex] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sectionReview, setSectionReview] = useState<SectionReviewState>({});
  const [refiningSectionKey, setRefiningSectionKey] = useState<string | null>(null);
  const [researchReview, setResearchReview] = useState<ResearchReviewState>({ market: '', competitors: '' });
  const [refiningResearchKey, setRefiningResearchKey] = useState<'market' | 'competitors' | null>(null);
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [askingFollowUp, setAskingFollowUp] = useState<string | null>(null);
  const [visiblePlaybackCount, setVisiblePlaybackCount] = useState(0);
  const [isPlaybackRunning, setIsPlaybackRunning] = useState(true);
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  
  const totalTokens = Object.values(tokens).reduce((acc, val) => acc + val, 0);
  const totalSearches = Object.values(searches).reduce((acc, val) => acc + (val?.length || 0), 0);
  const refinementSections = parseRefinementSections(results['refine'] || '');
  const reviewableSections = refinementSections.filter((section) => section.key !== 'checkpoint');
  const acceptedSections = reviewableSections.filter(
    (section) => sectionReview[section.key]?.decision === 'accepted'
  ).length;
  const flaggedSections = reviewableSections.filter(
    (section) => sectionReview[section.key]?.decision === 'revise'
  );
  const allSectionsAccepted = reviewableSections.length > 0 && acceptedSections === reviewableSections.length;
  const snapshotTitle = extractMarkdownSection(results['refine'] || '', 'Draft Pitch').split('. ')[0] || extractMarkdownSection(results['ui'] || '', 'Brand Vibe & Personality').split('. ')[0] || 'Product Interface Concept';
  const snapshotHero = extractMarkdownSection(results['ui'] || '', 'The Hero Section') || extractMarkdownSection(results['refine'] || '', 'Solution') || 'A product concept preview generated from the current validation flow.';
  const snapshotCore = extractMarkdownSection(results['ui'] || '', 'Core App Experience') || extractMarkdownSection(results['ux'] || '', 'The Path to Value') || 'Core workflow preview unavailable yet.';
  const snapshotChips = [
    ...extractBulletItems(results['refine'] || '', 'Why It Wins', 2),
    ...extractBulletItems(results['ux'] || '', 'Key Feature Roadmap (MoSCoW - simplified for humans)', 2),
  ].slice(0, 3);
  const marketTam = extractMarkdownSection(results['market'] || '', 'Market Size & TAM');
  const marketTrajectory = extractMarkdownSection(results['market'] || '', 'Trends & Trajectory');
  const marketOpportunities = extractBulletItems(results['market'] || '', 'Opportunities', 4);
  const marketRisks = extractBulletItems(results['market'] || '', 'Risks', 4);
  const competitorOverview = extractMarkdownSection(results['competitors'] || '', 'Competitive Landscape Overview');
  const competitorGaps = extractBulletItems(results['competitors'] || '', 'Positioning Gaps', 4);
  const competitorDifferentiation = extractBulletItems(results['competitors'] || '', 'Differentiation Opportunities', 4);
  const uxWorld = extractMarkdownSection(results['ux'] || '', "The User's World (Before this product)");
  const uxDiscovery = extractMarkdownSection(results['ux'] || '', 'The Discovery Moment (How they find it)');
  const uxFirst30 = extractMarkdownSection(results['ux'] || '', "The 'First 30 Seconds' (The onboarding experience)");
  const uxPath = extractMarkdownSection(results['ux'] || '', 'The Path to Value (How they solve their problem step-by-step)');
  const uxCoreLoop = extractMarkdownSection(results['ux'] || '', 'The Core Loop (What keeps them coming back)');
  const uxEmotionalArc = extractMarkdownSection(results['ux'] || '', 'Emotional Arc (How the user feels at each stage)');
  const uxRoadmap = extractBulletItems(results['ux'] || '', 'Key Feature Roadmap (MoSCoW - simplified for humans)', 5);
  const scoreValue = extractScore(results['scoring'] || '', 'OVERALL VALIDATION SCORE: [Insert Score 0-100 here]') ?? extractScore(results['scoring'] || '', 'Visibility Score (0-100)');
  const verdictText = extractMarkdownSection(results['scoring'] || '', 'The Verdict: [GO / PIVOT / NO-GO]');
  const scoreRisks = extractBulletItems(results['scoring'] || '', 'Key Risks & Warning Signs', 4);
  const scoreNextSteps = extractBulletItems(results['scoring'] || '', 'Critical Next Steps', 4);
  const visibilityScore = extractScore(results['visibility'] || '', 'Visibility Score (0-100)');
  const visibilitySummary = extractMarkdownSection(results['visibility'] || '', 'How AI Models (ChatGPT, Claude, etc.) Describe This Concept');
  const visibilityCompetition = extractMarkdownSection(results['visibility'] || '', 'Competitive Visibility Landscape');
  const visibilityRecommendations = extractBulletItems(results['visibility'] || '', 'SEO vs. GEO Optimization Recommendations', 4);
  const completedInterviewCount = interviews.filter((entry) => entry.is_complete).length;
  const activeInterview = interviews.find((entry) => entry.status === 'interviewing') || null;
  const selectedInterview = selectedInterviewIndex !== null ? interviews[selectedInterviewIndex] || null : null;
  const selectedPainPoints = listify(selectedInterview?.user.context?.pain_points, 4);
  const selectedSummary = summarizeInterview(selectedInterview?.response || '');
  const playbackMessages = selectedInterview
    ? [
        {
          key: 'intro',
          role: 'agent' as const,
          speaker: 'FounderSignal',
          text: 'Walk me through your honest reaction to this product, the market story behind it, and whether you would actually trust it enough to try or buy.',
        },
        ...splitPlaybackSegments(selectedInterview.response || '').map((text, index) => ({
          key: `main-${index}`,
          role: 'persona' as const,
          speaker: selectedInterview.user.name,
          text,
        })),
        ...((selectedInterview.followUps || []).flatMap((item, index) => {
          const answerSegments = splitPlaybackSegments(item.answer || '');
          return [
            {
              key: `q-${index}`,
              role: 'user' as const,
              speaker: 'You',
              text: item.question,
            },
            ...answerSegments.map((text, answerIndex) => ({
              key: `a-${index}-${answerIndex}`,
              role: 'persona' as const,
              speaker: selectedInterview.user.name,
              text,
            })),
          ];
        }) || []),
      ]
    : [];

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    setVisiblePlaybackCount(0);
    setIsPlaybackRunning(true);
  }, [selectedInterview?.user.name]);

  useEffect(() => {
    if (!selectedInterview || playbackMessages.length === 0) return;
    if (!isPlaybackRunning) return;
    if (visiblePlaybackCount >= playbackMessages.length) return;

    const timer = window.setTimeout(() => {
      setVisiblePlaybackCount((count) => Math.min(count + 1, playbackMessages.length));
    }, visiblePlaybackCount === 0 ? 250 : 700);

    return () => window.clearTimeout(timer);
  }, [selectedInterview, playbackMessages.length, visiblePlaybackCount, isPlaybackRunning]);

  useEffect(() => {
    if (!chatViewportRef.current) return;
    chatViewportRef.current.scrollTop = chatViewportRef.current.scrollHeight;
  }, [visiblePlaybackCount, playbackMessages.length]);

  const getHeaders = () => {
    return {
      'Content-Type': 'application/json'
    };
  };



  const fetchSessions = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/v1/agents/sessions', {
        headers: getHeaders()
      });


      const data = await res.json();
      setSessions(data);
    } catch (e) {
      console.error('Failed to fetch sessions', e);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/agents/sessions/${sessionId}`, {
        headers: getHeaders()
      });


      const data = await res.json();
      
      // Hydrate state
      setIdea(data.input.idea);
      setCurrentSessionId(data.report_id);
      
      // Hydrate idea
      if (data.idea) setIdea(data.idea);
      else if (data.input?.idea) setIdea(data.input.idea);

      setResults(data.results_map || {}); 
      setStatus(data.status_map || {});
      setTokens(data.tokens_map || {});
      setSearches(data.searches_map || {});
      setInterviews(data.interviews || []);
      const hasRefinement = (data.status_map || {}).refine === 'completed';
      const hasResearchCheckpoint =
        hasRefinement &&
        (data.status_map || {}).market === 'completed' &&
        (data.status_map || {}).competitors === 'completed' &&
        !['ux', 'ui', 'visibility', 'scoring'].some((key) => (data.status_map || {})[key] === 'completed');
      const hasOnlyRefinement =
        hasRefinement &&
        !['market', 'competitors', 'ux', 'ui', 'visibility', 'scoring'].some((key) => (data.status_map || {})[key] === 'completed');
      const inferredStage = data.analysis_stage || (
        hasResearchCheckpoint
          ? 'awaiting_research_approval'
          : hasOnlyRefinement
            ? 'awaiting_approval'
            : 'idle'
      );
      setAnalysisStage(inferredStage);
      setSectionReview(data.refinement_review || {});
      setActiveTab(inferredStage === 'awaiting_research_approval' ? 'market' : hasRefinement ? 'refine' : 'overview');

      setIsSidebarOpen(false);
    } catch (e) {
      console.error('Failed to load session', e);
    }
  };

  const saveCurrentSession = async (finalResults: any, finalStatus: any, finalTokens: any, finalSearches: any, finalInterviews?: any[], stageOverride?: string) => {
    try {
      const reportId = currentSessionId || Math.random().toString(36).substring(7);
      
      // Generate a short title from the idea
      const title = idea.length > 40 ? idea.substring(0, 40) + '...' : idea;

      const payload = {
        report_id: reportId,
        idea: idea, // keeping 'idea' for backwards compat or internal use
        title: title,
        input: { idea },
        results_map: finalResults,
        status_map: finalStatus,
        tokens_map: finalTokens,
        searches_map: finalSearches,
        analysis_stage: stageOverride || analysisStage,
        refinement_review: sectionReview,
        interviews: finalInterviews || interviews,
        created_at: new Date().toISOString()
      };


      
      await fetch('http://localhost:8000/api/v1/agents/sessions/save', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });


      
      setCurrentSessionId(reportId);
      fetchSessions();
    } catch {}
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
      const res = await fetch('http://localhost:8000/api/v1/agents/usage', {
        headers: getHeaders()
      });


      const data = await res.json();
      setUsage(data);
    } catch (e) {
      console.error('Failed to fetch usage', e);
    }
  };

  const streamAgent = async (agentId: string, payload: any): Promise<string> => {
    setStatus(prev => ({ ...prev, [agentId]: 'running' }));
    setResults(prev => ({ ...prev, [agentId]: '' }));

    try {
      const response = await fetch(`http://localhost:8000/api/v1/agents${AGENTS.find(a => a.id === agentId)?.endpoint}`, {
        method: 'POST',
        headers: getHeaders(),
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

  const updateResearchReview = (key: 'market' | 'competitors', value: string) => {
    setResearchReview((prev) => ({ ...prev, [key]: value }));
  };

  const startInterviews = async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    setInterviews([]);
    setSelectedInterviewIndex(null);
    setActiveTab('interviews');
    let latestInterviews: InterviewEntry[] = [];

    try {
      const response = await fetch('http://localhost:8000/api/v1/agents/interviews', {
        method: 'POST',
        headers: getHeaders(),
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
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.replace('data: ', ''));
            
            if (data.user) {
              setInterviews(prev => {
                const existing = prev.findIndex(i => i.user.name === data.user.name);
                const nextStatus: InterviewStatus = data.is_complete
                  ? 'complete'
                  : data.event === 'persona_created'
                    ? 'ready'
                    : data.chunk
                      ? 'interviewing'
                      : 'building';

                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = {
                    ...updated[existing],
                    user: data.user,
                    response: data.response || `${updated[existing].response}${data.chunk || ''}`,
                    is_complete: Boolean(data.is_complete),
                    status: nextStatus,
                    focus_points: data.focus_points || updated[existing].focus_points || [],
                    research_highlights: data.research_highlights || updated[existing].research_highlights,
                  };
                  latestInterviews = updated;
                  return updated;
                } else {
                  if (prev.length === 0) setSelectedInterviewIndex(0);
                  latestInterviews = [
                    ...prev,
                    {
                      user: data.user,
                      response: data.response || data.chunk || '',
                      is_complete: Boolean(data.is_complete),
                      status: nextStatus,
                      focus_points: data.focus_points || [],
                      research_highlights: data.research_highlights,
                    },
                  ];
                  return latestInterviews;
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
      saveCurrentSession(results, status, tokens, searches, latestInterviews.length ? latestInterviews : interviews);
    }
  };

  const askSelectedInterviewQuestion = async () => {
    if (!selectedInterview || !followUpQuestion.trim() || askingFollowUp) return;

    const question = followUpQuestion.trim();
    setAskingFollowUp(selectedInterview.user.name);
    setFollowUpQuestion('');

    setInterviews((prev) =>
      prev.map((entry) =>
        entry.user.name === selectedInterview.user.name
          ? {
              ...entry,
              followUps: [...(entry.followUps || []), { question, answer: '', isStreaming: true }],
            }
          : entry,
      ),
    );

    try {
      const response = await fetch('http://localhost:8000/api/v1/agents/interviews/follow-up', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          user: selectedInterview.user,
          question,
          prior_response: selectedInterview.response,
          refined_idea: results['refine'],
          market_research: results['market'],
          competitors: results['competitors'],
          ux: results['ux'],
          ui: results['ui'],
          visibility: results['visibility'],
          scoring: results['scoring'],
        }),
      });

      if (!response.ok) throw new Error('Follow-up question failed');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';
      let latestInterviews = interviews;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.replace('data: ', ''));
          if (data.error) throw new Error(data.error);
          if (!data.user || data.question !== question) continue;

          setInterviews((prev) => {
            const updated = prev.map((entry) => {
              if (entry.user.name !== data.user.name) return entry;
              const followUps = [...(entry.followUps || [])];
              const targetIndex = followUps.findIndex((item) => item.question === question && item.isStreaming !== false);
              if (targetIndex >= 0) {
                followUps[targetIndex] = {
                  ...followUps[targetIndex],
                  answer: data.response || `${followUps[targetIndex].answer}${data.chunk || ''}`,
                  isStreaming: !data.is_complete,
                };
              }
              return { ...entry, followUps };
            });
            latestInterviews = updated;
            return updated;
          });
        }
      }

      await saveCurrentSession(results, status, tokens, searches, latestInterviews);
    } catch (e: any) {
      console.error('Follow-up question error', e);
      setGlobalError(e.message || 'Failed to ask follow-up question.');
    } finally {
      setAskingFollowUp(null);
    }
  };

  const togglePlayback = () => {
    if (!selectedInterview) return;
    if (visiblePlaybackCount >= playbackMessages.length) {
      setVisiblePlaybackCount(0);
      setIsPlaybackRunning(true);
      return;
    }
    setIsPlaybackRunning((current) => !current);
  };


  const startRefinement = async () => {
    if (isOrchestrating) return;
    if (!idea.trim()) return;
    
    setIsOrchestrating(true);
    setAnalysisStage('refining');
    setResults({});
    setStatus({});
    setTokens({});
    setSearches({});
    setSectionReview({});
    setGlobalError(null);
    
    const localResults: Record<string, string> = {};
    const localStatus: Record<string, string> = {};

    try {
      const runStage = async (id: string, params: any) => {
        localStatus[id] = 'running';
        setStatus(prev => ({...prev, [id]: 'running'}));
        const text = await streamAgent(id, params);
        localResults[id] = text;
        localStatus[id] = 'completed';
        setResults(prev => ({...prev, [id]: text}));
        setStatus(prev => ({...prev, [id]: 'completed'}));
        return text;
      };

      // 1. Refine only
      await runStage('refine', { idea });
      setAnalysisStage('awaiting_approval');
      setSectionReview({});
      setActiveTab('refine');
      
      // Save partial results
      await saveCurrentSession(localResults, localStatus, tokens, searches, interviews, 'awaiting_approval');
      
    } catch (err: any) {
      console.error('Refinement failed:', err);
      setGlobalError(err.message || 'Failed to refine idea.');
      setAnalysisStage('idle');
    } finally {
      setIsOrchestrating(false);
    }
  };

  const continueAnalysis = async () => {
    if (isOrchestrating) return;
    if (analysisStage === 'awaiting_approval' && !results['refine']) {
      setGlobalError('Complete idea refinement before continuing.');
      return;
    }
    if (analysisStage === 'awaiting_approval' && !allSectionsAccepted) {
      setGlobalError('Accept each refined idea section before continuing to research.');
      return;
    }
    setIsOrchestrating(true);
    setAnalysisStage('analyzing');
    setGlobalError(null);

    const localResults = { ...results };
    const localStatus = { ...status };
    const refinedText = results['refine'];

    try {
      const runStage = async (id: string, params: any) => {
        localStatus[id] = 'running';
        setStatus(prev => ({...prev, [id]: 'running'}));
        const text = await streamAgent(id, params);
        localResults[id] = text;
        localStatus[id] = 'completed';
        setResults(prev => ({...prev, [id]: text}));
        setStatus(prev => ({...prev, [id]: 'completed'}));
        return text;
      };

      if (analysisStage === 'awaiting_approval') {
        await Promise.all([
          runStage('market', { refined_idea: refinedText }),
          runStage('competitors', { refined_idea: refinedText })
        ]);

        await fetchUsage();
        setAnalysisStage('awaiting_research_approval');
        setActiveTab('market');
        await saveCurrentSession(localResults, localStatus, tokens, searches, interviews, 'awaiting_research_approval');
      } else {
        const marketText = localResults['market'] || results['market'];
        const compText = localResults['competitors'] || results['competitors'];

        const [uxText] = await Promise.all([
          runStage('ux', { refined_idea: refinedText, market_research: marketText }),
          runStage('scoring', { refined_idea: refinedText, market_research: marketText, competitor_research: compText })
        ]);

        await new Promise(r => setTimeout(r, 500));
        
        await runStage('visibility', { refined_idea: refinedText, competitor_research: compText });
        await runStage('ui', { refined_idea: refinedText, ux_flow: uxText });

        await fetchUsage();
        await saveCurrentSession(localResults, localStatus, tokens, searches, interviews, 'idle');
        setAnalysisStage('idle');
      }
      
    } catch (err: any) {
      console.error('Analysis failed:', err);
      setGlobalError(err.message || 'Failed to complete analysis.');
    } finally {
      setIsOrchestrating(false);
    }
  };

  const updateSectionDecision = (sectionKey: string, decision: SectionDecision) => {
    setSectionReview((prev) => ({
      ...prev,
      [sectionKey]: {
        decision,
        notes: decision === 'accepted' ? '' : prev[sectionKey]?.notes || ''
      }
    }));
  };

  const updateSectionNotes = (sectionKey: string, notes: string) => {
    setSectionReview((prev) => ({
      ...prev,
      [sectionKey]: {
        decision: prev[sectionKey]?.decision || 'revise',
        notes
      }
    }));
  };

  const runRefinementWithFeedback = async (feedback: string) => {
    const text = await streamAgent('refine', { idea, feedback });
    setResults((prev) => ({ ...prev, refine: text }));
    setStatus((prev) => ({ ...prev, refine: 'completed' }));
    setAnalysisStage('awaiting_approval');
    setSectionReview({});
    await saveCurrentSession(
      { ...results, refine: text },
      { ...status, refine: 'completed' },
      tokens,
      searches,
      interviews
    );
  };

  const rerunResearchAgent = async (agentId: 'market' | 'competitors') => {
    if (isOrchestrating) return;

    const feedback = researchReview[agentId].trim();
    if (!feedback) {
      setGlobalError(`Add a short edit request before refining ${agentId === 'market' ? 'market research' : 'competitor analysis'}.`);
      return;
    }

    setIsOrchestrating(true);
    setAnalysisStage('awaiting_research_approval');
    setRefiningResearchKey(agentId);
    setGlobalError(null);

    try {
      const text = await streamAgent(agentId, {
        refined_idea: results['refine'],
        feedback,
      });
      const nextResults = { ...results, [agentId]: text };
      const nextStatus: Record<string, 'pending' | 'running' | 'completed' | 'error'> = {
        ...status,
        [agentId]: 'completed',
      };
      setResults(nextResults);
      setStatus(nextStatus);
      setResearchReview((prev) => ({ ...prev, [agentId]: '' }));
      await saveCurrentSession(nextResults, nextStatus, tokens, searches, interviews, 'awaiting_research_approval');
    } catch (err: any) {
      console.error(`Failed to rerun ${agentId}:`, err);
      setGlobalError(err.message || `Failed to refine ${agentId}.`);
    } finally {
      setIsOrchestrating(false);
      setRefiningResearchKey(null);
    }
  };

  const refineSingleSection = async (sectionTitle: string, sectionKey: string) => {
    if (isOrchestrating) return;

    const notes = sectionReview[sectionKey]?.notes?.trim();
    if (!notes) {
      setGlobalError(`Add a short edit request for "${sectionTitle}" before sending refinement.`);
      return;
    }

    setIsOrchestrating(true);
    setAnalysisStage('refining');
    setRefiningSectionKey(sectionKey);
    setGlobalError(null);

    try {
      const acceptedTitles = reviewableSections
        .filter((section) => sectionReview[section.key]?.decision === 'accepted')
        .map((section) => section.title);
      const feedback = [
        `Revise only the "${sectionTitle}" section.`,
        'Keep the rest of the document stable unless this change requires a small alignment update.',
        acceptedTitles.length > 0 ? `Already accepted sections to preserve: ${acceptedTitles.join(', ')}` : '',
        `Edit request for "${sectionTitle}": ${notes}`,
        'The user may want to add details, remove claims, tighten wording, or change scope. Apply the request directly and return the full revised checkpoint document.'
      ]
        .filter(Boolean)
        .join('\n');

      await runRefinementWithFeedback(feedback);
    } catch (err: any) {
      console.error('Single section refinement failed:', err);
      setGlobalError(err.message || `Failed to refine "${sectionTitle}".`);
      setAnalysisStage('awaiting_approval');
    } finally {
      setIsOrchestrating(false);
      setRefiningSectionKey(null);
    }
  };

  const refineFlaggedSections = async () => {
    if (isOrchestrating) return;
    if (flaggedSections.length === 0) {
      setGlobalError('Flag at least one section for revision first.');
      return;
    }

    setIsOrchestrating(true);
    setAnalysisStage('refining');
    setGlobalError(null);

    try {
      const acceptedTitles = reviewableSections
        .filter((section) => sectionReview[section.key]?.decision === 'accepted')
        .map((section) => section.title);
      const feedback = [
        'Revise only the flagged sections below.',
        'Keep accepted sections aligned unless the requested revisions require a small adjustment.',
        acceptedTitles.length > 0 ? `Accepted sections to preserve where possible: ${acceptedTitles.join(', ')}` : '',
        ...flaggedSections.map((section) => {
          const notes = sectionReview[section.key]?.notes?.trim() || 'Make this section clearer and easier to approve.';
          return `- ${section.title}: ${notes}`;
        })
      ]
        .filter(Boolean)
        .join('\n');

      await runRefinementWithFeedback(feedback);
    } catch (err: any) {
      console.error('Section refinement failed:', err);
      setGlobalError(err.message || 'Failed to refine the flagged sections.');
      setAnalysisStage('awaiting_approval');
    } finally {
      setIsOrchestrating(false);
    }
  };

  return (
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
                       {s.title || s.idea || s.input?.idea || 'Untitled Project'}
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
          <div className="nav-brand-icon">
            <Zap size={16} />
          </div>
          <span className="nav-brand-name">FounderSignal</span>
        </div>

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
                  onClick={startRefinement}
                  disabled={isOrchestrating || !idea.trim()}
                  style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}
                >
                  {isOrchestrating ? <div className="spinner" style={{ width: '20px', height: '20px' }}></div> : <Sparkles size={20} />}
                  {isOrchestrating ? 'Refining Idea...' : 'Start With Idea Refinement'}
                </button>
              </div>
            </div>
          </div>

          {leftSection === "pipeline" ? (
            <>
              {allNavItems.map((item) => {
                const Icon = item.icon;
                const s = item.status;
                const clickable =
                  item.id === "overview" ||
                  s === "completed" ||
                  s === "running" ||
                  (item.id === "interviews" &&
                    (interviews.length > 0 || isSimulating));
                const badge =
                  s === "running"
                    ? "running"
                    : s === "completed"
                      ? "done"
                      : s === "error"
                        ? "error"
                        : null;
                return (
                  <div 
                    key={agent.id} 
                    className={`dashboard-tile ${activeTab === agent.id ? 'active' : ''} ${s === 'completed' ? 'clickable' : ''} ${s === 'running' ? 'is-running' : ''}`}
                    onClick={() => (s === 'completed' || s === 'running') && setActiveTab(agent.id)}
                    style={{ cursor: (s === 'completed' || s === 'running') ? 'pointer' : 'default' }}
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
                    <div className="session-idea">{s.idea}</div>
                    <div className="session-date">
                      {new Date(s.created_at).toLocaleDateString()}
                    </div>
                  </button>
                ))
              )}
            </>
          )}
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
                      <button key={a.id} onClick={() => setActiveTab(a.id)} className={`nav-item ${activeTab === a.id ? 'active' : ''} ${status[a.id] === 'running' ? 'running' : ''}`}>
                        <a.icon size={16} /> {a.label}
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

              {/* Viewport Area */}
              <div style={{ flex: 1 }}>
                {analysisStage === 'awaiting_approval' && (
                  <div className="checkpoint-card fade-in" style={{ marginBottom: '20px' }}>
                    <div className="flex-between checkpoint-header" style={{ gap: '16px', alignItems: 'flex-start' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>Checkpoint: review the refined idea first</h3>
                        <p style={{ margin: '6px 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          Review each section, accept it with a tick, or flag it for another refinement pass before spending tokens on research.
                        </p>
                      </div>
                    </div>

                    <div className="checkpoint-guidance">
                      <div className="checkpoint-pill">{acceptedSections}/{reviewableSections.length || 0} sections accepted</div>
                      <div className="checkpoint-pill">{flaggedSections.length} sections flagged</div>
                      <div className="checkpoint-pill">Accept or revise each section</div>
                    </div>

                    <div className="checkpoint-actions">
                      <button
                        onClick={refineFlaggedSections}
                        disabled={isOrchestrating || flaggedSections.length === 0}
                        style={{ background: 'white', color: 'var(--text-primary)', border: '1px solid #cbd5e1' }}
                      >
                        Refine Flagged Sections
                      </button>
                      <button onClick={continueAnalysis} disabled={isOrchestrating || !allSectionsAccepted}>
                        <ArrowRight size={16} />
                        Continue To Research
                      </button>
                    </div>
                  </div>
                )}
                {analysisStage === 'awaiting_research_approval' && (
                  <div className="checkpoint-card fade-in" style={{ marginBottom: '20px' }}>
                    <div className="flex-between checkpoint-header" style={{ gap: '16px', alignItems: 'flex-start' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>Checkpoint: review research before synthesis</h3>
                        <p style={{ margin: '6px 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                          Market research and competitor analysis are ready. Review both tabs, then continue to UX, scoring, visibility, and UI generation.
                        </p>
                      </div>
                    </div>

                    <div className="checkpoint-guidance">
                      <div className={`checkpoint-pill ${activeTab === 'market' ? 'is-selected' : ''}`}>Market research complete</div>
                      <div className={`checkpoint-pill ${activeTab === 'competitors' ? 'is-selected' : ''}`}>Competitor analysis complete</div>
                      <div className="checkpoint-pill">Human review before downstream agents</div>
                    </div>

                    <div className="checkpoint-actions">
                      <button onClick={() => setActiveTab('market')} className={activeTab === 'market' ? 'checkpoint-tab-highlight' : ''} style={{ background: 'white', color: 'var(--text-primary)', border: '1px solid #cbd5e1' }}>
                        Review Market Research
                      </button>
                      <button onClick={() => setActiveTab('competitors')} className={activeTab === 'competitors' ? 'checkpoint-tab-highlight' : ''} style={{ background: 'white', color: 'var(--text-primary)', border: '1px solid #cbd5e1' }}>
                        Review Competitors
                      </button>
                      <button onClick={continueAnalysis} disabled={isOrchestrating}>
                        <ArrowRight size={16} />
                        Continue To The Rest
                      </button>
                    </div>
                  </div>
                )}
                <div className={`glass-panel ${activeTab === 'interviews' ? 'interview-shell' : ''}`} style={{ padding: '32px', minHeight: '600px' }}>
                  {status[activeTab] === 'running' && (
                    <div className="streaming-banner">
                      <span className="streaming-wave"></span>
                      <span className="streaming-dot"></span>
                      <span className="streaming-copy">Streaming live. New output appears as the agent writes.</span>
                    </div>
                  )}
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
                    <div className="fade-in interview-lab">
                      <div className="interview-mini-header">
                        <div>
                          <span className="visual-eyebrow">Customer Validation Lab</span>
                          <h2>Simulated user interviews</h2>
                        </div>
                        <div className="interview-mini-stats">
                          <span>{interviews.length}/5 personas</span>
                          <span>{completedInterviewCount} completed</span>
                          <span>{activeInterview ? `${activeInterview.user.name} live` : isSimulating ? 'Generating personas' : 'Ready'}</span>
                        </div>
                      </div>

                      {interviews.length === 0 ? (
                        <div className="persona-empty-state compact">
                          <UserRound size={24} />
                          <p>No personas yet. Start the simulation from the overview tab.</p>
                        </div>
                      ) : (
                        <div className="persona-tab-strip" role="tablist" aria-label="Interview personas">
                          {interviews.map((int, idx) => (
                            <button
                              key={`${int.user.name}-${idx}`}
                              type="button"
                              onClick={() => setSelectedInterviewIndex(idx)}
                              className={`persona-tab ${selectedInterviewIndex === idx ? 'selected' : ''} status-${int.status}`}
                            >
                              <span className="persona-tab-name">{int.user.name}</span>
                              <span className="persona-tab-meta">{int.user.context.role || int.user.archetype}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="interview-focus-layout">
                        <div className="interview-stage compact">
                          {selectedInterview ? (
                            <>
                              <div className="interview-stage-header">
                                <div>
                                  <span className="visual-eyebrow">Active Interview</span>
                                  <h3>{selectedInterview.user.name}</h3>
                                  <p>{selectedInterview.user.context.role || selectedInterview.user.archetype} • {selectedInterview.user.context.company_or_context || 'Context forming'}</p>
                                </div>
                                <div className={`interview-live-pill ${selectedInterview.status}`}>
                                  <span className="interview-live-dot"></span>
                                  {selectedInterview.status === 'complete' ? 'Interview complete' : selectedInterview.status === 'interviewing' ? 'Streaming answer' : selectedInterview.status === 'ready' ? 'Persona created' : 'Building persona'}
                                </div>
                              </div>

                              <div className="interview-summary-bar">
                                <div className="interview-summary-main">
                                  <span className="interview-summary-label">Interview summary</span>
                                  <p>{selectedSummary}</p>
                                </div>
                                <div className="interview-summary-meta">
                                  <span>{selectedInterview.user.context.role || selectedInterview.user.archetype}</span>
                                  <span>{(selectedPainPoints[0] || selectedInterview.focus_points[0] || 'Real-world concerns').slice(0, 60)}</span>
                                </div>
                              </div>

                              <div className="loom-player-shell">
                                <div className="loom-player-topbar">
                                  <div className="loom-player-meta">
                                    <div className="loom-player-avatar">{selectedInterview.user.name.split(' ').map((part: string) => part[0]).join('').slice(0, 2)}</div>
                                    <div>
                                      <strong>{selectedInterview.user.name}</strong>
                                      <span>{selectedInterview.user.context.role || selectedInterview.user.archetype}</span>
                                    </div>
                                  </div>
                                  <div className="loom-player-controls">
                                    <button type="button" className="loom-control-btn" onClick={togglePlayback}>
                                      {visiblePlaybackCount >= playbackMessages.length
                                        ? <Play size={14} />
                                        : isPlaybackRunning
                                          ? <Pause size={14} />
                                          : <Play size={14} />}
                                    </button>
                                    <span className="loom-control-copy">
                                      {visiblePlaybackCount >= playbackMessages.length
                                        ? 'Replay interview'
                                        : isPlaybackRunning
                                          ? 'Playing'
                                          : 'Paused'}
                                    </span>
                                  </div>
                                </div>

                                <div className="interview-quote-card minimal">
                                  <Quote size={16} />
                                  <p>{selectedInterview.user.context.quote_seed || 'Show me why this belongs in my workflow.'}</p>
                                </div>

                                <div className="chat-viewport" ref={chatViewportRef}>
                                  <div className="transcript-shell compact minimal">
                                    {playbackMessages.slice(0, visiblePlaybackCount).map((message) => (
                                      <div
                                        key={message.key}
                                        className={`transcript-turn ${
                                          message.role === 'agent'
                                            ? 'interviewer'
                                            : message.role === 'user'
                                              ? 'viewer'
                                              : 'participant'
                                        }`}
                                      >
                                        <div className="transcript-speaker">{message.speaker}</div>
                                        <div className="transcript-bubble">
                                          <ReactMarkdown>{message.text}</ReactMarkdown>
                                        </div>
                                      </div>
                                    ))}
                                    {(selectedInterview.status === 'interviewing' || askingFollowUp === selectedInterview.user.name) && (
                                      <div className="transcript-turn participant">
                                        <div className="transcript-speaker">{selectedInterview.user.name}</div>
                                        <div className="transcript-bubble typing-state">
                                          <span className="typing-cursor"></span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="follow-up-bar">
                                  <textarea
                                    value={followUpQuestion}
                                    onChange={(e) => setFollowUpQuestion(e.target.value)}
                                    placeholder={`Ask ${selectedInterview.user.name} a follow-up question...`}
                                    className="follow-up-input"
                                  />
                                  <button
                                    type="button"
                                    onClick={askSelectedInterviewQuestion}
                                    disabled={!followUpQuestion.trim() || askingFollowUp === selectedInterview.user.name}
                                    className="follow-up-button"
                                  >
                                    {askingFollowUp === selectedInterview.user.name ? 'Asking...' : 'Ask User'}
                                  </button>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="persona-empty-state">
                              <Radar size={24} />
                              <p>Select a persona to open the interview room.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : activeTab === 'refine' && refinementSections.length > 0 ? (
                    <div className="fade-in">
                      {refinementSections.map((section) => {
                        const review = sectionReview[section.key] || { decision: 'pending', notes: '' };
                        const showControls = analysisStage === 'awaiting_approval' && section.key !== 'checkpoint';

                        return (
                          <section key={section.key} className="refine-section-card">
                            <div className="refine-section-header">
                              <div>
                                <h2 style={{ marginBottom: '6px' }}>{section.title}</h2>
                                {showControls && (
                                  <span className={`review-status review-status-${review.decision}`}>
                                    {review.decision === 'accepted' ? 'Accepted' : review.decision === 'revise' ? 'Edit requested' : 'Pending review'}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="markdown-content">
                              <ReactMarkdown>{section.content}</ReactMarkdown>
                            </div>

                            {showControls && (
                              <div className="section-review-panel">
                                <div className="section-review-inline">
                                  <span className="section-review-label">Review</span>

                                  <label className={`compact-choice ${review.decision === 'accepted' ? 'selected' : ''}`}>
                                    <input
                                      type="radio"
                                      name={`section-${section.key}`}
                                      value="accepted"
                                      checked={review.decision === 'accepted'}
                                      onChange={() => updateSectionDecision(section.key, 'accepted')}
                                    />
                                    <span>Accept</span>
                                  </label>

                                  <label className={`compact-choice ${review.decision === 'revise' ? 'selected' : ''}`}>
                                    <input
                                      type="radio"
                                      name={`section-${section.key}`}
                                      value="revise"
                                      checked={review.decision === 'revise'}
                                      onChange={() => updateSectionDecision(section.key, 'revise')}
                                    />
                                    <span>Revise</span>
                                  </label>
                                </div>

                                {review.decision === 'revise' && (
                                  <div className="section-revise-box">
                                    <textarea
                                      value={review.notes}
                                      onChange={(e) => updateSectionNotes(section.key, e.target.value)}
                                      placeholder={`What should change in "${section.title}"? Add details to include, claims to remove, or wording to tighten.`}
                                      style={{ minHeight: '100px', marginTop: '12px' }}
                                    />
                                    <div className="section-revise-actions">
                                      <button
                                        onClick={() => refineSingleSection(section.title, section.key)}
                                        disabled={isOrchestrating || refiningSectionKey === section.key || !review.notes.trim()}
                                      >
                                        <Sparkles size={16} />
                                        {refiningSectionKey === section.key ? 'Refining This Section...' : 'Refine This Section'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  ) : activeTab === 'refine' && status['refine'] === 'running' ? (
                    <div className="markdown-content fade-in">
                      <p className="streaming-helper">The refinement draft is streaming in. Sections will become reviewable as headings arrive.</p>
                      <ReactMarkdown>{results['refine'] || 'Starting idea refinement...'}</ReactMarkdown>
                    </div>
                  ) : activeTab === 'market' && results['market'] ? (
                    <div className="fade-in">
                      <div className="stage-visual">
                        <div className="stage-visual-header">
                          <span className="visual-eyebrow">Market Snapshot</span>
                          <h2>Market Dashboard</h2>
                        </div>
                        <div className="market-visual-grid">
                          <div className="metric-card">
                            <span className="metric-label">TAM signal</span>
                            <div className="metric-value">{extractNumber(marketTam) || 'Sizing needed'}</div>
                            <p>{sentencePreview(marketTam, 'Market size summary from the report.')}</p>
                          </div>
                          <div className="metric-card alt">
                            <span className="metric-label">Growth signal</span>
                            <div className="metric-value">{extractNumber(marketTrajectory) || 'Trend signal'}</div>
                            <p>{sentencePreview(marketTrajectory, 'Trajectory and trend summary from the report.')}</p>
                          </div>
                          <div className="insight-card">
                            <h3>Opportunities</h3>
                            <div className="chip-cloud">
                              {(marketOpportunities.length ? marketOpportunities : extractShortLines(extractMarkdownSection(results['market'] || '', 'Executive Summary'), 3)).map((item) => (
                                <span key={item} className="insight-chip positive">{item}</span>
                              ))}
                            </div>
                          </div>
                          <div className="insight-card">
                            <h3>Risks</h3>
                            <div className="chip-cloud">
                              {(marketRisks.length ? marketRisks : ['Validate source quality', 'Confirm market timing']).map((item) => (
                                <span key={item} className="insight-chip warning">{item}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="markdown-content">
                        <ReactMarkdown>{results['market']}</ReactMarkdown>
                      </div>
                      {analysisStage === 'awaiting_research_approval' && (
                        <div className="research-iteration-box">
                          <h3>Refine Market Research</h3>
                          <textarea
                            value={researchReview.market}
                            onChange={(e) => updateResearchReview('market', e.target.value)}
                            placeholder="Ask for clearer data, stronger sources, less fluff, more buyer-specific insights, or removal of weak claims."
                            style={{ minHeight: '110px' }}
                          />
                          <div className="section-revise-actions">
                            <button
                              onClick={() => rerunResearchAgent('market')}
                              disabled={isOrchestrating || refiningResearchKey === 'market' || !researchReview.market.trim()}
                            >
                              <Sparkles size={16} />
                              {refiningResearchKey === 'market' ? 'Refining Market Research...' : 'Refine Market Research'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : activeTab === 'competitors' && results['competitors'] ? (
                    <div className="fade-in">
                      <div className="stage-visual">
                        <div className="stage-visual-header">
                          <span className="visual-eyebrow">Competitive View</span>
                          <h2>Competitor Matrix</h2>
                        </div>
                        <div className="matrix-board">
                          <div className="matrix-axis axis-y">Differentiation</div>
                          <div className="matrix-axis axis-x">Market Maturity</div>
                          <div className="matrix-grid">
                            <div className="matrix-cell">
                              <span>Emerging gap</span>
                              <p>{sentencePreview(competitorOverview, 'Whitespace in the market.', 80)}</p>
                            </div>
                            <div className="matrix-cell">
                              <span>Established players</span>
                              <p>{sentencePreview(visibilityCompetition || competitorOverview, 'Crowded incumbent zone.', 80)}</p>
                            </div>
                            <div className="matrix-cell highlight">
                              <span>Your wedge</span>
                              <p>{(competitorGaps[0] || competitorDifferentiation[0] || 'Define the sharpest positioning gap here.').slice(0, 90)}</p>
                            </div>
                            <div className="matrix-cell">
                              <span>Premium niche</span>
                              <p>{(competitorDifferentiation[1] || competitorGaps[1] || 'Opportunity for focused premium positioning.').slice(0, 90)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="dual-column-chips">
                          <div>
                            <h3>Positioning Gaps</h3>
                            <div className="chip-cloud">
                              {(competitorGaps.length ? competitorGaps : ['Sharpen the underserved buyer segment']).map((item) => (
                                <span key={item} className="insight-chip neutral">{item}</span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h3>Differentiation</h3>
                            <div className="chip-cloud">
                              {(competitorDifferentiation.length ? competitorDifferentiation : ['Turn a market gap into a defensible promise']).map((item) => (
                                <span key={item} className="insight-chip positive">{item}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="markdown-content">
                        <ReactMarkdown>{results['competitors']}</ReactMarkdown>
                      </div>
                      {analysisStage === 'awaiting_research_approval' && (
                        <div className="research-iteration-box">
                          <h3>Refine Competitor Analysis</h3>
                          <textarea
                            value={researchReview.competitors}
                            onChange={(e) => updateResearchReview('competitors', e.target.value)}
                            placeholder="Ask for stronger competitor picks, clearer gaps, better differentiation, or removal of weak examples."
                            style={{ minHeight: '110px' }}
                          />
                          <div className="section-revise-actions">
                            <button
                              onClick={() => rerunResearchAgent('competitors')}
                              disabled={isOrchestrating || refiningResearchKey === 'competitors' || !researchReview.competitors.trim()}
                            >
                              <Sparkles size={16} />
                              {refiningResearchKey === 'competitors' ? 'Refining Competitor Analysis...' : 'Refine Competitor Analysis'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : activeTab === 'ux' && results['ux'] ? (
                    <div className="fade-in">
                      <div className="stage-visual">
                        <div className="stage-visual-header">
                          <span className="visual-eyebrow">Journey Map</span>
                          <h2>UX Flow Canvas</h2>
                        </div>
                        <div className="journey-track">
                          {[
                            { label: 'Before', text: uxWorld || 'What life looks like before the product.' },
                            { label: 'Discovery', text: uxDiscovery || 'How the user discovers the product.' },
                            { label: 'First 30s', text: uxFirst30 || 'The initial onboarding moment.' },
                            { label: 'Value', text: uxPath || 'How the user reaches value.' },
                            { label: 'Loop', text: uxCoreLoop || 'What keeps them returning.' },
                          ].map((step, index) => (
                            <div key={step.label} className="journey-step">
                              <div className="journey-index">0{index + 1}</div>
                              <h3>{step.label}</h3>
                              <p>{sentencePreview(step.text, step.text, 110)}</p>
                            </div>
                          ))}
                        </div>
                        <div className="dual-column-chips">
                          <div>
                            <h3>Emotional Arc</h3>
                            <p className="visual-body-copy">{sentencePreview(uxEmotionalArc, 'Confidence rises as friction drops.', 220)}</p>
                          </div>
                          <div>
                            <h3>Roadmap</h3>
                            <div className="chip-cloud">
                              {(uxRoadmap.length ? uxRoadmap : ['Must Have: clarify the first core workflow']).map((item) => (
                                <span key={item} className="insight-chip neutral">{item}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="markdown-content">
                        <ReactMarkdown>{results['ux']}</ReactMarkdown>
                      </div>
                    </div>
                  ) : activeTab === 'scoring' && results['scoring'] ? (
                    <div className="fade-in">
                      <div className="stage-visual">
                        <div className="stage-visual-header">
                          <span className="visual-eyebrow">Decision Layer</span>
                          <h2>Validation Scoreboard</h2>
                        </div>
                        <div className="score-hero">
                          <div className="score-ring">
                            <div className="score-ring-inner">
                              <span className="score-ring-value">{scoreValue ?? '--'}</span>
                              <span className="score-ring-label">Score</span>
                            </div>
                          </div>
                          <div className="score-summary">
                            <h3>{verdictText || 'Awaiting verdict summary'}</h3>
                            <div className="dual-column-chips">
                              <div>
                                <h4>Key Risks</h4>
                                <div className="chip-cloud">
                                  {(scoreRisks.length ? scoreRisks : ['Risk summary not parsed yet']).map((item) => (
                                    <span key={item} className="insight-chip warning">{item}</span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <h4>Next Steps</h4>
                                <div className="chip-cloud">
                                  {(scoreNextSteps.length ? scoreNextSteps : ['Next step summary not parsed yet']).map((item) => (
                                    <span key={item} className="insight-chip positive">{item}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="markdown-content">
                        <ReactMarkdown>{results['scoring']}</ReactMarkdown>
                      </div>
                    </div>
                  ) : activeTab === 'visibility' && results['visibility'] ? (
                    <div className="fade-in">
                      <div className="stage-visual">
                        <div className="stage-visual-header">
                          <span className="visual-eyebrow">AI Discovery</span>
                          <h2>Visibility Dashboard</h2>
                        </div>
                        <div className="market-visual-grid">
                          <div className="metric-card alt">
                            <span className="metric-label">Visibility score</span>
                            <div className="metric-value">{visibilityScore ?? '--'}</div>
                            <p>{sentencePreview(visibilitySummary, 'How AI systems currently describe the concept.', 120)}</p>
                          </div>
                          <div className="insight-card">
                            <h3>Competitive visibility</h3>
                            <p className="visual-body-copy">{sentencePreview(visibilityCompetition, 'Competitive visibility landscape summary.', 180)}</p>
                          </div>
                          <div className="insight-card" style={{ gridColumn: '1 / -1' }}>
                            <h3>Optimization recommendations</h3>
                            <div className="chip-cloud">
                              {(visibilityRecommendations.length ? visibilityRecommendations : ['Strengthen product-language consistency across AI-facing touchpoints']).map((item) => (
                                <span key={item} className="insight-chip neutral">{item}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="markdown-content">
                        <ReactMarkdown>{results['visibility']}</ReactMarkdown>
                      </div>
                    </div>
                  ) : activeTab === 'ui' && results['ui'] ? (
                    <div className="fade-in">
                      <div className="visual-snapshot">
                        <div className="visual-snapshot-copy">
                          <span className="visual-eyebrow">Visual Snapshot</span>
                          <h2>{snapshotTitle}</h2>
                          <p>{snapshotHero.slice(0, 240)}</p>
                          <div className="visual-chip-row">
                            {(snapshotChips.length > 0 ? snapshotChips : ['Clear value prop', 'Focused first user', 'Product-led flow']).map((chip) => (
                              <span key={chip} className="visual-chip">{chip}</span>
                            ))}
                          </div>
                        </div>
                        <div className="visual-device">
                          <div className="visual-nav">
                            <span></span><span></span><span></span>
                          </div>
                          <div className="visual-hero-card">
                            <div className="visual-badge">Launch-ready</div>
                            <div className="visual-title">{extractMarkdownSection(results['ui'], 'Brand Vibe & Personality').split('. ')[0] || 'Product Story'}</div>
                            <div className="visual-subtitle">{snapshotHero.slice(0, 140)}</div>
                          </div>
                          <div className="visual-grid">
                            <div className="visual-mini-card">
                              <div className="visual-mini-label">Hero</div>
                              <div className="visual-mini-copy">{snapshotHero.slice(0, 70)}</div>
                            </div>
                            <div className="visual-mini-card alt">
                              <div className="visual-mini-label">Core Flow</div>
                              <div className="visual-mini-copy">{snapshotCore.slice(0, 70)}</div>
                            </div>
                            <div className="visual-mini-card">
                              <div className="visual-mini-label">Audience</div>
                              <div className="visual-mini-copy">{extractMarkdownSection(results['refine'] || '', 'Best Early User').replace(/^- /gm, '').slice(0, 70) || 'Early adopter profile'}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="markdown-content">
                        <ReactMarkdown>{results['ui']}</ReactMarkdown>
                      </div>
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
                            {s.idea?.slice(0, 50) || "Untitled"}
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

            {!isOrchestrating && (
              <div style={{ textAlign: 'center', marginTop: '40px' }}>
                <button onClick={() => { setIdea(''); setResults({}); setStatus({}); setTokens({}); setSearches({}); setInterviews([]); setCurrentSessionId(null); setAnalysisStage('idle'); setActiveTab('refine'); setSectionReview({}); setGlobalError(null); }} style={{ background: 'white', border: '1px solid #e2e8f0' }}>
                  Start New Validation
                </button>
              </div>
              <div className="markdown-content">
                <ReactMarkdown>{results[activeTab] || ""}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* ── Interviews tab ── */}
          {activeTab === "interviews" && (
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
                    </div>
                    {interviews[selectedInterviewIndex].response ? (
                      <div className="markdown-content">
                        <ReactMarkdown>
                          {interviews[selectedInterviewIndex].response}
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
                  ? <div className="markdown-content"><ReactMarkdown>{interviewReport}</ReactMarkdown></div>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[80, 60, 70, 50].map((w, i) => (
                        <div key={i} className="skeleton-line" style={{ width: `${w}%`, height: 12, borderRadius: 4 }} />
                      ))}
                    </div>
                }
              </div>
            )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
