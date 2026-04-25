"""Idea Refinement Agent — Transforms raw ideas into structured problem statements."""

from __future__ import annotations

from app.agents.base import BaseAgent
from app.models.schemas import IdeaInput, RefinedIdea


class IdeaRefinementAgent(BaseAgent):
    """Takes a raw startup idea and produces a structured, refined version.

    This is always the first agent in the pipeline — its output feeds
    all subsequent agents.
    """

    name = "idea_refinement"
    system_prompt = (
        "You are a seasoned product strategist and advisor. "
        "Your job is to take a raw concept—which could be a new startup idea, "
        "an existing product, or a new feature—and refine it "
        "into a clear, structured definition. Be specific, practical, and actionable. "
        "Focus on clarity—a reader should understand the problem, solution and "
        "concept in under 30 seconds."
    )

    async def run(self, *, idea_input: IdeaInput, feedback: str | None = None) -> RefinedIdea:
        """Refine a raw startup idea into a structured concept.

        Args:
            idea_input: The user's raw concept (idea, product, or feature) with optional context.

        Returns:
            Structured RefinedIdea with problem statement, value prop, etc.
        """
        context_parts = [f"Raw Idea: {idea_input.idea}"]
        if idea_input.target_region:
            context_parts.append(f"Target Region: {idea_input.target_region}")
        if idea_input.industry:
            context_parts.append(f"Industry: {idea_input.industry}")
        if idea_input.target_audience:
            context_parts.append(f"Target Audience: {idea_input.target_audience}")
        if idea_input.business_model:
            context_parts.append(f"Business Model: {idea_input.business_model}")

        if feedback:
            context_parts.append(f"Previous Review Feedback to Address:\n{feedback}")

        prompt = (
            "Analyze the following concept (startup idea, product, or feature) and "
            "produce a refined, structured version.\n\n"
            f"{chr(10).join(context_parts)}\n\n"
            "Produce:\n"
            "1. A clear problem statement (what pain exists today?)\n"
            "2. A solution hypothesis (how does this product solve it?)\n"
            "3. A value proposition (why would someone choose this?)\n"
            "4. Refined target audience (who specifically benefits most?)\n"
            "5. Recommended business model\n"
            "6. Key assumptions that need validation (list 3-5)\n"
            "7. A one-paragraph elevator pitch\n"
        )

        return await self.generate_structured(prompt, RefinedIdea)

    async def run_stream(self, *, idea_input: IdeaInput, feedback: str | None = None):
        """Refine a raw idea into a structured concept and stream the markdown output."""
        context_parts = [f"Raw Idea: {idea_input.idea}"]
        if idea_input.target_region:
            context_parts.append(f"Target Region: {idea_input.target_region}")
        if idea_input.industry:
            context_parts.append(f"Industry: {idea_input.industry}")
        if idea_input.target_audience:
            context_parts.append(f"Target Audience: {idea_input.target_audience}")
        if idea_input.business_model:
            context_parts.append(f"Business Model: {idea_input.business_model}")

        if feedback:
            context_parts.append(f"Previous Review Feedback to Address:\n{feedback}")

        prompt = (
            "Analyze the following concept (startup idea, product, or feature) and "
            "produce a refined, structured report in Markdown format.\n\n"
            f"{chr(10).join(context_parts)}\n\n"
            "Produce a professional, detailed report with the following sections:\n"
            "# Refined Concept Analysis\n"
            "## Problem Statement\n"
            "## Solution Hypothesis\n"
            "## Value Proposition\n"
            "## Target Audience\n"
            "## Recommended Business Model\n"
            "## Key Assumptions\n"
            "## Elevator Pitch\n"
            "\nBe thorough and use professional formatting."
        )

        async for chunk in self.stream_text(prompt):
            yield chunk
