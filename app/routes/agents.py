"""Agents route — Individual agent endpoints for frontend-driven orchestration."""

import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.agents.ai_visibility import AIVisibilityAgent
from app.agents.competitor_research import CompetitorResearchAgent
from app.agents.idea_refinement import IdeaRefinementAgent
from app.agents.market_research import MarketResearchAgent
from app.agents.customer_validation_agent import CustomerValidationAgent
from app.agents.ui_spec import UISpecAgent
from app.agents.ux_flow import UXFlowAgent
from app.agents.validation_scoring import ValidationScoringAgent
from app.models.schemas import IdeaInput
from app.services.hera_service import get_hera_service
from app.services.peec_service import get_peec_service
from app.services.tavily_service import get_tavily_service
from app.services.storage import get_storage

router = APIRouter()
logger = logging.getLogger("foundersignal.routes.agents")


@router.post("/tts")
async def text_to_speech(request: Request):
    """Stream TTS audio for an interview response via Gradium."""
    from app.config import get_settings
    from app.services.tts_service import stream_tts, voice_for_archetype

    body = await request.json()
    text = body.get("text", "")
    archetype = body.get("archetype", "")
    gender = body.get("gender", "")
    voice_id = body.get("voice_id") or voice_for_archetype(archetype, gender)

    if not text.strip():
        return {"error": "No text provided"}

    settings = get_settings()
    if not settings.gradium_api_key:
        return {"error": "GRADIUM_API_KEY not configured"}

    async def audio_generator():
        try:
            async for chunk in stream_tts(settings.gradium_api_key, voice_id, text):
                yield chunk
        except Exception as e:
            logger.error("TTS stream error: %s", e, exc_info=True)

    from fastapi.responses import StreamingResponse as _SR
    return _SR(audio_generator(), media_type="audio/wav")


async def agent_stream_generator(agent, method_name, **kwargs):
    """Generic generator for agent streaming."""
    try:
        method = getattr(agent, method_name)
        async for chunk in method(**kwargs):
            # Send as SSE chunk
            data = {
                "chunk": chunk,
                "tokens": agent.tokens_used,
                "searches": agent.searches,
            }
            yield f"data: {json.dumps(data)}\n\n"

        # Send final completion event with total tokens and all searches
        final_data = {
            "done": True,
            "tokens": agent.tokens_used,
            "searches": agent.searches,
        }
        yield f"data: {json.dumps(final_data)}\n\n"
    except Exception as e:
        logger.error(f"Agent {agent.name} error: {e}", exc_info=True)
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


@router.post("/refine")
async def refine_idea(idea_input: IdeaInput):
    """Refine a raw idea."""
    agent = IdeaRefinementAgent()
    return StreamingResponse(
        agent_stream_generator(agent, "run_stream", idea_input=idea_input),
        media_type="text/event-stream",
    )


@router.post("/market")
async def market_research(request: Request):
    """Run market research based on refined idea text."""
    body = await request.json()
    refined_idea_text = body.get("refined_idea", "")
    tavily = get_tavily_service()
    agent = MarketResearchAgent(tavily=tavily)
    return StreamingResponse(
        agent_stream_generator(agent, "run_stream_text", refined_idea_text=refined_idea_text),
        media_type="text/event-stream",
    )


@router.post("/competitors")
async def competitor_research(request: Request):
    """Run competitor research."""
    body = await request.json()
    refined_idea_text = body.get("refined_idea", "")
    tavily = get_tavily_service()
    agent = CompetitorResearchAgent(tavily=tavily)
    return StreamingResponse(
        agent_stream_generator(agent, "run_stream_text", refined_idea_text=refined_idea_text),
        media_type="text/event-stream",
    )


@router.post("/ux")
async def ux_flow(request: Request):
    """Run UX flow design."""
    body = await request.json()
    refined_idea_text = body.get("refined_idea", "")
    market_research_text = body.get("market_research", "")
    agent = UXFlowAgent()
    return StreamingResponse(
        agent_stream_generator(
            agent,
            "run_stream_text",
            refined_idea_text=refined_idea_text,
            market_research_text=market_research_text,
        ),
        media_type="text/event-stream",
    )


@router.post("/ui")
async def ui_spec(request: Request):
    """Run UI specification generation."""
    body = await request.json()
    refined_idea_text = body.get("refined_idea", "")
    ux_flow_text = body.get("ux_flow", "")
    agent = UISpecAgent()
    return StreamingResponse(
        agent_stream_generator(
            agent,
            "run_stream_text",
            refined_idea_text=refined_idea_text,
            ux_flow_text=ux_flow_text,
        ),
        media_type="text/event-stream",
    )


@router.post("/visibility")
async def ai_visibility(request: Request):
    """Run AI visibility analysis."""
    body = await request.json()
    refined_idea_text = body.get("refined_idea", "")
    competitor_research_text = body.get("competitor_research", "")
    peec = get_peec_service()
    agent = AIVisibilityAgent(peec=peec)
    return StreamingResponse(
        agent_stream_generator(
            agent,
            "run_stream_text",
            refined_idea_text=refined_idea_text,
            competitor_research_text=competitor_research_text,
        ),
        media_type="text/event-stream",
    )


@router.post("/scoring")
async def validation_scoring(request: Request):
    """Run validation scoring."""
    body = await request.json()
    refined_idea_text = body.get("refined_idea", "")
    market_research_text = body.get("market_research", "")
    competitor_research_text = body.get("competitor_research", "")
    agent = ValidationScoringAgent()
    return StreamingResponse(
        agent_stream_generator(
            agent,
            "run_stream_text",
            refined_idea_text=refined_idea_text,
            market_research_text=market_research_text,
            competitor_research_text=competitor_research_text,
        ),
        media_type="text/event-stream",
    )


@router.post("/verify")
async def verify_report(request: Request):
    """Run verification review on the full report."""
    body = await request.json()
    full_report_markdown = body.get("full_report", "")
    from app.agents.verification import VerificationAgent

    agent = VerificationAgent()
    return StreamingResponse(
        agent_stream_generator(agent, "run_stream_text", full_report_markdown=full_report_markdown),
        media_type="text/event-stream",
    )


@router.get("/usage")
async def get_usage():
    """Fetch usage and credits for all services."""
    tavily = get_tavily_service()
    hera = get_hera_service()
    peec = get_peec_service()

    usage = {
        "tavily": tavily.get_usage() if tavily else {"error": "Not configured"},
        "hera": {"status": "Active"} if hera else {"status": "Disabled"},
        "peec": {"status": "Active"} if peec else {"status": "Disabled"},
        "gemini": "Active",
    }
    return usage
async def interview_stream_generator(agent, **kwargs):
    """Custom generator for interview simulation to preserve flat structure."""
    try:
        async for payload in agent.run_stream_interviews(**kwargs):
            # Payload is {"user": ..., "chunk": ..., "is_complete": ...}
            payload["tokens"] = agent.tokens_used
            payload["searches"] = agent.searches
            yield f"data: {json.dumps(payload)}\n\n"
        
        # Final completion event
        yield f"data: {json.dumps({'done': True, 'tokens': agent.tokens_used})}\n\n"
    except Exception as e:
        logger.error(f"Interview agent error: {e}", exc_info=True)
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


@router.post("/interviews")
async def customer_interviews(request: Request):
    """Run live customer interview simulation with full research context."""
    body = await request.json()
    refined_idea_text = body.get("refined_idea", "")
    market_research_text = body.get("market_research", "")
    competitor_analysis_text = body.get("competitors", "")
    ux_flow_text = body.get("ux", "")
    ui_spec_text = body.get("ui", "")
    visibility_text = body.get("visibility", "")
    scoring_text = body.get("scoring", "")
    
    from app.models.schemas import RefinedIdea
    # Reconstruct a basic RefinedIdea for the agent to use as a primary reference
    mock_idea = RefinedIdea(
        problem_statement=refined_idea_text[:1000],
        solution_hypothesis=refined_idea_text,
        value_proposition="Extracted from concept analysis",
        target_audience="Specified target group",
        business_model="Specified business model",
        key_assumptions=["Implicit in the provided research dossier"],
        elevator_pitch=refined_idea_text[:500]
    )
    
    agent = CustomerValidationAgent()
    return StreamingResponse(
        interview_stream_generator(
            agent,
            refined_idea=mock_idea,
            market_research_text=market_research_text,
            competitor_analysis_text=competitor_analysis_text,
            ux_flow_text=ux_flow_text,
            ui_spec_text=ui_spec_text,
            visibility_text=visibility_text,
            scoring_text=scoring_text
        ),
        media_type="text/event-stream",
    )
@router.get("/sessions")
async def list_sessions():
    """List all saved sessions."""
    return get_storage().list_sessions()


@router.get("/sessions/{session_id}")
async def load_session(session_id: str):
    """Load a specific session."""
    session = get_storage().load_session(session_id)
    if not session:
        return {"error": "Session not found"}, 404
    return session


@router.post("/sessions/save")
async def save_session(request: Request):
    """Save or update a session."""
    from app.models.schemas import FullReport
    data = await request.json()
    report = FullReport.model_validate(data)
    get_storage().save_session(report)
    return {"success": True, "id": report.report_id}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    success = get_storage().delete_session(session_id)
    return {"success": success}
