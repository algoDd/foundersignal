# FounderSignal 🚀

**AI-powered startup idea validation platform** — Enter a raw idea, get a complete validation report powered by 8 specialist AI agents.

[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green.svg)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What It Does

A founder enters a raw startup idea, and FounderSignal runs a **multi-agent AI pipeline** that generates:

- ✅ **Problem Statement** — refined, structured concept
- 📊 **Market Research** — TAM, trends, growth data (via Tavily real-time search)
- 🏢 **Competitor Analysis** — feature comparison, positioning gaps
- 👥 **Target Audience** — personas, JTBD, behavioral patterns
- 🎨 **UX Flow** — user journey, screen definitions, feature priorities
- 🖼️ **UI Design Spec** — design tokens, component specs, frontend prompt
- 🔍 **AI Search Visibility** — how the idea appears in ChatGPT/Perplexity (Peec AI)
- 📈 **Validation Score** — composite score with Go/Pivot/No-go verdict
- 🎬 **Dashboard Video** — animated infographic (Hera Video)

## Architecture

```
User Input → Orchestrator Agent
                ├── 1. Idea Refinement Agent (Gemini)
                ├── 2. Market Research Agent (Tavily + Gemini) ─┐
                ├── 3. Competitor Research Agent (Tavily + Gemini) ├─ parallel
                ├── 4. Target Audience Agent (Gemini) ───────────┘
                ├── 5. UX Flow Agent (Gemini)
                ├── 6. UI Spec Agent (Gemini)
                ├── 7. AI Visibility Agent (Peec AI + Gemini) ─┐
                ├── 8. Validation Scoring Agent (Gemini) ──────┘─ parallel
                └── 9. Dashboard Video (Hera) ── async
```

## Quick Start

### Prerequisites
- Python 3.12+
- [uv](https://docs.astral.sh/uv/) package manager

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/foundersignal.git
cd foundersignal

# Install dependencies
make install

# Configure API keys
cp .env.example .env
# Edit .env with your API keys (see INTEGRATIONS.md)

# Start the dev server
make dev
```

The API will be running at `http://localhost:8000`.

### API Documentation

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### Try It

```bash
curl -X POST http://localhost:8000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "idea": "An AI-powered platform that helps first-time founders validate their startup ideas by generating market research, competitor analysis, and product specs",
    "target_region": "Global",
    "industry": "SaaS / Developer Tools",
    "business_model": "freemium"
  }'
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Health check + service status |
| `POST` | `/api/v1/analyze` | Run full idea validation pipeline |
| `GET` | `/api/v1/video/{id}` | Check Hera video status |

## Project Structure

```
foundersignal/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── config.py             # Pydantic Settings
│   ├── models/schemas.py     # All Pydantic models
│   ├── agents/               # AI agent framework
│   │   ├── base.py           # BaseAgent ABC
│   │   ├── orchestrator.py   # Pipeline coordinator
│   │   ├── idea_refinement.py
│   │   ├── market_research.py
│   │   ├── competitor_research.py
│   │   ├── target_audience.py
│   │   ├── ux_flow.py
│   │   ├── ui_spec.py
│   │   ├── ai_visibility.py
│   │   └── validation_scoring.py
│   ├── services/             # External integrations
│   │   ├── llm/              # LLM-agnostic provider layer
│   │   │   ├── base.py       # BaseLLMProvider ABC
│   │   │   └── gemini_provider.py
│   │   ├── tavily_service.py
│   │   ├── hera_service.py
│   │   └── peec_service.py
│   └── routes/               # API endpoints
│       ├── health.py
│       ├── analyze.py
│       └── video.py
├── tests/
├── .env.example
├── pyproject.toml
├── Makefile
├── INTEGRATIONS.md
└── CHANGELOG.md
```

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Language | Python 3.12+ |
| Framework | FastAPI |
| Package Manager | uv |
| LLM | Google Gemini (agent-agnostic layer) |
| Search | Tavily |
| Video | Hera Video |
| AI Visibility | Peec AI |
| Validation | Pydantic |
| Linting | Ruff |
| Testing | Pytest |

## Customer Evaluation Module (Synthetic Auditor)

This repository contains the **Synthetic Auditor**, a powerful tool designed to evaluate new product ideas by simulating customer feedback using a cohort of AI-generated synthetic personas. It provides a FastAPI endpoint and a CLI for interaction.

The core idea is to quickly and automatically test a product concept against a diverse set of potential users, identifying key objections, surprising insights, and potential market fit before investing significant development resources.

### Business Logic & Workflow

The application follows a multi-step pipeline orchestrated by a state graph:

1.  **Input**: The process starts with a **product idea**, which can be provided as a simple string or in a text/markdown file.

2.  **Strategist Node**: The system first analyzes the product idea to determine the most critical demographic and psychographic variables to test. For example, for a fintech app, it might identify variables like "tech_literacy", "disposable_income", and "privacy_concern".

3.  **Persona Strategist Node**: Based on the product, it then identifies a set of diverse user **archetypes** to interview. This ensures a wide range of perspectives, from "Tech-Savvy Early Adopters" to "Skeptical IT Managers" and "Privacy-Concerned Users".

4.  **Persona Factory Node**: The system generates a cohort of synthetic users. Each user is a unique entity with:
    *   A name and archetype.
    *   An OCEAN personality profile (Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism).
    *   A detailed, nuanced personal context and background relevant to the product idea.

5.  **Simulation Node**: The application runs simulated interviews in parallel with each synthetic user. Each user is presented with the product idea and prompted to give their honest, visceral reaction. The AI is instructed to be authentic, meaning users with skeptical or disagreeable personality traits will provide harsh and critical feedback if it's in character.

6.  **Save Interviews Node**: The raw results of each interview are saved to a timestamped JSON file in the `interviews/` directory. This file contains the customer's profile and their full response.

7.  **Audit Node**: Finally, the system synthesizes all the feedback into a final **Synthetic Audit Report**. This report includes:
    *   A **Market Fit Score** (0-100).
    *   A list of **Key Objections** or "Deal Breakers".
    *   **Surprising Insights** and edge cases.
    *   A **Recommended Pivot** for the product idea.

### Output Directories

After an audit is complete, the following directories will contain the results:

*   `outputs/`: Contains JSON files with the detailed profiles of all generated personas.
*   `interviews/`: Contains JSON files with the detailed results of each interview, including the persona and their response.
*   `reports/`: Contains markdown files of the final, synthesized audit report.

### Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes.

#### Prerequisites

*   [Python 3.12+](https://www.python.org/downloads/)
*   [uv](https://github.com/astral-sh/uv) - A fast Python package installer and resolver.

#### Installation

1.  **Clone the repository:**
    ```sh
    git clone <repository-url>
    cd customer-evaluation-module
    ```

2.  **Create a virtual environment and install dependencies:**
    This project uses `uv` to manage dependencies.
    ```sh
    uv sync
    ```
    This will install all the dependencies listed in `pyproject.toml` into a local `.venv` directory.

### Usage

You can interact with the Customer Evaluation Module via the API or the CLI. Before running, ensure you have your Google API key set in a `.env` file:
```
GOOGLE_API_KEY="your-api-key-here"
```

#### API

To run the API server, use the following command:

```sh
uv run python auditor.py --serve
```

This will start a local server, typically on `http://127.0.0.1:8000`.

You can now send requests to the API.

**Example `POST /audit` request:**

You can post a product idea as a string or upload a file. The API will return a JSON response containing the final audit report and the detailed customer feedback.

```sh
curl -X POST -F "file=@/path/to/your/idea.md" http://127.0.0.1:8000/audit
```

#### CLI

To use the module from the command line, you can pass a file path or the idea as a string.

**Run with a file:**

```sh
uv run python auditor.py --file sample_idea.md
```

This will read the content of `sample_idea.md`, run the full audit process, and save the generated artifacts in the `outputs`, `interviews`, and `reports` directories.

**Run with a string:**
```sh
uv run python auditor.py --idea "A new social media app for sharing dreams."
```

## Development

```bash
make help      # Show all commands
make dev       # Dev server with hot reload
make test      # Run tests
make lint      # Check code quality
make format    # Auto-format code
make clean     # Remove build artifacts
```

## License

MIT

---

Built for the **Big Berlin Hackathon** 🇩🇪
