import dotenv from 'dotenv';
dotenv.config();

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

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

const DEEPGRAM_DEFAULT_MODEL = 'aura-2-thalia-en';

async function deepgramTTS(text, signal, voiceId) {
    if (!DEEPGRAM_API_KEY) return null;
    const model = /^aura-/.test(voiceId || '') ? voiceId : DEEPGRAM_DEFAULT_MODEL;
    const response = await fetch(
        `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}&encoding=mp3`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Token ${DEEPGRAM_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text }),
            signal,
        }
    );
    if (!response.ok) {
        const err = await response.text();
        console.warn(`⚠️ Deepgram TTS ${response.status}: ${err.slice(0, 100)} — falling back`);
        return null;
    }
    const buf = Buffer.from(await response.arrayBuffer());
    if (buf.length === 0) console.warn('⚠️ Deepgram TTS returned empty audio — falling back');
    return buf.length > 0 ? buf : null;
}

async function elevenLabsTTS(text, signal, voiceId) {
    if (!ELEVENLABS_API_KEY || ELEVENLABS_API_KEY.includes('your-eleven')) return null;
    const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId || ELEVENLABS_VOICE_ID)}`,
        {
            method: 'POST',
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg',
            },
            body: JSON.stringify({
                text,
                model_id: 'eleven_turbo_v2_5',
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
        console.warn(`⚠️ ElevenLabs TTS ${response.status}: ${err.slice(0, 100)} — falling back`);
        return null;
    }
    return Buffer.from(await response.arrayBuffer());
}

async function openAiTTS(text, signal, voiceId) {
    if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('your-openai')) return null;
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'tts-1',
            input: text,
            voice: voiceId || 'nova',
            speed: 1.0,
            response_format: 'mp3',
        }),
        signal,
    });
    if (!response.ok) {
        console.warn(`⚠️ OpenAI TTS ${response.status} — falling back`);
        return null;
    }
    return Buffer.from(await response.arrayBuffer());
}

const PROVIDERS = { deepgram: deepgramTTS, elevenlabs: elevenLabsTTS, openai: openAiTTS };

/**
 * Generate TTS audio for a single text chunk.
 * The persona's chosen provider/voice goes first, then: Deepgram Aura → ElevenLabs → OpenAI TTS → Local TTS server.
 * Fallback providers use their own default voice (a voice id only means something to its provider).
 *
 * @param {string} text
 * @param {AbortSignal} [signal]
 * @param {{ provider?: string, id?: string }} [voice]
 * @returns {Promise<Buffer>}
 */
async function speakChunk(text, signal, voice = {}) {
    const preferred = PROVIDERS[voice.provider] ? voice.provider : 'deepgram';
    const order = [preferred, ...['deepgram', 'elevenlabs', 'openai'].filter(p => p !== preferred)];

    for (const provider of order) {
        try {
            const buf = await PROVIDERS[provider](text, signal, provider === preferred ? voice.id : undefined);
            if (buf) return buf;
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.warn(`⚠️ ${provider} TTS error: ${err.message} — falling back`);
        }
    }

    // ── Local TTS server (Edge-TTS — works locally, may be blocked on EC2) ──
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
 * Split a reply into short speakable pieces for low-latency streaming.
 * Deepgram's total time grows with text length (~0.9s for a short sentence, ~3s for a long reply),
 * so every sentence is its own request, and a long opening sentence is cut at its first clause
 * to get the first audio out quickly.
 */
function splitForStreaming(text) {
    const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    if (sentences.length === 0) return [text];

    // Glue tiny fragments ("Sure!") onto the next piece so we don't pay a request per word
    const pieces = [];
    for (const s of sentences) {
        const last = pieces[pieces.length - 1];
        if (last && last.length < 20) pieces[pieces.length - 1] = `${last} ${s}`;
        else pieces.push(s);
    }

    // Then cut a long opening piece at its first clause break, so the first audio is short and fast
    const first = pieces[0];
    if (first.length > 90) {
        const cut = first.slice(25).search(/[,;:—–]\s/);
        if (cut !== -1) {
            const at = 25 + cut + 1;
            pieces.splice(0, 1, first.slice(0, at).trim(), first.slice(at).trim());
        }
    }
    return pieces;
}

const MAX_PARALLEL_TTS = 3;

/**
 * Low-latency speech for chat widgets: synthesizes sentences in parallel (bounded) and hands each
 * one over IN ORDER as soon as it is ready, together with its text so the widget can show the
 * caption exactly when that audio starts playing.
 *
 * @param {string} text
 * @param {{ signal?: AbortSignal, voice?: object, onChunk: (chunk: { audio: Buffer, text: string, index: number, total: number }) => void }} opts
 * @returns {Promise<number>} number of chunks delivered
 */
export async function streamSpeech(text, { signal, voice, onChunk }) {
    const startMs = Date.now();
    const pieces = splitForStreaming(text);
    const results = new Array(pieces.length);
    let nextToStart = 0;
    let delivered = 0;

    const startNext = () => {
        if (nextToStart >= pieces.length) return;
        const i = nextToStart++;
        results[i] = speakChunk(pieces[i], signal, voice).catch(err => {
            if (err.name !== 'AbortError') console.warn(`⚠️ TTS piece ${i + 1}/${pieces.length} failed:`, err.message);
            return null;
        });
    };
    for (let k = 0; k < MAX_PARALLEL_TTS; k++) startNext();

    for (let i = 0; i < pieces.length; i++) {
        const audio = await results[i];
        startNext();
        if (signal?.aborted) break;
        if (!audio?.length) continue;
        onChunk({ audio, text: pieces[i], index: i, total: pieces.length });
        if (delivered === 0) console.log(`🔊 [TTS] First audio in ${Date.now() - startMs}ms (${pieces.length} pieces)`);
        delivered++;
    }
    return delivered;
}

export const PCM_SAMPLE_RATE = 24000;
const DEEPGRAM_TTS_HOST = process.env.DEEPGRAM_TTS_HOST || 'api.deepgram.com';

/**
 * True streaming speech (lowest latency): ONE Deepgram request for the whole reply, raw 16-bit PCM
 * forwarded as it arrives. Measured from EC2: first audio ~0.4s, and generation stays ahead of
 * real-time playback, so the widget can start playing immediately without gaps.
 *
 * onPcm(buffer) receives even-length Int16 LE mono chunks at PCM_SAMPLE_RATE: ~100ms for the
 * first one (fast start), ~200ms after that (fewer socket messages).
 *
 * @returns {Promise<number>} PCM bytes delivered; 0 means nothing was streamed (caller should fall back)
 */
export async function streamPcmSpeech(text, { signal, voice = {}, onPcm }) {
    if (!DEEPGRAM_API_KEY || (voice.provider && voice.provider !== 'deepgram')) return 0;
    const model = /^aura-/.test(voice.id || '') ? voice.id : DEEPGRAM_DEFAULT_MODEL;
    const startMs = Date.now();

    let response;
    try {
        response = await fetch(
            `https://${DEEPGRAM_TTS_HOST}/v1/speak?model=${encodeURIComponent(model)}&encoding=linear16&sample_rate=${PCM_SAMPLE_RATE}&container=none`,
            {
                method: 'POST',
                headers: { 'Authorization': `Token ${DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
                signal,
            }
        );
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        console.warn(`⚠️ Deepgram PCM stream error: ${err.message} — falling back`);
        return 0;
    }
    if (!response.ok || !response.body) {
        console.warn(`⚠️ Deepgram PCM stream ${response.status} — falling back`);
        return 0;
    }

    const FIRST_BATCH = PCM_SAMPLE_RATE * 2 / 10;  // 100ms
    const NEXT_BATCH = PCM_SAMPLE_RATE * 2 / 5;    // 200ms
    let pending = [];
    let pendingBytes = 0;
    let delivered = 0;

    const flush = (force) => {
        const threshold = delivered === 0 ? FIRST_BATCH : NEXT_BATCH;
        if (!pendingBytes || (!force && pendingBytes < threshold)) return;
        let buf = Buffer.concat(pending, pendingBytes);
        let carry = null;
        if (buf.length % 2) {            // keep Int16 samples whole across packets
            carry = buf.subarray(buf.length - 1);
            buf = buf.subarray(0, buf.length - 1);
        }
        pending = carry ? [Buffer.from(carry)] : [];
        pendingBytes = carry ? 1 : 0;
        if (!buf.length) return;
        if (delivered === 0) console.log(`🔊 [TTS] First streamed audio in ${Date.now() - startMs}ms`);
        delivered += buf.length;
        onPcm(buf);
    };

    const reader = response.body.getReader();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            pending.push(Buffer.from(value));
            pendingBytes += value.length;
            flush(false);
        }
        flush(true);
    } catch (err) {
        if (err.name === 'AbortError' || signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        console.warn(`⚠️ Deepgram PCM stream interrupted: ${err.message}`);
    }
    return delivered;
}

/**
 * Generate TTS audio for the given text.
 * If emitter is provided, streams sentence-by-sentence chunks to the client
 * so audio starts playing within ~500ms (instead of waiting for full generation).
 *
 * @param {string} text
 * @param {AbortSignal} [signal]
 * @param {{ emit: Function }} [emitter] - Socket.IO room emitter for chunked streaming
 * @param {{ provider?: string, id?: string }} [voice] - persona voice
 * @returns {Promise<Buffer|null>} - Full buffer if no emitter, null if streamed via emitter
 */
export async function speak(text, signal, emitter, voice) {
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
                const chunkBuffer = await speakChunk(sentences[i], signal, voice);
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
        const buffer = await speakChunk(text, signal, voice);
        console.log(`✅ [TTS] audio: ${buffer.length} bytes (${Date.now() - startMs}ms)`);
        return buffer;
    } catch (err) {
        if (err.name === 'AbortError') throw err;
        console.error('❌ All TTS providers failed:', err.message);
        throw err;
    }
}