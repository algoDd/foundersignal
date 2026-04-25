"""Health check route."""

from fastapi import APIRouter

from app.config import get_settings
from app.models.schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Check API health and service availability."""
    settings = get_settings()
    return HealthResponse(
        status="healthy",
        version="0.1.0",
        services={
            "gemini": bool(settings.gemini_api_key),
            "tavily": bool(settings.tavily_api_key),
            "hera": settings.has_hera,
            "peec": settings.has_peec,
        },
    )
