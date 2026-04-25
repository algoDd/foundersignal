import asyncio
import logging
import random

from openai import AsyncOpenAI
import openai

from app.services.llm.base import BaseLLMProvider

logger = logging.getLogger("foundersignal.llm.openai")


class OpenAIProvider(BaseLLMProvider):
    """OpenAI-compatible provider using the openai SDK."""

    def __init__(self, api_key: str, model: str, base_url: str | None = None) -> None:
        if not api_key:
            api_key = "dummy-key-for-local-models"
            
        kwargs = {"api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
            
        self._client = AsyncOpenAI(**kwargs)
        self._model = model
        logger.info("OpenAI provider ready — model: %s, base_url: %s", model, base_url)

    async def generate(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 8192,
    ) -> tuple[str, int]:
        """Generate text using OpenAI."""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        max_retries = 5
        retry_delay = 5
        for i in range(max_retries):
            try:
                response = await self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                
                text = response.choices[0].message.content or ""
                tokens = response.usage.total_tokens if response.usage else 0
                return text, tokens
            except openai.RateLimitError as e:
                if i < max_retries - 1:
                    sleep_time = retry_delay + random.uniform(0, 1)  # noqa: S311
                    logger.warning(
                        "OpenAI 429 hit, retrying in %.2fs... (Attempt %d/%d)",
                        sleep_time,
                        i + 1,
                        max_retries,
                    )
                    await asyncio.sleep(sleep_time)
                    retry_delay *= 2
                    continue
                logger.error("OpenAI error (generate): %s", e)
                raise
            except Exception as e:
                logger.error("OpenAI error (generate): %s", e)
                raise

        return "", 0

    async def stream(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 8192,
    ):
        """Stream text generation from OpenAI."""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        max_retries = 5
        retry_delay = 5
        for i in range(max_retries):
            try:
                response_stream = await self._client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    stream=True,
                )
                
                # Unfortunately OpenAI stream responses don't include token usage by default 
                # unless stream_options={"include_usage": True} is passed (if supported by backend).
                # We'll just yield 0 for tokens for now, or estimate.
                async for chunk in response_stream:
                    if chunk.choices and len(chunk.choices) > 0:
                        delta = chunk.choices[0].delta
                        if delta and delta.content:
                            yield delta.content, 0
                return
            except openai.RateLimitError as e:
                if i < max_retries - 1:
                    sleep_time = retry_delay + random.uniform(0, 1)  # noqa: S311
                    logger.warning(
                        "OpenAI 429 hit (stream), retrying in %.2fs... (Attempt %d/%d)",
                        sleep_time,
                        i + 1,
                        max_retries,
                    )
                    await asyncio.sleep(sleep_time)
                    retry_delay *= 2
                    continue
                logger.error("OpenAI error (stream): %s", e)
                raise
            except Exception as e:
                logger.error("OpenAI error (stream): %s", e)
                raise

    async def close(self) -> None:
        """Close OpenAI client."""
        await self._client.close()
