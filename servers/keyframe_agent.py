"""
Keyframe Avatar Agent — LiveKit Python Sidecar
==============================================
Architecture:
  1. Agent joins LiveKit room. Dispatch metadata picks the persona (face) and voice:
       { "personaSlug": "...", "personaId": "...", "voice": { "provider": "deepgram", "id": "aura-2-thalia-en" } }
  2. Node.js sends a data message: { "type": "speak", "text": "...", "voice": {...} }  or  { "type": "stop" }
  3. This agent fetches MP3 audio (persona's provider first, then Deepgram / ElevenLabs / OpenAI / edge-tts).
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

DEEPGRAM_API_KEY    = os.getenv('DEEPGRAM_API_KEY', '')
DEEPGRAM_DEFAULT_MODEL = 'aura-2-thalia-en'
ELEVENLABS_API_KEY  = os.getenv('ELEVENLABS_API_KEY', '')
ELEVENLABS_VOICE_ID = os.getenv('ELEVENLABS_VOICE_ID', 'EXAVITQu4vr4xnSDxMaL') # Bella
OPENAI_API_KEY      = os.getenv('OPENAI_API_KEY', '')
TTS_BASE_URL        = os.getenv('TTS_BASE_URL', 'http://localhost:8000')

KEYFRAME_PERSONA_ID   = os.getenv('KEYFRAME_PERSONA_ID', '')
KEYFRAME_PERSONA_SLUG = os.getenv('KEYFRAME_PERSONA_SLUG', 'public:cassidy_persona-1.5-live')

# Chunk size: 50ms of audio at 24kHz mono
CHUNK_SAMPLES = int(SAMPLE_RATE * 0.05)  # 1200 samples per 50ms


async def tts_deepgram(text: str, voice_id: str = ''):
    if not DEEPGRAM_API_KEY:
        return None
    model = voice_id if voice_id.startswith('aura-') else DEEPGRAM_DEFAULT_MODEL
    async with aiohttp.ClientSession() as http:
        async with http.post(
            "https://api.deepgram.com/v1/speak",
            params={"model": model, "encoding": "mp3"},
            json={"text": text},
            headers={"Authorization": f"Token {DEEPGRAM_API_KEY}"},
            timeout=aiohttp.ClientTimeout(total=20)
        ) as resp:
            if resp.status == 200:
                data = await resp.read()
                logger.info(f"Fetched {len(data)} bytes from Deepgram ({model})")
                return data or None
            logger.warning(f"Deepgram TTS returned {resp.status}: {(await resp.text())[:100]}")
            return None


async def tts_elevenlabs(text: str, voice_id: str = ''):
    if not ELEVENLABS_API_KEY:
        return None
    async with aiohttp.ClientSession() as http:
        async with http.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id or ELEVENLABS_VOICE_ID}",
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
                data = await resp.read()
                logger.info(f"Fetched {len(data)} bytes from ElevenLabs")
                return data
            logger.warning(f"ElevenLabs TTS returned {resp.status}: {(await resp.text())[:100]}")
            return None


async def tts_openai(text: str, voice_id: str = ''):
    if not OPENAI_API_KEY:
        return None
    async with aiohttp.ClientSession() as http:
        async with http.post(
            "https://api.openai.com/v1/audio/speech",
            json={
                "model": "tts-1",
                "input": text,
                "voice": voice_id or "nova",
                "response_format": "mp3"
            },
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            timeout=aiohttp.ClientTimeout(total=20)
        ) as resp:
            if resp.status == 200:
                data = await resp.read()
                logger.info(f"Fetched {len(data)} bytes from OpenAI TTS")
                return data
            logger.warning(f"OpenAI TTS returned {resp.status}")
            return None


TTS_PROVIDERS = {"deepgram": tts_deepgram, "elevenlabs": tts_elevenlabs, "openai": tts_openai}


async def synthesize(text: str, voice: dict):
    """Persona's provider/voice first, then the same fallback order as the Node backend (tts.js)."""
    preferred = voice.get('provider') if voice.get('provider') in TTS_PROVIDERS else 'deepgram'
    order = [preferred] + [p for p in ('deepgram', 'elevenlabs', 'openai') if p != preferred]
    for provider in order:
        try:
            # A voice id only means something to its own provider; fallbacks use their defaults
            data = await TTS_PROVIDERS[provider](text, voice.get('id', '') if provider == preferred else '')
            if data:
                return data
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning(f"{provider} TTS error: {e}")
    return None


async def fetch_mp3_and_push_frames(text: str, audio_output: DataStreamAudioOutput, voice: dict = None):
    """
    Fetch MP3 for the persona's voice (falling back across providers, then the local TTS server),
    decode to PCM, then push as AudioFrames to Keyframe for real-time lip-sync rendering.
    """
    try:
        mp3_bytes = await synthesize(text, voice or {})

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

        loop = asyncio.get_running_loop()
        start_time = loop.time()

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

            # Real-time frame pacing: 50ms per frame to prevent buffer overflow in Keyframe pipeline
            target_time = start_time + (frame_count * 0.05)
            wait_time = target_time - loop.time()
            if wait_time > 0:
                await asyncio.sleep(wait_time)

        # Mark end of utterance segment
        if hasattr(audio_output, 'flush'):
            try:
                audio_output.flush()
            except Exception:
                pass

        logger.info(f"Pushed {frame_count} audio frames to Keyframe for: '{text[:40]}'")

    except asyncio.CancelledError:
        logger.info("Speech task cancelled due to new utterance or interruption")
        if hasattr(audio_output, 'clear_buffer'):
            try:
                audio_output.clear_buffer()
            except Exception:
                pass
    except Exception as e:
        logger.error(f"Error in fetch_mp3_and_push_frames: {e}", exc_info=True)


async def entrypoint(ctx: JobContext):
    """Main entry point — each job = one LiveKit room (one active demo session)."""
    await ctx.connect()
    room = ctx.room

    logger.info(f'Keyframe agent connected to room: {room.name}')

    # Per-product persona from the dispatch metadata; .env values are the fallback
    try:
        meta = json.loads(ctx.job.metadata or '{}')
    except (json.JSONDecodeError, TypeError):
        meta = {}
    persona_slug = meta.get('personaSlug') or ''
    persona_id = meta.get('personaId') or ''
    if not persona_slug and not persona_id:
        persona_slug, persona_id = KEYFRAME_PERSONA_SLUG, KEYFRAME_PERSONA_ID
    default_voice = meta.get('voice') or {}

    session = agents.AgentSession()
    avatar = None
    audio_output = None
    current_speech_task = None

    async def start_or_restart_avatar():
        nonlocal avatar, audio_output
        try:
            logger.info('🚀 Starting Keyframe Avatar Session...')
            if persona_slug:
                logger.info(f'Using Keyframe persona slug: {persona_slug}')
                avatar = keyframe.AvatarSession(persona_slug=persona_slug)
            else:
                logger.info(f'Using custom Keyframe persona ID: {persona_id}')
                avatar = keyframe.AvatarSession(persona_id=persona_id)

            await avatar.start(session, room=room)
            audio_output = session.output.audio
            logger.info('✅ Keyframe avatar session started — video & audio publishing to LiveKit room.')
            return avatar
        except Exception as e:
            logger.error(f'❌ Failed to start Keyframe avatar session: {e}', exc_info=True)
            return None

    # Initial avatar session start
    await start_or_restart_avatar()

    # ── Auto-reconnect if Keyframe avatar participant disconnects in between ──
    @room.on("participant_disconnected")
    def on_participant_disconnected(participant: rtc.RemoteParticipant):
        if avatar and participant.identity == avatar.avatar_identity:
            logger.warning(f"⚠️ Keyframe avatar participant {participant.identity} disconnected! Auto-reconnecting to keep avatar alive...")
            asyncio.create_task(start_or_restart_avatar())

    # ── Listen for speak commands from Node.js backend ──
    @room.on("data_received")
    def on_data_received(data_packet: rtc.DataPacket):
        nonlocal current_speech_task
        try:
            payload = json.loads(data_packet.data.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return

        def stop_current_speech():
            if current_speech_task and not current_speech_task.done():
                current_speech_task.cancel()
                if hasattr(audio_output, 'clear_buffer'):
                    try:
                        audio_output.clear_buffer()
                    except Exception:
                        pass

        if payload.get('type') == 'stop':
            # A human specialist took over the call
            logger.info("Stop command received")
            stop_current_speech()

        elif payload.get('type') == 'speak':
            text = payload.get('text', '').strip()
            if text and audio_output:
                logger.info(f"Speak command received: {text[:80]}")
                stop_current_speech()
                voice = payload.get('voice') or default_voice
                current_speech_task = asyncio.create_task(fetch_mp3_and_push_frames(text, audio_output, voice))

    logger.info('Keyframe agent ready — listening for speak commands.')
    await asyncio.Event().wait()


if __name__ == '__main__':
    lk_url = os.getenv('LIVEKIT_URL', '').strip()
    lk_key = os.getenv('LIVEKIT_API_KEY', '').strip()
    lk_secret = os.getenv('LIVEKIT_API_SECRET', '').strip()

    if not lk_url or 'your-livekit-url' in lk_url:
        logger.error(f"❌ INVALID LIVEKIT_URL: '{lk_url}'. Please set LIVEKIT_URL in backend/.env to your real LiveKit Cloud URL!")
    else:
        logger.info(f"🚀 Starting Keyframe Agent with LiveKit URL: {lk_url} (key: {lk_key[:6]}...)")

    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name='keyframe-avatar',
            worker_type=agents.WorkerType.ROOM,
            num_idle_processes=0,
            initialize_process_timeout=60.0,
            ws_url=lk_url if (lk_url and 'your-livekit-url' not in lk_url) else None,
            api_key=lk_key if (lk_key and 'your-api-key' not in lk_key) else None,
            api_secret=lk_secret if (lk_secret and 'your-api-secret' not in lk_secret) else None,
        )
    )
