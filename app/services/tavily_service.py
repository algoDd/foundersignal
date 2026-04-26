"""Tavily Service — Real-time web search for market & competitor research."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from hashlib import sha256
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception
import httpx

logger = logging.getLogger("foundersignal.services.tavily")

_SEARCH_CACHE: dict[str, dict] = {}
_EXTRACT_CACHE: dict[str, list[dict]] = {}
_SERVICE_INSTANCE: TavilyService | None = None

from tavily import TavilyClient

def is_rate_limit_error(exception):

    return isinstance(exception, httpx.HTTPStatusError) and exception.response.status_code == 429



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

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(5),
        retry=retry_if_exception(lambda e: "429" in str(e) or "limit" in str(e).lower()),
        before_sleep=lambda retry_state: logger.warning(
            f"Tavily Rate Limit hit (search), retrying in {retry_state.next_action.sleep}s... (Attempt {retry_state.attempt_number})"
        )
    )
    def search(
        self,
        query: str,
        *,
        search_depth: str = "advanced",
        max_results: int = 10,
        include_answer: bool = True,
    ) -> dict:
        """Run a search query and return raw results with retries."""
        cache_key = self._cache_key("search", query, search_depth, str(max_results), str(include_answer))
        cached = _SEARCH_CACHE.get(cache_key)
        if cached is not None:
            logger.info("Tavily cache hit: %s", query[:80])
            return cached

        logger.info("Tavily search: %s", query[:80])
        response = self._client.search(
            query,
            search_depth=search_depth,
            max_results=max_results,
            include_answer=include_answer,
        )
        _SEARCH_CACHE[cache_key] = response
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
        cache_key = self._cache_key("extract", *sorted(urls))
        cached = _EXTRACT_CACHE.get(cache_key)
        if cached is not None:
            logger.info("Tavily extract cache hit: %d URLs", len(urls))
            return cached

        logger.info("Tavily extract: %d URLs", len(urls))
        response = self._client.extract(urls=urls)
        results = response.get("results", [])
        _EXTRACT_CACHE[cache_key] = results
        return results

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(5),
        retry=retry_if_exception(is_rate_limit_error),
        before_sleep=lambda retry_state: logger.warning(
            f"Tavily Rate Limit hit (usage), retrying in {retry_state.next_action.sleep}s... (Attempt {retry_state.attempt_number})"
        )
    )
    def get_usage(self) -> dict:
        """Fetch current API usage and credits with retries."""
        response = httpx.get(
            "https://api.tavily.com/usage",
            headers={"Authorization": f"Bearer {self._client.api_key}"},
            timeout=10.0,
        )
        response.raise_for_status()
        return response.json()

    def _cache_key(self, prefix: str, *parts: str) -> str:
        normalized = "|".join(part.strip().lower() for part in parts)
        return f"{prefix}:{sha256(normalized.encode('utf-8')).hexdigest()}"



def get_tavily_service() -> TavilyService | None:
    """Factory — returns TavilyService or None if key is missing."""
    global _SERVICE_INSTANCE  # noqa: PLW0603
    from app.config import get_settings

    settings = get_settings()
    if not settings.tavily_api_key:
        logger.warning("Tavily API key not set — search features disabled")
        return None
    if _SERVICE_INSTANCE is None:
        _SERVICE_INSTANCE = TavilyService(api_key=settings.tavily_api_key)
    return _SERVICE_INSTANCE
