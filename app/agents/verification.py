"""Verification Agent — Reviews the generated validation report for quality and consistency."""

from __future__ import annotations

import json

from app.agents.base import BaseAgent
from app.models.schemas import FullReport, VerificationFeedback


class VerificationAgent(BaseAgent):
    """Reviews the generated report across all outputs and gives feedback.

    If the report is lacking depth, has contradictory points, or misses
    crucial details, it provides feedback to be used in a re-iteration.
    """

    name = "verification"
    system_prompt = (
        "You are an expert product advisor and rigorous quality assurance reviewer. "
        "Your task is to review an AI-generated product validation report. "
        "Check for consistency, depth, logical flow, and actionable insights. "
        "If there are any major gaps, contradictions, or superficial analyses, "
        "mark passed as false and provide clear, specific feedback. "
        "If the report is excellent and robust, mark passed as true with empty feedback."
    )

    async def run(self, *, report: FullReport) -> VerificationFeedback:
        """Review the full report and provide feedback.

        Args:
            report: The generated FullReport (or partial if still in loop).

        Returns:
            VerificationFeedback with boolean passed and list of feedback strings.
        """
        # Dump the report to JSON, ignoring None values and omitting video metadata
        report_data = report.model_dump(
            exclude_none=True,
            exclude={
                "dashboard_video",
                "agent_progress",
                "total_duration_seconds",
                "report_id",
                "created_at",
            },
        )
        report_json = json.dumps(report_data, default=str)

        prompt = (
            "Review the following generated product validation report.\n\n"
            f"```json\n{report_json[:10000]}\n```\n\n"
            "Evaluate:\n"
            "1. Is the idea refinement clear and structurally sound?\n"
            "2. Does the market and competitor research provide real numbers and deep insights?\n"
            "3. Are the UX and UI recommendations practical and cohesive with the idea?\n"
            "4. Are the scores justified by the rest of the report?\n\n"
            "Produce VerificationFeedback. If passed is false, list 2-3 specific "
            "areas that must be improved in the next iteration."
        )

        return await self.generate_structured(prompt, VerificationFeedback)

    async def run_stream_text(self, *, full_report_markdown: str):
        """Review the full report based on text context and stream feedback."""
        prompt = (
            "Critically review the following product validation report (Markdown format).\n\n"
            f"## Full Report\n{full_report_markdown}\n\n"
            "Produce a professional Markdown review including:\n"
            "# Quality Assurance & Verification Review\n"
            "## Consistency & Cohesion Analysis\n"
            "## Depth of Insights & Data Quality\n"
            "## Strategic Logical Gaps\n"
            "## Recommended Improvements for Iteration\n"
            "## Final Quality Rating (0-100)\n"
        )

        async for chunk in self.stream_text(prompt):
            yield chunk
