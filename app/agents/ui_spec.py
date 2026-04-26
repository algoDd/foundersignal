"""UI Spec Agent — Design system tokens, component specs, and frontend prompts."""

from __future__ import annotations

from app.agents.base import BaseAgent
from app.models.schemas import RefinedIdea, UISpec, UXFlow


class UISpecAgent(BaseAgent):
    """Generates design system specs and a detailed frontend build prompt.

    Takes the UX flow and produces concrete design tokens, component
    specifications, and a comprehensive prompt for generating the frontend.
    """

    name = "ui_spec"
    system_prompt = (
        "You are a visionary UI designer and creative director. "
        "Your goal is to describe the visual 'soul' of the product. "
        "Focus on the aesthetic vibe, the layout of a stunning landing page, "
        "and how the core app screens feel. Use evocative language. "
        "Describe high-fidelity prototypes, interactions, and the brand personality. "
        "Think premium, modern, and high-converting."
    )

    async def run(
        self,
        *,
        refined_idea: RefinedIdea,
        ux_flow: UXFlow,
    ) -> UISpec:
        """Generate UI specifications from UX flow.

        Args:
            refined_idea: Structured idea for brand context.
            ux_flow: The UX flow to design for.

        Returns:
            UISpec with design tokens, components, layouts, and build prompt.
        """
        screens_text = "\n".join(
            f"- {s.name}: {s.purpose} (elements: {', '.join(s.key_elements[:5])})"
            for s in ux_flow.screens
        )

        prompt = (
            "Create a comprehensive UI design specification for this product concept.\n\n"
            f"## Product\n"
            f"Name context: {refined_idea.elevator_pitch[:200]}\n"
            f"Value Prop: {refined_idea.value_proposition}\n\n"
            f"## Screens to Design\n{screens_text}\n\n"
            f"## Feature Priorities\n{chr(10).join(ux_flow.feature_priorities[:10])}\n\n"
            "Produce:\n"
            "1. Design tokens (8-12 tokens covering colors, spacing, typography, "
            "   border-radius, shadows — use modern, premium aesthetics)\n"
            "2. Component specifications (4-6 reusable components with name, "
            "   description, props, and variants)\n"
            "3. Page layout descriptions for each screen (3-5 screens max)\n"
            "4. Overall style guide summary\n"
            "5. A detailed frontend_prompt (500-1000 words) that could be given "
            "   to an AI tool to generate a complete Vite + React + TypeScript "
            "   frontend. Include specific colors, fonts, animations, and layout details.\n"
        )

        return await self.generate_structured(prompt, UISpec, max_tokens=6144)

    async def run_stream_text(self, *, refined_idea_text: str, ux_flow_text: str):
        """Generate UI specifications based on text context and stream markdown."""
        prompt = (
            "Describe the visual prototype and landing page for the following product "
            "concept and user journey in Markdown.\n\n"
            f"## The Concept\n{refined_idea_text}\n\n"
            f"## The Journey\n{ux_flow_text}\n\n"
            "Produce a visual specification report including:\n"
            "# Visual Prototype Design\n"
            "## Brand Vibe & Personality (Evocative description)\n"
            "## The Hero Section (What the user sees first on the landing page)\n"
            "## Key Conversion Modules (Social proof, feature showcase, CTA)\n"
            "## Core App Experience (How the main dashboard/screen looks)\n"
            "## Design System Snapshot (Colors, Typography, Moodboard description)\n"
            "## Interaction Design (How elements move and respond)\n"
            "## Detailed Implementation Prompt (For building the high-fidelity UI)\n"
            "\nRules:\n"
            "- Do not use markdown tables.\n"
            "- Use vivid but readable prose and bullets.\n"
            "- Include concrete colors, layout cues, and visual hierarchy details.\n"
        )

        async for chunk in self.stream_text(prompt, max_tokens=6144):
            yield chunk
