/**
 * D-ID Streaming API Proxy Routes
 * 
 * These routes proxy D-ID Streaming API calls from the frontend so the API key
 * never has to be exposed in the browser. The frontend handles the WebRTC
 * peer connection; this backend handles the authenticated API calls.
 */
import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

const D_ID_API_KEY = process.env.D_ID_API_KEY;
const D_ID_API_BASE_URL = process.env.D_ID_API_BASE_URL || 'https://api.d-id.com';
const D_ID_SOURCE_URL = process.env.D_ID_SOURCE_URL;

function getAuthHeader() {
    if (!D_ID_API_KEY) return '';
    return D_ID_API_KEY.includes(':')
        ? `Basic ${Buffer.from(D_ID_API_KEY).toString('base64')}`
        : `Bearer ${D_ID_API_KEY}`;
}

// POST /api/did-stream/create
// Creates a new D-ID streaming session and returns ICE server config
router.post('/create', async (req, res) => {
    if (!D_ID_API_KEY) {
        return res.status(400).json({ error: 'D-ID API key not configured' });
    }

    try {
        const response = await fetch(`${D_ID_API_BASE_URL}/talks/streams`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthHeader(),
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                source_url: D_ID_SOURCE_URL,
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('D-ID create stream error:', response.status, text);
            return res.status(response.status).json({ error: 'D-ID stream creation failed', details: text });
        }

        const data = await response.json();
        // Returns { id, session_id, offer, ice_servers }
        return res.json(data);
    } catch (err) {
        console.error('D-ID create stream exception:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/did-stream/sdp
// Sends the client's SDP answer to D-ID to complete WebRTC negotiation
router.post('/sdp', async (req, res) => {
    const { streamId, sessionId, answer } = req.body;
    if (!streamId || !sessionId || !answer) {
        return res.status(400).json({ error: 'streamId, sessionId and answer are required' });
    }

    try {
        const response = await fetch(`${D_ID_API_BASE_URL}/talks/streams/${streamId}/sdp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthHeader(),
                'Accept': 'application/json',
            },
            body: JSON.stringify({ answer, session_id: sessionId }),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('D-ID SDP error:', response.status, text);
            return res.status(response.status).json({ error: 'D-ID SDP exchange failed', details: text });
        }

        return res.json({ ok: true });
    } catch (err) {
        console.error('D-ID SDP exception:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/did-stream/ice
// Forwards ICE candidates from the client to D-ID
router.post('/ice', async (req, res) => {
    const { streamId, sessionId, candidate } = req.body;
    if (!streamId || !sessionId) {
        return res.status(400).json({ error: 'streamId and sessionId are required' });
    }

    try {
        const response = await fetch(`${D_ID_API_BASE_URL}/talks/streams/${streamId}/ice`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthHeader(),
                'Accept': 'application/json',
            },
            body: JSON.stringify({ candidate: candidate || null, session_id: sessionId }),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('D-ID ICE error:', response.status, text);
            return res.status(response.status).json({ error: 'D-ID ICE exchange failed', details: text });
        }

        return res.json({ ok: true });
    } catch (err) {
        console.error('D-ID ICE exception:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /api/did-stream/talk
// Sends audio/text to D-ID to animate the avatar
router.post('/talk', async (req, res) => {
    const { streamId, sessionId, audioBase64, mimeType } = req.body;
    if (!streamId || !sessionId) {
        return res.status(400).json({ error: 'streamId and sessionId are required' });
    }

    try {
        let script;
        if (audioBase64) {
            // Send raw audio for the avatar to lip-sync to
            script = {
                type: 'audio',
                audio_url: `data:${mimeType || 'audio/mpeg'};base64,${audioBase64}`,
            };
        } else {
            return res.status(400).json({ error: 'audioBase64 is required' });
        }

        const payload = {
            script,
            session_id: sessionId,
            config: {
                stitch: true,
                fluent: true,
                pad_audio: 0.0,
            },
        };

        const response = await fetch(`${D_ID_API_BASE_URL}/talks/streams/${streamId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthHeader(),
                'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error('D-ID talk error:', response.status, text);
            return res.status(response.status).json({ error: 'D-ID talk failed', details: text });
        }

        const data = await response.json();
        return res.json(data);
    } catch (err) {
        console.error('D-ID talk exception:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// DELETE /api/did-stream/:streamId
// Closes a D-ID stream session to free up quota
router.delete('/:streamId', async (req, res) => {
    const { streamId } = req.params;
    const { sessionId } = req.body;

    try {
        const response = await fetch(`${D_ID_API_BASE_URL}/talks/streams/${streamId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthHeader(),
                'Accept': 'application/json',
            },
            body: JSON.stringify({ session_id: sessionId }),
        });

        return res.json({ ok: true });
    } catch (err) {
        console.error('D-ID delete stream exception:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

export default router;
