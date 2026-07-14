#!/bin/bash
# SalesBot TTS Server - Startup Script
# Downloads the voice model on first run, then starts the server

set -e

MODELS_DIR="/tts_models"

# Download voice model if not already present
if [ ! -f "/en/en_US/lessac/medium/en_US-lessac-medium.onnx" ]; then
    echo "[startup_tts.sh] Voice model not found, downloading..."
    python "/download_voice.py"
    echo "[startup_tts.sh] Voice model downloaded!"
else
    echo "[startup_tts.sh] Voice model already present, skipping download."
fi

echo "[startup_tts.sh] Starting TTS server on port 8000..."
python "/tts_server.py"
