import asyncio
import logging
from functools import partial

from google import genai
from google.genai import types
from google.genai.errors import ClientError
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception

from app.services.llm.base import BaseLLMProvider

def is_rate_limit_error(exception):
    return isinstance(exception, ClientError) and ("429" in str(exception) or "RESOURCE_EXHAUSTED" in str(exception))


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

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=30),

        stop=stop_after_attempt(5),
        retry=retry_if_exception(is_rate_limit_error),
        before_sleep=lambda retry_state: logger.warning(
            f"Gemini Rate Limit hit, retrying in {retry_state.next_action.sleep}s... (Attempt {retry_state.attempt_number})"
        )
    )
    async def generate(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 8192,
    ) -> tuple[str, int]:
        """Generate text using Gemini with automatic retries."""
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        if system_prompt:
            config.system_instruction = system_prompt

        response = await asyncio.to_thread(
            partial(
                self._client.models.generate_content,
                model=self._model,
                contents=prompt,
                config=config,
            )
        )
        tokens = response.usage_metadata.total_token_count if response.usage_metadata else 0
        return response.text or "", tokens

    @retry(
        wait=wait_exponential(multiplier=1, min=2, max=30),
        stop=stop_after_attempt(5),
        retry=retry_if_exception(is_rate_limit_error),
        before_sleep=lambda retry_state: logger.warning(
            f"Gemini Rate Limit hit (stream), retrying in {retry_state.next_action.sleep}s... (Attempt {retry_state.attempt_number})"
        )
    )
    async def stream(
        self,
        prompt: str,
        *,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 8192,
    ):
        """Stream text generation from Gemini with automatic retries."""
        config = types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        if system_prompt:
            config.system_instruction = system_prompt

        response_stream = await asyncio.to_thread(
            partial(
                self._client.models.generate_content_stream,
                model=self._model,
                contents=prompt,
                config=config,
            )
        )
        for chunk in response_stream:
            text = chunk.text or ""
            tokens = chunk.usage_metadata.total_token_count if chunk.usage_metadata else 0
            yield text, tokens


    async def close(self) -> None:
        """No persistent connection to close for Gemini REST client."""
        pass
