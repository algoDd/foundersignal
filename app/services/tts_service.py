"""Gradium TTS service — streams WAV audio chunks for a given voice + text."""

from __future__ import annotations

import asyncio
import base64
import json
import logging

import websockets

logger = logging.getLogger("foundersignal.tts")

GRADIUM_WS_URL = "wss://api.gradium.ai/api/speech/tts"

# Per-archetype voices, keyed by (archetype_keyword, gender).
# All English flagship voices from the Gradium library.
_VOICES: dict[tuple[str, str], str] = {
    ("early adopter",         "female"): "YTpq7expH9539ERJ",  # Emma   — pleasant, smooth
    ("early adopter",         "male"):   "LFZvm12tW_z0xfGo",  # Kent   — relaxed, authentic
    ("skeptical",             "female"): "ubuXFxVQwVYnZQhy",  # Eva    — dynamic, British
    ("skeptical",             "male"):   "KWJiFWu2O9nMPYcR",  # John   — warm, low-pitched, authoritative
    ("industry veteran",      "female"): "ubuXFxVQwVYnZQhy",  # Eva    — confident, experienced
    ("industry veteran",      "male"):   "m86j6D7UZpGzHsNu",  # Jack   — seasoned British
    ("cost-conscious",        "female"): "jtEKaLYNn6iif5PR",  # Sydney — airy, practical
    ("cost-conscious",        "male"):   "LFZvm12tW_z0xfGo",  # Kent   — grounded, value-focused
    ("practical implementer", "female"): "jtEKaLYNn6iif5PR",  # Sydney — helpful, light
    ("practical implementer", "male"):   "m86j6D7UZpGzHsNu",  # Jack   — dependable, British
}

# Gender-only fallbacks (when archetype keyword doesn't match)
_FALLBACK: dict[str, str] = {
    "female": "YTpq7expH9539ERJ",  # Emma
    "male":   "LFZvm12tW_z0xfGo",  # Kent
}


def voice_for_archetype(archetype: str, gender: str = "") -> str:
    g = gender.strip().lower() if gender else "female"
    if g not in ("male", "female"):
        g = "female"
    low = archetype.lower()
    for key, _ in _VOICES.items():
        if key[0] in low and key[1] == g:
            return _VOICES[key]
    return _FALLBACK[g]


MAX_CHARS = 1400  # Free tier hard limit is 1500 chars/session; stay safely under


def _truncate_to_sentences(text: str, limit: int = MAX_CHARS) -> str:
    """Truncate text at a sentence boundary within the character limit."""
    if len(text) <= limit:
        return text
    snippet = text[:limit]
    # Walk back to the last sentence-ending punctuation
    for i in range(len(snippet) - 1, -1, -1):
        if snippet[i] in ".!?":
            return snippet[: i + 1]
    # No sentence boundary found — fall back to last word boundary
    last_space = snippet.rfind(" ")
    return (snippet[:last_space] + "…") if last_space > 0 else (snippet + "…")


async def stream_tts(api_key: str, voice_id: str, text: str):
    """
    Connects to Gradium WebSocket TTS, sends text, and yields raw WAV
    audio bytes as they arrive.  Raises on connection/protocol errors.
    """
    text = _truncate_to_sentences(text)
    headers = {"x-api-key": api_key}
    async with websockets.connect(GRADIUM_WS_URL, additional_headers=headers) as ws:
        # 1. Setup
        await ws.send(json.dumps({
            "type": "setup",
            "model_name": "default",
            "voice_id": voice_id,
            "output_format": "wav",
        }))

        # 2. Wait for ready
        ready_raw = await ws.recv()
        ready = json.loads(ready_raw)
        if ready.get("type") == "error":
            raise RuntimeError(f"Gradium TTS error: {ready.get('message')}")

        # 3. Send text then end_of_stream
        await ws.send(json.dumps({"type": "text", "text": text}))
        await ws.send(json.dumps({"type": "end_of_stream"}))

        # 4. Stream audio chunks back
        async for raw in ws:
            msg = json.loads(raw)
            if msg.get("type") == "audio":
                yield base64.b64decode(msg["audio"])
            elif msg.get("type") == "end_of_stream":
                break
            elif msg.get("type") == "error":
                raise RuntimeError(f"Gradium TTS error: {msg.get('message')}")
            # "text" (timestamp) messages are silently ignored
