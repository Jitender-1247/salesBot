"""
Keyframe Avatar Agent — LiveKit Python Sidecar
==============================================
Architecture:
  1. Agent joins LiveKit room.
  2. Node.js sends a data message: { "type": "speak", "text": "..." }
  3. This agent fetches MP3 audio from our local edge-tts server.
  4. MP3 is decoded to PCM using pydub/audioop and chunked into AudioFrames.
  5. AudioFrames are pushed to Keyframe's DataStreamAudioOutput for lip-sync.
  6. The frontend plays audio via the socket (agent-audio event from Node.js backend).
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

# ── Load environment from the backend's .env ──
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [KeyframeAgent] %(levelname)s: %(message)s',
)
logger = logging.getLogger(__name__)

TTS_BASE_URL = os.getenv('TTS_BASE_URL', 'http://localhost:8000')
KEYFRAME_PERSONA_ID = os.getenv('KEYFRAME_PERSONA_ID', '')
KEYFRAME_PERSONA_SLUG = os.getenv('KEYFRAME_PERSONA_SLUG', '')

# Chunk size: 50ms of audio at 24kHz mono
# Smaller chunks = lower latency, but higher CPU overhead and potential for stuttering
CHUNK_SAMPLES = int(SAMPLE_RATE * 0.05)  # 1200 samples per 50ms


async def fetch_mp3_and_push_frames(text: str, audio_output: DataStreamAudioOutput):
    """
    Fetch MP3 from our local TTS server, decode to PCM, then push as AudioFrames
    to the Keyframe DataStreamAudioOutput for lip-sync rendering.
    """
    try:
        # Step 1: Fetch MP3 from edge-tts server
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
                timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status != 200:
                    logger.error(f"TTS server returned {resp.status}")
                    return
                mp3_bytes = await resp.read()

        logger.info(f"Fetched {len(mp3_bytes)} bytes of MP3 audio for lip-sync")

        # Step 2: Decode MP3 to raw PCM using miniaudio (no ffmpeg needed)
        decoded = miniaudio.decode(
            mp3_bytes,
            output_format=miniaudio.SampleFormat.SIGNED16,
            nchannels=1,
            sample_rate=SAMPLE_RATE,
        )
        pcm_bytes = bytes(decoded.samples)

        # Step 3: Chunk into AudioFrames and push to Keyframe
        frame_count = 0
        bytes_per_sample = 2  # 16-bit = 2 bytes
        chunk_bytes = CHUNK_SAMPLES * bytes_per_sample

        for offset in range(0, len(pcm_bytes), chunk_bytes):
            chunk = pcm_bytes[offset:offset + chunk_bytes]
            # Pad last chunk if needed
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
            # Yield to event loop briefly so other tasks don't starve
            await asyncio.sleep(0)

        logger.info(f"Pushed {frame_count} frames to Keyframe for: {text[:40]}")

    except Exception as e:
        logger.error(f"Error in fetch_mp3_and_push_frames: {e}", exc_info=True)


async def entrypoint(ctx: JobContext):
    """Main entry point — each job = one LiveKit room (one active demo session)."""
    await ctx.connect()
    room = ctx.room

    logger.info(f'Keyframe agent connected to room: {room.name}')

    if not KEYFRAME_PERSONA_ID and not KEYFRAME_PERSONA_SLUG:
        logger.error('Neither KEYFRAME_PERSONA_ID nor KEYFRAME_PERSONA_SLUG is set in backend/.env')
        return

    # ── Create minimal AgentSession for Keyframe to hook into ──
    session = agents.AgentSession()

    # ── Start Keyframe (replaces session's audio tail with DataStreamAudioOutput) ──
    if KEYFRAME_PERSONA_SLUG:
        logger.info(f'Using public persona slug: {KEYFRAME_PERSONA_SLUG}')
        avatar = keyframe.AvatarSession(persona_slug=KEYFRAME_PERSONA_SLUG)
    else:
        logger.info(f'Using custom persona ID: {KEYFRAME_PERSONA_ID}')
        avatar = keyframe.AvatarSession(persona_id=KEYFRAME_PERSONA_ID)

    await avatar.start(session, room=room)
    logger.info('Keyframe avatar session started — video track publishing to room.')

    # Get the DataStreamAudioOutput (set by avatar.start via replace_audio_tail)
    audio_output = session.output.audio
    logger.info(f'Audio pipeline: {type(audio_output).__name__}')

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

    # Keep agent alive
    await asyncio.Event().wait()


if __name__ == '__main__':
    if not KEYFRAME_PERSONA_ID and not KEYFRAME_PERSONA_SLUG:
        print('\n[ERROR] Neither KEYFRAME_PERSONA_ID nor KEYFRAME_PERSONA_SLUG is set in backend/.env!')
        print('  Add: KEYFRAME_PERSONA_SLUG=public:cassidy_persona-1.5-live\n')
        sys.exit(1)

    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name='keyframe-avatar',
            worker_type=agents.WorkerType.ROOM,
        )
    )
