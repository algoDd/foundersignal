"""FounderSignal — Pydantic schemas for all inputs and outputs.

Every agent's input/output is a well-defined Pydantic model.
This makes the pipeline type-safe, serializable, and self-documenting.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

# =============================================================================
# Enums
# =============================================================================


class AgentStatus(StrEnum):
    """Status of an individual agent run."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class BusinessModel(StrEnum):
    """Common business model types."""

    SAAS = "saas"
    MARKETPLACE = "marketplace"
    E_COMMERCE = "ecommerce"
    SUBSCRIPTION = "subscription"
    FREEMIUM = "freemium"
    AD_SUPPORTED = "ad_supported"
    HARDWARE = "hardware"
    API_SERVICE = "api_service"
    OTHER = "other"


# =============================================================================
# Input
# =============================================================================


class IdeaInput(BaseModel):
    """User's raw startup idea with optional context."""

    idea: str = Field(..., min_length=10, max_length=50000, description="Raw startup idea text")
    target_region: str | None = Field(None, description="Target geographic region")
    industry: str | None = Field(None, description="Industry vertical")
    target_audience: str | None = Field(None, description="Target audience description")
    business_model: str | None = Field(None, description="Business model type")


# =============================================================================
# Agent Outputs
# =============================================================================


class RefinedIdea(BaseModel):
    """Output of the Idea Refinement Agent."""

    problem_statement: str = Field(..., description="Clear, concise problem statement")
    solution_hypothesis: str = Field(..., description="Proposed solution")
    value_proposition: str = Field(..., description="Core value proposition")
    target_audience: str = Field(..., description="Refined target audience")
    business_model: str = Field(..., description="Recommended business model")
    key_assumptions: list[str] = Field(
        default_factory=list, description="Key assumptions to validate"
    )
    elevator_pitch: str = Field(..., description="One-paragraph elevator pitch")


class MarketDataPoint(BaseModel):
    """A single market data point with source attribution."""

    metric: str = Field(..., description="What is being measured")
    value: str = Field(..., description="The data value")
    source: str = Field("", description="Source URL or reference")


class MarketResearch(BaseModel):
    """Output of the Market Research Agent."""

    market_size: str = Field(..., description="Total addressable market (TAM)")
    market_growth: str = Field(..., description="Growth rate and trajectory")
    key_trends: list[str] = Field(default_factory=list, description="Major market trends")
    data_points: list[MarketDataPoint] = Field(
        default_factory=list, description="Supporting data with sources"
    )
    opportunities: list[str] = Field(default_factory=list, description="Market opportunities")
    risks: list[str] = Field(default_factory=list, description="Market risks")
    summary: str = Field(..., description="Executive summary of market research")
    sources: list[str] = Field(default_factory=list, description="All source URLs")


class Competitor(BaseModel):
    """A single competitor profile."""

    name: str
    website: str = ""
    description: str = ""
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    pricing: str = ""
    target_audience: str = ""
    key_features: list[str] = Field(default_factory=list)


class CompetitorAnalysis(BaseModel):
    """Output of the Competitor Research Agent."""

    competitors: list[Competitor] = Field(
        default_factory=list, description="Identified competitors"
    )
    competitive_landscape: str = Field(..., description="Overview of competitive landscape")
    positioning_gaps: list[str] = Field(
        default_factory=list, description="Gaps in current market positioning"
    )
    differentiation_opportunities: list[str] = Field(
        default_factory=list, description="Ways to differentiate"
    )
    summary: str = Field(..., description="Executive summary")
    sources: list[str] = Field(default_factory=list, description="Source URLs")


class Persona(BaseModel):
    """A target audience persona."""

    name: str = Field(..., description="Persona name")
    age_range: str = Field(..., description="Age range")
    occupation: str = Field(..., description="Job title or occupation")
    pain_points: list[str] = Field(default_factory=list)
    goals: list[str] = Field(default_factory=list)
    behaviors: list[str] = Field(default_factory=list)
    quote: str = Field("", description="Representative quote from this persona")


class TargetAudienceAnalysis(BaseModel):
    """Output of the Target Audience Agent."""

    personas: list[Persona] = Field(default_factory=list, description="User personas")
    jobs_to_be_done: list[str] = Field(default_factory=list, description="JTBD framework")
    behavioral_patterns: list[str] = Field(
        default_factory=list, description="Key behavioral patterns"
    )
    adoption_barriers: list[str] = Field(default_factory=list, description="Barriers to adoption")
    summary: str = Field(..., description="Executive summary")


class Screen(BaseModel):
    """A single screen in the UX flow."""

    name: str
    purpose: str
    key_elements: list[str] = Field(default_factory=list)
    user_actions: list[str] = Field(default_factory=list)
    navigation_to: list[str] = Field(default_factory=list, description="Screens this leads to")


class UXFlow(BaseModel):
    """Output of the UX Flow Agent."""

    user_journey: list[str] = Field(
        default_factory=list, description="High-level user journey steps"
    )
    screens: list[Screen] = Field(default_factory=list, description="Screen definitions")
    information_architecture: list[str] = Field(default_factory=list, description="IA structure")
    feature_priorities: list[str] = Field(
        default_factory=list, description="MVP feature prioritization"
    )
    summary: str = Field(..., description="UX flow summary")


class DesignToken(BaseModel):
    """A design system token."""

    name: str
    value: str
    category: str = ""  # color, spacing, typography, etc.


class ComponentSpec(BaseModel):
    """A UI component specification."""

    name: str
    description: str
    props: list[str] = Field(default_factory=list)
    variants: list[str] = Field(default_factory=list)


class UISpec(BaseModel):
    """Output of the UI Spec Agent."""

    design_tokens: list[DesignToken] = Field(
        default_factory=list, description="Design system tokens"
    )
    components: list[ComponentSpec] = Field(
        default_factory=list, description="Component specifications"
    )
    page_layouts: list[str] = Field(default_factory=list, description="Page layout descriptions")
    style_guide: str = Field(..., description="Overall style guide summary")
    frontend_prompt: str = Field(
        ..., description="Detailed prompt for generating the frontend (Vite/Lovable)"
    )


class AIVisibility(BaseModel):
    """Output of the AI Visibility Agent (Peec AI integration)."""

    visibility_score: float = Field(
        0.0, ge=0, le=100, description="AI search visibility score (0-100)"
    )
    ai_search_summary: str = Field(..., description="How the idea appears in AI search")
    competitor_visibility: list[dict[str, Any]] = Field(
        default_factory=list, description="Competitor visibility comparison"
    )
    recommendations: list[str] = Field(
        default_factory=list, description="Recommendations for AI visibility"
    )
    sources_cited: list[str] = Field(
        default_factory=list, description="Sources AI models cite for this topic"
    )


class CustomerValidationReport(BaseModel):
    """Summary of the synthetic customer feedback audit."""

    market_fit_score: int = Field(
        ge=0, le=100, description="A score from 0-100 indicating market fit."
    )
    key_objections: list[str] = Field(
        description="The most critical objections or 'deal-breakers' raised by the cohort."
    )
    surprising_insights: list[str] = Field(
        description="Unexpected or novel feedback and edge cases identified."
    )
    recommended_pivot: str = Field(
        description="A suggested pivot for the product based on feedback."
    )


class ScoreDimension(BaseModel):
    """A single scoring dimension."""

    name: str
    score: float = Field(..., ge=0, le=10)
    reasoning: str
    confidence: str = "medium"  # low, medium, high


class ValidationScore(BaseModel):
    """Output of the Validation Scoring Agent."""

    overall_score: float = Field(..., ge=0, le=100, description="Composite validation score")
    dimensions: list[ScoreDimension] = Field(
        default_factory=list, description="Individual dimension scores"
    )
    verdict: str = Field(..., description="Go / Pivot / No-go recommendation")
    key_risks: list[str] = Field(default_factory=list, description="Top risks")
    next_steps: list[str] = Field(default_factory=list, description="Recommended next steps")
    summary: str = Field(..., description="Validation summary")


class DashboardVideo(BaseModel):
    """Output of the Hera dashboard video generation."""

    video_id: str = Field("", description="Hera video job ID")
    project_url: str = Field("", description="Hera project URL")
    status: str = Field("pending", description="Video generation status")
    prompt_used: str = Field("", description="Prompt sent to Hera")


class OptimizedQuery(BaseModel):
    """Output of the Query Optimizer Agent."""

    query: str = Field(..., max_length=400, description="Optimized search query, guaranteed under 400 characters")


class VerificationFeedback(BaseModel):
    """Output of the Verification Agent."""

    passed: bool = Field(..., description="Whether the report meets all criteria")
    feedback: list[str] = Field(default_factory=list, description="Specific feedback points if not passed")


# =============================================================================
# Agent Progress Tracking
# =============================================================================


class AgentProgress(BaseModel):
    """Progress of a single agent execution."""

    agent_name: str
    status: AgentStatus = AgentStatus.PENDING
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: str | None = None
    tokens_used: int = 0


# =============================================================================
# Full Report (Final Assembly)
# =============================================================================


class FullReport(BaseModel):
    """The complete validation report — assembled by the Orchestrator."""

    report_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Input
    input: IdeaInput

    # Agent outputs
    refined_idea: RefinedIdea | None = None
    market_research: MarketResearch | None = None
    competitor_analysis: CompetitorAnalysis | None = None
    customer_validation: CustomerValidationReport | None = None
    target_audience: TargetAudienceAnalysis | None = None
    ux_flow: UXFlow | None = None
    ui_spec: UISpec | None = None
    ai_visibility: AIVisibility | None = None
    validation_score: ValidationScore | None = None
    dashboard_video: DashboardVideo | None = None

    # Pipeline metadata
    agent_progress: list[AgentProgress] = Field(default_factory=list)
    total_duration_seconds: float | None = None
    total_tokens_used: int = 0


# =============================================================================
# API Response Wrappers
# =============================================================================


class AnalyzeResponse(BaseModel):
    """Response for POST /api/v1/analyze."""

    success: bool = True
    report: FullReport


class ReportListItem(BaseModel):
    """Summary of a report for listing."""

    report_id: str
    idea_summary: str
    overall_score: float | None = None
    created_at: datetime


class ReportListResponse(BaseModel):
    """Response for GET /api/v1/reports."""

    reports: list[ReportListItem] = Field(default_factory=list)
    total: int = 0


class VideoStatusResponse(BaseModel):
    """Response for GET /api/v1/video/{video_id}."""

    video_id: str
    status: str
    project_url: str = ""
    download_url: str = ""


class HealthResponse(BaseModel):
    """Response for GET /api/v1/health."""

    status: str = "healthy"
    version: str = "0.1.0"
    services: dict[str, bool] = Field(default_factory=dict)
