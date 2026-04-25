import asyncio
import time
import logging
import random

from google import genai
from google.genai import types
from google.genai.errors import ClientError

from app.services.llm.base import BaseLLMProvider

logger = logging.getLogger("foundersignal.llm.gemini")


class GeminiProvider(BaseLLMProvider):
    """Google Gemini provider using the google-genai SDK."""

    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            msg = "GEMINI_API_KEY is required. Get one from https://aistudio.google.com/"
            raise ValueError(msg)
        self._client = genai.Client(api_key=api_key)
        self._model = model
        logger.info("Gemini provider ready — model: %s", model)

    async def generate(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 8192,
    ) -> tuple[str, int]:
        """Generate text using Gemini."""
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        if system_prompt:
            config.system_instruction = system_prompt

        max_retries = 5
        retry_delay = 2
        for i in range(max_retries):
            try:
                response = self._client.models.generate_content(
                    model=self._model,
                    contents=prompt,
                    config=config,
                )
                tokens = response.usage_metadata.total_token_count if response.usage_metadata else 0
                return response.text or "", tokens
            except ClientError as e:
                is_rate_limit = "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)
                if i < max_retries - 1 and is_rate_limit:
                    sleep_time = retry_delay + random.uniform(0, 1)
                    logger.warning("Gemini 429 hit, retrying in %.2fs... (Attempt %d/%d)", sleep_time, i+1, max_retries)
                    await asyncio.sleep(sleep_time)
                    retry_delay *= 2
                    continue
                raise e

    async def stream(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 8192,
    ):
        """Stream text using Gemini."""
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        if system_prompt:
            config.system_instruction = system_prompt

        max_retries = 5
        retry_delay = 2
        for i in range(max_retries):
            try:
                response_stream = self._client.models.generate_content_stream(
                    model=self._model,
                    contents=prompt,
                    config=config,
                )
                for chunk in response_stream:
                    tokens = chunk.usage_metadata.total_token_count if chunk.usage_metadata else 0
                    yield chunk.text or "", tokens
                return # Success
            except ClientError as e:
                is_rate_limit = "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e)
                if i < max_retries - 1 and is_rate_limit:
                    sleep_time = retry_delay + random.uniform(0, 1)
                    logger.warning("Gemini 429 hit (stream), retrying in %.2fs... (Attempt %d/%d)", sleep_time, i+1, max_retries)
                    await asyncio.sleep(sleep_time)
                    retry_delay *= 2
                    continue
                raise e

    async def close(self) -> None:
        """No persistent connection to close for Gemini REST client."""
