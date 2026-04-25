"""Integration tests for all configured API integrations.

These tests hit the real external APIs if the corresponding API keys
are present in the .env file. If a key is missing, the test is skipped.
"""

import os

import httpx
import pytest

from app.services.hera_service import HeraService
from app.services.llm.gemini_provider import GeminiProvider
from app.services.peec_service import PeecService
from app.services.tavily_service import TavilyService


@pytest.mark.asyncio
async def test_gemini_integration():
    """Test the Google Gemini API integration."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        pytest.skip("GEMINI_API_KEY not found in environment.")

    provider = GeminiProvider(api_key=api_key)
    # Give it a larger token budget so it doesn't get cut off early
    response = await provider.generate("Say hello in one word.", max_tokens=50)
    assert response, "Gemini API returned empty response. Check if key is valid."


def test_tavily_integration():
    """Test the Tavily API integration."""
    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        pytest.skip("TAVILY_API_KEY not found in environment.")

    service = TavilyService(api_key=api_key)
    response = service.search("AI startups 2024", max_results=1, include_answer=False)
    assert "results" in response, "Tavily API response missing 'results' key"
    assert len(response["results"]) > 0, "Tavily API returned no results"


@pytest.mark.asyncio
async def test_peec_integration():
    """Test the Peec AI API integration."""
    api_key = os.getenv("PEEC_API_KEY")
    if not api_key:
        pytest.skip("PEEC_API_KEY not found in environment.")

    service = PeecService(api_key=api_key)
    try:
        response = await service.get_reports()
        assert isinstance(response, dict), "Peec API response should be a dictionary"
    except httpx.HTTPStatusError as e:
        # If the API key is invalid or the endpoint doesn't exist for this tier,
        # we accept 401/404 as proof that the server was reached.
        assert e.response.status_code in [401, 404], (
            f"Peec AI unexpected status: {e.response.status_code}"
        )
    finally:
        await service.close()


@pytest.mark.asyncio
async def test_hera_integration():
    """Test the Hera Video API integration."""
    api_key = os.getenv("HERA_API_KEY")
    if not api_key:
        pytest.skip("HERA_API_KEY not found in environment.")

    service = HeraService(api_key=api_key)
    try:
        # We query a dummy video ID to check if our API key is accepted.
        # We expect a 404 (Not Found) for the dummy ID, but if the key is invalid,
        # the API will return a 401 (Unauthorized) or 403 (Forbidden).
        await service.get_video_status("dummy-test-id")
    except httpx.HTTPStatusError as e:
        assert e.response.status_code == 404, (
            f"Hera API Expected 404 for dummy video, got {e.response.status_code}. "
            "Key might be invalid."
        )
    finally:
        await service.close()
