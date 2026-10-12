import dotenv from 'dotenv';
dotenv.config();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // "Bella" — natural female voice

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const TTS_BASE_URL = process.env.TTS_BASE_URL || 'http://localhost:8000';

/**
 * Split text into speakable chunks (sentences).
 * Each chunk is short enough for fast TTS but long enough to sound natural.
 */
function splitIntoSentences(text) {
    // Split on sentence boundaries, keeping the delimiter
    const parts = text.split(/(?<=[.!?])\s+/);
    const chunks = [];
    let current = '';

    for (const part of parts) {
        if ((current + ' ' + part).length > 200 && current) {
            chunks.push(current.trim());
            current = part;
        } else {
            current = current ? current + ' ' + part : part;
        }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks.length > 0 ? chunks : [text];
}

/**
 * Generate TTS audio for a single text chunk.
 * Priority: ElevenLabs → OpenAI TTS → Local TTS server
 *
 * @param {string} text
 * @param {AbortSignal} [signal]
 * @returns {Promise<Buffer>}
 */
async function speakChunk(text, signal) {
    // ── 1. ElevenLabs (Primary if configured) ──
    if (ELEVENLABS_API_KEY && !ELEVENLABS_API_KEY.includes('your-eleven')) {
        try {
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

            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                return Buffer.from(arrayBuffer);
            } else {
                const err = await response.text();
                console.warn(`⚠️ ElevenLabs TTS ${response.status}: ${err.slice(0, 100)} — falling back`);
            }
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.warn(`⚠️ ElevenLabs error: ${err.message} — falling back`);
        }
    }

    // ── 2. OpenAI TTS (Secondary) ──
    if (OPENAI_API_KEY && !OPENAI_API_KEY.includes('your-openai')) {
        try {
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

            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                return Buffer.from(arrayBuffer);
            } else {
                console.warn(`⚠️ OpenAI TTS ${response.status} — falling back to local TTS`);
            }
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.warn(`⚠️ OpenAI TTS error: ${err.message} — falling back to local TTS`);
        }
    }

    // ── 3. Local TTS server (Always reliable Edge-TTS) ──
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

    if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } else {
        throw new Error(`Local TTS error: ${response.status}`);
    }
}

/**
 * Generate TTS audio for the given text.
 * If emitter is provided, streams sentence-by-sentence chunks to the client
 * so audio starts playing within ~500ms (instead of waiting for full generation).
 *
 * @param {string} text
 * @param {AbortSignal} [signal]
 * @param {{ emit: Function }} [emitter] - Socket.IO room emitter for chunked streaming
 * @returns {Promise<Buffer|null>} - Full buffer if no emitter, null if streamed via emitter
 */
export async function speak(text, signal, emitter) {
    const startMs = Date.now();
    console.log(`🔊 TTS: "${text.substring(0, 60)}..."`);

    // ── Streaming mode: split into sentences, emit each chunk as it's ready ──
    if (emitter) {
        const sentences = splitIntoSentences(text);
        let totalBytes = 0;

        for (let i = 0; i < sentences.length; i++) {
            if (signal?.aborted) {
                console.log('🛑 TTS aborted mid-stream');
                break;
            }

            try {
                const chunkBuffer = await speakChunk(sentences[i], signal);
                if (chunkBuffer && chunkBuffer.length > 0) {
                    emitter.emit('agent-audio', chunkBuffer);
                    totalBytes += chunkBuffer.length;

                    if (i === 0) {
                        console.log(`🔊 [TTS Stream] First chunk sent in ${Date.now() - startMs}ms (${chunkBuffer.length} bytes)`);
                    }
                }
            } catch (err) {
                if (err.name === 'AbortError') throw err;
                console.warn(`⚠️ TTS chunk ${i + 1}/${sentences.length} failed:`, err.message);
            }
        }

        console.log(`✅ [TTS Stream] Complete: ${sentences.length} chunks, ${totalBytes} bytes, ${Date.now() - startMs}ms`);
        return null; // Already streamed
    }

    // ── Non-streaming mode: generate full buffer at once (legacy fallback) ──
    try {
        const buffer = await speakChunk(text, signal);
        console.log(`✅ [TTS] audio: ${buffer.length} bytes (${Date.now() - startMs}ms)`);
        return buffer;
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        console.error('❌ All TTS providers failed:', err.message);
        throw err;
    }
}