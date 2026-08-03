import { Server } from 'socket.io';
import { CallOrchestrator } from '../call/orchestrator.js';
import { generateToken } from '../call/room.js';
import { AgentDispatchClient } from 'livekit-server-sdk';
import Call from '../models/Call.js';
import Product from '../models/Product.js';
import { v4 as uuidv4 } from 'uuid';

const orchestrators = new Map();
const screenshotIntervals = new Map();

const STALE_CALL_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

function startStaleCallSweep() {
    setInterval(async () => {
        try {
            const cutoff = new Date(Date.now() - STALE_CALL_TIMEOUT_MS);
            const staleCalls = await Call.find({ status: 'active', createdAt: { $lt: cutoff } });

            for (const call of staleCalls) {
                if (orchestrators.has(call._id.toString())) continue;

                const duration = Math.floor((Date.now() - call.createdAt.getTime()) / 1000);
                await Call.findByIdAndUpdate(call._id, { status: 'failed', duration });
                console.log(`🧹 Swept stale call ${call._id} — marked failed`);
            }
        } catch (err) {
            console.log('❌ Stale call sweep error:', err.message);
        }
    }, 5 * 60 * 1000); // check every 5 minutes
}

export function initSocket(server) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
        : ['http://localhost:5173', 'http://localhost:5174'];

    const io = new Server(server, {
        cors: {
            origin: process.env.NODE_ENV === 'production' ? allowedOrigins : '*',
            methods: ['GET', 'POST']
        },
        maxHttpBufferSize: 10e6 // 10MB for audio blobs + screenshots
    });

    io.on('connection', (socket) => {
        console.log(`🔌 Socket connected: ${socket.id}`);

        // Visitor starts a demo
        socket.on('start-demo', async ({ productId, prospectName, prospectEmail }) => {
            try {
                console.log(`🎬 Starting demo for product: ${productId}`);

                const product = await Product.findById(productId);
                if (!product) {
                    socket.emit('error', 'Product not found');
                    return;
                }

                // Create call record
                const roomName = `demo-${productId}-${uuidv4()}`;
                const call = await Call.create({
                    productId,
                    clientId: product.clientId,
                    roomUrl: roomName,
                    status: 'active',
                    prospectName: prospectName || '',
                    prospectEmail: prospectEmail || ''
                });

                const callId = call._id.toString();
                socket.join(callId);

                // Generate LiveKit tokens
                const visitorToken = await generateToken(roomName, `visitor-${socket.id}`);
                const agentToken = await generateToken(roomName, 'agent-alex');

                // Send tokens to visitor
                socket.emit('demo-started', {
                    callId,
                    roomName,
                    visitorToken,
                    agentToken,
                    livekitUrl: process.env.LIVEKIT_URL
                });

                // Start orchestrator (pass roomName so it can send LiveKit data to Keyframe agent)
                const orchestrator = new CallOrchestrator(productId, callId, io, roomName);
                orchestrators.set(callId, orchestrator);
                await orchestrator.start();

                socket.activeCallId = callId;

                // Dispatch the Keyframe avatar agent to this room
                try {
                    const lkUrl = process.env.LIVEKIT_URL.replace('wss://', 'https://');
                    const agentDispatch = new AgentDispatchClient(
                        lkUrl,
                        process.env.LIVEKIT_API_KEY,
                        process.env.LIVEKIT_API_SECRET
                    );
                    await agentDispatch.createDispatch(roomName, 'keyframe-avatar');
                    console.log(`🎤 Keyframe agent dispatched to room: ${roomName}`);
                } catch (dispatchErr) {
                    console.warn('⚠️ Keyframe agent dispatch failed (is the Python agent running?):', dispatchErr.message);
                }

                // Start screenshot streaming every 1 second
                const screenshotInterval = setInterval(async () => {
                    try {
                        if (orchestrator.navigator.page) {
                            const screenshot = await orchestrator.navigator.page.screenshot({
                                type: 'jpeg',
                                quality: 60
                            });
                            const base64 = screenshot.toString('base64');
                            io.to(callId).emit('screen-update', { image: base64 });
                        }
                    } catch (err) {
                        // page might be navigating — skip this frame
                    }
                }, 1000);

                screenshotIntervals.set(callId, screenshotInterval);

            } catch (err) {
                console.log('❌ Start demo error:', err.message);
                socket.emit('demo-error', { message: err.message });
            }
        });

        // Receive complete audio blob from visitor (VAD-triggered on client)
        socket.on('audio-blob', async ({ callId, audio }) => {
            const orchestrator = orchestrators.get(callId);
            if (orchestrator) {
                const audioBuffer = Buffer.from(audio);
                await orchestrator.handleAudioBlob(audioBuffer);
            }
        });

        // Legacy: still accept streaming audio chunks for backward compatibility
        socket.on('audio-chunk', ({ callId, chunk }) => {
            // No longer used with Whisper — VAD on client sends complete blobs
            // Kept for potential future use
        });

        // Frontend signals that agent audio finished playing
        socket.on('audio-playback-complete', ({ callId }) => {
            const orchestrator = orchestrators.get(callId);
            if (orchestrator) {
                orchestrator.handleAudioPlaybackComplete();
            }
        });

        // Visitor ends demo
        socket.on('end-demo', async ({ callId, prospectEmail, prospectName }) => {
            try {
                // Stop screenshot interval
                const interval = screenshotIntervals.get(callId);
                if (interval) {
                    clearInterval(interval);
                    screenshotIntervals.delete(callId);
                }

                const orchestrator = orchestrators.get(callId);
                if (orchestrator) {
                    await orchestrator.end();
                    orchestrators.delete(callId);
                }

                socket.activeCallId = null;
                socket.emit('demo-ended', { callId });
                console.log(`🏁 Demo ended: ${callId}`);
            } catch (err) {
                console.log('❌ End demo error:', err.message);
            }
        });

        // Triggered by frontend when Keyframe video track attaches
        socket.on('avatar-ready', async ({ callId }) => {
            const orchestrator = orchestrators.get(callId);
            if (orchestrator) {
                await orchestrator.sendGreeting();
            }
        });

        // Handle disconnect
        socket.on('disconnect', async () => {
            console.log(`🔌 Socket disconnected: ${socket.id}`);

            const callId = socket.activeCallId;
            if (!callId) return;

            try {
                const interval = screenshotIntervals.get(callId);
                if (interval) {
                    clearInterval(interval);
                    screenshotIntervals.delete(callId);
                }

                const orchestrator = orchestrators.get(callId);
                if (orchestrator) {
                    await orchestrator.end('', '', 'failed');
                    orchestrators.delete(callId);
                    console.log(`⚠️ Call ${callId} marked failed (visitor disconnected)`);
                }
            } catch (err) {
                console.log('❌ Error cleaning up disconnected call:', err.message);
            }
        });
    });

    startStaleCallSweep();

    return io;
}