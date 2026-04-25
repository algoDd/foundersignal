"""Agents route — Individual agent endpoints for frontend-driven orchestration."""

import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.agents.ai_visibility import AIVisibilityAgent
from app.agents.competitor_research import CompetitorResearchAgent
from app.agents.idea_refinement import IdeaRefinementAgent
from app.agents.market_research import MarketResearchAgent
from app.agents.ui_spec import UISpecAgent
from app.agents.ux_flow import UXFlowAgent
from app.agents.validation_scoring import ValidationScoringAgent
from app.models.schemas import IdeaInput
from app.services.hera_service import get_hera_service
from app.services.peec_service import get_peec_service
from app.services.tavily_service import get_tavily_service

router = APIRouter()
logger = logging.getLogger("foundersignal.routes.agents")


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
