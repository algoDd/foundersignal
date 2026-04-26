"""Peec AI Service — AI search visibility analysis."""

from __future__ import annotations

import logging

import httpx
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception

logger = logging.getLogger("foundersignal.services.peec")

PEEC_BASE_URL = "https://api.peec.ai"
_SERVICE_INSTANCE: PeecService | None = None

def is_rate_limit_error(exception):
    return isinstance(exception, httpx.HTTPStatusError) and exception.response.status_code == 429



class PeecService:
    """Client for the Peec AI Customer API.

    Provides AI search visibility data — how a brand/concept appears
    across ChatGPT, Perplexity, Gemini, and other AI search engines.
    """

    def __init__(self, api_key: str) -> None:
        if not api_key:
            msg = "PEEC_API_KEY is required."
            raise ValueError(msg)
        self._api_key = api_key
        self._client = httpx.AsyncClient(
            base_url=PEEC_BASE_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )
        logger.info("Peec AI service initialized")

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(5),
        retry=retry_if_exception(is_rate_limit_error),
        before_sleep=lambda retry_state: logger.warning(
            f"Peec AI Rate Limit hit (reports), retrying in {retry_state.next_action.sleep}s... (Attempt {retry_state.attempt_number})"
        )
    )
    async def get_reports(self) -> dict:
        """Fetch available reports from Peec AI with retries."""
        logger.info("Peec AI: fetching reports")
        response = await self._client.get("/v1/reports")
        response.raise_for_status()
        return response.json()


    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(5),
        retry=retry_if_exception(is_rate_limit_error),
        before_sleep=lambda retry_state: logger.warning(
            f"Peec AI Rate Limit hit (project), retrying in {retry_state.next_action.sleep}s... (Attempt {retry_state.attempt_number})"
        )
    )
    async def get_project_info(self) -> dict:
        """Fetch project information with retries."""
        logger.info("Peec AI: fetching project info")
        response = await self._client.get("/v1/project")
        response.raise_for_status()
        return response.json()


    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(5),
        retry=retry_if_exception(is_rate_limit_error),
        before_sleep=lambda retry_state: logger.warning(
            f"Peec AI Rate Limit hit (company), retrying in {retry_state.next_action.sleep}s... (Attempt {retry_state.attempt_number})"
        )
    )
    async def get_company_visibility(self) -> dict:
        """Fetch company visibility metrics with retries."""
        logger.info("Peec AI: fetching company visibility")
        response = await self._client.get("/v1/company")
        response.raise_for_status()
        return response.json()


    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()


def get_peec_service() -> PeecService | None:
    """Factory — returns PeecService or None if key is missing."""
    global _SERVICE_INSTANCE  # noqa: PLW0603
    from app.config import get_settings

    settings = get_settings()
    if not settings.has_peec:
        logger.info("Peec AI key not set — AI visibility uses Gemini simulation")
        return None
    if _SERVICE_INSTANCE is None:
        _SERVICE_INSTANCE = PeecService(api_key=settings.peec_api_key)
    return _SERVICE_INSTANCE
