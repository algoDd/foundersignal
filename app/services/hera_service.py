"""Hera Service — AI motion graphics video generation."""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger("foundersignal.services.hera")

HERA_BASE_URL = "https://api.hera.video/v1"


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
        """Submit a motion graphics video generation job.

        Args:
            prompt: Text prompt describing the video to generate.
            duration_seconds: Video duration (1-60 seconds).
            aspect_ratio: Output aspect ratio.
            resolution: Output resolution.
            fps: Frames per second.
            reference_image_urls: Optional reference images.

        Returns:
            Dict with 'video_id' and 'project_url'.
        """
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

    async def get_video_status(self, video_id: str) -> dict:
        """Check the status of a video generation job.

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
    from app.config import get_settings

    settings = get_settings()
    if not settings.has_hera:
        logger.info("Hera API key not set — video features disabled")
        return None
    return HeraService(api_key=settings.hera_api_key)
