import { Server } from 'socket.io';
import { CallOrchestrator } from '../call/orchestrator.js';
import { generateToken } from '../call/room.js';
import Call from '../models/Call.js';
import Product from '../models/Product.js';
import { v4 as uuidv4 } from 'uuid';

const orchestrators = new Map();
const screenshotIntervals = new Map();

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
        socket.on('start-demo', async ({ productId }) => {
            try {
                console.log(`🎬 Starting demo for product: ${productId}`);

                const product = await Product.findById(productId);
                if (!product) {
                    socket.emit('demo-error', { message: 'Product not found' });
                    return;
                }
                if (product.explorationStatus !== 'ready') {
                    socket.emit('demo-error', { message: 'Product is still being explored, please wait' });
                    return;
                }

                // Create call record
                const roomName = `demo-${productId}-${uuidv4()}`;
                const call = await Call.create({
                    productId,
                    clientId: product.clientId,
                    roomUrl: roomName,
                    status: 'active'
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

                // Start orchestrator
                const orchestrator = new CallOrchestrator(productId, callId, io);
                orchestrators.set(callId, orchestrator);
                await orchestrator.start();

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
                    await orchestrator.end(prospectEmail, prospectName);
                    orchestrators.delete(callId);
                }

                socket.emit('demo-ended', { callId });
                console.log(`🏁 Demo ended: ${callId}`);
            } catch (err) {
                console.log('❌ End demo error:', err.message);
            }
        });

        // Handle disconnect
        socket.on('disconnect', async () => {
            console.log(`🔌 Socket disconnected: ${socket.id}`);
        });
    });

    return io;
}