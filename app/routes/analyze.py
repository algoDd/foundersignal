"""Analyze route — Main endpoint for startup idea validation."""

import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.agents.orchestrator import OrchestratorAgent
from app.models.schemas import AnalyzeResponse, IdeaInput
from app.services.hera_service import get_hera_service
from app.services.peec_service import get_peec_service
from app.services.tavily_service import get_tavily_service

router = APIRouter()
logger = logging.getLogger("foundersignal.routes.analyze")


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_idea(idea_input: IdeaInput) -> AnalyzeResponse:
    """Analyze a startup idea through the full agent pipeline.

    This endpoint runs the complete validation pipeline:
    1. Idea Refinement
    2. Market Research (Tavily) + Competitor Research + Target Audience (parallel)
    3. UX Flow Design
    4. UI Spec Generation
    5. AI Visibility Analysis (Peec AI) + Validation Scoring (parallel)
    6. Dashboard Video (Hera) — async
    7. Knowledge Base Storage (Qontext) — async

    The response includes all agent outputs and a composite validation score.
    """
    logger.info("Analyzing idea: %s", idea_input.idea[:100])

    try:
        # Initialize services (graceful fallback if keys missing)
        tavily = get_tavily_service()
        hera = get_hera_service()
        peec = get_peec_service()

        # Run the orchestrator pipeline
        orchestrator = OrchestratorAgent(
            tavily=tavily,
            hera=hera,
            peec=peec,
        )
        report = await orchestrator.run(idea_input)

        return AnalyzeResponse(success=True, report=report)

    except ValueError as e:
        logger.error("Configuration error: %s", e)
        raise HTTPException(
            status_code=500,
            detail=f"Service configuration error: {e}",
        ) from e
    except Exception as e:
        logger.error("Analysis failed: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Analysis pipeline failed: {e}",
        ) from e


@router.post("/analyze/stream")
async def analyze_idea_stream(idea_input: IdeaInput):
    """Stream the startup idea analysis results."""
    logger.info("Streaming analysis for idea: %s", idea_input.idea[:100])

    try:
        tavily = get_tavily_service()
        hera = get_hera_service()
        peec = get_peec_service()

        orchestrator = OrchestratorAgent(
            tavily=tavily,
            hera=hera,
            peec=peec,
        )

        async def event_generator():
            try:
                async for report in orchestrator.run_stream(idea_input):
                    # Yield as SSE data
                    data = json.dumps(report.model_dump(mode="json"))
                    yield f"data: {data}\n\n"
            except Exception as e:
                logger.error("Stream error: %s", e, exc_info=True)
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return StreamingResponse(event_generator(), media_type="text/event-stream")

    except Exception as e:
        logger.error("Streaming setup failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
