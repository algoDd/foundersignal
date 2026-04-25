"""LLM Provider — Abstract base and factory.

The agent layer never imports a specific LLM SDK directly.
Instead, it uses `get_llm_provider()` which returns an implementation
based on the `LLM_PROVIDER` env var.

To add a new provider:
  1. Create `app/services/llm/my_provider.py` implementing `BaseLLMProvider`
  2. Register it in `get_llm_provider()` below
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from typing import TypeVar

from pydantic import BaseModel

logger = logging.getLogger("foundersignal.llm")

T = TypeVar("T", bound=BaseModel)


class BaseLLMProvider(ABC):
    """Abstract interface that every LLM provider must implement."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 8192,
    ) -> tuple[str, int]:
        """Generate raw text from a prompt. Returns (text, token_count)."""
        ...

    @abstractmethod
    async def stream(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 8192,
    ):
        """Stream raw text from a prompt. Yields (chunk_text, token_count_so_far)."""
        ...

    async def generate_structured(
        self,
        prompt: str,
        response_model: type[T],
        *,
        system_prompt: str = "",
        temperature: float = 0.4,
        max_tokens: int = 8192,
    ) -> tuple[T, int]:
        """Generate a structured Pydantic object from a prompt.

        Default implementation: ask the LLM to respond in JSON matching
        the schema, then parse. Returns (parsed_object, token_count).
        """
        schema_json = json.dumps(response_model.model_json_schema(), indent=2)
        structured_prompt = (
            f"{prompt}\n\n"
            "IMPORTANT: You MUST return ONLY a raw JSON object containing the "
            "POPULATED DATA based on your analysis.\n"
            "DO NOT output the JSON schema itself. Use the schema below strictly to "
            "structure your resulting JSON data:\n"
            f"```json\n{schema_json}\n```\n"
            "Respond ONLY with the final JSON data. Do not include any other text."
        )
        raw, tokens = await self.generate(
            structured_prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        # Strip markdown fences if present
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            # Remove first and last fence lines
            lines = [ln for ln in lines if not ln.strip().startswith("```")]
            cleaned = "\n".join(lines)
        return response_model.model_validate_json(cleaned), tokens

    @abstractmethod
    async def close(self) -> None:
        """Clean up resources."""
        ...


# ---------------------------------------------------------------------------
# Provider cache (singleton per process)
# ---------------------------------------------------------------------------

_provider_instance: BaseLLMProvider | None = None


def get_llm_provider() -> BaseLLMProvider:
    """Factory — returns the configured LLM provider (cached)."""
    global _provider_instance  # noqa: PLW0603

    if _provider_instance is not None:
        return _provider_instance

    from app.config import get_settings

    settings = get_settings()
    provider_name = settings.llm_provider.lower()

    if provider_name == "gemini":
        from app.services.llm.gemini_provider import GeminiProvider

        _provider_instance = GeminiProvider(
            api_key=settings.gemini_api_key,
            model=settings.llm_model,
        )
    else:
        msg = (
            f"Unknown LLM provider: '{provider_name}'. Supported: gemini. Set LLM_PROVIDER in .env"
        )
        raise ValueError(msg)

    logger.info("LLM provider initialized: %s (model: %s)", provider_name, settings.llm_model)
    return _provider_instance


def reset_llm_provider() -> None:
    """Reset the cached provider (useful for testing)."""
    global _provider_instance  # noqa: PLW0603
    _provider_instance = None
