"""Agents route — Individual agent endpoints for frontend-driven orchestration."""

import json
import logging
import re

from fastapi import APIRouter, HTTPException, Request
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
from app.services.persistence import persistence

router = APIRouter()
logger = logging.getLogger("foundersignal.routes.agents")


def _extract_markdown_section(markdown: str, heading: str) -> str:
    escaped_heading = re.escape(heading)
    pattern = re.compile(rf"## {escaped_heading}[\s\S]*?(?=\n## |\Z)", re.IGNORECASE)
    match = pattern.search(markdown)
    if not match:
        return ""
    return re.sub(rf"^## {escaped_heading}\n?", "", match.group(0), flags=re.IGNORECASE).strip()


def _extract_bullets(markdown: str, heading: str, limit: int = 4) -> list[str]:
    section = _extract_markdown_section(markdown, heading)
    bullets = [
        line.strip()[2:].strip()
        for line in section.splitlines()
        if line.strip().startswith("- ")
    ]
    if bullets:
        return bullets[:limit]
    fallback = [
        line.strip()
        for line in section.splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    return fallback[:limit]


def _build_refined_idea_model(refined_idea_text: str):
    from app.models.schemas import RefinedIdea

    problem_statement = _extract_markdown_section(refined_idea_text, "Problem")
    solution_hypothesis = _extract_markdown_section(refined_idea_text, "Solution")
    value_proposition = _extract_markdown_section(refined_idea_text, "Why It Wins")
    target_audience = _extract_markdown_section(refined_idea_text, "Best Early User")
    business_model = _extract_markdown_section(refined_idea_text, "Business Model")
    elevator_pitch = _extract_markdown_section(refined_idea_text, "Draft Pitch")
    assumptions = _extract_bullets(refined_idea_text, "Assumptions To Prove", limit=5)

    return RefinedIdea(
        problem_statement=problem_statement or refined_idea_text[:800],
        solution_hypothesis=solution_hypothesis or refined_idea_text[:1200],
        value_proposition=value_proposition or solution_hypothesis or "Clarify the strongest value proposition.",
        target_audience=target_audience or "Primary early adopter still being refined.",
        business_model=business_model or "Business model still being refined.",
        key_assumptions=assumptions or ["Validate willingness to adopt the proposed solution."],
        elevator_pitch=elevator_pitch or refined_idea_text[:500],
    )


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


@router.post("/refine")
async def refine_idea(request: Request):
    """Refine a raw idea, optionally using checkpoint feedback."""
    body = await request.json()
    feedback = body.get("feedback")

    try:
        idea_input = IdeaInput.model_validate(
            {
                "idea": body.get("idea", ""),
                "target_region": body.get("target_region"),
                "industry": body.get("industry"),
                "target_audience": body.get("target_audience"),
                "business_model": body.get("business_model"),
            }
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Invalid idea refinement payload") from exc

    agent = IdeaRefinementAgent()
    return StreamingResponse(
        agent_stream_generator(agent, "run_stream", idea_input=idea_input, feedback=feedback),
        media_type="text/event-stream",
    )


@router.post("/market")
async def market_research(request: Request):
    """Run market research based on refined idea text."""
    body = await request.json()
    refined_idea_text = body.get("refined_idea", "")
    feedback = body.get("feedback")
    tavily = get_tavily_service()
    agent = MarketResearchAgent(tavily=tavily)
    return StreamingResponse(
        agent_stream_generator(agent, "run_stream_text", refined_idea_text=refined_idea_text, feedback=feedback),
        media_type="text/event-stream",
    )


@router.post("/competitors")
async def competitor_research(request: Request):
    """Run competitor research."""
    body = await request.json()
    refined_idea_text = body.get("refined_idea", "")
    feedback = body.get("feedback")
    tavily = get_tavily_service()
    agent = CompetitorResearchAgent(tavily=tavily)
    return StreamingResponse(
        agent_stream_generator(agent, "run_stream_text", refined_idea_text=refined_idea_text, feedback=feedback),
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


async def follow_up_stream_generator(agent, **kwargs):
    """Stream persona follow-up answers as SSE."""
    try:
        async for payload in agent.run_follow_up_question(**kwargs):
            payload["tokens"] = agent.tokens_used
            payload["searches"] = agent.searches
            yield f"data: {json.dumps(payload)}\n\n"

        yield f"data: {json.dumps({'done': True, 'tokens': agent.tokens_used})}\n\n"
    except Exception as e:
        logger.error("Interview follow-up error: %s", e, exc_info=True)
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
    refined_idea = _build_refined_idea_model(refined_idea_text)

    agent = CustomerValidationAgent()
    return StreamingResponse(
        interview_stream_generator(
            agent,
            refined_idea=refined_idea,
            market_research_text=market_research_text,
            competitor_analysis_text=competitor_analysis_text,
            ux_flow_text=ux_flow_text,
            ui_spec_text=ui_spec_text,
            visibility_text=visibility_text,
            scoring_text=scoring_text,
        ),
        media_type="text/event-stream",
    )


@router.post("/interviews/follow-up")
async def customer_interview_follow_up(request: Request):
    """Ask a follow-up question to a previously generated synthetic user."""
    body = await request.json()
    refined_idea_text = body.get("refined_idea", "")
    question = body.get("question", "").strip()
    user_payload = body.get("user")
    prior_response = body.get("prior_response", "")

    if not question:
        raise HTTPException(status_code=422, detail="Question is required")
    if not user_payload:
        raise HTTPException(status_code=422, detail="User payload is required")

    refined_idea = _build_refined_idea_model(refined_idea_text)
    agent = CustomerValidationAgent()
    return StreamingResponse(
        follow_up_stream_generator(
            agent,
            user_payload=user_payload,
            question=question,
            prior_response=prior_response,
            refined_idea=refined_idea,
            market_research_text=body.get("market_research", ""),
            competitor_analysis_text=body.get("competitors", ""),
            ux_flow_text=body.get("ux", ""),
            ui_spec_text=body.get("ui", ""),
            visibility_text=body.get("visibility", ""),
            scoring_text=body.get("scoring", ""),
        ),
        media_type="text/event-stream",
    )


@router.get("/sessions")
async def list_sessions():
    """List all saved sessions."""
    return await persistence.get_sessions("public")




@router.get("/sessions/{session_id}")
async def load_session(session_id: str):
    """Load a specific session."""
    session = await persistence.get_session_by_id(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return session




@router.post("/sessions/save")
async def save_session(request: Request):
    """Save or update a session."""
    data = await request.json()
    report_id = await persistence.save_session("public", data)
    return {"success": True, "id": report_id}




@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a session."""
    success = await persistence.delete_session("public", session_id)
    return {"success": success}
