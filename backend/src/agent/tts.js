import dotenv from 'dotenv';
dotenv.config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // "Bella" — natural female voice

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const TTS_BASE_URL = process.env.TTS_BASE_URL || 'http://localhost:8000';

/**
 * Generate TTS audio for the given text.
 * Priority: ElevenLabs → OpenAI TTS → Local TTS server
 *
 * Returns a Buffer (MP3) that can be emitted directly to the browser.
 *
 * @param {string} text
 * @param {AbortSignal} [signal]
 * @returns {Promise<Buffer>}
 */
export async function speak(text, signal) {
    try {
        console.log(`🔊 TTS: "${text.substring(0, 60)}..."`);

        if (ELEVENLABS_API_KEY) {
            // ── ElevenLabs (Primary — most natural, Sofia-like voice) ──
            const response = await fetch(
                `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
                {
                    method: 'POST',
                    headers: {
                        'xi-api-key': ELEVENLABS_API_KEY,
                        'Content-Type': 'application/json',
                        'Accept': 'audio/mpeg',
                    },
                    body: JSON.stringify({
                        text,
                        model_id: 'eleven_turbo_v2_5', // Fastest, lowest latency
                        voice_settings: {
                            stability: 0.5,
                            similarity_boost: 0.75,
                            style: 0.0,
                            use_speaker_boost: true,
                        },
                        output_format: 'mp3_44100_128',
                    }),
                    signal,
                }
            );

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`ElevenLabs TTS error: ${response.status} — ${err.slice(0, 200)}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            console.log(`✅ [ElevenLabs] TTS audio: ${buffer.length} bytes`);
            return buffer;

        } else if (OPENAI_API_KEY) {
            // ── OpenAI TTS (Secondary) ──
            const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text,
                    voice: 'nova', // Most natural female voice
                    speed: 1.0,
                    response_format: 'mp3',
                }),
                signal,
            });

            if (!response.ok) {
                throw new Error(`OpenAI TTS error: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            console.log(`✅ [OpenAI TTS] audio: ${buffer.length} bytes`);
            return buffer;

        } else {
            // ── Local TTS server (fallback) ──
            const response = await fetch(`${TTS_BASE_URL}/v1/audio/speech`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text,
                    voice: 'alloy',
                    speed: 1.0,
                    response_format: 'mp3'
                }),
                signal,
            });

            if (!response.ok) {
                throw new Error(`Local TTS error: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            console.log(`✅ [Local TTS] audio: ${buffer.length} bytes`);
            return buffer;
        }

    } catch (err) {
        if (err.name === 'AbortError') throw err;
        console.log('❌ TTS error:', err.message);
        throw err;
    }
}