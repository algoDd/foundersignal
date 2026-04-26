"""Orchestrator Agent — Coordinates the full analysis pipeline.

Runs all specialist agents in the correct order:
  1. Idea Refinement (sequential — everything depends on this)
  2. Market Research + Competitor Research + Target Audience (parallel)
  3. UX Flow (sequential — needs audience + market context)
  4. UI Spec (sequential — needs UX flow)
  5. AI Visibility + Validation Scoring (parallel)
  6. Dashboard Video via Hera (async, non-blocking)
  7. Store in Qontext vault (async, non-blocking)
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import UTC, datetime

from app.agents.ai_visibility import AIVisibilityAgent
from app.agents.competitor_research import CompetitorResearchAgent
from app.agents.idea_refinement import IdeaRefinementAgent
from app.agents.market_research import MarketResearchAgent
from app.agents.ui_spec import UISpecAgent
from app.agents.ux_flow import UXFlowAgent
from app.agents.validation_scoring import ValidationScoringAgent
from app.models.schemas import (
    AgentProgress,
    AgentStatus,
    DashboardVideo,
    FullReport,
    IdeaInput,
)
from app.services.hera_service import HeraService
from app.services.peec_service import PeecService
from app.services.tavily_service import TavilyService
from app.config import get_settings

logger = logging.getLogger("foundersignal.orchestrator")


class OrchestratorAgent:
    """Coordinates all specialist agents into a full analysis pipeline."""

    def __init__(
        self,
        *,
        tavily: TavilyService | None = None,
        hera: HeraService | None = None,
        peec: PeecService | None = None,
    ) -> None:
        self._tavily = tavily
        self._hera = hera
        self._peec = peec
        self._settings = get_settings()

        # Initialize agents
        self._idea_agent = IdeaRefinementAgent()
        self._market_agent = MarketResearchAgent(tavily=tavily)
        self._competitor_agent = CompetitorResearchAgent(tavily=tavily)
        self._ux_agent = UXFlowAgent()
        self._ui_agent = UISpecAgent()
        self._visibility_agent = AIVisibilityAgent(peec=peec)
        self._scoring_agent = ValidationScoringAgent()
        self._verification_agent = None
        if self._settings.enable_model_verification:
            from app.agents.verification import VerificationAgent

            self._verification_agent = VerificationAgent()

    async def run(self, idea_input: IdeaInput) -> FullReport:
        """Execute the full analysis pipeline.

        Args:
            idea_input: The user's startup idea.

        Returns:
            Complete FullReport with all agent outputs.
        """
        start_time = time.monotonic()
        report = FullReport(input=idea_input)
        progress: dict[str, AgentProgress] = {}

        def track(name: str, status: AgentStatus, error: str | None = None) -> None:
            if name not in progress:
                progress[name] = AgentProgress(agent_name=name)
            p = progress[name]
            p.status = status
            if status == AgentStatus.RUNNING:
                p.started_at = datetime.now(UTC)
            elif status in (AgentStatus.COMPLETED, AgentStatus.FAILED):
                p.completed_at = datetime.now(UTC)
            if error:
                p.error = error

        try:
            track("idea_refinement", AgentStatus.RUNNING)
            report.refined_idea = await self._idea_agent.run(idea_input=idea_input)
            track("idea_refinement", AgentStatus.COMPLETED)
        except Exception as e:
            track("idea_refinement", AgentStatus.FAILED, str(e))
            logger.error("Idea refinement failed: %s", e)
            return self._finalize_report(report, progress, start_time)

        refined = report.refined_idea

        async def run_market():
            try:
                track("market_research", AgentStatus.RUNNING)
                result = await self._market_agent.run(refined_idea=refined)
                track("market_research", AgentStatus.COMPLETED)
                return result
            except Exception as e:
                track("market_research", AgentStatus.FAILED, str(e))
                logger.error("Market research failed: %s", e)
                return None

        async def run_competitor():
            try:
                track("competitor_research", AgentStatus.RUNNING)
                result = await self._competitor_agent.run(refined_idea=refined)
                track("competitor_research", AgentStatus.COMPLETED)
                return result
            except Exception as e:
                track("competitor_research", AgentStatus.FAILED, str(e))
                logger.error("Competitor research failed: %s", e)
                return None

        report.market_research, report.competitor_analysis = await asyncio.gather(
            run_market(), run_competitor()
        )
        report.target_audience = None

        try:
            track("ux_flow", AgentStatus.RUNNING)
            report.ux_flow = await self._ux_agent.run(
                refined_idea=refined,
                target_audience=None,
                market_research=report.market_research,
            )
            track("ux_flow", AgentStatus.COMPLETED)
        except Exception as e:
            track("ux_flow", AgentStatus.FAILED, str(e))
            logger.error("UX flow failed: %s", e)

        if report.ux_flow:
            try:
                track("ui_spec", AgentStatus.RUNNING)
                report.ui_spec = await self._ui_agent.run(
                    refined_idea=refined,
                    ux_flow=report.ux_flow,
                )
                track("ui_spec", AgentStatus.COMPLETED)
            except Exception as e:
                track("ui_spec", AgentStatus.FAILED, str(e))
                logger.error("UI spec failed: %s", e)

        async def run_visibility():
            try:
                track("ai_visibility", AgentStatus.RUNNING)
                result = await self._visibility_agent.run(
                    refined_idea=refined,
                    competitor_analysis=report.competitor_analysis,
                )
                track("ai_visibility", AgentStatus.COMPLETED)
                return result
            except Exception as e:
                track("ai_visibility", AgentStatus.FAILED, str(e))
                logger.error("AI visibility failed: %s", e)
                return None

        async def run_scoring():
            try:
                track("validation_scoring", AgentStatus.RUNNING)
                result = await self._scoring_agent.run(
                    refined_idea=refined,
                    market_research=report.market_research,
                    competitor_analysis=report.competitor_analysis,
                    target_audience=None,
                )
                track("validation_scoring", AgentStatus.COMPLETED)
                return result
            except Exception as e:
                track("validation_scoring", AgentStatus.FAILED, str(e))
                logger.error("Validation scoring failed: %s", e)
                return None

        report.ai_visibility, report.validation_score = await asyncio.gather(
            run_visibility(), run_scoring()
        )

        if self._verification_agent is not None:
            try:
                track("verification", AgentStatus.RUNNING)
                await self._verification_agent.run(report=report)
                track("verification", AgentStatus.COMPLETED)
            except Exception as e:
                track("verification", AgentStatus.FAILED, str(e))
                logger.error("Verification failed to run: %s", e)
        else:
            track("verification", AgentStatus.SKIPPED)

        # ── Step 6: Hera Dashboard Video (non-blocking) ────────────────
        if self._hera and report.validation_score:
            try:
                video_prompt = self._build_hera_prompt(report)
                result = await self._hera.create_video(prompt=video_prompt, duration_seconds=10)
                report.dashboard_video = DashboardVideo(
                    video_id=result.get("video_id", ""),
                    project_url=result.get("project_url", ""),
                    status="processing",
                    prompt_used=video_prompt,
                )
            except Exception as e:
                logger.warning("Hera video generation failed: %s", e)

        # ── Finalize ──────────────────────────────────────────────────
        finalized = self._finalize_report(report, progress, start_time)
        logger.info(
            "Pipeline complete — %.1fs, tokens: %d, score: %s",
            finalized.total_duration_seconds,
            finalized.total_tokens_used,
            finalized.validation_score.overall_score if finalized.validation_score else "N/A",
        )
        return finalized

    async def run_stream(self, idea_input: IdeaInput):
        """Execute the full analysis pipeline and yield the report after each step."""
        start_time = time.monotonic()
        report = FullReport(input=idea_input)
        progress: dict[str, AgentProgress] = {}

        def track(name: str, status: AgentStatus, error: str | None = None) -> None:
            if name not in progress:
                progress[name] = AgentProgress(agent_name=name)
            p = progress[name]
            p.status = status
            if status == AgentStatus.RUNNING:
                p.started_at = datetime.now(UTC)
            elif status in (AgentStatus.COMPLETED, AgentStatus.FAILED):
                p.completed_at = datetime.now(UTC)
            if error:
                p.error = error

        # Helper to finalize and yield
        async def finalize_and_yield():
            finalized = self._finalize_report(report, progress, start_time)
            yield finalized.model_copy(deep=True)

        logger.info("Starting streaming pipeline")

        try:
            track("idea_refinement", AgentStatus.RUNNING)
            async for chunk in finalize_and_yield():
                yield chunk
            report.refined_idea = await self._idea_agent.run(idea_input=idea_input)
            track("idea_refinement", AgentStatus.COMPLETED)
            async for chunk in finalize_and_yield():
                yield chunk
        except Exception as e:
            track("idea_refinement", AgentStatus.FAILED, str(e))
            logger.error("Idea refinement failed: %s", e)
            async for chunk in finalize_and_yield():
                yield chunk
            return

        refined = report.refined_idea

        track("market_research", AgentStatus.RUNNING)
        track("competitor_research", AgentStatus.RUNNING)
        async for chunk in finalize_and_yield():
            yield chunk

        async def run_market():
            try:
                result = await self._market_agent.run(refined_idea=refined)
                track("market_research", AgentStatus.COMPLETED)
                return result
            except Exception as e:
                track("market_research", AgentStatus.FAILED, str(e))
                logger.error("Market research failed: %s", e)
                return None

        async def run_competitor():
            try:
                result = await self._competitor_agent.run(refined_idea=refined)
                track("competitor_research", AgentStatus.COMPLETED)
                return result
            except Exception as e:
                track("competitor_research", AgentStatus.FAILED, str(e))
                logger.error("Competitor research failed: %s", e)
                return None

        report.market_research, report.competitor_analysis = await asyncio.gather(
            run_market(), run_competitor()
        )
        async for chunk in finalize_and_yield():
            yield chunk

        try:
            track("ux_flow", AgentStatus.RUNNING)
            async for chunk in finalize_and_yield():
                yield chunk
            report.ux_flow = await self._ux_agent.run(
                refined_idea=refined,
                target_audience=None,
                market_research=report.market_research,
            )
            track("ux_flow", AgentStatus.COMPLETED)
            async for chunk in finalize_and_yield():
                yield chunk
        except Exception as e:
            track("ux_flow", AgentStatus.FAILED, str(e))
            logger.error("UX flow failed: %s", e)
            async for chunk in finalize_and_yield():
                yield chunk

        if report.ux_flow:
            try:
                track("ui_spec", AgentStatus.RUNNING)
                async for chunk in finalize_and_yield():
                    yield chunk
                report.ui_spec = await self._ui_agent.run(
                    refined_idea=refined,
                    ux_flow=report.ux_flow,
                )
                track("ui_spec", AgentStatus.COMPLETED)
                async for chunk in finalize_and_yield():
                    yield chunk
            except Exception as e:
                track("ui_spec", AgentStatus.FAILED, str(e))
                logger.error("UI spec failed: %s", e)
                async for chunk in finalize_and_yield():
                    yield chunk

        track("ai_visibility", AgentStatus.RUNNING)
        track("validation_scoring", AgentStatus.RUNNING)
        async for chunk in finalize_and_yield():
            yield chunk

        async def run_visibility():
            try:
                result = await self._visibility_agent.run(
                    refined_idea=refined,
                    competitor_analysis=report.competitor_analysis,
                )
                track("ai_visibility", AgentStatus.COMPLETED)
                return result
            except Exception as e:
                track("ai_visibility", AgentStatus.FAILED, str(e))
                logger.error("AI visibility failed: %s", e)
                return None

        async def run_scoring():
            try:
                result = await self._scoring_agent.run(
                    refined_idea=refined,
                    market_research=report.market_research,
                    competitor_analysis=report.competitor_analysis,
                    target_audience=None,
                )
                track("validation_scoring", AgentStatus.COMPLETED)
                return result
            except Exception as e:
                track("validation_scoring", AgentStatus.FAILED, str(e))
                logger.error("Validation scoring failed: %s", e)
                return None

        report.ai_visibility, report.validation_score = await asyncio.gather(
            run_visibility(), run_scoring()
        )
        async for chunk in finalize_and_yield():
            yield chunk

        if self._settings.enable_model_verification:
            try:
                track("verification", AgentStatus.RUNNING)
                async for chunk in finalize_and_yield():
                    yield chunk
                await self._verification_agent.run(report=report)
                track("verification", AgentStatus.COMPLETED)
            except Exception as e:
                track("verification", AgentStatus.FAILED, str(e))
                logger.error("Verification failed to run: %s", e)
        else:
            track("verification", AgentStatus.SKIPPED)

        async for chunk in finalize_and_yield():
            yield chunk

        # ── Step 6: Hera Dashboard Video (non-blocking) ────────────────
        if self._hera and report.validation_score:
            try:
                video_prompt = self._build_hera_prompt(report)
                result = await self._hera.create_video(prompt=video_prompt, duration_seconds=10)
                report.dashboard_video = DashboardVideo(
                    video_id=result.get("video_id", ""),
                    project_url=result.get("project_url", ""),
                    status="processing",
                    prompt_used=video_prompt,
                )
                async for chunk in finalize_and_yield():
                    yield chunk
            except Exception as e:
                logger.warning("Hera video generation failed: %s", e)

        # ── Finalize ──────────────────────────────────────────────────
        async for chunk in finalize_and_yield():
            yield chunk

    def _finalize_report(
        self,
        report: FullReport,
        progress: dict[str, AgentProgress],
        start_time: float,
    ) -> FullReport:
        report.agent_progress = list(progress.values())
        report.total_duration_seconds = round(time.monotonic() - start_time, 2)
        report.total_tokens_used = sum(
            [
                self._idea_agent.tokens_used,
                self._market_agent.tokens_used,
                self._competitor_agent.tokens_used,
                self._ux_agent.tokens_used,
                self._ui_agent.tokens_used,
                self._visibility_agent.tokens_used,
                self._scoring_agent.tokens_used,
                self._verification_agent.tokens_used,
            ]
        )
        return report

    def _build_hera_prompt(self, report: FullReport) -> str:
        """Build a Hera video prompt from the report data."""
        score = report.validation_score
        idea = report.refined_idea
        parts = [
            "Create a sleek startup validation dashboard infographic animation.",
            f"Product: {idea.value_proposition}" if idea else "",
            f"Overall Score: {score.overall_score}/100" if score else "",
            f"Verdict: {score.verdict}" if score else "",
        ]
        if score and score.dimensions:
            dims = ", ".join(f"{d.name}: {d.score}/10" for d in score.dimensions[:5])
            parts.append(f"Dimension scores: {dims}")
        parts.append(
            "Style: modern, dark theme, glowing gradients, animated charts, "
            "professional motion graphics"
        )
        return " ".join(p for p in parts if p)
