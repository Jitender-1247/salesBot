"""
SalesBot — Speech-to-Text Server (Faster-Whisper)
Runs on CPU with INT8 quantization. No GPU required.

Usage:
    pip install faster-whisper fastapi uvicorn python-multipart
    python stt_server.py

Endpoint: POST /v1/audio/transcriptions
Port: 8787
"""

import os
import asyncio
import shutil
import tempfile
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import uvicorn

app = FastAPI(title="SalesBot STT Server", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model on startup (CPU mode with INT8 for speed)
# tiny = ~250ms, base = ~900ms — tiny is fine for clear voice input
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")
print(f"Loading Whisper model: {MODEL_SIZE} (CPU, INT8)...")
whisper_model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
print(f"[OK] Whisper model '{MODEL_SIZE}' loaded successfully!")


@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_SIZE, "device": "cpu"}


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("base"),
    language: str = Form("en"),
    response_format: str = Form("json"),
):
    """OpenAI-compatible transcription endpoint."""
    # Save uploaded file to temp location
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        # Run CPU-bound transcription in a thread pool to keep event loop responsive
        def _transcribe():
            segs, inf = whisper_model.transcribe(
                tmp_path,
                language=language if language != "auto" else None,
                beam_size=1,       # Greedy decode — much faster, minimal quality loss
                vad_filter=True,   # Voice activity detection for better results
                condition_on_previous_text=False,  # Avoid slow conditioning on prior context
            )
            return list(segs), inf  # materialize generator before leaving thread

        segments, info = await asyncio.to_thread(_transcribe)

        # Collect all segment texts
        text = " ".join([seg.text.strip() for seg in segments])

        return {
            "text": text,
            "language": info.language,
            "duration": info.duration,
        }
    finally:
        # Cleanup temp file
        os.unlink(tmp_path)


if __name__ == "__main__":
    print("\n--- SalesBot STT Server starting on http://localhost:8787 ---")
    print("    Model: " + MODEL_SIZE)
    print("    Device: CPU (INT8)")
    print()
    uvicorn.run(app, host="0.0.0.0", port=8787)