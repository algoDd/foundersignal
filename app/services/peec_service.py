"""Peec AI Service — AI search visibility analysis."""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger("foundersignal.services.peec")

PEEC_BASE_URL = "https://api.peec.ai"


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

    async def get_reports(self) -> dict:
        """Fetch available reports from Peec AI.

        Returns:
            Dict with report data.
        """
        logger.info("Peec AI: fetching reports")
        response = await self._client.get("/v1/reports")
        response.raise_for_status()
        return response.json()

    async def get_project_info(self) -> dict:
        """Fetch project information.

        Returns:
            Dict with project data.
        """
        logger.info("Peec AI: fetching project info")
        response = await self._client.get("/v1/project")
        response.raise_for_status()
        return response.json()

    async def get_company_visibility(self) -> dict:
        """Fetch company visibility metrics.

        Returns:
            Dict with visibility, sentiment, position data.
        """
        logger.info("Peec AI: fetching company visibility")
        response = await self._client.get("/v1/company")
        response.raise_for_status()
        return response.json()

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()


def get_peec_service() -> PeecService | None:
    """Factory — returns PeecService or None if key is missing."""
    from app.config import get_settings

    settings = get_settings()
    if not settings.has_peec:
        logger.info("Peec AI key not set — AI visibility uses Gemini simulation")
        return None
    return PeecService(api_key=settings.peec_api_key)
