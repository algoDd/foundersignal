"""Market Research Agent — Real-time market analysis using Tavily + LLM."""

from __future__ import annotations

from app.agents.base import BaseAgent
from app.models.schemas import MarketResearch, RefinedIdea
from app.services.tavily_service import TavilyService


class MarketResearchAgent(BaseAgent):
    """Researches market size, trends, growth, and opportunities.

    Uses Tavily for real-time web search and the LLM for synthesis.
    """

    name = "market_research"
    system_prompt = (
        "You are a market research analyst specializing in product and business ecosystems. "
        "You have access to real-time search data. Synthesize the data into "
        "actionable insights with specific numbers, trends, and source citations. "
        "Be data-driven—avoid vague claims. Always cite your sources."
    )

    def __init__(self, tavily: TavilyService | None = None, **kwargs) -> None:
        super().__init__(**kwargs)
        self._tavily = tavily

    async def run(self, *, refined_idea: RefinedIdea) -> MarketResearch:
        """Research the market for a refined startup idea.

        Args:
            refined_idea: The structured idea from IdeaRefinementAgent.

        Returns:
            MarketResearch with size, trends, opportunities, risks, and sources.
        """
        search_context = ""
        source_urls: list[str] = []

        if self._tavily:
            # Run targeted searches
            queries = [
                f"{refined_idea.problem_statement} market size TAM 2025 2026",
                f"{refined_idea.target_audience} industry trends growth market opportunity",
            ]
            for query in queries:
                if len(query) > 380:
                    query = query[:380] + "..."

                answer, results = self._tavily.search_and_extract(query, max_results=4)
                search_context += f"\n\n### Search: {query}\nAnswer: {answer}\n"
                for r in results:
                    search_context += f"- [{r.title}]({r.url}): {r.content[:300]}\n"
                    source_urls.append(r.url)

        prompt = (
            "Based on the following product concept and market data, produce a "
            "comprehensive market research report.\n\n"
            f"## Product Concept\n"
            f"Problem: {refined_idea.problem_statement}\n"
            f"Solution: {refined_idea.solution_hypothesis}\n"
            f"Target Audience: {refined_idea.target_audience}\n"
            f"Business Model: {refined_idea.business_model}\n"
        )

        if search_context:
            prompt += f"\n## Real-Time Market Data\n{search_context}\n"

        prompt += (
            "\nProduce a market research report covering:\n"
            "1. Total Addressable Market (TAM) with numbers\n"
            "2. Market growth rate and trajectory\n"
            "3. Key market trends (list 3-5)\n"
            "4. Specific data points with sources\n"
            "5. Market opportunities\n"
            "6. Market risks\n"
            "7. Executive summary\n"
        )

        result = await self.generate_structured(prompt, MarketResearch, max_tokens=4096)
        if source_urls:
            result.sources = list(set(source_urls + result.sources))
        return result

    async def run_stream_text(self, *, refined_idea_text: str, feedback: str | None = None):
        """Research the market based on refined idea text and stream markdown."""
        search_context = ""
        source_urls: list[str] = []

        if self._tavily:
            # We use the text to extract some keywords for search
            # For simplicity, we just search for general market context
            queries = [
                "market size TAM growth trends 2024 2025",
                "market opportunity and risks",
            ]
            # Extract a very brief context for searching
            context_limit = 150
            idea_summary = refined_idea_text[:context_limit]
            for query in queries:
                full_query = f"{idea_summary} {query}"
                if len(full_query) > 380:
                    full_query = full_query[:380] + "..."

                answer, results = self._tavily.search_and_extract(full_query, max_results=5)
                search_context += f"\n\n### Search: {full_query}\nAnswer: {answer}\n"
                current_sources = []
                for r in results:
                    search_context += f"- [{r.title}]({r.url})\n"
                    source_urls.append(r.url)
                    current_sources.append(r.url)

                self.add_search(full_query, len(results), current_sources)

        prompt = (
            "Analyze the following product concept and market data to produce a detailed "
            "Market Research Report in Markdown.\n\n"
            f"## Refined Concept\n{refined_idea_text}\n\n"
        )
        if feedback:
            prompt += f"## Human Feedback To Address\n{feedback}\n\n"
        if search_context:
            prompt += f"## Real-Time Market Data\n{search_context}\n"

        prompt += (
            "\nProduce a professional Markdown report including:\n"
            "# Market Research Report\n"
            "## Market Size & TAM\n"
            "## Trends & Trajectory\n"
            "## Opportunities\n"
            "## Risks\n"
            "## Key Data Points & Sources\n"
            "## Executive Summary\n"
            "\nRules:\n"
            "- Do not use markdown tables.\n"
            "- Use bullets and short labeled lists for metrics and sources.\n"
            "- Every data point should be readable in plain markdown.\n"
            "- If a number is uncertain, say it is an estimate instead of inventing precision.\n"
        )

        async for chunk in self.stream_text(prompt):
            yield chunk
