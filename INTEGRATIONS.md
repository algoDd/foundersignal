# FounderSignal — Integration Requirements

This document lists every external service integration, what it does in FounderSignal, and how to obtain API keys.

## Quick Setup

```bash
cp .env.example .env
# Fill in your API keys in .env
```

---

## Required (Core — App won't function without these)

### 1. Google Gemini (DeepMind)

| | |
|---|---|
| **Role** | Core LLM for all 8 specialist agents — idea refinement, market synthesis, scoring |
| **Hackathon Tech** | ✅ Counts toward 3-tech minimum |
| **Get API Key** | [Google AI Studio](https://aistudio.google.com/) |
| **Env Variable** | `GEMINI_API_KEY` |
| **Python Package** | `google-genai` |
| **Documentation** | [ai.google.dev/gemini-api](https://ai.google.dev/gemini-api) |

### 2. Tavily

| | |
|---|---|
| **Role** | Real-time web search for Market Research + Competitor Research agents |
| **Hackathon Tech** | ✅ Counts toward 3-tech minimum |
| **Get API Key** | [Tavily Dashboard](https://app.tavily.com/) |
| **Env Variable** | `TAVILY_API_KEY` |
| **Python Package** | `tavily-python` |
| **Documentation** | [docs.tavily.com](https://docs.tavily.com) |

---

## Optional (Graceful fallback if missing)

### 3. Hera Video

| | |
|---|---|
| **Role** | Dashboard infographic video generation — animated validation report visuals |
| **Hackathon Tech** | Bonus points (Hera track) |
| **Get API Key** | [Contact Hera team](https://tally.so/r/3N1eRj) or [API Docs](https://docs.hera.video) |
| **Env Variable** | `HERA_API_KEY` |
| **API Base URL** | `https://api.hera.video/v1` |
| **Endpoints Used** | `POST /videos`, `GET /videos/{id}` |

### 4. Peec AI

| | |
|---|---|
| **Role** | AI search visibility analysis — how the startup idea appears in ChatGPT, Perplexity, etc. |
| **Hackathon Tech** | Bonus points (Peec AI track) |
| **Get API Key** | [Peec AI Dashboard](https://app.peec.ai/api-keys) |
| **Env Variable** | `PEEC_API_KEY` |
| **API Base URL** | `https://api.peec.ai` |
| **Fallback** | If missing, AI Visibility Agent uses Gemini simulation |


---

## Hackathon Technology Scorecard

| Technology | Partner? | Counts toward 3? | Integrated? |
|---|---|---|---|
| Google Gemini (DeepMind) | ✅ | ✅ | ✅ Core LLM |
| Tavily | ✅ | ✅ | ✅ Market + Competitor research |
| Lovable | ✅ | ✅ | ✅ Frontend builder |
| Hera | Bonus | No | ✅ Dashboard video |
| Peec AI | Bonus | No | ✅ AI visibility |
| **Total qualifying** | | **3** (Gemini + Tavily + Lovable) | |
