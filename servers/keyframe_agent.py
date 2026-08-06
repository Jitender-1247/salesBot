"""
Keyframe Avatar Agent — LiveKit Python Sidecar
==============================================
Architecture:
  1. Agent joins LiveKit room.
  2. Node.js sends a data message: { "type": "speak", "text": "..." }
  3. This agent fetches MP3 audio (ElevenLabs / OpenAI / edge-tts).
  4. MP3 is decoded to PCM using miniaudio and chunked into AudioFrames.
  5. AudioFrames are pushed to Keyframe's DataStreamAudioOutput for lip-sync.
  6. The frontend receives video & audio streams live from Keyframe via WebRTC.
"""

import asyncio
import io
import json
import logging
import os
import sys

import aiohttp
import miniaudio
from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import JobContext, WorkerOptions, cli
from livekit.plugins import keyframe
from livekit.plugins.keyframe.avatar import DataStreamAudioOutput, SAMPLE_RATE

# ── Load environment from backend's .env if present ──
env_path = os.path.join(os.path.dirname(__file__), '..', 'backend', '.env')
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [KeyframeAgent] %(levelname)s: %(message)s',
)
logger = logging.getLogger(__name__)

# Standardize Keyframe API keys across all possible env var naming conventions
kf_key = os.getenv('KEYFRAME_API_KEY') or os.getenv('KEYFRAMELABS_API_KEY') or os.getenv('KEYFRAME_LABS_API_KEY') or ''
if kf_key:
    os.environ['KEYFRAME_API_KEY'] = kf_key
    os.environ['KEYFRAMELABS_API_KEY'] = kf_key
    os.environ['LIVEKIT_KEYFRAME_API_KEY'] = kf_key

ELEVENLABS_API_KEY  = os.getenv('ELEVENLABS_API_KEY', '')
ELEVENLABS_VOICE_ID = os.getenv('ELEVENLABS_VOICE_ID', 'EXAVITQu4vr4xnSDxMaL') # Bella
OPENAI_API_KEY      = os.getenv('OPENAI_API_KEY', '')
TTS_BASE_URL        = os.getenv('TTS_BASE_URL', 'http://localhost:8000')

KEYFRAME_PERSONA_ID   = os.getenv('KEYFRAME_PERSONA_ID', '')
KEYFRAME_PERSONA_SLUG = os.getenv('KEYFRAME_PERSONA_SLUG', 'public:cassidy_persona-1.5-live')

# Chunk size: 50ms of audio at 24kHz mono
CHUNK_SAMPLES = int(SAMPLE_RATE * 0.05)  # 1200 samples per 50ms


async def fetch_mp3_and_push_frames(text: str, audio_output: DataStreamAudioOutput):
    """
    Fetch MP3 from ElevenLabs, OpenAI, or local TTS server, decode to PCM,
    then push as AudioFrames to Keyframe for real-time lip-sync rendering.
    """
    try:
        mp3_bytes = None

        if ELEVENLABS_API_KEY:
            # ── ElevenLabs TTS (Primary) ──
            async with aiohttp.ClientSession() as http:
                async with http.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
                    json={
                        "text": text,
                        "model_id": "eleven_turbo_v2_5",
                        "voice_settings": {
                            "stability": 0.5,
                            "similarity_boost": 0.75,
                        },
                        "output_format": "mp3_44100_128",
                    },
                    headers={"xi-api-key": ELEVENLABS_API_KEY},
                    timeout=aiohttp.ClientTimeout(total=20)
                ) as resp:
                    if resp.status == 200:
                        mp3_bytes = await resp.read()
                        logger.info(f"Fetched {len(mp3_bytes)} bytes from ElevenLabs")
                    else:
                        err_t = await resp.text()
                        logger.warn(f"ElevenLabs TTS returned {resp.status}: {err_t[:100]}")

        if not mp3_bytes and OPENAI_API_KEY:
            # ── OpenAI TTS (Secondary) ──
            async with aiohttp.ClientSession() as http:
                async with http.post(
                    "https://api.openai.com/v1/audio/speech",
                    json={
                        "model": "tts-1",
                        "input": text,
                        "voice": "nova",
                        "response_format": "mp3"
                    },
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                    timeout=aiohttp.ClientTimeout(total=20)
                ) as resp:
                    if resp.status == 200:
                        mp3_bytes = await resp.read()
                        logger.info(f"Fetched {len(mp3_bytes)} bytes from OpenAI TTS")
                    else:
                        logger.warn(f"OpenAI TTS returned {resp.status}")

        if not mp3_bytes:
            # ── Fallback local TTS server (edge-tts) ──
            async with aiohttp.ClientSession() as http:
                async with http.post(
                    f"{TTS_BASE_URL}/v1/audio/speech",
                    json={
                        "model": "tts-1",
                        "input": text,
                        "voice": "alloy",
                        "speed": 1.0,
                        "response_format": "mp3"
                    },
                    timeout=aiohttp.ClientTimeout(total=20)
                ) as resp:
                    if resp.status == 200:
                        mp3_bytes = await resp.read()
                        logger.info(f"Fetched {len(mp3_bytes)} bytes from local TTS server")
                    else:
                        logger.error(f"Local TTS server returned {resp.status}")
                        return

        # Decode MP3 to raw 24kHz mono PCM using miniaudio
        decoded = miniaudio.decode(
            mp3_bytes,
            output_format=miniaudio.SampleFormat.SIGNED16,
            nchannels=1,
            sample_rate=SAMPLE_RATE,
        )
        pcm_bytes = bytes(decoded.samples)

        # Chunk into AudioFrames and push to Keyframe
        frame_count = 0
        bytes_per_sample = 2  # 16-bit
        chunk_bytes = CHUNK_SAMPLES * bytes_per_sample

        for offset in range(0, len(pcm_bytes), chunk_bytes):
            chunk = pcm_bytes[offset:offset + chunk_bytes]
            if len(chunk) < chunk_bytes:
                chunk = chunk + b'\x00' * (chunk_bytes - len(chunk))
            frame = rtc.AudioFrame(
                data=chunk,
                sample_rate=SAMPLE_RATE,
                num_channels=1,
                samples_per_channel=CHUNK_SAMPLES,
            )
            await audio_output.capture_frame(frame)
            frame_count += 1
            await asyncio.sleep(0)

        logger.info(f"Pushed {frame_count} audio frames to Keyframe for: '{text[:40]}'")

    except Exception as e:
        logger.error(f"Error in fetch_mp3_and_push_frames: {e}", exc_info=True)


async def entrypoint(ctx: JobContext):
    """Main entry point — each job = one LiveKit room (one active demo session)."""
    await ctx.connect()
    room = ctx.room

    logger.info(f'Keyframe agent connected to room: {room.name}')

    session = agents.AgentSession()

    # ── Start Keyframe Avatar Session ──
    if KEYFRAME_PERSONA_SLUG:
        logger.info(f'Using Keyframe persona slug: {KEYFRAME_PERSONA_SLUG}')
        avatar = keyframe.AvatarSession(persona_slug=KEYFRAME_PERSONA_SLUG)
    else:
        logger.info(f'Using custom Keyframe persona ID: {KEYFRAME_PERSONA_ID}')
        avatar = keyframe.AvatarSession(persona_id=KEYFRAME_PERSONA_ID)

    await avatar.start(session, room=room)
    logger.info('✅ Keyframe avatar session started — video & audio publishing to LiveKit room.')

    audio_output = session.output.audio

    # ── Listen for speak commands from Node.js backend ──
    @room.on("data_received")
    def on_data_received(data_packet: rtc.DataPacket):
        try:
            payload = json.loads(data_packet.data.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return

        if payload.get('type') == 'speak':
            text = payload.get('text', '').strip()
            if text:
                logger.info(f"Speak command received: {text[:80]}")
                asyncio.create_task(fetch_mp3_and_push_frames(text, audio_output))

    logger.info('Keyframe agent ready — listening for speak commands.')
    await asyncio.Event().wait()


if __name__ == '__main__':
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name='keyframe-avatar',
            worker_type=agents.WorkerType.ROOM,
        )
    )
