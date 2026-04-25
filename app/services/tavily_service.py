"""Tavily Service — Real-time web search for market & competitor research."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from tavily import TavilyClient

logger = logging.getLogger("foundersignal.services.tavily")


@dataclass
class SearchResult:
    """A single search result from Tavily."""

    title: str
    url: str
    content: str
    score: float


class TavilyService:
    """Wrapper around the Tavily search API."""

    def __init__(self, api_key: str) -> None:
        if not api_key:
            msg = "TAVILY_API_KEY is required. Get one from https://app.tavily.com/"
            raise ValueError(msg)
        self._client = TavilyClient(api_key=api_key)
        logger.info("Tavily service initialized")

    def search(
        self,
        query: str,
        *,
        search_depth: str = "advanced",
        max_results: int = 10,
        include_answer: bool = True,
    ) -> dict:
        """Run a search query and return raw results.

        Args:
            query: Search query string.
            search_depth: "basic" or "advanced" (more thorough).
            max_results: Maximum number of results to return.
            include_answer: Whether to include a synthesized answer.

        Returns:
            Raw Tavily response dict with 'results', 'answer', etc.
        """
        logger.info("Tavily search: %s", query[:80])
        response = self._client.search(
            query,
            search_depth=search_depth,
            max_results=max_results,
            include_answer=include_answer,
        )
        return response

    def search_and_extract(
        self,
        query: str,
        *,
        max_results: int = 8,
    ) -> tuple[str, list[SearchResult]]:
        """Search and return a clean answer + structured results.

        Returns:
            Tuple of (answer_text, list_of_SearchResult).
        """
        response = self.search(query, max_results=max_results, include_answer=True)

        answer = response.get("answer", "")
        results = []
        for r in response.get("results", []):
            results.append(
                SearchResult(
                    title=r.get("title", ""),
                    url=r.get("url", ""),
                    content=r.get("content", ""),
                    score=r.get("score", 0.0),
                )
            )
        return answer, results

    def extract_urls(self, urls: list[str]) -> list[dict]:
        """Extract clean content from specific URLs."""
        logger.info("Tavily extract: %d URLs", len(urls))
        response = self._client.extract(urls=urls)
        return response.get("results", [])

    def get_usage(self) -> dict:
        """Fetch current API usage and credits."""
        import httpx
        try:
            response = httpx.get(
                "https://api.tavily.com/usage",
                headers={"Authorization": f"Bearer {self._client.api_key}"},
                timeout=10.0
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.warning("Failed to fetch Tavily usage: %s", e)
            return {"error": str(e)}


def get_tavily_service() -> TavilyService | None:
    """Factory — returns TavilyService or None if key is missing."""
    from app.config import get_settings

    settings = get_settings()
    if not settings.tavily_api_key:
        logger.warning("Tavily API key not set — search features disabled")
        return None
    return TavilyService(api_key=settings.tavily_api_key)
