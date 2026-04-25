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
from app.agents.customer_validation_agent import CustomerValidationAgent
from app.agents.idea_refinement import IdeaRefinementAgent
from app.agents.market_research import MarketResearchAgent
from app.agents.ui_spec import UISpecAgent
from app.agents.ux_flow import UXFlowAgent
from app.agents.validation_scoring import ValidationScoringAgent
from app.agents.verification import VerificationAgent
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

        # Initialize agents
        self._idea_agent = IdeaRefinementAgent()
        self._market_agent = MarketResearchAgent(tavily=tavily)
        self._competitor_agent = CompetitorResearchAgent(tavily=tavily)
        self._customer_agent = CustomerValidationAgent()
        self._ux_agent = UXFlowAgent()
        self._ui_agent = UISpecAgent()
        self._visibility_agent = AIVisibilityAgent(peec=peec)
        self._scoring_agent = ValidationScoringAgent()
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

        feedback: str | None = None

        for iteration in range(2):
            logger.info("Starting pipeline iteration %d/2", iteration + 1)

            # ── Step 1: Idea Refinement ────────────────────────────────────
            try:
                track(f"idea_refinement_v{iteration}", AgentStatus.RUNNING)
                report.refined_idea = await self._idea_agent.run(idea_input=idea_input, feedback=feedback)
                track(f"idea_refinement_v{iteration}", AgentStatus.COMPLETED)
            except Exception as e:
                track(f"idea_refinement_v{iteration}", AgentStatus.FAILED, str(e))
                logger.error("Idea refinement failed: %s", e)
                break

            refined = report.refined_idea

            # ── Step 2: Parallel — Market + Competitor ──────────
            async def run_market():
                try:
                    track(f"market_research_v{iteration}", AgentStatus.RUNNING)
                    result = await self._market_agent.run(refined_idea=refined)
                    track(f"market_research_v{iteration}", AgentStatus.COMPLETED)
                    return result
                except Exception as e:
                    track(f"market_research_v{iteration}", AgentStatus.FAILED, str(e))
                    logger.error("Market research failed: %s", e)
                    return None

            async def run_competitor():
                try:
                    track(f"competitor_research_v{iteration}", AgentStatus.RUNNING)
                    result = await self._competitor_agent.run(refined_idea=refined)
                    track(f"competitor_research_v{iteration}", AgentStatus.COMPLETED)
                    return result
                except Exception as e:
                    track(f"competitor_research_v{iteration}", AgentStatus.FAILED, str(e))
                    logger.error("Competitor research failed: %s", e)
                    return None

            async def run_customer_validation():
                try:
                    track(f"customer_validation_v{iteration}", AgentStatus.RUNNING)
                    result = await self._customer_agent.run(refined_idea=refined)
                    track(f"customer_validation_v{iteration}", AgentStatus.COMPLETED)
                    return result
                except Exception as e:
                    track(f"customer_validation_v{iteration}", AgentStatus.FAILED, str(e))
                    logger.error("Customer validation failed: %s", e)
                    return None

            market, competitor, customer_validation = await asyncio.gather(
                run_market(), run_competitor(), run_customer_validation()
            )
            report.market_research = market
            report.competitor_analysis = competitor
            report.customer_validation = customer_validation
            report.target_audience = None  # Descoped

            # ── Step 3: UX Flow (needs market) ──────────────────
            try:
                track(f"ux_flow_v{iteration}", AgentStatus.RUNNING)
                report.ux_flow = await self._ux_agent.run(
                    refined_idea=refined,
                    target_audience=None,
                    market_research=market,
                )
                track(f"ux_flow_v{iteration}", AgentStatus.COMPLETED)
            except Exception as e:
                track(f"ux_flow_v{iteration}", AgentStatus.FAILED, str(e))
                logger.error("UX flow failed: %s", e)

            # ── Step 4: UI Spec (needs UX flow) ────────────────────────────
            if report.ux_flow:
                try:
                    track(f"ui_spec_v{iteration}", AgentStatus.RUNNING)
                    report.ui_spec = await self._ui_agent.run(
                        refined_idea=refined,
                        ux_flow=report.ux_flow,
                    )
                    track(f"ui_spec_v{iteration}", AgentStatus.COMPLETED)
                except Exception as e:
                    track(f"ui_spec_v{iteration}", AgentStatus.FAILED, str(e))
                    logger.error("UI spec failed: %s", e)

            # ── Step 5: Parallel — AI Visibility + Validation Scoring ──────
            async def run_visibility():
                try:
                    track(f"ai_visibility_v{iteration}", AgentStatus.RUNNING)
                    result = await self._visibility_agent.run(
                        refined_idea=refined,
                        competitor_analysis=competitor,
                    )
                    track(f"ai_visibility_v{iteration}", AgentStatus.COMPLETED)
                    return result
                except Exception as e:
                    track(f"ai_visibility_v{iteration}", AgentStatus.FAILED, str(e))
                    logger.error("AI visibility failed: %s", e)
                    return None

            async def run_scoring():
                try:
                    track(f"validation_scoring_v{iteration}", AgentStatus.RUNNING)
                    result = await self._scoring_agent.run(
                        refined_idea=refined,
                        market_research=market,
                        competitor_analysis=competitor,
                        target_audience=None,
                    )
                    track(f"validation_scoring_v{iteration}", AgentStatus.COMPLETED)
                    return result
                except Exception as e:
                    track(f"validation_scoring_v{iteration}", AgentStatus.FAILED, str(e))
                    logger.error("Validation scoring failed: %s", e)
                    return None

            visibility, scoring = await asyncio.gather(run_visibility(), run_scoring())
            report.ai_visibility = visibility
            report.validation_score = scoring

            # ── Verification Loop ──
            try:
                track(f"verification_v{iteration}", AgentStatus.RUNNING)
                vf = await self._verification_agent.run(report=report)
                track(f"verification_v{iteration}", AgentStatus.COMPLETED)

                if vf.passed:
                    logger.info("Verification passed on iteration %d.", iteration + 1)
                    break
                else:
                    logger.warning("Verification failed: %s", vf.feedback)
                    feedback = "\n".join(f"- {f}" for f in vf.feedback)
            except Exception as e:
                track(f"verification_v{iteration}", AgentStatus.FAILED, str(e))
                logger.error("Verification failed to run: %s", e)
                break

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
        report.agent_progress = list(progress.values())
        report.total_duration_seconds = round(time.monotonic() - start_time, 2)

        report.total_tokens_used = sum([
            self._idea_agent.tokens_used,
            self._market_agent.tokens_used,
            self._competitor_agent.tokens_used,
            self._customer_agent.tokens_used,
            self._ux_agent.tokens_used,
            self._ui_agent.tokens_used,
            self._visibility_agent.tokens_used,
            self._scoring_agent.tokens_used,
            self._verification_agent.tokens_used,
        ])

        logger.info(
            "Pipeline complete — %.1fs, tokens: %d, score: %s",
            report.total_duration_seconds,
            report.total_tokens_used,
            report.validation_score.overall_score if report.validation_score else "N/A",
        )
        return report

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

        feedback: str | None = None

        # Helper to finalize and yield
        async def finalize_and_yield():
            report.agent_progress = list(progress.values())
            report.total_duration_seconds = round(time.monotonic() - start_time, 2)
            report.total_tokens_used = sum([
                self._idea_agent.tokens_used,
                self._market_agent.tokens_used,
                self._competitor_agent.tokens_used,
                self._ux_agent.tokens_used,
                self._ui_agent.tokens_used,
                self._visibility_agent.tokens_used,
                self._scoring_agent.tokens_used,
                self._verification_agent.tokens_used,
            ])
            yield report.model_copy(deep=True)

        for iteration in range(2):
            logger.info("Starting pipeline iteration %d/2", iteration + 1)

            # ── Step 1: Idea Refinement ────────────────────────────────────
            try:
                track(f"idea_refinement_v{iteration}", AgentStatus.RUNNING)
                async for chunk in finalize_and_yield(): yield chunk

                report.refined_idea = await self._idea_agent.run(idea_input=idea_input, feedback=feedback)
                track(f"idea_refinement_v{iteration}", AgentStatus.COMPLETED)
                async for chunk in finalize_and_yield(): yield chunk
            except Exception as e:
                track(f"idea_refinement_v{iteration}", AgentStatus.FAILED, str(e))
                logger.error("Idea refinement failed: %s", e)
                async for chunk in finalize_and_yield(): yield chunk
                break

            refined = report.refined_idea

            # ── Step 2: Parallel — Market + Competitor ──────────
            track(f"market_research_v{iteration}", AgentStatus.RUNNING)
            track(f"competitor_research_v{iteration}", AgentStatus.RUNNING)
            async for chunk in finalize_and_yield(): yield chunk

            async def run_market():
                try:
                    result = await self._market_agent.run(refined_idea=refined)
                    track(f"market_research_v{iteration}", AgentStatus.COMPLETED)
                    return result
                except Exception as e:
                    track(f"market_research_v{iteration}", AgentStatus.FAILED, str(e))
                    logger.error("Market research failed: %s", e)
                    return None

            async def run_competitor():
                try:
                    result = await self._competitor_agent.run(refined_idea=refined)
                    track(f"competitor_research_v{iteration}", AgentStatus.COMPLETED)
                    return result
                except Exception as e:
                    track(f"competitor_research_v{iteration}", AgentStatus.FAILED, str(e))
                    logger.error("Competitor research failed: %s", e)
                    return None

            market, competitor = await asyncio.gather(
                run_market(), run_competitor()
            )
            report.market_research = market
            report.competitor_analysis = competitor
            report.target_audience = None
            async for chunk in finalize_and_yield(): yield chunk

            # ── Step 3: UX Flow ──────────────────
            try:
                track(f"ux_flow_v{iteration}", AgentStatus.RUNNING)
                async for chunk in finalize_and_yield(): yield chunk

                report.ux_flow = await self._ux_agent.run(
                    refined_idea=refined,
                    target_audience=None,
                    market_research=market,
                )
                track(f"ux_flow_v{iteration}", AgentStatus.COMPLETED)
                async for chunk in finalize_and_yield(): yield chunk
            except Exception as e:
                track(f"ux_flow_v{iteration}", AgentStatus.FAILED, str(e))
                logger.error("UX flow failed: %s", e)
                async for chunk in finalize_and_yield(): yield chunk

            # ── Step 4: UI Spec ────────────────────────────
            if report.ux_flow:
                try:
                    track(f"ui_spec_v{iteration}", AgentStatus.RUNNING)
                    async for chunk in finalize_and_yield(): yield chunk

                    report.ui_spec = await self._ui_agent.run(
                        refined_idea=refined,
                        ux_flow=report.ux_flow,
                    )
                    track(f"ui_spec_v{iteration}", AgentStatus.COMPLETED)
                    async for chunk in finalize_and_yield(): yield chunk
                except Exception as e:
                    track(f"ui_spec_v{iteration}", AgentStatus.FAILED, str(e))
                    logger.error("UI spec failed: %s", e)
                    async for chunk in finalize_and_yield(): yield chunk

            # ── Step 5: Parallel — AI Visibility + Validation Scoring ──────
            track(f"ai_visibility_v{iteration}", AgentStatus.RUNNING)
            track(f"validation_scoring_v{iteration}", AgentStatus.RUNNING)
            async for chunk in finalize_and_yield(): yield chunk

            async def run_visibility():
                try:
                    result = await self._visibility_agent.run(
                        refined_idea=refined,
                        competitor_analysis=competitor,
                    )
                    track(f"ai_visibility_v{iteration}", AgentStatus.COMPLETED)
                    return result
                except Exception as e:
                    track(f"ai_visibility_v{iteration}", AgentStatus.FAILED, str(e))
                    logger.error("AI visibility failed: %s", e)
                    return None

            async def run_scoring():
                try:
                    result = await self._scoring_agent.run(
                        refined_idea=refined,
                        market_research=market,
                        competitor_analysis=competitor,
                        target_audience=None,
                    )
                    track(f"validation_scoring_v{iteration}", AgentStatus.COMPLETED)
                    return result
                except Exception as e:
                    track(f"validation_scoring_v{iteration}", AgentStatus.FAILED, str(e))
                    logger.error("Validation scoring failed: %s", e)
                    return None

            visibility, scoring = await asyncio.gather(run_visibility(), run_scoring())
            report.ai_visibility = visibility
            report.validation_score = scoring
            async for chunk in finalize_and_yield(): yield chunk

            # ── Verification Loop ──
            try:
                track(f"verification_v{iteration}", AgentStatus.RUNNING)
                async for chunk in finalize_and_yield(): yield chunk

                vf = await self._verification_agent.run(report=report)
                track(f"verification_v{iteration}", AgentStatus.COMPLETED)

                if vf.passed:
                    logger.info("Verification passed on iteration %d.", iteration + 1)
                    async for chunk in finalize_and_yield(): yield chunk
                    break
                else:
                    logger.warning("Verification failed: %s", vf.feedback)
                    feedback = "\n".join(f"- {f}" for f in vf.feedback)
                    async for chunk in finalize_and_yield(): yield chunk
            except Exception as e:
                track(f"verification_v{iteration}", AgentStatus.FAILED, str(e))
                logger.error("Verification failed to run: %s", e)
                async for chunk in finalize_and_yield(): yield chunk
                break

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
                async for chunk in finalize_and_yield(): yield chunk
            except Exception as e:
                logger.warning("Hera video generation failed: %s", e)

        # ── Finalize ──────────────────────────────────────────────────
        async for chunk in finalize_and_yield(): yield chunk

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
