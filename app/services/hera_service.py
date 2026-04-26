"""Hera Service — AI motion graphics video generation."""

from __future__ import annotations

import logging

import httpx
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception

logger = logging.getLogger("foundersignal.services.hera")

HERA_BASE_URL = "https://api.hera.video/v1"
_SERVICE_INSTANCE: HeraService | None = None


def is_rate_limit_error(exception):
    return isinstance(exception, httpx.HTTPStatusError) and exception.response.status_code == 429

class HeraService:
    """Client for the Hera Video API (motion graphics generation)."""

    def __init__(self, api_key: str) -> None:
        if not api_key:
            msg = "HERA_API_KEY is required."
            raise ValueError(msg)
        self._api_key = api_key
        self._client = httpx.AsyncClient(
            base_url=HERA_BASE_URL,
            headers={
                "x-api-key": api_key,
                "Content-Type": "application/json",
            },
            timeout=60.0,
        )
        logger.info("Hera service initialized")

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(5),
        retry=retry_if_exception(is_rate_limit_error),
        before_sleep=lambda retry_state: logger.warning(
            f"Hera Rate Limit hit (create), retrying in {retry_state.next_action.sleep}s... (Attempt {retry_state.attempt_number})"
        ),
    )
    async def create_video(
        self,
        prompt: str,
        *,
        duration_seconds: int = 8,
        aspect_ratio: str = "16:9",
        resolution: str = "1080p",
        fps: str = "30",
        reference_image_urls: list[str] | None = None,
    ) -> dict:
        """Submit a video generation job with retries."""
        payload: dict = {
            "prompt": prompt,
            "outputs": [
                {
                    "format": "mp4",
                    "aspect_ratio": aspect_ratio,
                    "fps": fps,
                    "resolution": resolution,
                }
            ],
            "duration_seconds": duration_seconds,
        }
        if reference_image_urls:
            payload["reference_image_urls"] = reference_image_urls[:5]

        logger.info("Hera create video: %s", prompt[:80])
        response = await self._client.post("/videos", json=payload)
        response.raise_for_status()
        return response.json()

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(5),
        retry=retry_if_exception(is_rate_limit_error),
        before_sleep=lambda retry_state: logger.warning(
            f"Hera Rate Limit hit (status), retrying in {retry_state.next_action.sleep}s... (Attempt {retry_state.attempt_number})"
        ),
    )
    async def get_video_status(self, video_id: str) -> dict:
        """Check the status of a video generation job with retries.

        Args:
            video_id: The video job ID returned from create_video.

        Returns:
            Dict with status information.
        """

        logger.info("Hera status check: %s", video_id)
        response = await self._client.get(f"/videos/{video_id}")
        response.raise_for_status()
        return response.json()

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()


def get_hera_service() -> HeraService | None:
    """Factory — returns HeraService or None if key is missing."""
    global _SERVICE_INSTANCE  # noqa: PLW0603
    from app.config import get_settings

    settings = get_settings()
    if not settings.has_hera:
        logger.info("Hera API key not set — video features disabled")
        return None
    if _SERVICE_INSTANCE is None:
        _SERVICE_INSTANCE = HeraService(api_key=settings.hera_api_key)
    return _SERVICE_INSTANCE
