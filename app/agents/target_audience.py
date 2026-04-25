"""Target Audience Agent — Persona generation and behavioral analysis."""

from __future__ import annotations

from app.agents.base import BaseAgent
from app.models.schemas import RefinedIdea, TargetAudienceAnalysis


class TargetAudienceAgent(BaseAgent):
    """Generates detailed user personas, JTBD, and behavioral patterns.

    Pure LLM reasoning agent — no external data sources needed.
    """

    name = "target_audience"
    system_prompt = (
        "You are a user research expert specializing in startup target audiences. "
        "Create detailed, realistic personas based on the startup concept. "
        "Use the Jobs-to-be-Done framework and behavioral psychology. "
        "Personas should feel like real people — give them names, specific pain points, "
        "and realistic quotes. Focus on actionable insights that drive product decisions."
    )

    async def run(self, *, refined_idea: RefinedIdea) -> TargetAudienceAnalysis:
        """Generate target audience analysis for a refined startup idea.

        Args:
            refined_idea: The structured idea from IdeaRefinementAgent.

        Returns:
            TargetAudienceAnalysis with personas, JTBD, and behavioral patterns.
        """
        prompt = (
            "Create a detailed target audience analysis for the following startup.\n\n"
            f"Problem: {refined_idea.problem_statement}\n"
            f"Solution: {refined_idea.solution_hypothesis}\n"
            f"Target Audience: {refined_idea.target_audience}\n"
            f"Value Proposition: {refined_idea.value_proposition}\n"
            f"Business Model: {refined_idea.business_model}\n\n"
            "Produce:\n"
            "1. 3-4 detailed user personas (name, age_range, occupation, pain_points, "
            "   goals, behaviors, and a representative quote)\n"
            "2. Jobs-to-be-Done (3-5 core jobs users are hiring this product for)\n"
            "3. Behavioral patterns (how do these users currently solve the problem?)\n"
            "4. Adoption barriers (what might prevent them from switching?)\n"
            "5. Executive summary of the target audience\n"
        )

        return await self.generate_structured(prompt, TargetAudienceAnalysis)
