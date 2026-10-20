import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { CallOrchestrator } from '../call/orchestrator.js';
import { ChatOrchestrator } from '../call/chatOrchestrator.js';
import { generateToken } from '../call/room.js';
import { AgentDispatchClient } from 'livekit-server-sdk';
import Call from '../models/Call.js';
import Product from '../models/Product.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import {
    pubClient, subClient,
    acquireSessionSlot, releaseSessionSlot,
    MAX_CONCURRENT,
} from '../utils/redis.js';
import { isObjectId } from '../utils/validate.js';
import { isPrivateAddress } from '../utils/urlSafety.js';

// A socket may only control the call it started (callIds are not secrets: they appear in logs, URLs, etc.)
// After a reconnect the new socket regains ownership via 'resume-session' + the per-call secret token.
function ownsCall(socket, callId, event) {
    if (typeof callId === 'string' && socket.activeCallId === callId) return true;
    console.warn(`🛡️ Ignored '${event}' from socket ${socket.id}: it does not own call ${callId} (active: ${socket.activeCallId || 'none'})`);
    return false;
}

// ── Reconnect support ──
// Socket.IO reconnects (network blips, polling→websocket upgrade failures, laptop sleep) create a
// NEW socket. Instead of killing the call on disconnect, keep it alive for a grace period so the
// widget can reclaim it with the secret token it received when the session started.
const RESUME_GRACE_MS = (parseInt(process.env.SESSION_RESUME_GRACE_SECONDS) || 30) * 1000;
const sessionTokens = new Map();   // callId -> secret token (only ever sent to the visitor who started it)
const pendingCleanups = new Map(); // callId -> timeout handle for a disconnected, not-yet-resumed call

function issueSessionToken(callId) {
    const token = crypto.randomBytes(24).toString('hex');
    sessionTokens.set(callId, token);
    return token;
}

function tokenMatches(callId, token) {
    const expected = sessionTokens.get(callId);
    if (!expected || typeof token !== 'string' || token.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

const orchestrators = new Map();
const chatOrchestrators = new Map();
const screenshotIntervals = new Map();

// Configurable stale call timeout: max session duration + 2 minute grace period
const MAX_SESSION_SEC = parseInt(process.env.MAX_SESSION_DURATION_SECONDS) || 300;
const STALE_CALL_TIMEOUT_MS = (MAX_SESSION_SEC + 120) * 1000;

// ── Abuse limits for the public widget socket ──
// Every session launches Chromium / LLM / TTS work, so cap how often one IP can start them.
const SESSION_STARTS_PER_WINDOW = parseInt(process.env.SESSION_STARTS_PER_IP) || 10;
const SESSION_WINDOW_MS = 10 * 60 * 1000;
const MAX_USER_MESSAGE_CHARS = 1000;
const MAX_AUDIO_BLOB_BYTES = 5 * 1024 * 1024;
const sessionStartsByIp = new Map(); // ip -> [timestamps]

function clientIp(socket) {
    const direct = (socket.handshake.address || '').replace(/^::ffff:/, '');
    // Only trust X-Forwarded-For when the connection comes from our own proxy (nginx)
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (forwarded && (!direct || isPrivateAddress(direct))) {
        return String(forwarded).split(',')[0].trim();
    }
    return direct;
}

function allowSessionStart(ip) {
    const now = Date.now();
    const recent = (sessionStartsByIp.get(ip) || []).filter(t => now - t < SESSION_WINDOW_MS);
    if (recent.length >= SESSION_STARTS_PER_WINDOW) {
        sessionStartsByIp.set(ip, recent);
        return false;
    }
    recent.push(now);
    sessionStartsByIp.set(ip, recent);
    return true;
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of sessionStartsByIp) {
        if (!times.some(t => now - t < SESSION_WINDOW_MS)) sessionStartsByIp.delete(ip);
    }
}, SESSION_WINDOW_MS).unref();

const cleanText = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Validate a start request; returns an error message or null. */
function checkStartRequest(socket, productId) {
    if (!isObjectId(productId)) return 'Product not found';
    if (socket.activeCallId) return 'A session is already active on this connection';
    if (!allowSessionStart(clientIp(socket))) return 'Too many sessions started. Please try again in a few minutes.';
    return null;
}

/** Stop everything a call owns: screenshots, orchestrator (writes the Call record), session slot, token. */
async function teardownCall(callId, { email = '', name = '', status, reason }) {
    const pending = pendingCleanups.get(callId);
    if (pending) {
        clearTimeout(pending);
        pendingCleanups.delete(callId);
    }
    sessionTokens.delete(callId);

    const interval = screenshotIntervals.get(callId);
    if (interval) {
        clearInterval(interval);
        screenshotIntervals.delete(callId);
    }

    const demoOrch = orchestrators.get(callId);
    if (demoOrch) {
        orchestrators.delete(callId);
        await demoOrch.end(email, name, status, reason);
    }

    const chatOrch = chatOrchestrators.get(callId);
    if (chatOrch) {
        chatOrchestrators.delete(callId);
        await chatOrch.end(email, name, status, reason);
    }

    // Release session slot and promote next queued session
    const nextCallId = await releaseSessionSlot(callId);
    if (nextCallId) {
        console.log(`🔄 Promoting queued session: ${nextCallId}`);
    }
}

function startStaleCallSweep() {
    setInterval(async () => {
        try {
            const cutoff = new Date(Date.now() - STALE_CALL_TIMEOUT_MS);
            const staleCalls = await Call.find({ status: 'active', createdAt: { $lt: cutoff } });

            for (const call of staleCalls) {
                if (orchestrators.has(call._id.toString())) continue;

                const duration = Math.floor((Date.now() - call.createdAt.getTime()) / 1000);
                await Call.findByIdAndUpdate(call._id, { status: 'failed', duration, endReason: 'error' });
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

    // ── Redis Adapter for horizontal scaling (multi-node support) ──
    if (pubClient && subClient) {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('🔴 Socket.IO Redis adapter enabled (multi-node ready)');
    }

    io.on('connection', (socket) => {
        console.log(`🔌 Socket connected: ${socket.id}`);

        // Visitor starts a demo
        socket.on('start-demo', async (startArgs = {}) => {
            try {
                const { productId } = startArgs;
                const prospectName = cleanText(startArgs.prospectName, 200);
                const prospectEmail = cleanText(startArgs.prospectEmail, 320);
                const startError = checkStartRequest(socket, productId);
                if (startError) {
                    socket.emit('demo-error', { message: startError });
                    return;
                }
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

                // ── Concurrency Guard ──
                // Check if we have a free session slot before launching expensive resources
                const slot = await acquireSessionSlot(callId);
                if (!slot.allowed) {
                    console.log(`⏳ Session queued: ${callId} (position ${slot.position})`);
                    socket.emit('demo-queued', {
                        callId,
                        position: slot.position,
                        estimatedWaitSeconds: slot.estimatedWaitSeconds,
                    });
                    // Update call status to reflect queued state
                    await Call.findByIdAndUpdate(callId, { status: 'failed', endReason: 'error' });
                    return;
                }

                socket.join(callId);
                socket.activeCallId = callId;

                // Send session config to widget (max duration, etc.)
                socket.emit('session-config', {
                    maxDurationSeconds: MAX_SESSION_SEC,
                    maxConcurrent: MAX_CONCURRENT,
                });

                // Generate LiveKit tokens
                const visitorToken = await generateToken(roomName, `visitor-${socket.id}`);

                // Send tokens to visitor
                socket.emit('demo-started', {
                    callId,
                    roomName,
                    visitorToken,
                    sessionToken: issueSessionToken(callId),
                    livekitUrl: process.env.LIVEKIT_URL
                });

                // Start orchestrator (pass roomName so it can send LiveKit data to Keyframe agent)
                const orchestrator = new CallOrchestrator(productId, callId, io, roomName);
                orchestrators.set(callId, orchestrator);
                socket.activeCallId = callId;

                // Launch browser session in background so audio greeting and UI begin with ZERO delay
                orchestrator.start().then(() => {
                    console.log(`🌐 [${callId}] Browser session fully initialized`);
                }).catch(err => {
                    console.warn(`⚠️ [${callId}] Orchestrator startup error:`, err.message);
                });

                // Trigger immediate greeting so user hears Sofia's voice right away
                setTimeout(() => {
                    orchestrator.sendGreeting().catch(e => console.warn('Greeting notice:', e.message));
                }, 400);

                // Dispatch the Keyframe avatar agent to this room in background
                (async () => {
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
                        console.warn('ℹ️ Keyframe agent dispatch notice:', dispatchErr.message);
                    }
                })();

                // ── Smart Screenshot Capture ──
                // Screenshots are sent as base64 data URL strings for reliable delivery
                // across all Socket.IO transports (polling fallback, Nginx proxies, etc.)
                let frameCount = 0;
                const screenshotInterval = setInterval(async () => {
                    try {
                        if (orchestrator.navigator?.page) {
                            const screenshot = await orchestrator.navigator.page.screenshot({
                                type: 'jpeg',
                                quality: 50
                            });
                            // Send raw base64 so both existing and updated widget clients format it safely
                            const rawBase64 = screenshot.toString('base64');
                            frameCount++;
                            if (frameCount === 1 || frameCount % 10 === 0) {
                                console.log(`📸 [${callId}] Emitted screenshot frame #${frameCount} (${(screenshot.length / 1024).toFixed(1)} KB)`);
                            }
                            // Emit directly to caller socket AND to room for reliability
                            socket.emit('screen-update', { image: rawBase64 });
                            io.to(callId).emit('screen-update', { image: rawBase64 });
                        } else {
                            if (frameCount === 0) {
                                console.log(`⏳ [${callId}] Navigator page not available yet for screenshot`);
                            }
                        }
                    } catch (err) {
                        console.warn(`⚠️ [${callId}] Screenshot capture error:`, err.message);
                    }
                }, 1500);

                screenshotIntervals.set(callId, screenshotInterval);

            } catch (err) {
                console.log('❌ Start demo error:', err.message);
                // Free the slot reserved for this attempt so the visitor can retry
                if (socket.activeCallId) {
                    await releaseSessionSlot(socket.activeCallId).catch(() => {});
                    socket.activeCallId = null;
                }
                socket.emit('demo-error', { message: 'Could not start the session. Please try again.' });
            }
        });

        // ── 1-on-1 Avatar Chat Mode (widget2) ──
        socket.on('start-chat', async (startArgs = {}) => {
            try {
                const { productId } = startArgs;
                const prospectName = cleanText(startArgs.prospectName, 200);
                const prospectEmail = cleanText(startArgs.prospectEmail, 320);
                const startError = checkStartRequest(socket, productId);
                if (startError) {
                    socket.emit('demo-error', { message: startError });
                    return;
                }
                console.log(`💬 Starting 1-on-1 Avatar Chat for product: ${productId}`);

                const product = await Product.findById(productId);
                if (!product) {
                    socket.emit('error', 'Product not found');
                    return;
                }

                const roomName = `chat-${productId}-${uuidv4()}`;
                const call = await Call.create({
                    productId,
                    clientId: product.clientId,
                    roomUrl: roomName,
                    status: 'active',
                    prospectName: prospectName || '',
                    prospectEmail: prospectEmail || '',
                    mode: 'chat'
                });

                const callId = call._id.toString();

                const slot = await acquireSessionSlot(callId);
                if (!slot.allowed) {
                    console.log(`⏳ Chat session queued: ${callId} (position ${slot.position})`);
                    socket.emit('demo-queued', {
                        callId,
                        position: slot.position,
                        estimatedWaitSeconds: slot.estimatedWaitSeconds,
                    });
                    await Call.findByIdAndUpdate(callId, { status: 'failed', endReason: 'error' });
                    return;
                }

                socket.join(callId);
                socket.activeCallId = callId;

                socket.emit('session-config', {
                    maxDurationSeconds: MAX_SESSION_SEC,
                    maxConcurrent: MAX_CONCURRENT,
                });

                const visitorToken = await generateToken(roomName, `visitor-${socket.id}`);

                const suggestedQuestions = [];
                if (product.knowledgeMap?.pages) {
                    for (const p of product.knowledgeMap.pages) {
                        if (p.commonQuestions?.length) {
                            suggestedQuestions.push(...p.commonQuestions);
                        }
                    }
                }

                const payload = {
                    callId,
                    roomName,
                    visitorToken,
                    sessionToken: issueSessionToken(callId),
                    livekitUrl: process.env.LIVEKIT_URL,
                    mode: 'chat',
                    productName: product.name,
                    productSummary: product.knowledgeMap?.productSummary || '',
                    knowledgeMap: product.knowledgeMap || null,
                    suggestedQuestions: [...new Set(suggestedQuestions)].slice(0, 5)
                };

                socket.emit('chat-started', payload);
                socket.emit('demo-started', payload);

                const orchestrator = new ChatOrchestrator(productId, callId, io, roomName);
                chatOrchestrators.set(callId, orchestrator);
                socket.activeCallId = callId;

                orchestrator.start().then(() => {
                    console.log(`💬 [${callId}] 1-on-1 Avatar Chat session ready`);
                }).catch(err => {
                    console.warn(`⚠️ [${callId}] Chat startup error:`, err.message);
                });

                setTimeout(() => {
                    orchestrator.sendGreeting().catch(e => console.warn('Greeting notice:', e.message));
                }, 300);

                // Dispatch Keyframe avatar
                (async () => {
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
                        console.warn('ℹ️ Keyframe agent dispatch notice:', dispatchErr.message);
                    }
                })();

            } catch (err) {
                console.log('❌ Start chat error:', err.message);
                // Free the slot reserved for this attempt so the visitor can retry
                if (socket.activeCallId) {
                    await releaseSessionSlot(socket.activeCallId).catch(() => {});
                    socket.activeCallId = null;
                }
                socket.emit('demo-error', { message: 'Could not start the session. Please try again.' });
            }
        });

        // Receive complete audio blob from visitor (VAD-triggered on client)
        socket.on('audio-blob', async ({ callId, audio } = {}) => {
            if (!ownsCall(socket, callId, 'audio-blob')) return;
            const orchestrator = orchestrators.get(callId) || chatOrchestrators.get(callId);
            if (orchestrator && audio) {
                const audioBuffer = Buffer.from(audio);
                if (audioBuffer.length === 0 || audioBuffer.length > MAX_AUDIO_BLOB_BYTES) return;
                await orchestrator.handleAudioBlob(audioBuffer);
            }
        });

        // Receive direct text message from visitor (chat / voice fallback)
        socket.on('user-message', async ({ callId, text } = {}) => {
            if (!ownsCall(socket, callId, 'user-message')) return;
            const message = cleanText(text, MAX_USER_MESSAGE_CHARS);
            const orchestrator = orchestrators.get(callId) || chatOrchestrators.get(callId);
            if (orchestrator && message) {
                console.log(`💬 [${callId}] Received text message from user (${message.length} chars)`);
                await orchestrator.handleUserSpeech(message, orchestrator.currentLanguage || 'en');
            }
        });

        // Frontend signals that agent audio finished playing
        socket.on('audio-playback-complete', ({ callId } = {}) => {
            if (!ownsCall(socket, callId, 'audio-playback-complete')) return;
            const orchestrator = orchestrators.get(callId) || chatOrchestrators.get(callId);
            if (orchestrator) {
                orchestrator.handleAudioPlaybackComplete();
            }
        });

        // Visitor ends the session (widget: end-demo, widget2: end-chat, widget3: end-call)
        const endSession = async ({ callId, prospectEmail, prospectName } = {}) => {
            if (!ownsCall(socket, callId, 'end-session')) return;
            try {
                const email = cleanText(prospectEmail, 320);
                const name = cleanText(prospectName, 200);

                await teardownCall(callId, { email, name, status: 'completed', reason: 'user' });

                socket.activeCallId = null;
                socket.emit('demo-ended', { callId });
                socket.emit('chat-ended', { callId });
                console.log(`🏁 Session ended: ${callId}`);
            } catch (err) {
                console.log('❌ End session error:', err.message);
            }
        };
        socket.on('end-demo', endSession);
        socket.on('end-chat', endSession);
        socket.on('end-call', endSession);

        // Triggered by frontend when Keyframe video track attaches
        socket.on('avatar-ready', async ({ callId } = {}) => {
            if (!ownsCall(socket, callId, 'avatar-ready')) return;
            const orchestrator = orchestrators.get(callId) || chatOrchestrators.get(callId);
            if (orchestrator) {
                await orchestrator.sendGreeting();
            }
        });

        // Visitor's socket reconnected: reclaim the call it started before the drop
        socket.on('resume-session', ({ callId, sessionToken } = {}) => {
            const alive = typeof callId === 'string' && (orchestrators.has(callId) || chatOrchestrators.has(callId));
            if (!alive || !tokenMatches(callId, sessionToken) || (socket.activeCallId && socket.activeCallId !== callId)) {
                console.warn(`🛡️ Resume refused for call ${callId} on socket ${socket.id}`);
                socket.emit('session-expired', { callId });
                return;
            }
            const pending = pendingCleanups.get(callId);
            if (pending) {
                clearTimeout(pending);
                pendingCleanups.delete(callId);
            }
            socket.join(callId);
            socket.activeCallId = callId;
            socket.emit('session-resumed', { callId });
            console.log(`🔁 Session resumed: ${callId} on socket ${socket.id}`);
        });

        // Handle disconnect: give the visitor a grace period to reconnect before tearing the call down
        socket.on('disconnect', (reason) => {
            console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);

            const callId = socket.activeCallId;
            if (!callId || pendingCleanups.has(callId)) return;
            if (!orchestrators.has(callId) && !chatOrchestrators.has(callId)) return;

            console.log(`⏳ [${callId}] Visitor disconnected — holding session ${RESUME_GRACE_MS / 1000}s for reconnect`);
            pendingCleanups.set(callId, setTimeout(async () => {
                pendingCleanups.delete(callId);
                try {
                    await teardownCall(callId, { status: 'failed', reason: 'disconnect' });
                    console.log(`⚠️ Call ${callId} marked failed (visitor did not reconnect)`);
                } catch (err) {
                    console.log('❌ Error cleaning up disconnected call:', err.message);
                }
            }, RESUME_GRACE_MS));
        });
    });

    startStaleCallSweep();

    return io;
}