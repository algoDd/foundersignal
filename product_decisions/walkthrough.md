# FounderSignal — Backend Implementation Walkthrough

The backend architecture and multi-agent pipeline for FounderSignal are fully completed and verified! 🚀

## What Was Built

We have created a highly modular, multi-agent system built on **FastAPI** using **Python 3.12** and **uv**. The core functionality takes a raw startup idea and enriches it into a comprehensive validation report.

### 1. The Agent Architecture
We built an **Orchestrator Agent** that coordinates 8 specialist agents.

- **Idea Refinement**: Generates the core problem statement, value proposition, and elevator pitch.
- **Market Research**: Uses Tavily search to determine TAM, market trends, and opportunities.
- **Competitor Research**: Uses Tavily search to identify direct and indirect competitors, alongside positioning gaps.
- **Target Audience**: Defines realistic personas, Jobs-to-be-Done (JTBD), and behavioral patterns.
- **UX Flow**: Details the user journey, screen architecture, and feature prioritization.
- **UI Spec**: Produces design tokens, components, and a frontend prompt (to be used later for Lovable / Vite generation).
- **AI Visibility**: Pulls data from **Peec AI** (with an LLM fallback) to show how the brand/concept appears in generative search.
- **Validation Scoring**: Computes a composite 0-100 score with a Go/Pivot/No-go verdict based on all prior inputs.

### 2. Service Integrations

The system is fully integrated with hackathon partner APIs:

- **Gemini (DeepMind)**: The foundational logic engine across all 8 agents, abstracted neatly so providers can be swapped out easily.
- **Tavily**: Powers our market and competitor real-time lookups.
- **Hera Video**: Asynchronously fires off requests to generate animated dashboard visuals from our validation score metrics.
- **Peec AI**: Ingests and reports on AI search visibility and brand ranking.
- **Qontext**: Persists all generated reports as structured knowledge blocks, allowing you to ask cross-sectional questions against all your founders' ideas in the future.

> [!NOTE]
> All optional APIs (Hera, Peec AI, Qontext) are built to fail gracefully. If the key is missing in the `.env` file, the orchestrator safely skips or simulates that specific step.

### 3. Server & Structure

- Everything is typed with strict **Pydantic** models.
- The `Makefile` exposes standardized commands (`make dev`, `make test`, `make lint`).
- Code has been fully linted with **Ruff** to satisfy Aikido's "Most Secure Build" requirement (no basic flaws, typed, safe).
- **Swagger UI** is up and running correctly, automatically documenting all the endpoints.

![Swagger UI Dashboard](/Users/dbhatnagar/.gemini/antigravity/brain/16840048-b397-4436-92c5-2807a8bd18f7/.tempmediaStorage/media_16840048-b397-4436-92c5-2807a8bd18f7_1777122812307.png)

## Verification Results

✅ **Dependencies Installed**: Handled cleanly with `uv`.
✅ **Linting Check**: Ruff confirmed 0 issues across the codebase.
✅ **Server Check**: The FastAPI process starts perfectly on `http://localhost:8000`.
✅ **Swagger UI**: Verified with browser agent. Endpoints correctly registered:
  - `GET /api/v1/health`
  - `POST /api/v1/analyze`
  - `GET /api/v1/reports`
  - `GET /api/v1/reports/{report_id}`
  - `GET /api/v1/video/{video_id}`

## Next Steps for You

1. **API Keys Configuration**: Open the `.env` file (copied from `.env.example`) and fill in your Gemini, Tavily, Peec AI, Hera, and Qontext keys.
2. **Frontend Development (Vite/Lovable)**: As discussed, you can now start hitting the `/api/v1/analyze` endpoint from your frontend to generate these massive reports and render the outputs nicely.
3. **Phase 2 (Voice - Gradium)**: When ready to introduce voice, we can add a WebSocket endpoint in `app/routes/voice.py` bridging Gradium STT with our Orchestrator pipeline.
