import dotenv from 'dotenv';
dotenv.config();

// ── Provider Keys ──
const DEEPGRAM_API_KEY   = (process.env.DEEPGRAM_API_KEY || '').replace(/['"]/g, '').trim();
const GROQ_API_KEY       = (process.env.GROQ_API_KEY || '').replace(/['"]/g, '').trim();
const OPENAI_API_KEY     = (process.env.OPENAI_API_KEY || '').replace(/['"]/g, '').trim();

// ── Config ──
const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo';
const DEEPGRAM_MODEL     = process.env.DEEPGRAM_MODEL || 'nova-2';
const STT_BASE_URL       = process.env.STT_BASE_URL || 'http://localhost:8787';
const STT_MODEL          = process.env.STT_MODEL || 'base';
const STT_LANGUAGE       = process.env.STT_LANGUAGE || 'en';

// Log active STT provider on startup
const activePrimary = DEEPGRAM_API_KEY ? 'Deepgram Nova-2' :
                      GROQ_API_KEY ? 'Groq Whisper' :
                      OPENAI_API_KEY ? 'OpenAI Whisper' : 'Local Whisper';
console.log(`🎙️ STT Provider: ${activePrimary} (with cascading fallbacks)`);

/**
 * Transcribe audio using a 4-tier cascade for maximum reliability and speed:
 *
 *   1. Deepgram Nova-2  — ~150ms, best for voice agents, no hallucinations
 *   2. Groq Whisper     — ~200ms, free cloud Whisper-Large-V3-Turbo
 *   3. OpenAI Whisper   — ~400ms, paid but very reliable
 *   4. Local Whisper    — CPU fallback (only if no cloud keys are configured)
 *
 * @param {Buffer} audioBuffer - WebM/WAV audio data from the client
 * @param {string} [language]  - Language hint (default: 'en')
 * @returns {Promise<{text: string, language: string}>}
 */
export async function transcribeAudio(audioBuffer, language) {
    const lang = language || STT_LANGUAGE || 'en';
    const startMs = Date.now();

    // ════════════════════════════════════════════════════
    // TIER 1: Deepgram Nova-2 (Primary — Fastest, Best for Voice Agents)
    // ════════════════════════════════════════════════════
    if (DEEPGRAM_API_KEY && !DEEPGRAM_API_KEY.includes('your-')) {
        try {
            const params = new URLSearchParams({
                model: DEEPGRAM_MODEL,
                language: lang !== 'auto' ? lang : '',
                smart_format: 'true',
                punctuate: 'true',
            });
            // Remove empty params
            for (const [key, val] of params) {
                if (!val) params.delete(key);
            }

            const response = await fetch(
                `https://api.deepgram.com/v1/listen?${params.toString()}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Token ${DEEPGRAM_API_KEY}`,
                        'Content-Type': 'audio/webm',
                    },
                    body: audioBuffer,  // Raw binary — no FormData overhead
                    signal: AbortSignal.timeout(5000),
                }
            );

            if (response.ok) {
                const data = await response.json();
                const alt = data.results?.channels?.[0]?.alternatives?.[0];
                const transcript = (alt?.transcript || '').trim();
                const confidence = alt?.confidence || 0;
                const detectedLang = data.results?.channels?.[0]?.detected_language || lang;
                const elapsed = Date.now() - startMs;

                if (transcript) {
                    console.log(`🗣️ [Deepgram ${DEEPGRAM_MODEL}] (${elapsed}ms, conf: ${(confidence * 100).toFixed(0)}%) Heard: "${transcript}"`);
                } else {
                    console.log(`🔇 [Deepgram] Empty transcript (${elapsed}ms) — likely silence`);
                }
                return { text: transcript, language: detectedLang };
            } else {
                const errorText = await response.text();
                console.warn(`⚠️ Deepgram ${response.status}: ${errorText.substring(0, 150)} — falling back to Groq`);
            }
        } catch (dgErr) {
            console.warn(`⚠️ Deepgram timeout/error (${Date.now() - startMs}ms):`, dgErr.message, '— falling back to Groq');
        }
    }

    // ════════════════════════════════════════════════════
    // TIER 2: Groq Cloud Whisper (Secondary — Free, Fast)
    // ════════════════════════════════════════════════════
    if (GROQ_API_KEY && !GROQ_API_KEY.includes('your-')) {
        try {
            const formData = new FormData();
            const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });
            formData.append('file', audioBlob, 'recording.webm');
            formData.append('model', GROQ_WHISPER_MODEL);
            if (lang && lang !== 'auto') {
                formData.append('language', lang);
            }
            formData.append('response_format', 'json');

            const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                },
                body: formData,
                signal: AbortSignal.timeout(5000),
            });

            if (response.ok) {
                const data = await response.json();
                const transcript = data.text?.trim() || '';
                const elapsed = Date.now() - startMs;
                if (transcript) {
                    console.log(`🗣️ [Groq Whisper] (${elapsed}ms) Heard: "${transcript}"`);
                } else {
                    console.log(`🔇 [Groq Whisper] Empty transcript (${elapsed}ms)`);
                }
                return { text: transcript, language: data.language || lang };
            } else {
                const errorText = await response.text();
                console.warn(`⚠️ Groq STT ${response.status}: ${errorText.substring(0, 150)} — falling back to OpenAI`);
            }
        } catch (groqErr) {
            console.warn(`⚠️ Groq STT timeout/error (${Date.now() - startMs}ms):`, groqErr.message, '— falling back');
        }
    }

    // ════════════════════════════════════════════════════
    // TIER 3: OpenAI Whisper (Tertiary — Paid, Reliable)
    // ════════════════════════════════════════════════════
    if (OPENAI_API_KEY && !OPENAI_API_KEY.includes('your-')) {
        try {
            const formData = new FormData();
            const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });
            formData.append('file', audioBlob, 'recording.webm');
            formData.append('model', 'whisper-1');
            if (lang && lang !== 'auto') formData.append('language', lang);

            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                },
                body: formData,
                signal: AbortSignal.timeout(6000),
            });

            if (response.ok) {
                const data = await response.json();
                const transcript = data.text?.trim() || '';
                const elapsed = Date.now() - startMs;
                if (transcript) {
                    console.log(`🗣️ [OpenAI Whisper] (${elapsed}ms) Heard: "${transcript}"`);
                }
                return { text: transcript, language: lang };
            } else {
                console.warn(`⚠️ OpenAI STT ${response.status} — falling back to local`);
            }
        } catch (oaErr) {
            console.warn(`⚠️ OpenAI STT timeout/error (${Date.now() - startMs}ms):`, oaErr.message);
        }
    }

    // ════════════════════════════════════════════════════
    // TIER 4: Local Faster-Whisper (Last Resort — CPU Heavy)
    // ════════════════════════════════════════════════════
    try {
        const formData = new FormData();
        const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });
        formData.append('file', audioBlob, 'recording.webm');
        formData.append('model', STT_MODEL);
        if (lang && lang !== 'auto') formData.append('language', lang);
        formData.append('response_format', 'json');

        const response = await fetch(`${STT_BASE_URL}/v1/audio/transcriptions`, {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(8000),
        });

        if (response.ok) {
            const data = await response.json();
            const transcript = data.text?.trim() || '';
            const detectedLang = data.language || lang;
            const elapsed = Date.now() - startMs;
            if (transcript) {
                console.log(`🗣️ [Local Whisper] (${elapsed}ms) Heard: "${transcript}"`);
            }
            return { text: transcript, language: detectedLang };
        } else {
            const errorText = await response.text();
            console.log('❌ Local STT error:', errorText);
        }
    } catch (localErr) {
        console.warn(`⚠️ Local STT unavailable: ${localErr.message}`);
    }

    // All tiers failed
    console.log('❌ All STT providers failed — returning empty transcript');
    return { text: '', language: lang };
}

/**
 * Check if at least one STT provider is configured and healthy.
 */
export async function checkSTTHealth() {
    // Cloud providers are always "healthy" if configured
    if (DEEPGRAM_API_KEY || GROQ_API_KEY || OPENAI_API_KEY) return true;

    // Check local Whisper server
    try {
        const res = await fetch(`${STT_BASE_URL}/health`, {
            signal: AbortSignal.timeout(3000),
        });
        return res.ok;
    } catch {
        return false;
    }
}