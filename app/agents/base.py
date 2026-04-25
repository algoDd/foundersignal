"""Base Agent — Abstract foundation for all FounderSignal agents.

Every agent follows the same pattern:
  1. Has a `name` and `system_prompt`
  2. Uses the LLM provider (agent-agnostic)
  3. Implements `run()` which takes typed input and returns typed output
  4. Has built-in logging and error handling

To create a new agent:
  1. Subclass `BaseAgent`
  2. Set `name` and `system_prompt`
  3. Implement `run(self, **kwargs) -> YourOutputModel`
"""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from typing import Any, TypeVar

from pydantic import BaseModel

from app.services.llm.base import BaseLLMProvider, get_llm_provider

T = TypeVar("T", bound=BaseModel)

logger = logging.getLogger("foundersignal.agents")


class BaseAgent(ABC):
    """Abstract base class for all FounderSignal agents."""

    name: str = "base_agent"
    system_prompt: str = ""

    def __init__(self, llm: BaseLLMProvider | None = None) -> None:
        """Initialize the agent with an optional LLM provider.

        Args:
            llm: LLM provider instance. If None, uses the default from config.
        """
        self._llm = llm or get_llm_provider()
        self._logger = logging.getLogger(f"foundersignal.agents.{self.name}")
        self.tokens_used: int = 0
        self.searches: list[dict[str, Any]] = []

    def add_search(self, query: str, results_count: int, sources: list[str]) -> None:
        """Track a search conducted by the agent."""
        self.searches.append(
            {
                "query": query,
                "results_count": results_count,
                "sources": sources,
                "timestamp": time.time(),
            }
        )

    @abstractmethod
    async def run(self, **kwargs: Any) -> BaseModel:
        """Execute the agent's task.

        Each agent defines its own kwargs and return type.
        """
        ...

    async def generate_text(
        self,
        prompt: str,
        *,
        temperature: float = 0.7,
        max_tokens: int = 8192,
    ) -> str:
        """Generate raw text using the LLM.

        Args:
            prompt: The user prompt.
            temperature: Sampling temperature.
            max_tokens: Maximum output tokens.

        Returns:
            Generated text string.
        """
        self._logger.debug("Generating text — prompt length: %d", len(prompt))
        text, tokens = await self._llm.generate(
            prompt,
            system_prompt=self.system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        self.tokens_used += tokens
        return text

    async def stream_text(
        self,
        prompt: str,
        *,
        temperature: float = 0.7,
        max_tokens: int = 8192,
    ):
        """Stream raw text using the LLM.

        Yields:
            Text chunks as they arrive.
        """
        self._logger.debug("Streaming text — prompt length: %d", len(prompt))
        async for chunk, tokens in self._llm.stream(
            prompt,
            system_prompt=self.system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            self.tokens_used = tokens  # total_token_count so far
            yield chunk

    async def generate_structured(
        self,
        prompt: str,
        response_model: type[T],
        *,
        temperature: float = 0.4,
        max_tokens: int = 8192,
    ) -> T:
        """Generate a structured Pydantic object using the LLM.

        Args:
            prompt: The user prompt.
            response_model: Pydantic model class for the output.
            temperature: Sampling temperature (lower = more deterministic).
            max_tokens: Maximum output tokens.

        Returns:
            Parsed Pydantic model instance.
        """
        self._logger.debug("Generating structured output — model: %s", response_model.__name__)
        start = time.monotonic()
        result, tokens = await self._llm.generate_structured(
            prompt,
            response_model,
            system_prompt=self.system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        self.tokens_used += tokens
        elapsed = time.monotonic() - start
        self._logger.info(
            "Agent '%s' completed in %.1fs — output: %s",
            self.name,
            elapsed,
            response_model.__name__,
        )
        return result

    def build_context_block(self, **sections: str) -> str:
        """Helper to build a structured context block for prompts.

        Args:
            **sections: Named sections (e.g., idea="...", market="...").

        Returns:
            Formatted context string.
        """
        parts = []
        for key, value in sections.items():
            if value:
                label = key.replace("_", " ").title()
                parts.append(f"## {label}\n{value}")
        return "\n\n".join(parts)
