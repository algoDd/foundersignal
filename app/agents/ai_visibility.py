"""AI Visibility Agent — AI search visibility analysis (Peec AI + LLM fallback)."""

from __future__ import annotations

from app.agents.base import BaseAgent
from app.models.schemas import AIVisibility, CompetitorAnalysis, RefinedIdea
from app.services.peec_service import PeecService


class AIVisibilityAgent(BaseAgent):
    """Analyzes AI search visibility using Peec AI or LLM simulation."""

    name = "ai_visibility"
    system_prompt = (
        "You are an AI search visibility expert (Generative Engine Optimization). "
        "Analyze how a product concept (startup, existing product, or new feature) would appear in AI search engines like "
        "ChatGPT, Perplexity, Claude, and Google AI Overviews."
    )

    def __init__(self, peec: PeecService | None = None, **kwargs) -> None:
        super().__init__(**kwargs)
        self._peec = peec

    async def run(
        self,
        *,
        refined_idea: RefinedIdea,
        competitor_analysis: CompetitorAnalysis | None = None,
    ) -> AIVisibility:
        """Analyze AI search visibility for the startup idea."""
        peec_context = ""
        if self._peec:
            try:
                data = await self._peec.get_company_visibility()
                peec_context = f"\n## Peec AI Data\n{data}\n"
            except Exception as e:
                self._logger.warning("Peec AI failed, using LLM: %s", e)

        comp_text = ""
        if competitor_analysis:
            comp_text = "\n".join(
                f"- {c.name}: {c.description[:100]}" for c in competitor_analysis.competitors
            )

        prompt = (
            f"Analyze AI search visibility for:\n"
            f"Problem: {refined_idea.problem_statement}\n"
            f"Solution: {refined_idea.solution_hypothesis}\n"
        )
        if comp_text:
            prompt += f"\nCompetitors:\n{comp_text}\n"
        if peec_context:
            prompt += peec_context
        prompt += (
            "\nProduce: visibility_score (0-100), ai_search_summary, "
            "competitor_visibility (list of dicts with name+estimated_visibility), "
            "recommendations (3-5), and sources_cited."
        )

        return await self.generate_structured(prompt, AIVisibility)

    async def run_stream_text(self, *, refined_idea_text: str, competitor_research_text: str | None = None):
        """Analyze AI search visibility based on text context and stream markdown."""
        peec_context = ""
        if self._peec:
            try:
                data = await self._peec.get_company_visibility()
                peec_context = f"\n## Peec AI Real-Time Data\n{data}\n"
            except Exception as e:
                self._logger.warning("Peec AI failed: %s", e)

        prompt = (
            "Analyze AI search visibility and Generative Engine Optimization (GEO) for the following product concept in Markdown.\n\n"
            f"## Refined Concept\n{refined_idea_text}\n\n"
        )
        if competitor_research_text:
            prompt += f"## Competitive Context\n{competitor_research_text}\n\n"
        if peec_context:
            prompt += peec_context

        prompt += (
            "Produce a professional Markdown report including:\n"
            "# AI Search Visibility Analysis (GEO)\n"
            "## Visibility Score (0-100)\n"
            "## How AI Models (ChatGPT, Claude, etc.) Describe This Concept\n"
            "## Competitive Visibility Landscape\n"
            "## SEO vs. GEO Optimization Recommendations\n"
            "## Executive Summary\n"
        )

        async for chunk in self.stream_text(prompt):
            yield chunk
