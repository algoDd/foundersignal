"""Query Optimizer Agent — Intelligently shortens search queries."""

from __future__ import annotations

from app.agents.base import BaseAgent
from app.models.schemas import OptimizedQuery


class QueryOptimizerAgent(BaseAgent):
    """Shortens and optimizes long search queries.

    Tavily has a 400 character limit on search queries. This agent takes
    a long query and paraphrases it into the most impactful search terms.
    """

    name = "query_optimizer"
    system_prompt = (
        "You are an expert search query optimizer. "
        "Your task is to take a long, complex search query and paraphrase it into "
        "a highly effective, concise search query that is STRICTLY UNDER 400 characters. "
        "Focus on the most important keywords, entities, and intent."
    )

    async def run(self, *, query: str) -> OptimizedQuery:
        """Optimize a long search query.

        Args:
            query: The original long search query.

        Returns:
            An OptimizedQuery object containing the shortened query.
        """
        prompt = (
            "Optimize this search query to be under 400 characters while preserving "
            "its core meaning and intent for a search engine.\n\n"
            f"Original Query:\n{query}\n\n"
            "Produce the optimized query."
        )

        return await self.generate_structured(prompt, OptimizedQuery)
