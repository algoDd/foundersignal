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
