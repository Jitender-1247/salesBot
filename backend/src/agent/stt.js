import dotenv from 'dotenv';
dotenv.config();

const STT_BASE_URL = process.env.STT_BASE_URL || 'http://localhost:8787';
const STT_MODEL = process.env.STT_MODEL || 'base';
const STT_LANGUAGE = process.env.STT_LANGUAGE || 'en';

/**
 * Transcribe an audio blob using local Faster-Whisper server.
 * This replaces the old Deepgram WebSocket streaming approach
 * with a simpler HTTP batch transcription.
 *
 * @param {Buffer} audioBuffer - WAV/WebM audio data
 * @param {string} [language] - Language hint (default: 'en')
 * @returns {Promise<{text: string, language: string}>}
 */
export async function transcribeAudio(audioBuffer, language) {
    try {
        const formData = new FormData();
        const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });
        formData.append('file', audioBlob, 'recording.webm');
        formData.append('model', STT_MODEL);
        formData.append('language', language || STT_LANGUAGE);
        formData.append('response_format', 'json');

        const response = await fetch(`${STT_BASE_URL}/v1/audio/transcriptions`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log('❌ STT error:', errorText);
            throw new Error(`STT server error: ${response.status}`);
        }

        const data = await response.json();
        const transcript = data.text?.trim() || '';
        const detectedLang = data.language || language || 'en';

        if (transcript) {
            console.log(`🗣️ Heard: ${transcript}`);
        }

        return { text: transcript, language: detectedLang };
    } catch (err) {
        console.log('❌ STT error:', err.message);
        return { text: '', language: language || 'en' };
    }
}

/**
 * Check if the STT server is healthy.
 * @returns {Promise<boolean>}
 */
export async function checkSTTHealth() {
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