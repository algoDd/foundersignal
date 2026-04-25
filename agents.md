# Agent Guidelines & Development Process

This document provides the standard operating procedures and technical guidelines for AI agents working on this project.

## Core Tech Stack

*   **Language**: Python
*   **Package Manager & Environment**: `uv`
*   **Backend Framework**: `FastAPI`

Whenever building server components, you must adhere strictly to this stack. Use `uv` for lightning-fast dependency management and virtual environments. Use `FastAPI` for building robust, high-performance APIs.

## Hackathon Alignment

**CRITICAL**: Every time you start a new task, design a feature, or make an architectural decision, you MUST refer to `big_hack_hackthon.md`. 
*   Ask yourself: *Does this feature help us win the target track?*
*   Ask yourself: *Are we utilizing at least 3 required partner technologies?*
*   Ask yourself: *Can this be easily demonstrated in a 2-minute video?*

## Development Process

1.  **Understand Context**: Before making changes, read the relevant context, recent files, and `big_hack_hackthon.md`.
2.  **Environment Management**: 
    *   Use `uv venv` to create virtual environments.
    *   Use `uv pip install <package>` or `uv add <package>` for adding dependencies.
    *   Ensure `pyproject.toml` or `requirements.txt` is updated accordingly.
3.  **FastAPI Best Practices**:
    *   Use Pydantic models for request/response validation.
    *   Keep route handlers clean; delegate business logic to separate modules or services.
    *   Implement proper error handling and return appropriate HTTP status codes.
    *   Document endpoints using FastAPI's built-in OpenAPI/Swagger UI capabilities.
4.  **Documentation & Readability**:
    *   Keep code modular and well-documented.
    *   Remember that part of the judging criteria is a comprehensive README and API documentation. Ensure every new endpoint or major component is documented.
5.  **Security**:
    *   Do not hardcode API keys or secrets. Use environment variables (`.env` files parsed via `pydantic-settings` or `os.getenv`).
    *   Ensure the code is secure, keeping in mind the Aikido side-challenge for the "Most Secure Build".
6. **Development Rules** : 
    *   Try to use Lovable for frontend development.
    *   Always use Python for backend development.
    *   Always use uv for dependency management.
    *   Always use FastAPI for backend development.
    *   Always use Pydantic for request/response validation.
    * Keep linting and formating in mind, it would be good for the product.
    * Create update makefile with all the standard commands like make dev, make test, make build, make run, make clean
    * Create update README.md with all the standard information.
    * Create update .gitignore with all the standard information.
    * Create update CHANGELOG.md with all the standard information.
    * Develop things in modular way. Keep the code clean, simple, modular and well-documented. The single function should not have complexity of more than 20 conditional statements.
    * The code should be self-documenting. Avoid deeply nested structures.
    * Avoid over-engineering. Keep the code simple and focused on the problem we are trying to solve.
    * Always build things which can be easily tested on local but is ready to getting deployed and a guide to deployment in production too.
