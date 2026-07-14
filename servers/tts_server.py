"""
SalesBot — Text-to-Speech Server (Piper TTS)
Uses the Piper Python API directly. Runs on CPU. No GPU required.

Usage:
    pip install piper-tts fastapi uvicorn
    python tts_server.py

Endpoint: POST /v1/audio/speech
Port: 8000
"""

import io
import os
import re
import wave
import json
import asyncio
import threading
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from piper import PiperVoice
import uvicorn

# Voice model config
MODELS_DIR = Path(__file__).parent / "tts_models"
MODELS_DIR.mkdir(exist_ok=True)

DEFAULT_VOICE = os.environ.get("PIPER_VOICE", "en_US-lessac-medium")

# Global voice instance
piper_voice = None

# Lock to serialise concurrent synthesis calls in the thread pool.
# Piper's ONNX session is not guaranteed thread-safe, so we protect it.
_tts_lock = threading.Lock()


def find_onnx_model(voice_name: str) -> tuple:
    """Find the downloaded ONNX model and config files."""
    for onnx_path in MODELS_DIR.rglob("*.onnx"):
        if voice_name.replace("-", "_") in str(onnx_path) or voice_name in str(onnx_path):
            config_path = Path(str(onnx_path) + ".json")
            if config_path.exists():
                return str(onnx_path), str(config_path)
    return None, None


class SpeechRequest(BaseModel):
    model: str = "piper"
    input: str
    voice: str = "default"
    speed: float = 1.0
    response_format: str = "wav"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global piper_voice

    print(f"  Loading Piper voice: {DEFAULT_VOICE}...")
    onnx_path, config_path = find_onnx_model(DEFAULT_VOICE)

    if onnx_path is None:
        print(f"  [ERROR] Voice model not found!")
        print(f"  Run: python download_voice.py")
        raise FileNotFoundError(f"Voice model '{DEFAULT_VOICE}' not found in {MODELS_DIR}")

    print(f"  Model: {onnx_path}")
    piper_voice = PiperVoice.load(onnx_path, config_path=config_path)
    print(f"  [OK] Piper voice loaded and ready!")
    yield


app = FastAPI(title="SalesBot TTS Server", version="2.0.0", lifespan=lifespan)

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
    return {"status": "ok", "voice": DEFAULT_VOICE, "engine": "piper"}


@app.post("/v1/audio/speech")
async def synthesize(request: SpeechRequest):
    """OpenAI-compatible TTS endpoint."""
    global piper_voice

    text = clean_text_for_tts(request.input)
    if not text or not text.strip():
        return Response(content=b"", media_type="audio/wav")

    try:
        # Run CPU-bound synthesis in a thread pool so the event loop stays responsive
        def _synthesize() -> bytes:
            with _tts_lock:  # serialise concurrent chunk requests safely
                buf = io.BytesIO()
                with wave.open(buf, "wb") as wav_file:
                    piper_voice.synthesize_wav(text, wav_file)
                return buf.getvalue()

        audio_data = await asyncio.to_thread(_synthesize)
        return Response(content=audio_data, media_type="audio/wav")

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
    print(f"   Engine: Piper TTS (CPU)")
    print()
    uvicorn.run(app, host="0.0.0.0", port=8000)