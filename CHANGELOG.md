# Changelog

All notable changes to FounderSignal will be documented in this file.

## [0.1.0] - 2026-04-25

### Added
- Initial project scaffolding with FastAPI + uv
- Multi-agent architecture with Orchestrator + 8 specialist agents
- LLM-agnostic provider layer (Gemini implementation)
- Tavily integration for real-time market & competitor research
- Hera Video integration for dashboard infographic generation
- Peec AI integration for AI search visibility analysis
- Qontext integration for knowledge base / context vault
- Full Pydantic model library for type-safe pipeline
- API endpoints: analyze, health, reports, video status
- Comprehensive documentation: README, INTEGRATIONS, CHANGELOG
- Makefile with standard dev commands

### Removed
- Qontext integration (knowledge base / context vault) as it's not currently available
- Gradium API configuration as it's not yet available
- `/api/v1/reports` endpoints
