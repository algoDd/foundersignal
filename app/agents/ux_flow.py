"""UX Flow Agent — User journey mapping and feature architecture."""

from __future__ import annotations

from app.agents.base import BaseAgent
from app.models.schemas import (
    MarketResearch,
    RefinedIdea,
    TargetAudienceAnalysis,
    UXFlow,
)


class UXFlowAgent(BaseAgent):
    """Designs user journeys, screen flows, and feature prioritization.

    Requires context from previous agents (idea, audience, market) to
    design informed user experiences.
    """

    name = "ux_flow"
    system_prompt = (
        "You are a master story-teller and senior UX designer. "
        "Your job is to map out the human experience of interacting with a product. "
        "Focus on the 'Why' and the 'How' from a user's perspective. "
        "Avoid dry technical specs; instead, describe the user's emotions, "
        "their friction points, and how the product delivers a 'wow' moment. "
        "Design flows that feel magical and effortless."
    )

    async def run(
        self,
        *,
        refined_idea: RefinedIdea,
        target_audience: TargetAudienceAnalysis | None = None,
        market_research: MarketResearch | None = None,
    ) -> UXFlow:
        """Design the UX flow for a startup idea.

        Args:
            refined_idea: Structured idea concept.
            target_audience: Audience analysis for user-centered design.
            market_research: Market context for competitive positioning.

        Returns:
            UXFlow with journey, screens, IA, and feature priorities.
        """
        context = (
            f"## Product Concept\n"
            f"Problem: {refined_idea.problem_statement}\n"
            f"Solution: {refined_idea.solution_hypothesis}\n"
            f"Value Proposition: {refined_idea.value_proposition}\n"
            f"Target Audience: {refined_idea.target_audience}\n"
        )

        if target_audience:
            personas_text = "\n".join(
                f"- {p.name} ({p.occupation}): {', '.join(p.pain_points[:2])}"
                for p in target_audience.personas
            )
            context += f"\n## User Personas\n{personas_text}\n"

        if market_research:
            context += f"\n## Market Context\n{market_research.summary}\n"

        prompt = (
            f"Design the complete UX flow for this product concept.\n\n"
            f"{context}\n\n"
            "Produce:\n"
            "1. High-level user journey (5-8 steps from discovery to core value)\n"
            "2. Screen definitions (6-10 screens, each with name, purpose, "
            "   key_elements, user_actions, and navigation_to)\n"
            "3. Information architecture (site/app structure)\n"
            "4. Feature priorities (MVP features using MoSCoW: Must/Should/Could/Won't)\n"
            "5. UX flow summary\n"
        )

        return await self.generate_structured(prompt, UXFlow)

    async def run_stream_text(self, *, refined_idea_text: str, market_research_text: str | None = None):
        """Design the UX flow based on text context and stream markdown."""
        prompt = (
            "Tell the story of the user journey for the following product concept in Markdown.\n\n"
            f"## The Concept\n{refined_idea_text}\n\n"
        )
        if market_research_text:
            prompt += f"## Market Insights\n{market_research_text}\n\n"

        prompt += (
            "Produce a user-centric narrative report including:\n"
            "# The User Journey\n"
            "## The User's World (Before this product)\n"
            "## The Discovery Moment (How they find it)\n"
            "## The 'First 30 Seconds' (The onboarding experience)\n"
            "## The Path to Value (How they solve their problem step-by-step)\n"
            "## The Core Loop (What keeps them coming back)\n"
            "## Emotional Arc (How the user feels at each stage)\n"
            "## Key Feature Roadmap (MoSCoW - simplified for humans)\n"
        )

        async for chunk in self.stream_text(prompt):
            yield chunk
