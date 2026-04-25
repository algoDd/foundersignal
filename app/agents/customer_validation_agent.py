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
from typing import Annotated, Any, TypedDict

from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from app.agents.base import BaseAgent
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
        # Build the comprehensive context block
        context_parts = [
            f"PRODUCT VISION:\n{refined_idea.elevator_pitch}",
            f"PROBLEM STATEMENT:\n{refined_idea.problem_statement}",
            f"PROPOSED SOLUTION:\n{refined_idea.solution_hypothesis}"
        ]
        
        if market_research_text:
            context_parts.append(f"MARKET INSIGHTS:\n{market_research_text[:2000]}...")
        if competitor_analysis_text:
            context_parts.append(f"COMPETITOR GAPS:\n{competitor_analysis_text[:2000]}...")
        if ux_flow_text:
            context_parts.append(f"USER JOURNEY:\n{ux_flow_text[:2000]}...")
        if ui_spec_text:
            context_parts.append(f"VISUAL PROTOTYPE:\n{ui_spec_text[:2000]}...")
        if scoring_text:
            context_parts.append(f"VALIDATION AUDIT:\n{scoring_text[:1000]}...")

        full_research_dossier = "\n\n---\n\n".join(context_parts)

        # 1. Ask the LLM to identify the most relevant archetypes for this specific product
        archetype_prompt = f"""
You are a customer research strategist. Based on the product dossier below, identify exactly 7 distinct customer archetypes that would be most insightful to interview.

Each archetype should represent a meaningfully different perspective, motivation, or pain point relevant to this specific product — not generic archetypes.

Product Dossier:
{full_research_dossier[:3000]}

Return ONLY a valid JSON array of 7 strings, each being a short archetype name (2-4 words).
Example: ["Early Adopter", "Skeptical Enterprise Buyer", "Budget-Conscious SMB Owner", "Technical Power User", "Compliance-Driven Manager", "First-Time User", "Industry Veteran"]
"""
        archetype_res, _ = await self._llm.generate(archetype_prompt, temperature=0.7)
        try:
            clean = archetype_res.strip()
            if "```json" in clean:
                clean = clean.split("```json")[1].split("```")[0].strip()
            elif "```" in clean:
                clean = clean.split("```")[1].strip()
            archetypes = json.loads(clean)
            if not isinstance(archetypes, list) or len(archetypes) == 0:
                raise ValueError("Invalid archetype list")
        except Exception:
            archetypes = ["Early Adopter", "Skeptical Stakeholder", "Industry Veteran", "Cost-Conscious User", "Practical Implementer", "Visionary Innovator", "Risk-Averse Buyer"]
        
        interview_responses: list[str] = []

        for archetype in archetypes:
            # 2. Generate a persona context
            ctx_prompt = f"""
            Create a unique person profile for a user interview.
            This persona MUST embody the archetype: '{archetype}'.
            Focus on their role, pain points, and what they value in a solution.

            Based on this Product Dossier:
            {full_research_dossier[:4000]}

            Return ONLY valid JSON with exactly these keys:
            - "name": a realistic first and last name (e.g. "Sarah Chen", "Marcus Rodriguez") — NOT a placeholder
            - "gender": either "male" or "female"
            - "role": their job title or role
            - "background": 1-2 sentences about their background
            - "values": what they care most about

            Example: {{"name": "Priya Mehta", "gender": "female", "role": "Senior Product Manager", "background": "10 years in B2B SaaS, frustrated with manual reporting.", "values": "Efficiency and clear ROI"}}
            """
            ctx_res, _ = await self._llm.generate(ctx_prompt, temperature=0.8)
            try:
                # Clean up the response if it has markdown blocks
                clean_json = ctx_res.strip()
                if "```json" in clean_json:
                    clean_json = clean_json.split("```json")[1].split("```")[0].strip()
                elif "```" in clean_json:
                    clean_json = clean_json.split("```")[1].strip()

                ctx_data = json.loads(clean_json)
                # Ensure name field is present and meaningful
                if not ctx_data.get("name") or ctx_data["name"].startswith("User_"):
                    ctx_data["name"] = ctx_data.get("full_name") or ctx_data.get("persona_name") or f"{archetype} Respondent"
            except Exception:
                ctx_data = {"name": f"{archetype} Respondent", "role": archetype, "background": "Unknown", "values": "Efficiency"}

            user = SyntheticUser(
                name=ctx_data.get("name", "User"),
                archetype=archetype,
                ocean=self._generate_ocean_profile(archetype),
                context=ctx_data
            )

            # 3. Conduct the interview
            system = (
                f"Identity: {user.bio()}\n"
                "You are participating in a deep-dive interview about a new product idea and its technical/market research. "
                "You have been shown the vision, the market data, and even the proposed UX/UI prototypes. "
                "Be authentic to your persona. If you are a skeptic, challenge the assumptions in the research. "
                "If you are an industry veteran, comment on the market fit and competitor gaps. "
                "Keep your response visceral and honest. 2-3 short, impactful paragraphs."
            )
            msg = f"Give me your honest, visceral reaction to this entire product dossier: {full_research_dossier[:5000]}"
            
            # Use our centralized LLM provider for streaming the response
            full_response = ""
            async for chunk, _ in self._llm.stream(msg, system_prompt=system):
                full_response += chunk
                # Yield a partial update for the UI
                yield {
                    "user": user.model_dump(),
                    "chunk": chunk,
                    "is_complete": False
                }
            
            yield {
                "user": user.model_dump(),
                "response": full_response,
                "is_complete": True
            }
            interview_responses.append(
                f"### {ctx_data.get('name', archetype)} ({archetype})\n{full_response}"
            )
            # Small delay between interviews for dramatic effect and rate limiting
            await asyncio.sleep(1)

        # 4. Generate synthesis report from all interview responses
        combined_responses = "\n\n---\n\n".join(interview_responses)
        report_prompt = f"""
You are a senior market research analyst. You have just completed {len(archetypes)} in-depth customer interviews for the following product:

{full_research_dossier[:2000]}

Here are the interview transcripts:

{combined_responses[:6000]}

Write a comprehensive synthesis report in Markdown covering:
1. **Overall Market Signal** — a 0–100 score with a one-line verdict
2. **Key Themes** — the 3–5 most recurring ideas across interviews
3. **Critical Objections** — deal-breakers or concerns raised by multiple interviewees
4. **Surprising Insights** — unexpected findings or edge cases worth exploring
5. **Archetype Breakdown** — brief summary of each archetype's stance (positive / neutral / negative)
6. **Recommended Next Steps** — concrete actions the founder should take

Be direct, opinionated, and data-driven. Back every claim with evidence from the transcripts.
"""
        report_text = ""
        async for chunk, _ in self._llm.stream(report_prompt):
            report_text += chunk
            yield {
                "report_chunk": chunk,
                "is_report": True,
                "is_complete": False,
            }

        yield {
            "report": report_text,
            "is_report": True,
            "is_complete": True,
        }

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
