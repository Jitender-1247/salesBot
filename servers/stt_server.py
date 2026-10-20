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
import tempfile
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
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
MAX_UPLOAD_BYTES = int(os.environ.get("STT_MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
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
    # Accept "en", "en-US", "en_GB"; anything else (e.g. "english", "") falls back to auto-detect
    # instead of failing the request, so a bad hint never costs the visitor their utterance.
    base_lang = (language or "").strip().lower().replace("_", "-").split("-")[0]
    whisper_lang = base_lang if base_lang.isalpha() and 2 <= len(base_lang) <= 3 else None

    # Only keep a short alphanumeric extension from the client-supplied filename
    ext = os.path.splitext(file.filename or "")[1].lower()
    suffix = ext if ext[1:].isalnum() and len(ext) <= 6 else ".webm"

    # Save uploaded file to temp location, enforcing a size cap
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = tmp.name
        written = 0
        while chunk := file.file.read(1024 * 1024):
            written += len(chunk)
            if written > MAX_UPLOAD_BYTES:
                tmp.close()
                os.unlink(tmp_path)
                raise HTTPException(status_code=413, detail="Audio file too large")
            tmp.write(chunk)

    try:
        # Run CPU-bound transcription in a thread pool to keep event loop responsive
        def _transcribe():
            segs, inf = whisper_model.transcribe(
                tmp_path,
                language=whisper_lang,
                beam_size=1,       # Fast greedy decoding (5x faster than beam_size=5 on CPU)
                best_of=1,
                temperature=0.0,
                vad_filter=True,   # Trims ambient silence before inference
                vad_parameters=dict(min_silence_duration_ms=250),
                condition_on_previous_text=False,
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