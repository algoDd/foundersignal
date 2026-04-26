"""Customer Validation Agent — Simulates customer feedback for an idea.

This agent can be run standalone for quick audits or as part of the main
orchestration pipeline.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime
import json
import os
import random
import re
from typing import Annotated, Any, TypedDict

import httpx

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from app.agents.base import BaseAgent
from app.config import get_settings
from app.models.schemas import CustomerValidationReport, RefinedIdea

# --- 1. SCHEMAS & MODELS ---


class OceanProfile(BaseModel):
    openness: float = Field(ge=0, le=1)
    conscientiousness: float = Field(ge=0, le=1)
    extraversion: float = Field(ge=0, le=1)
    agreeableness: float = Field(ge=0, le=1)
    neuroticism: float = Field(ge=0, le=1)


class SyntheticUser(BaseModel):
    name: str
    archetype: str
    ocean: OceanProfile
    context: dict[str, Any]

    def bio(self) -> str:
        ctx_str = ", ".join(
            [f"{k.replace('_', ' ').title()}: {v}" for k, v in self.context.items()]
        )
        return f"{self.name} ({self.archetype}) | {ctx_str} | OCEAN: {self.ocean.model_dump()}"


class InterviewResult(TypedDict):
    customer_info: dict[str, Any]
    response: str


class State(TypedDict):
    product_idea: str
    target_variables: list[str]
    archetypes: list[str]
    cohort: list[SyntheticUser]
    interview_results: list[InterviewResult]
    raw_feedbacks: Annotated[list[str], lambda x, y: x + y]  # Appends list items
    final_audit: str


# --- 2. THE AGENT ---

# Load environment variables for standalone execution
load_dotenv()

# Constants
COHORT_SIZE = 5
DEMOGRAPHIC_SIZE = 5
TOTAL_CUSTOMERS = 100

_settings = get_settings()


class CustomerValidationAgent(BaseAgent):
    """
    Simulates a cohort of synthetic users to gather feedback on a product idea.
    Saves detailed artifacts to disk and returns a summary report.
    """

    name = "customer_validation"
    system_prompt = "You are a market research and customer psychology expert."

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        # The LangGraph state machine
        self._app = self._build_graph()

    def _build_graph(self):
        """Builds the LangGraph state machine for the audit pipeline."""
        builder = StateGraph(State)
        builder.add_node("strategist", self._strategist_node)
        builder.add_node("persona_strategist", self._persona_strategist_node)
        builder.add_node("factory", self._persona_factory_node)
        builder.add_node("save_personas", self._save_personas_node)
        builder.add_node("simulate", self._simulation_node)
        builder.add_node("save_interviews", self._save_interviews_node)
        builder.add_node("audit", self._audit_node)

        builder.add_edge(START, "strategist")
        builder.add_edge("strategist", "persona_strategist")
        builder.add_edge("persona_strategist", "factory")
        builder.add_edge("factory", "save_personas")
        builder.add_edge("save_personas", "simulate")
        builder.add_edge("simulate", "save_interviews")
        builder.add_edge("save_interviews", "audit")
        builder.add_edge("audit", END)

        return builder.compile()

    async def run(self, *, refined_idea: RefinedIdea) -> CustomerValidationReport:
        """
        Executes the full customer validation pipeline.

        Args:
            refined_idea: The structured idea from the IdeaRefinementAgent.

        Returns:
            A summary report of the customer validation findings.
        """
        print(f"\n--- STARTING CUSTOMER VALIDATION ({TOTAL_CUSTOMERS} customers) ---")
        idea_text = self.build_context_block(
            problem=refined_idea.problem_statement,
            solution=refined_idea.solution_hypothesis,
            target_audience=refined_idea.target_audience,
        )

        result = await self._app.ainvoke({"product_idea": idea_text, "raw_feedbacks": []})
        print("\n" + "=" * 50)
        print(result["final_audit"])

        # Parse the final text report into the Pydantic model
        parsed_report = await self._parse_final_report(result["final_audit"])
        return parsed_report

    async def _parse_final_report(self, report_text: str) -> CustomerValidationReport:
        """Uses the LLM to parse the raw text report into a structured model."""
        prompt = (
            "Parse the following synthetic audit report into a structured JSON object. "
            "Extract the Market Fit Score, Key Objections, Surprising Insights, and "
            "Recommended Pivot. The objections, insights, and pivot should be lists of "
            "strings.\n\n"
            f"REPORT:\n{report_text}"
        )
        return await self.generate_structured(prompt, CustomerValidationReport)

    async def run_stream_interviews(
        self, 
        *, 
        refined_idea: RefinedIdea,
        market_research_text: str | None = None,
        competitor_analysis_text: str | None = None,
        ux_flow_text: str | None = None,
        ui_spec_text: str | None = None,
        visibility_text: str | None = None,
        scoring_text: str | None = None
    ):
        """
        Runs a live simulation of customer interviews and streams them.
        Injects full research context for highly realistic feedback.
        """
        dossier_summary = self._build_interview_dossier(
            refined_idea=refined_idea,
            market_research_text=market_research_text,
            competitor_analysis_text=competitor_analysis_text,
            ux_flow_text=ux_flow_text,
            ui_spec_text=ui_spec_text,
            visibility_text=visibility_text,
            scoring_text=scoring_text,
        )
        full_research_dossier = dossier_summary["dossier"]
        research_highlights = dossier_summary["highlights"]

        archetypes = [
            "Early Adopter",
            "Skeptical Stakeholder",
            "Industry Veteran",
            "Cost-Conscious User",
            "Practical Implementer",
        ]
        
        for archetype in archetypes:
            ctx_prompt = f"""
            Create a unique person profile for a user interview.
            This persona MUST embody the archetype: '{archetype}'.
            Focus on role, lived context, objections, purchase behavior, and what they value in a solution.

            PRODUCT DOSSIER:
            {full_research_dossier[:5000]}

            Return ONLY valid JSON with these keys:
            - name
            - role
            - company_or_context
            - background
            - values (array of short strings)
            - pain_points (array of short strings)
            - interview_style
            - quote_seed
            """
            ctx_res, _ = await self._llm.generate(ctx_prompt, temperature=0.8)
            ctx_data = self._parse_persona_json(ctx_res, archetype)

            user = SyntheticUser(
                name=ctx_data.get("name", "User"),
                archetype=archetype,
                ocean=self._generate_ocean_profile(archetype),
                context=ctx_data,
            )

            focus_points = self._persona_focus_points(ctx_data)
            yield {
                "event": "persona_created",
                "user": user.model_dump(),
                "focus_points": focus_points,
                "research_highlights": research_highlights,
                "is_complete": False,
            }

            system = (
                f"Identity: {user.bio()}\n"
                "You are participating in a deep-dive interview about a new product idea and its technical/market research. "
                "You have been shown the vision, the market data, and even the proposed UX/UI prototypes. "
                "Be authentic to your persona. If you are a skeptic, challenge the assumptions in the research. "
                "If you are an industry veteran, comment on the market fit and competitor gaps. "
                "Keep your response visceral and honest. Structure your answer naturally like a real interview: "
                "1) immediate reaction, 2) what feels promising, 3) what blocks trust or adoption, 4) whether you would try or buy."
            )
            msg = (
                "Give me your honest, visceral reaction to this entire product dossier. "
                "Reference concrete elements from the dossier when relevant.\n\n"
                f"{full_research_dossier[:6000]}"
            )
            
            full_response = ""
            async for chunk, _ in self._llm.stream(msg, system_prompt=system):
                full_response += chunk
                yield {
                    "event": "interview_chunk",
                    "user": user.model_dump(),
                    "chunk": chunk,
                    "focus_points": focus_points,
                    "is_complete": False
                }
            
            yield {
                "event": "interview_complete",
                "user": user.model_dump(),
                "response": full_response,
                "focus_points": focus_points,
                "research_highlights": research_highlights,
                "is_complete": True
            }
            await asyncio.sleep(1)

    async def run_follow_up_question(
        self,
        *,
        user_payload: dict[str, Any],
        question: str,
        refined_idea: RefinedIdea,
        prior_response: str = "",
        market_research_text: str | None = None,
        competitor_analysis_text: str | None = None,
        ux_flow_text: str | None = None,
        ui_spec_text: str | None = None,
        visibility_text: str | None = None,
        scoring_text: str | None = None,
    ):
        """Stream a follow-up answer from a previously generated persona."""
        dossier_summary = self._build_interview_dossier(
            refined_idea=refined_idea,
            market_research_text=market_research_text,
            competitor_analysis_text=competitor_analysis_text,
            ux_flow_text=ux_flow_text,
            ui_spec_text=ui_spec_text,
            visibility_text=visibility_text,
            scoring_text=scoring_text,
        )
        user = SyntheticUser.model_validate(user_payload)
        prior_context = prior_response[:2500] if prior_response else "No prior interview transcript yet."
        system = (
            f"Identity: {user.bio()}\n"
            "Stay fully in character as this persona. "
            "You are answering a follow-up interview question after having already reviewed the product dossier. "
            "Answer naturally, specifically, and concisely. Reference your role, concerns, and prior reaction when useful."
        )
        prompt = (
            f"PRODUCT DOSSIER:\n{dossier_summary['dossier'][:4500]}\n\n"
            f"YOUR PRIOR INTERVIEW RESPONSE:\n{prior_context}\n\n"
            f"FOLLOW-UP QUESTION:\n{question}\n\n"
            "Answer as the persona in 1-3 concise paragraphs."
        )

        full_response = ""
        async for chunk, _ in self._llm.stream(prompt, system_prompt=system):
            full_response += chunk
            yield {
                "event": "follow_up_chunk",
                "user": user.model_dump(),
                "question": question,
                "chunk": chunk,
                "is_complete": False,
            }

        yield {
            "event": "follow_up_complete",
            "user": user.model_dump(),
            "question": question,
            "response": full_response,
            "is_complete": True,
        }

    def _parse_persona_json(self, raw_text: str, archetype: str) -> dict[str, Any]:
        """Parse persona JSON safely and provide a consistent fallback shape."""
        clean_json = raw_text.strip()
        if "```json" in clean_json:
            clean_json = clean_json.split("```json", maxsplit=1)[1].split("```", maxsplit=1)[0].strip()
        elif "```" in clean_json:
            clean_json = clean_json.split("```", maxsplit=1)[1].strip()

        try:
            ctx_data = json.loads(clean_json)
        except Exception:
            ctx_data = {}

        return {
            "name": ctx_data.get("name") or f"User_{archetype.replace(' ', '_')}",
            "role": ctx_data.get("role") or archetype,
            "company_or_context": ctx_data.get("company_or_context") or "Independent evaluator",
            "background": ctx_data.get("background") or "Evaluating the concept from their own working context.",
            "values": self._normalize_string_list(ctx_data.get("values")) or ["Clarity", "Time savings"],
            "pain_points": self._normalize_string_list(ctx_data.get("pain_points")) or ["Too many manual steps", "Unclear ROI"],
            "interview_style": ctx_data.get("interview_style") or "direct but thoughtful",
            "quote_seed": ctx_data.get("quote_seed") or "Show me why this matters in my real workflow.",
        }

    def _normalize_string_list(self, value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            parts = [item.strip(" -") for item in re.split(r"[,;\n]", value) if item.strip()]
            return [item for item in parts if item]
        return []

    def _persona_focus_points(self, ctx_data: dict[str, Any]) -> list[str]:
        return [
            *self._normalize_string_list(ctx_data.get("pain_points"))[:2],
            *self._normalize_string_list(ctx_data.get("values"))[:2],
        ][:4]

    def _build_interview_dossier(
        self,
        *,
        refined_idea: RefinedIdea,
        market_research_text: str | None,
        competitor_analysis_text: str | None,
        ux_flow_text: str | None,
        ui_spec_text: str | None,
        visibility_text: str | None,
        scoring_text: str | None,
    ) -> dict[str, Any]:
        """Build a compact but rich dossier so interviews feel grounded and specific."""
        highlights = {
            "product": refined_idea.value_proposition or refined_idea.elevator_pitch,
            "audience": refined_idea.target_audience,
            "business_model": refined_idea.business_model,
            "market_signals": self._extract_bullets(market_research_text or "", limit=3),
            "competitor_gaps": self._extract_bullets(competitor_analysis_text or "", limit=3),
            "journey_steps": self._extract_bullets(ux_flow_text or "", limit=3),
            "ui_moments": self._extract_bullets(ui_spec_text or "", limit=3),
            "visibility_signals": self._extract_bullets(visibility_text or "", limit=2),
            "decision_signals": self._extract_bullets(scoring_text or "", limit=2),
        }

        parts = [
            self.build_context_block(
                product_vision=refined_idea.elevator_pitch,
                problem_statement=refined_idea.problem_statement,
                proposed_solution=refined_idea.solution_hypothesis,
                value_proposition=refined_idea.value_proposition,
                target_audience=refined_idea.target_audience,
                business_model=refined_idea.business_model,
            )
        ]

        if market_research_text:
            parts.append(f"## Market Insights\n{market_research_text[:1800]}")
        if competitor_analysis_text:
            parts.append(f"## Competitor Gaps\n{competitor_analysis_text[:1800]}")
        if ux_flow_text:
            parts.append(f"## User Journey\n{ux_flow_text[:1600]}")
        if ui_spec_text:
            parts.append(f"## Visual Prototype\n{ui_spec_text[:1600]}")
        if visibility_text:
            parts.append(f"## AI Visibility\n{visibility_text[:1000]}")
        if scoring_text:
            parts.append(f"## Decision Layer\n{scoring_text[:1000]}")

        return {
            "dossier": "\n\n---\n\n".join(parts),
            "highlights": highlights,
        }

    def _extract_bullets(self, markdown: str, *, limit: int) -> list[str]:
        if not markdown:
            return []
        bullets = [
            line.strip()[2:].strip()
            for line in markdown.splitlines()
            if line.strip().startswith("- ")
        ]
        if bullets:
            return bullets[:limit]
        fallback = [
            line.strip()
            for line in markdown.splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]
        return fallback[:limit]

    # --- LangGraph Nodes (Keep for batch runs) ---

    def _strategist_node(self, state: State):
        """Analyzes product to decide who we should interview."""
        print(f"[*] Analyzing product: {state['product_idea'][:50]}...")
        prompt = f"""
        Product: {state["product_idea"]}
        Identify a minimum of {DEMOGRAPHIC_SIZE} most critical demographic/psychographic
        variables to test.
        Return ONLY a JSON list of strings. Example: ["age", "tech_literacy", "disposable_income"]
        """
        res = asyncio.run(self.generate_text(prompt))
        variables = json.loads(res.strip())
        return {"target_variables": variables}

    def _persona_strategist_node(self, state: State):
        """Determines the most relevant archetypes for the product."""
        print("[*] Determining best-fit archetypes...")
        prompt = f"""
        Based on the product idea: '{state["product_idea"]}', identify the {COHORT_SIZE}
        most critical and diverse user archetypes to interview.
        Consider the user base, potential stakeholders, and critics.
        Examples: "Early Adopter," "Skeptical Professional," "Privacy-Concerned User," etc.
        Return ONLY a JSON list of strings with the {COHORT_SIZE} archetype names.
        """
        res = asyncio.run(self.generate_text(prompt))
        archetypes = json.loads(res.strip())
        print(f"[*] Archetypes identified: {archetypes}")
        return {"archetypes": archetypes}

    def _persona_factory_node(self, state: State):
        """Generates a diverse cohort based on the dynamically selected archetypes."""
        print(f"[*] Generating synthetic cohort of {TOTAL_CUSTOMERS} customers...")
        cohort = []
        # ... (rest of the persona factory logic remains the same)
        customers_per_archetype = TOTAL_CUSTOMERS // len(state["archetypes"])
        remainder = TOTAL_CUSTOMERS % len(state["archetypes"])
        distribution = [customers_per_archetype] * len(state["archetypes"])
        for i in range(remainder):
            distribution[i] += 1

        customer_count = 0
        for i, archetype_name in enumerate(state["archetypes"]):
            num_customers_for_archetype = distribution[i]
            for _ in range(num_customers_for_archetype):
                customer_count += 1
                ctx_prompt = f"""
                Create a unique person profile for the demographic variables:
                {state["target_variables"]}.
                This persona MUST embody the archetype: '{archetype_name}'.
                Be nuanced and avoid stereotypes. Give them a specific background and values.
                Return ONLY valid JSON.
                """
                res = asyncio.run(self.generate_text(ctx_prompt))
                ctx_data = json.loads(res.strip())

                user = SyntheticUser(
                    name=f"{archetype_name.replace(' ', '_')}_{customer_count}",
                    archetype=archetype_name,
                    ocean=self._generate_ocean_profile(archetype_name),
                    context=ctx_data,
                )
                cohort.append(user)
        return {"cohort": cohort}

    async def _generate_persona_via_pioneer(self, archetype: str, dossier: str) -> dict[str, Any]:
        """Generates a customer persona using the Pioneer API."""
        prompt = f"""
Create a unique person profile for a user interview.
This persona MUST embody the archetype: '{archetype}'.
Focus on their role, pain points, and what they value in a solution.

Based on this Product Dossier:
{dossier[:4000]}

Return ONLY valid JSON with exactly these keys:
- "name": a realistic first and last name (e.g. "Sarah Chen", "Marcus Rodriguez") — NOT a placeholder
- "gender": either "male" or "female"
- "role": their job title or role
- "background": 1-2 sentences about their background
- "values": what they care most about

Example: {{"name": "Priya Mehta", "gender": "female", "role": "Senior Product Manager", "background": "10 years in B2B SaaS, frustrated with manual reporting.", "values": "Efficiency and clear ROI"}}
"""
        payload = {
            "model": _settings.pioneer_model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.8,
        }
        headers = {
            "Authorization": f"Bearer {_settings.pioneer_api_key}",
            "Content-Type": "application/json",
        }
        print(f"[Pioneer] Calling {_settings.pioneer_api_url} for archetype: '{archetype}'")
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(_settings.pioneer_api_url, json=payload, headers=headers)
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        print(f"[Pioneer] Response received for '{archetype}' — content length: {len(content)} chars")

        clean = content.strip()
        if "```json" in clean:
            clean = clean.split("```json")[1].split("```")[0].strip()
        elif "```" in clean:
            clean = clean.split("```")[1].strip()
        result = json.loads(clean)
        print(f"[Pioneer] Parsed persona: {result.get('name')} | {result.get('role')}")
        return result

    def _generate_ocean_profile(self, archetype_name: str) -> OceanProfile:
        """Generates an OCEAN profile with archetype-influenced biases."""
        params = {
            "openness": random.uniform(0.2, 0.8),  # noqa: S311
            "conscientiousness": random.uniform(0.2, 0.8),  # noqa: S311
            "extraversion": random.uniform(0.2, 0.8),  # noqa: S311
            "agreeableness": random.uniform(0.2, 0.8),  # noqa: S311
            "neuroticism": random.uniform(0.2, 0.8),  # noqa: S311
        }
        if "skeptic" in archetype_name.lower():
            params["agreeableness"] = random.uniform(0.1, 0.4)  # noqa: S311
        if "early adopter" in archetype_name.lower():
            params["openness"] = random.uniform(0.7, 1.0)  # noqa: S311
        return OceanProfile(**params)

    def _save_personas_node(self, state: State):
        """Saves all generated personas to a single JSON file."""
        print("[*] Saving personas...")
        os.makedirs("outputs", exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        file_path = os.path.join("outputs", f"personas_{timestamp}.json")
        cohort_data = [user.model_dump() for user in state["cohort"]]
        with open(file_path, "w") as f:
            json.dump(cohort_data, f, indent=2)
        print(f"[*] {len(cohort_data)} personas saved to {file_path}")
        return {}

    async def _simulation_node(self, state: State):
        """Simulates parallel interviews with the cohort."""
        print(f"[*] Running {len(state['cohort'])} interviews in parallel...")

        async def interview(user: SyntheticUser) -> InterviewResult:
            system = (
                f"Identity: {user.bio()}\nYou are participating in a blind market test. "
                "Be authentic. If your personality or context suggests you would "
                "dislike this, BE HARSH."
            )
            msg = f"Give me your honest, visceral reaction to this idea: {state['product_idea']}"
            llm = ChatGoogleGenerativeAI(
                model="gemini-1.5-pro", temperature=0.7
            )  # Temp instance for async
            res = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content=msg)])
            return {"customer_info": user.model_dump(), "response": str(res.content)}

        tasks = [interview(u) for u in state["cohort"]]
        interview_results = await asyncio.gather(*tasks)
        raw_feedbacks = [
            f"--- {result['customer_info']['name']} ---\n{result['response']}"
            for result in interview_results
        ]
        return {"interview_results": interview_results, "raw_feedbacks": raw_feedbacks}

    def _save_interviews_node(self, state: State):
        """Saves all interview results to a single JSON file."""
        print("[*] Saving interviews...")
        os.makedirs("interviews", exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        file_path = os.path.join("interviews", f"interviews_{timestamp}.json")
        with open(file_path, "w") as f:
            json.dump(state["interview_results"], f, indent=2)
        print(f"[*] {len(state['interview_results'])} interviews saved to {file_path}")
        return {}

    def _audit_node(self, state: State):
        """Final synthesis of the data."""
        print("[*] Synthesizing final audit report...")
        combined = "\n\n".join(state["raw_feedbacks"])
        prompt = f"""
        You are 'The Synthetic Auditor'. Analyze these feedback transcripts for the
        product: {state["product_idea"]}
        Transcripts:\n{combined}
        Provide:
        1. MARKET FIT SCORE (0-100)
        2. KEY OBJECTIONS (The 'Deal Breakers')
        3. SURPRISING INSIGHTS (Edge cases)
        4. RECOMMENDED PIVOT
        """
        res = asyncio.run(self.generate_text(prompt))

        os.makedirs("reports", exist_ok=True)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        report_path = os.path.join("reports", f"audit_report_{timestamp}.md")
        with open(report_path, "w") as f:
            f.write(
                f"# Synthetic Audit Report\n\n**Product Idea:** {state['product_idea']}\n\n{res}"
            )
        print(f"[*] Audit report saved to {report_path}")
        return {"final_audit": res}


# --- 3. STANDALONE EXECUTION ---

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the Synthetic Auditor Standalone")
    parser.add_argument("--file", type=str, help="Path to a text file with the product idea.")
    parser.add_argument("--idea", type=str, help="The product idea as a string.")
    args = parser.parse_args()

    if not args.file and not args.idea:
        print("Error: Must provide either --file or --idea.")
    else:
        idea_text = ""
        if args.file:
            with open(args.file) as f:
                idea_text = f.read()
        else:
            idea_text = args.idea

        # Create a mock RefinedIdea object for standalone execution
        mock_idea = RefinedIdea(
            problem_statement=idea_text,
            solution_hypothesis="",
            target_audience="",
            value_proposition="",
            business_model="",
        )

        # Instantiate and run the agent
        agent = CustomerValidationAgent()
        asyncio.run(agent.run(refined_idea=mock_idea))
