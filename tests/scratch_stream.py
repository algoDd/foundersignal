import asyncio
import os

from dotenv import load_dotenv
from google import genai

load_dotenv()


async def test_stream():
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    response_stream = client.models.generate_content_stream(
        model="gemini-2.5-flash",
        contents="Count from 1 to 5 slowly.",
    )
    for chunk in response_stream:
        print(f"Chunk: {chunk.text!r}")
        if chunk.usage_metadata:
            print(f"Tokens: {chunk.usage_metadata.total_token_count}")


if __name__ == "__main__":
    asyncio.run(test_stream())
