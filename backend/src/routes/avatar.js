import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

const D_ID_API_KEY = process.env.D_ID_API_KEY;
const D_ID_API_BASE_URL = process.env.D_ID_API_BASE_URL || 'https://api.d-id.com';
const D_ID_SOURCE_URL = process.env.D_ID_SOURCE_URL || 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=640';
const D_ID_VOICE = process.env.D_ID_VOICE || 'alloy';
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ITERATIONS = 25;

function getAuthHeader() {
    if (!D_ID_API_KEY) return '';
    return D_ID_API_KEY.includes(':')
        ? `Basic ${Buffer.from(D_ID_API_KEY).toString('base64')}`
        : `Bearer ${D_ID_API_KEY}`;
}

function findResultUrl(data) {
    return (
        data.resultUrl ||
        data.result_url ||
        data.url ||
        data.video_url ||
        data.output_url ||
        data.data?.resultUrl ||
        data.data?.result_url ||
        data.data?.url
    );
}

async function pollForResult(id) {
    const statusUrl = `${D_ID_API_BASE_URL}/v1/talks/${id}`;
    const authHeader = getAuthHeader();

    for (let i = 0; i < MAX_POLL_ITERATIONS; i++) {
        const res = await fetch(statusUrl, {
            headers: {
                Authorization: authHeader,
                Accept: 'application/json',
            },
        });

        if (!res.ok) {
            throw new Error(`D-ID status poll failed: ${res.status}`);
        }

        const statusData = await res.json();
        const resultUrl = findResultUrl(statusData);
        if (resultUrl) return resultUrl;

        if (statusData.status === 'failed' || statusData.status === 'error') {
            throw new Error(`D-ID generation failed: ${JSON.stringify(statusData)}`);
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    return undefined;
}

// POST /api/avatar — Generate talking avatar video from text
router.post('/', async (req, res) => {
    const enabled = process.env.D_ID_ENABLED === 'true';
    if (!enabled || !D_ID_API_KEY) {
        return res.status(400).json({ error: 'D-ID integration is disabled or missing API key' });
    }

    try {
        const { text } = req.body;
        if (!text || typeof text !== 'string') {
            return res.status(400).json({ error: 'Text is required' });
        }

        const payload = {
            source_url: D_ID_SOURCE_URL,
            script: [
                {
                    type: 'talk',
                    voice: D_ID_VOICE,
                    input: text,
                },
            ],
        };

        const authHeader = getAuthHeader();

        const response = await fetch(`${D_ID_API_BASE_URL}/v1/talks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: authHeader,
                Accept: 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const details = await response.text();
            return res.status(response.status).json({ error: 'D-ID request failed', details });
        }

        const data = await response.json();
        const directResult = findResultUrl(data);
        if (directResult) {
            return res.json({ resultUrl: directResult });
        }

        const id = data.id || data.talk_id || data.output_id;
        if (!id) {
            return res.status(500).json({ error: 'D-ID response did not include a result URL or activity ID' });
        }

        const resultUrl = await pollForResult(id);
        if (!resultUrl) {
            return res.status(504).json({ error: 'D-ID video generation timed out' });
        }

        return res.json({ resultUrl });
    } catch (error) {
        console.log('❌ Avatar error:', error.message);
        return res.status(500).json({ error: 'Failed to generate D-ID avatar', details: String(error) });
    }
});

export default router;
