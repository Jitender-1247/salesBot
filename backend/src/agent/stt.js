import dotenv from 'dotenv';
dotenv.config();

const GROQ_API_KEY       = process.env.GROQ_API_KEY;
const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo';

const OPENAI_API_KEY     = process.env.OPENAI_API_KEY;

const STT_BASE_URL       = process.env.STT_BASE_URL || 'http://localhost:8787';
const STT_MODEL          = process.env.STT_MODEL || 'base';
const STT_LANGUAGE       = process.env.STT_LANGUAGE || 'en';

/**
 * Transcribe an audio buffer using Groq Whisper API (primary, free & fast),
 * OpenAI Whisper API (secondary), or local Faster-Whisper server (fallback).
 *
 * Uses native Web API Blob & FormData supported in Node 18+
 * to avoid multipart EOF errors with legacy form-data libraries.
 *
 * @param {Buffer} audioBuffer - WAV/WebM audio data
 * @param {string} [language] - Language hint (default: 'en')
 * @returns {Promise<{text: string, language: string}>}
 */
export async function transcribeAudio(audioBuffer, language) {
    try {
        const lang = language || STT_LANGUAGE || 'en';

        if (GROQ_API_KEY) {
            // ── Groq Whisper (Primary — Free, fast, high-accuracy) ──
            const formData = new FormData();
            const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });
            formData.append('file', audioBlob, 'recording.webm');
            formData.append('model', GROQ_WHISPER_MODEL);
            formData.append('language', lang);
            formData.append('response_format', 'json');

            const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                },
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log('❌ Groq STT error:', errorText);
                throw new Error(`Groq STT error: ${response.status}`);
            }

            const data = await response.json();
            const transcript = data.text?.trim() || '';
            if (transcript) {
                console.log(`🗣️ [Groq Whisper] Heard: "${transcript}"`);
            }
            return { text: transcript, language: data.language || lang };

        } else if (OPENAI_API_KEY) {
            // ── OpenAI Whisper (Secondary) ──
            const formData = new FormData();
            const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });
            formData.append('file', audioBlob, 'recording.webm');
            formData.append('model', 'whisper-1');
            formData.append('language', lang);

            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                },
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log('❌ OpenAI STT error:', errorText);
                throw new Error(`OpenAI STT error: ${response.status}`);
            }

            const data = await response.json();
            const transcript = data.text?.trim() || '';
            if (transcript) {
                console.log(`🗣️ [OpenAI Whisper] Heard: "${transcript}"`);
            }
            return { text: transcript, language: lang };

        } else {
            // ── Local Faster-Whisper (Offline fallback) ──
            const formData = new FormData();
            const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });
            formData.append('file', audioBlob, 'recording.webm');
            formData.append('model', STT_MODEL);
            formData.append('language', lang);
            formData.append('response_format', 'json');

            const response = await fetch(`${STT_BASE_URL}/v1/audio/transcriptions`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log('❌ Local STT error:', errorText);
                throw new Error(`Local STT error: ${response.status}`);
            }

            const data = await response.json();
            const transcript = data.text?.trim() || '';
            const detectedLang = data.language || lang;
            if (transcript) {
                console.log(`🗣️ [Local Whisper] Heard: "${transcript}"`);
            }
            return { text: transcript, language: detectedLang };
        }

    } catch (err) {
        console.log('❌ STT error:', err.message);
        return { text: '', language: language || 'en' };
    }
}

/**
 * Check if STT is configured and healthy.
 */
export async function checkSTTHealth() {
    if (GROQ_API_KEY || OPENAI_API_KEY) return true;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${STT_BASE_URL}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        return res.ok;
    } catch {
        return false;
    }
}