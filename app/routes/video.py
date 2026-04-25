"""Video route — Check Hera video generation status."""

import logging

from fastapi import APIRouter, HTTPException

from app.models.schemas import VideoStatusResponse
from app.services.hera_service import get_hera_service

router = APIRouter()
logger = logging.getLogger("foundersignal.routes.video")


@router.get("/video/{video_id}", response_model=VideoStatusResponse)
async def get_video_status(video_id: str) -> VideoStatusResponse:
    """Check the status of a Hera dashboard video generation job.

    Args:
        video_id: The Hera video job ID.
    """
    hera = get_hera_service()
    if not hera:
        raise HTTPException(
            status_code=503,
            detail="Hera video service not configured",
        )

    try:
        status = await hera.get_video_status(video_id)
        return VideoStatusResponse(
            video_id=video_id,
            status=status.get("status", "unknown"),
            project_url=status.get("project_url", ""),
            download_url=status.get("download_url", ""),
        )
    except Exception as e:
        logger.error("Failed to check video status: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check video status: {e}",
        ) from e
