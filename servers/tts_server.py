"""
SalesBot — Text-to-Speech Server (Edge TTS)
Uses Microsoft Edge TTS for free, natural-sounding voices.

Usage:
    pip install edge-tts fastapi uvicorn
    python tts_server.py

Endpoint: POST /v1/audio/speech
Port: 8000
"""

import io
import os
import re
import json
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import edge_tts
import uvicorn

# Voice config — Edge TTS voices
# Some great natural-sounding voices:
#   en-US-GuyNeural      — male, warm, conversational
#   en-US-JennyNeural    — female, friendly, clear
#   en-US-AriaNeural     — female, natural, engaging
#   en-US-DavisNeural    — male, confident, professional
#   en-GB-SoniaNeural    — female, British, professional
#   en-IN-NeerjaNeural   — female, Indian English

DEFAULT_VOICE = os.environ.get("EDGE_VOICE", "en-US-AriaNeural")


class SpeechRequest(BaseModel):
    model: str = "edge"
    input: str
    voice: str = "default"
    speed: float = 1.0
    response_format: str = "wav"


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"  Edge TTS voice: {DEFAULT_VOICE}")
    print(f"  [OK] Edge TTS ready!")
    yield


app = FastAPI(title="SalesBot TTS Server", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Regex to match emoji and other unicode symbols that TTS reads aloud
EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U00002702-\U000027B0"  # dingbats
    "\U000024C2-\U0001F251"  # enclosed characters
    "\U0001f926-\U0001f937"  # gestures
    "\U00010000-\U0010ffff"  # supplementary chars
    "\u2640-\u2642"
    "\u2600-\u2B55"
    "\u200d"                 # zero width joiner
    "\ufe0f"                 # variation selector
    "]+",
    flags=re.UNICODE,
)


def clean_text_for_tts(text: str) -> str:
    """Remove emojis and clean text for TTS synthesis."""
    cleaned = EMOJI_PATTERN.sub(" ", text)
    # Collapse multiple spaces
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


@app.get("/health")
async def health():
    return {"status": "ok", "voice": DEFAULT_VOICE, "engine": "edge-tts"}


@app.post("/v1/audio/speech")
async def synthesize(request: SpeechRequest):
    """OpenAI-compatible TTS endpoint using Edge TTS."""
    text = clean_text_for_tts(request.input)
    if not text or not text.strip():
        return Response(content=b"", media_type="audio/wav")

    try:
        # Determine the voice to use
        voice = DEFAULT_VOICE

        # Build rate string from speed parameter
        rate_percent = int((request.speed - 1.0) * 100)
        rate_str = f"+{rate_percent}%" if rate_percent >= 0 else f"{rate_percent}%"

        # Use edge-tts to generate audio
        communicate = edge_tts.Communicate(text, voice, rate=rate_str)

        # Collect all MP3 audio data first, then return as a single response
        # (streaming causes the backend fetch().arrayBuffer() to hang)
        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])

        audio_data = b"".join(audio_chunks)

        if not audio_data:
            print("  [WARN] Edge TTS returned empty audio")
            return Response(content=b"", media_type="audio/mpeg")

        return Response(content=audio_data, media_type="audio/mpeg")

    except Exception as e:
        print(f"  TTS Error: {e}")
        return Response(
            content=json.dumps({"error": "TTS synthesis failed", "details": str(e)}),
            media_type="application/json",
            status_code=500,
        )


if __name__ == "__main__":
    print("\n--- SalesBot TTS Server starting on http://localhost:8000 ---")
    print(f"   Voice: {DEFAULT_VOICE}")
    print(f"   Engine: Edge TTS (Microsoft Neural)")
    print()
    uvicorn.run(app, host="0.0.0.0", port=8000)