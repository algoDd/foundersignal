export interface IdeaInput {
  idea: string;
  target_region?: string;
  industry?: string;
  target_audience?: string;
  business_model?: string;
}

export interface Dimension {
  name: string;
  score: number;
  reasoning: string;
  confidence: string;
}

export interface ValidationScore {
  overall_score: number;
  dimensions: Dimension[];
  verdict: string;
  key_risks: string[];
  next_steps: string[];
  summary: string;
}

export interface MarketResearch {
  market_size: string;
  market_growth: string;
  key_trends: string[];
  opportunities: string[];
  risks: string[];
  summary: string;
}

export interface Competitor {
  name: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
  key_features: string[];
}

export interface CompetitorAnalysis {
  competitors: Competitor[];
  competitive_landscape: string;
  positioning_gaps: string[];
  differentiation_opportunities: string[];
  summary: string;
}

export interface Persona {
  name: string;
  age_range: string;
  occupation: string;
  pain_points: string[];
  goals: string[];
  behaviors: string[];
  quote: string;
}

export interface TargetAudience {
  personas: Persona[];
  jobs_to_be_done: string[];
  behavioral_patterns: string[];
  adoption_barriers: string[];
  summary: string;
}

export interface RefinedIdea {
  problem_statement: string;
  solution_hypothesis: string;
  value_proposition: string;
  target_audience: string;
  business_model: string;
  key_assumptions: string[];
  elevator_pitch: string;
}

export interface AIVisibility {
  visibility_score: number;
  ai_search_summary: string;
  recommendations: string[];
}

export interface FullReport {
  report_id: string;
  refined_idea?: RefinedIdea;
  market_research?: MarketResearch;
  competitor_analysis?: CompetitorAnalysis;
  target_audience?: TargetAudience;
  validation_score?: ValidationScore;
  ai_visibility?: AIVisibility;
  total_duration_seconds: number;
  total_tokens_used: number;
}

export interface AnalyzeResponse {
  success: boolean;
  report: FullReport;
}
