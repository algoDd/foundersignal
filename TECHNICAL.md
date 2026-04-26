# Technical Reference

← [Back to README](README.md)

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

## Tech Stack

| Component       | Technology                        |
|-----------------|-----------------------------------|
| Language        | Python 3.12+                      |
| Framework       | FastAPI                           |
| Package Manager | uv                                |
| LLM             | Google Gemini                     |
| Search          | Tavily                            |
| Frontend        | React + TypeScript (Vite)         |
| Database        | Firebase / Firestore              |
| Auth            | Firebase Auth                     |
| Linting         | Ruff                              |
| Testing         | Pytest                            |

## Prerequisites

- Python 3.12+
- Node.js 18+
- [uv](https://docs.astral.sh/uv/) package manager

## Setup

```bash
# Clone the repo
git clone <repository-url>
cd customer-evaluation-module

# Backend — install dependencies
uv sync

# Frontend — install dependencies
cd frontend && npm install
```

## Configuration

Copy `.env.example` to `.env` and fill in your keys:

```
GOOGLE_API_KEY=
TAVILY_API_KEY=
FIREBASE_PROJECT_ID=
```

## Running Locally

```bash
# Backend API
uv run python auditor.py --serve
# → http://127.0.0.1:8000

# Frontend dev server
cd frontend && npm run dev
# → http://localhost:5173
```

## API Endpoints

| Method | Endpoint          | Description                        |
|--------|-------------------|------------------------------------|
| `GET`  | `/api/v1/health`  | Health check + service status      |
| `POST` | `/api/v1/analyze` | Run full validation pipeline       |
| `POST` | `/audit`          | Run synthetic customer audit       |
| `GET`  | `/api/v1/video/{id}` | Check video generation status   |

**Example request:**

```bash
curl -X POST http://localhost:8000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "idea": "A tool that helps product teams validate features before building them",
    "target_region": "Global",
    "industry": "SaaS",
    "business_model": "freemium"
  }'
```

## CLI Usage

```bash
# Run audit from a file
uv run python auditor.py --file sample_idea.md

# Run audit from a string
uv run python auditor.py --idea "A new social media app for sharing dreams."
```

## Output Directories

After an audit completes:

- `outputs/` — JSON files with generated persona profiles
- `interviews/` — JSON files with per-persona interview results
- `reports/` — Markdown files of the final synthesised audit report

## Project Structure

```
customer-evaluation-module/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── models/schemas.py
│   ├── agents/
│   │   ├── base.py
│   │   ├── orchestrator.py
│   │   ├── idea_refinement.py
│   │   ├── market_research.py
│   │   ├── competitor_research.py
│   │   ├── target_audience.py
│   │   ├── ux_flow.py
│   │   ├── ui_spec.py
│   │   ├── ai_visibility.py
│   │   └── validation_scoring.py
│   ├── services/
│   │   ├── llm/
│   │   │   ├── base.py
│   │   │   └── gemini_provider.py
│   │   ├── tavily_service.py
│   │   ├── hera_service.py
│   │   └── peec_service.py
│   └── routes/
│       ├── health.py
│       ├── analyze.py
│       └── video.py
├── frontend/
│   └── src/
├── auditor.py
├── pyproject.toml
├── .env.example
└── Makefile
```

## Makefile Commands

```bash
make help      # Show all commands
make dev       # Dev server with hot reload
make test      # Run tests
make lint      # Check code quality
make format    # Auto-format code
make clean     # Remove build artifacts
```
