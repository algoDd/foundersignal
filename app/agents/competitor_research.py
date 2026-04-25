"""Competitor Research Agent — Identifies and analyzes competitors using Tavily + LLM."""

from __future__ import annotations

from app.agents.base import BaseAgent
from app.models.schemas import CompetitorAnalysis, RefinedIdea
from app.services.tavily_service import TavilyService


class CompetitorResearchAgent(BaseAgent):
    """Finds competitors and analyzes their strengths, weaknesses, and positioning.

    Uses Tavily for real-time competitor discovery and the LLM for analysis.
    """

    name = "competitor_research"
    system_prompt = (
        "You are a competitive intelligence analyst. Your job is to identify "
        "direct and indirect competitors for a product concept "
        "(startup, existing product, or new feature), "
        "analyze their strengths and weaknesses, and find positioning gaps. "
        "Be thorough—include both well-known players and emerging startups. "
        "Always provide specific details about features, pricing, and positioning."
    )

    def __init__(self, tavily: TavilyService | None = None, **kwargs) -> None:
        super().__init__(**kwargs)
        self._tavily = tavily

    async def run(self, *, refined_idea: RefinedIdea) -> CompetitorAnalysis:
        """Research competitors for a refined startup idea.

        Args:
            refined_idea: The structured idea from IdeaRefinementAgent.

        Returns:
            CompetitorAnalysis with competitor profiles, gaps, and differentiation.
        """
        search_context = ""
        source_urls: list[str] = []

        if self._tavily:
            queries = [
                f"competitors alternatives to {refined_idea.solution_hypothesis}",
                f"best {refined_idea.target_audience} tools products startups",
                f"{refined_idea.problem_statement} existing solutions companies",
            ]
            for query in queries:
                if len(query) > 380:
                    query = query[:380] + "..."

                answer, results = self._tavily.search_and_extract(query, max_results=5)
                search_context += f"\n\n### Search: {query}\nAnswer: {answer}\n"
                for r in results:
                    search_context += f"- [{r.title}]({r.url}): {r.content[:300]}\n"
                    source_urls.append(r.url)

        prompt = (
            "Based on the following product concept and competitive data, "
            "produce a competitor analysis.\n\n"
            f"## Product Concept\n"
            f"Problem: {refined_idea.problem_statement}\n"
            f"Solution: {refined_idea.solution_hypothesis}\n"
            f"Target Audience: {refined_idea.target_audience}\n"
            f"Value Proposition: {refined_idea.value_proposition}\n"
        )

        if search_context:
            prompt += f"\n## Competitive Intelligence Data\n{search_context}\n"

        prompt += (
            "\nProduce a competitor analysis covering:\n"
            "1. List of 4-8 competitors (name, website, description, strengths, "
            "   weaknesses, pricing, target audience, key features)\n"
            "2. Overview of the competitive landscape\n"
            "3. Positioning gaps where our product can win\n"
            "4. Differentiation opportunities\n"
            "5. Executive summary\n"
        )

        result = await self.generate_structured(prompt, CompetitorAnalysis)
        if source_urls:
            result.sources = list(set(source_urls + result.sources))
        return result

    async def run_stream_text(self, *, refined_idea_text: str):
        """Research competitors based on refined idea text and stream markdown."""
        search_context = ""
        source_urls: list[str] = []

        if self._tavily:
            # General competitor search
            # Extract a very brief context for searching
            context_limit = 150
            idea_summary = refined_idea_text[:context_limit]
            queries = [
                f"top direct and indirect competitors for {idea_summary}",
                "competitors alternatives and market landscape",
            ]
            for query in queries:
                if len(query) > 380:
                    query = query[:380] + "..."

                answer, results = self._tavily.search_and_extract(query, max_results=5)
                search_context += f"\n\n### Search: {query}\nAnswer: {answer}\n"
                current_sources = []
                for r in results:
                    search_context += f"- [{r.title}]({r.url})\n"
                    source_urls.append(r.url)
                    current_sources.append(r.url)

                self.add_search(query, len(results), current_sources)

        prompt = (
            "Analyze the following product concept and competitive data to produce a detailed "
            "Competitor Analysis Report in Markdown.\n\n"
            f"## Refined Concept\n{refined_idea_text}\n\n"
        )
        if search_context:
            prompt += f"## Competitive Intelligence Data\n{search_context}\n"

        prompt += (
            "\nProduce a professional Markdown report including:\n"
            "# Competitor Analysis Report\n"
            "## Competitive Landscape Overview\n"
            "## Key Competitors (Name, Description, Strengths, Weaknesses)\n"
            "## Positioning Gaps\n"
            "## Differentiation Opportunities\n"
            "## Executive Summary\n"
        )

        async for chunk in self.stream_text(prompt):
            yield chunk
