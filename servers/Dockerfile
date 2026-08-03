FROM python:3.10-slim

# Install system dependencies required by Piper TTS and audio processing
RUN apt-get update && apt-get install -y \
    espeak-ng \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
# We add the extra dependencies required by the Keyframe agent since they aren't in requirements.txt
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    aiohttp \
    miniaudio \
    livekit-agents \
    livekit-api \
    livekit-plugins-keyframe \
    edge-tts

# Copy application code
COPY . .

# We'll use docker-compose to define the entrypoints for the 3 different servers
