import argparse
import asyncio
import datetime
import json
import os
import random
from typing import Annotated, Any, Dict, List, TypedDict

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

# --- 1. SCHEMAS & MODELS ---


class OceanProfile(BaseModel):
    openness: float = Field(ge=0, le=1)
    conscientiousness: float = Field(ge=0, le=1)
    extraversion: float = Field(ge=0, le=1)
    agreeableness: float = Field(ge=0, le=1)
    neuroticism: float = Field(ge=0, le=1)


class SyntheticUser(BaseModel):
    name: str
    ocean: OceanProfile
    context: Dict[str, Any]

    def bio(self) -> str:
        ctx_str = ", ".join(
            [f"{k.replace('_', ' ').title()}: {v}" for k, v in self.context.items()]
        )
        return f"{self.name} | {ctx_str} | OCEAN: {self.ocean.model_dump()}"


class InterviewResult(TypedDict):
    customer_info: Dict[str, Any] 
    response: str


class State(TypedDict):
    product_idea: str
    target_variables: List[str]
    archetypes: List[str]
    cohort: List[SyntheticUser]
    interview_results: List[InterviewResult]
    raw_feedbacks: Annotated[List[str], lambda x, y: x + y]  # Appends list items
    final_audit: str


# --- 2. THE ENGINE ---

# Initialize LLM (Ensure GOOGLE_API_KEY is in your env)
load_dotenv()
llm = ChatGoogleGenerativeAI(model="gemini-2.5-pro", temperature=0.7)


def strategist_node(state: State):
    """Analyzes product to decide who we should interview."""
    print(f"[*] Analyzing product: {state['product_idea'][:50]}...")
    prompt = f"""
    Product: {state["product_idea"]}
    Identify a minimum of {DEMOGRAPHIC_SIZE} most critical demographic/psychographic variables to test for this specific product.
    Return ONLY a JSON list of strings, with NO markdown formatting, NO backticks, and NO extra text. Example: ["age", "tech_literacy", "disposable_income", "privacy_concern"]
    """
    res = llm.invoke(prompt)
    content = res.content
    if content.startswith("```json"):
        content = content[7:]
    if content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]
    content = content.strip()
    vars = json.loads(content)
    return {"target_variables": vars}


def persona_strategist_node(state: State):
    """Determines the most relevant archetypes for the product."""
    print("[*] Determining best-fit archetypes for the product...")
    prompt = f"""
    Based on the product idea: '{state["product_idea"]}', identify the {COHORT_SIZE} most critical and diverse user archetypes to interview.

    Consider the user base, potential stakeholders, and critics.
    Examples of archetypes: "Early Adopter," "Skeptical Professional," "Privacy-Concerned User," "Non-Technical User," "Budget-Conscious Student," "Power User," "Accessibility Advocate," "System Administrator," "Rival Company Analyst," etc.

    Return ONLY a JSON list of strings with the {COHORT_SIZE} archetype names.
    Example: ["Tech-Savvy Early Adopter", "Skeptical IT Manager", "Busy Working Parent", "University Student", "Data Privacy Advocate"]
    """
    res = llm.invoke(prompt)
    content = res.content.strip()
    if content.startswith("```json"):
        content = content[7:-3].strip()

    archetypes = json.loads(content)
    print(f"[*] Archetypes identified: {archetypes}")
    return {"archetypes": archetypes}


COHORT_SIZE = 5
DEMOGRAPHIC_SIZE = 5
TOTAL_CUSTOMERS = 100


def persona_factory_node(state: State):
    """Generates a diverse cohort based on the dynamically selected archetypes."""
    print(
        f"[*] Generating synthetic cohort of {TOTAL_CUSTOMERS} customers across {len(state['archetypes'])} archetypes..."
    )
    os.makedirs("personas", exist_ok=True)
    cohort = []

    # Evenly distribute customers across archetypes
    customers_per_archetype = TOTAL_CUSTOMERS // len(state["archetypes"])
    remainder = TOTAL_CUSTOMERS % len(state["archetypes"])
    distribution = [customers_per_archetype] * len(state["archetypes"])
    for i in range(remainder):
        distribution[i] += 1

    customer_count = 0
    for i, archetype_name in enumerate(state["archetypes"]):
        num_customers_for_archetype = distribution[i]
        print(
            f"  -> Generating {num_customers_for_archetype} customers for archetype: {archetype_name}..."
        )

        for j in range(num_customers_for_archetype):
            customer_count += 1
            print(
                f"    -> Generating customer {customer_count}/{TOTAL_CUSTOMERS} (Archetype: {archetype_name})..."
            )

            # Set OCEAN scores with more variance
            ocean_params = {
                "openness": random.uniform(0.2, 0.8),
                "conscientiousness": random.uniform(0.2, 0.8),
                "extraversion": random.uniform(0.2, 0.8),
                "agreeableness": random.uniform(0.2, 0.8),
                "neuroticism": random.uniform(0.2, 0.8),
            }
            if "skeptic" in archetype_name.lower():
                ocean_params["agreeableness"] = random.uniform(0.1, 0.4)
                ocean_params["openness"] = random.uniform(0.1, 0.4)
            if (
                "enthusiast" in archetype_name.lower()
                or "early adopter" in archetype_name.lower()
            ):
                ocean_params["openness"] = random.uniform(0.7, 1.0)
                ocean_params["extraversion"] = random.uniform(0.7, 1.0)
            if (
                "pragmatist" in archetype_name.lower()
                or "professional" in archetype_name.lower()
            ):
                ocean_params["conscientiousness"] = random.uniform(0.7, 1.0)

            # Add more dynamic, randomized context
            moods = ["curious", "impatient", "distracted", "focused", "cautious"]
            current_mood = random.choice(moods)

            # Create a more detailed context prompt
            ctx_prompt = f"""
            Create a unique and detailed person profile for the following demographic/psychographic variables: {state["target_variables"]}.
            The product idea is: '{state["product_idea"]}'.

            This persona MUST embody the archetype: '{archetype_name}'.
            However, DO NOT be stereotypical. Create a believable, nuanced individual.
            For example, not all 'Skeptical Professionals' are the same. Give this one a unique background, a specific job, and personal values that make them fit this archetype in their own way.
            This person is currently feeling: {current_mood}. This might slightly influence their initial reaction.

            Provide specific, imagined details about their life, job, and values.
            For example, if the archetype is 'Privacy-Concerned User', describe their specific privacy concerns and past experiences that led to them.

            Return ONLY valid JSON, with no markdown formatting.
            """
            res = llm.invoke(ctx_prompt).content
            if res.startswith("```json"):
                res = res[7:]
            if res.startswith("```"):
                res = res[3:]
            if res.endswith("```"):
                res = res[:-3]
            res = res.strip()
            ctx_data = json.loads(res)
            ctx_data["mood"] = current_mood  # Add mood to the context
            print(f"       Customer {customer_count} generated.")

            user = SyntheticUser(
                name=f"{archetype_name.replace(' ', '_')}_{j}",
                ocean=OceanProfile(**ocean_params),
                context=ctx_data,
            )
            cohort.append(user)

    return {"cohort": cohort}


def save_personas_node(state: State):
    """Saves all generated personas to a single JSON file."""
    print("[*] Saving all personas to a single file...")
    os.makedirs("outputs", exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = os.path.join("outputs", f"idea_{timestamp}.json")

    # Convert cohort of Pydantic models to a list of dicts
    cohort_data = [user.model_dump() for user in state["cohort"]]

    with open(file_path, "w") as f:
        json.dump(cohort_data, f, indent=2)

    print(f"[*] All {len(state['cohort'])} personas saved to {file_path}")
    return state



async def simulation_node(state: State):
    """Simulates parallel interviews with the cohort."""
    print(f"[*] Running {len(state['cohort'])} interviews in parallel...")

    async def interview(user: SyntheticUser) -> InterviewResult:
        print(f"  -> Starting interview with {user.name}...")
        # The 'Adversarial' Prompting
        system = f"""
        Identity: {user.bio()}
        You are participating in a blind market test.
        CRITICAL: Be authentic. If your personality or context suggests you would dislike this, BE HARSH.
        If your Agreeableness is low, look for 'deal-breakers'.
        """
        msg = f"Give me your honest, visceral reaction to this idea: {state['product_idea']}"
        res = await llm.ainvoke(
            [SystemMessage(content=system), HumanMessage(content=msg)]
        )
        print(f"     Finished interview with {user.name}.")
        return {"customer_info": user.model_dump(), "response": res.content}

    tasks = [interview(u) for u in state["cohort"]]
    interview_results = await asyncio.gather(*tasks)
    raw_feedbacks = [
        f"--- {result['customer_info']['name']} ---\n{result['response']}"
        for result in interview_results
    ]

    return {"interview_results": interview_results, "raw_feedbacks": raw_feedbacks}


def audit_node(state: State):
    """Final synthesis of the data."""
    print("[*] Synthesizing final audit report...")
    combined = "\n\n".join(state["raw_feedbacks"])
    prompt = f"""
    You are 'The Synthetic Auditor'.
    Analyze these feedback transcripts for the product: {state["product_idea"]}

    Transcripts:
    {combined}

    Provide:
    1. MARKET FIT SCORE (0-100)
    2. KEY OBJECTIONS (The 'Deal Breakers')
    3. SURPRISING INSIGHTS (Edge cases)
    4. RECOMMENDED PIVOT
    """
    res = llm.invoke(prompt)

    # Save the report
    os.makedirs("reports", exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = os.path.join("reports", f"audit_report_{timestamp}.md")

    report_content = f"# Synthetic Audit Report\n\n**Product Idea:** {state['product_idea']}\n\n## Personas Generated\n"
    for user in state["cohort"]:
        report_content += f"- **{user.name}**: {user.bio()}\n"

    report_content += f"\n## Audit Findings\n{res.content}\n"

    with open(report_path, "w") as f:
        f.write(report_content)

    print(f"[*] Audit report saved to {report_path}")

    return {"final_audit": res.content}


def save_interviews_node(state: State):
    """Saves all interview results to a single JSON file."""
    print("[*] Saving all interview results to a single file...")
    os.makedirs("interviews", exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    file_path = os.path.join("interviews", f"interviews_{timestamp}.json")

    with open(file_path, "w") as f:
        json.dump(state["interview_results"], f, indent=2)

    print(f"[*] All {len(state['interview_results'])} interviews saved to {file_path}")
    return {}


# --- 3. THE GRAPH ---

builder = StateGraph(State)
builder.add_node("strategist", strategist_node)
builder.add_node("persona_strategist", persona_strategist_node)
builder.add_node("factory", persona_factory_node)
builder.add_node("save_personas", save_personas_node)
builder.add_node("simulate", simulation_node)
builder.add_node("save_interviews", save_interviews_node)
builder.add_node("audit", audit_node)

builder.add_edge(START, "strategist")
builder.add_edge("strategist", "persona_strategist")
builder.add_edge("persona_strategist", "factory")
builder.add_edge("factory", "save_personas")
builder.add_edge("save_personas", "simulate")
builder.add_edge("simulate", "save_interviews")
builder.add_edge("save_interviews", "audit")
builder.add_edge("audit", END)

app = builder.compile()

# --- 4. WRAPPER & API ---

fastapi_app = FastAPI(
    title="Synthetic Auditor API",
    description="Evaluates product ideas with synthetic personas",
)


async def run_audit(idea_text: str, total_customers: int = TOTAL_CUSTOMERS):
    """Awaits the given idea text and total number of customers to run the audit"""
    # Override TOTAL_CUSTOMERS if provided
    global TOTAL_CUSTOMERS
    TOTAL_CUSTOMERS = total_customers

    print(f"\n--- STARTING AUDIT ({TOTAL_CUSTOMERS} customers) ---")
    result = await app.ainvoke({"product_idea": idea_text, "raw_feedbacks": []})
    print("\n" + "=" * 50)
    print(result["final_audit"])
    return result


@fastapi_app.post("/audit")
async def audit_endpoint(
    product_idea: str = Form(None),
    file: UploadFile = File(None),
    total_customers: int = Form(TOTAL_CUSTOMERS),
):
    if file:
        content = await file.read()
        idea_text = content.decode("utf-8")
    elif product_idea:
        idea_text = product_idea
    else:
        raise HTTPException(
            status_code=400,
            detail="Must provide either product_idea text or a file upload",
        )

    result = await run_audit(idea_text, total_customers)

    customer_info_with_responses = []
    for interview in result.get("interview_results", []):
        customer_info = interview.get("customer_info", {})
        customer_info["interview_response"] = interview.get("response", "")
        customer_info_with_responses.append(customer_info)

    return {
        "status": "success",
        "report": result["final_audit"],
        "customer_info": customer_info_with_responses,
    }


# --- 5. EXECUTION ---

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the Synthetic Auditor")
    parser.add_argument("--serve", action="store_true", help="Start the FastAPI server")
    parser.add_argument(
        "--file",
        type=str,
        help="Path to a text/markdown file containing the product idea",
    )
    parser.add_argument("--idea", type=str, help="The product idea as a string")
    parser.add_argument(
        "--total-customers",
        type=int,
        default=TOTAL_CUSTOMERS,
        help="The total number of customers to generate for the audit.",
    )

    args = parser.parse_args()
    
    # Get the total number of customers from the command line arguments
    total_customers_arg = args.total_customers

    if args.serve:
        print("[*] Starting FastAPI server on port 8000...")
        # Note: total_customers from CLI is not directly used here,
        # but the endpoint '/audit' will accept it.
        uvicorn.run(fastapi_app, host="0.0.0.0", port=8000)
    elif args.file:
        with open(args.file, "r") as f:
            content = f.read()
        asyncio.run(run_audit(content, total_customers_arg))
    elif args.idea:
        asyncio.run(run_audit(args.idea, total_customers_arg))
    else:
        # Fallback to default test
        test_idea = "A mobile banking app where the 'Transfer Money' button is replaced by a Voice-Only command for security."
        print(f"[*] No arguments provided. Running default test: {test_idea}")
        asyncio.run(run_audit(test_idea, total_customers_arg))
