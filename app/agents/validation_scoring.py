"""Validation Scoring Agent — Composite scoring across all dimensions."""

from __future__ import annotations

from app.agents.base import BaseAgent
from app.models.schemas import (
    CompetitorAnalysis,
    MarketResearch,
    RefinedIdea,
    TargetAudienceAnalysis,
    ValidationScore,
)


class ValidationScoringAgent(BaseAgent):
    """Produces a composite validation score with dimensional breakdown.

    Takes all prior agent outputs and scores the idea on multiple dimensions.
    """

    name = "validation_scoring"
    system_prompt = (
        "You are a product validation expert. Score concepts (startups, existing products, "
        "or new features) objectively across multiple dimensions. Be honest—a 50/100 "
        "is fine if the concept has issues. Provide clear reasoning for each score "
        "and actionable next steps."
    )

    async def run(
        self,
        *,
        refined_idea: RefinedIdea,
        market_research: MarketResearch | None = None,
        competitor_analysis: CompetitorAnalysis | None = None,
        target_audience: TargetAudienceAnalysis | None = None,
    ) -> ValidationScore:
        """Score the startup idea across multiple dimensions."""
        context = (
            f"Idea: {refined_idea.elevator_pitch}\n"
            f"Problem: {refined_idea.problem_statement}\n"
            f"Solution: {refined_idea.solution_hypothesis}\n"
        )
        if market_research:
            context += f"\nMarket: {market_research.summary}\n"
        if competitor_analysis:
            context += f"\nCompetition: {competitor_analysis.summary}\n"
        if target_audience:
            context += f"\nAudience: {target_audience.summary}\n"

        prompt = (
            f"Score this product concept:\n\n{context}\n\n"
            "Score on these dimensions (each 0-10):\n"
            "1. Market Opportunity — size, growth, timing\n"
            "2. Problem Severity — how painful is the problem?\n"
            "3. Solution Fit — does the solution address the problem?\n"
            "4. Competitive Advantage — defensibility, differentiation\n"
            "5. Feasibility — can this be built with available tech?\n"
            "6. Business Model Viability — clear path to revenue\n"
            "7. Team-Market Fit — does this need domain expertise?\n\n"
            "Then provide: overall_score (0-100), verdict (Go/Pivot/No-go), "
            "key_risks (3-5), next_steps (3-5), and summary."
        )

        return await self.generate_structured(prompt, ValidationScore)

    async def run_stream_text(
        self,
        *,
        refined_idea_text: str,
        market_research_text: str | None = None,
        competitor_research_text: str | None = None,
    ):
        """Score the concept based on text context and stream markdown."""
        prompt = (
            "Produce a final Validation Score and Detailed Verdict for the following "
            "product concept in Markdown.\n\n"
            f"## Refined Concept\n{refined_idea_text}\n\n"
        )
        if market_research_text:
            prompt += f"## Market Context\n{market_research_text}\n\n"
        if competitor_research_text:
            prompt += f"## Competitive Context\n{competitor_research_text}\n\n"

        prompt += (
            "Produce a professional Markdown report including:\n"
            "# Final Validation Scorecard\n"
            "## OVERALL VALIDATION SCORE: [Insert Score 0-100 here]\n"
            "## The Verdict: [GO / PIVOT / NO-GO]\n\n"
            "### Dimensional Breakdown (0-10 each):\n"
            "- Market Opportunity: [Score]\n"
            "- Problem Severity: [Score]\n"
            "- Solution Fit: [Score]\n"
            "- Competitive Edge: [Score]\n"
            "- Technical Feasibility: [Score]\n"
            "- Business Viability: [Score]\n\n"
            "## Key Risks & Warning Signs\n"
            "## Critical Next Steps\n"
            "## Executive Summary & Rationale\n"
            "\nIMPORTANT: Do NOT leave scores as 0 unless the concept is truly "
            "non-viable. Be objective but thorough."
        )

        async for chunk in self.stream_text(prompt):
            yield chunk
