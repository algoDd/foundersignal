"""FounderSignal — FastAPI application entry point."""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routes import agents, analyze, health, video

logger = logging.getLogger("foundersignal")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan — startup and shutdown events."""
    settings = get_settings()
    logging.basicConfig(level=settings.log_level.upper())
    logger.info("FounderSignal starting up — LLM provider: %s", settings.llm_provider)
    logger.info("Tavily: %s", "✅" if settings.tavily_api_key else "❌ missing")
    logger.info("Hera: %s", "✅" if settings.has_hera else "⏭ skipped")
    logger.info("Peec AI: %s", "✅" if settings.has_peec else "⏭ skipped")
    yield
    logger.info("FounderSignal shutting down.")


app = FastAPI(
    title="FounderSignal API",
    description=(
        "AI-powered startup idea validation platform. "
        "Multi-agent system that generates market research, competitor analysis, "
        "UX flows, UI specs, AI search visibility, and validation scoring."
    ),
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS — allow Vite frontend and any dev origins
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
app.include_router(health.router, prefix="/api/v1", tags=["Health"])
app.include_router(analyze.router, prefix="/api/v1", tags=["Analysis"])
app.include_router(video.router, prefix="/api/v1", tags=["Video"])
app.include_router(agents.router, prefix="/api/v1/agents", tags=["Agents"])
