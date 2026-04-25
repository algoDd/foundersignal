# Big Berlin Hackathon - Strategy & Guidelines

This document serves as the ultimate guide for agents building products for the Big Berlin Hackathon. It outlines the constraints, available technologies, and tracks to maximize the chances of winning the >€50k prize pool.

**CRITICAL RULE FOR ALL AGENTS**: Whenever you are building, making architectural decisions, or choosing what to build next, you MUST refer to this document to ensure alignment with hackathon constraints and to maximize our chances of winning.

## 1. Mandatory Constraints (Failure to follow = Disqualification)

*   **Team Size**: Maximum 5 people.
*   **Partner Technologies**: You **MUST** use a minimum of **3** partner technologies (listed below).
*   **Originality**: The project must be newly created at this hackathon (boilerplates are allowed).
*   **Submission Deadline**: Sunday at 14:00.

## 2. Submission Requirements
When preparing the final submission, ensure we have:
1.  **2-minute video demo** (Loom or equivalent) with a live walkthrough and detailed explanation.
2.  **Public GitHub Repository** containing:
    *   Source code.
    *   Comprehensive README (setup & installation instructions).
    *   Clear documentation of all APIs, frameworks, and tools utilized.
    *   Sufficient technical documentation to enable thorough jury evaluation.

## 3. Technology Partners (MUST USE MINIMUM 3)

Integrate at least three of the following to qualify and earn bonus points:

1.  **Google Deepmind**: Frontier Multimodal AI Models (Gemini).
2.  **Tavily**: Real-time search, extraction, research, and web crawling API.
3.  **Lovable**: AI app/website builder.
4.  **Gradium**: Voice AI models for realtime interactions.
5.  **Entire**: Developer platform for agent-human collaboration.
6.  **Pioneer by Fastino**: Models that train themselves (Fine-tuning, synthetic data, GLiNER2).
    *   *Note: Aikido is a partner but does NOT count towards the minimum 3.*

## 4. Tracks (Choose one to target)

When deciding on the product, align strongly with one of these tracks:

*   **Buena (€2500)**: *The Context Engine*. Build an engine that produces a single Context Markdown File per property. It must handle unstructured data (ERPs, Gmail, PDFs), resolve identities, surgically update context without destroying human edits, and filter noise.
*   **Qontext (Gold bar + dinner)**: *Turn fragmented company data into a context base*. Build a virtual file system and graph from simulated enterprise data (email, CRM, HR, docs) that AI can operate on and humans can inspect.
*   **Inca (AirPod Pros)**: *The Human Test*. Voice agent for inbound claim calls that convinces the caller it's human (>50% pass rate). Must produce complete call docs and handle background noise.
*   **Hera (AirPod Pros)**: *AI Agents for Video Generation*. Creative agent that generates video/images with a specific goal and editorial opinions (e.g., viral product launch, engaging social content).
*   **Peec AI (€2500)**: *0 -> 1 AI Marketer*. Use Peec AI MCP to help early-stage brands win distribution against bigger competitors (e.g., Nothing vs Apple).
*   **Reonic (€2501)**: *AI Renewable Designer*. AI solution that generates renewable energy system designs (PV, battery, heat pumps) for residential customers based on basic inputs.
*   **telli & ai-coustics (Bose Headphones)**: *Voice AI in the wild*. Real-time voice interface using ai-coustics SDK that works under heavy background noise (e.g., fitness coach with loud music).
*   **Wildcard (Finalist Stage)**: Build whatever you want.

## 5. Side Challenges (Stack for extra prizes)
Try to hit these on top of your main track:
*   **Fastino**: Best use of Pioneer (Fine-tuning, synthetic data, GLiNER2). Prize: Mac Mini value (700€).
*   **Aikido**: Most Secure Build. Connect repo to Aikido and show zero/minimal vulnerabilities. Prize: 1000€.
*   **Gradium**: Best use of Gradium. Prize: 900k credits + Goodie Bag.
*   **Entire**: Best use of Entire. Prize: $1k Apple gift cards, Switch 2, PS5, Xbox.

## 6. How to Win (Strategy)
1.  **Pick a Track with clear, objective criteria** (e.g., Inca's >50% human pass rate) OR go for high-value tracks (Buena, Qontext, Peec AI, Reonic).
2.  **Stack Technologies**: Use Gemini (Deepmind) + Tavily + Entire/Pioneer/Lovable to easily hit the 3-tech minimum.
3.  **Prioritize the Demo**: The 2-minute video and live 5-minute presentation are everything. The UI/UX must look polished, and the core value prop must be immediately obvious.
4.  **Security First**: Hook up Aikido early. It's free money if your code is clean and you can easily secure the "Most Secure Build" prize.
