import { transcribeAudio } from '../agent/stt.js';
import { speak } from '../agent/tts.js';
import { think } from '../agent/brain/index.js';
import { Navigator } from '../agent/navigator/index.js';
import { decrypt } from '../utils/encryption.js';
import { generateToken } from '../call/room.js';
import { RoomServiceClient } from 'livekit-server-sdk';
import Product from '../models/Product.js';
import Call from '../models/Call.js';
import { analyzeCallOutcome } from '../agent/sentiment.js';
import { isZohoConfigured, upsertLead } from '../integrations/zoho.js';
import Lead from '../models/Lead.js';
import dotenv from 'dotenv';
dotenv.config();

export class CallOrchestrator {
    constructor(productId, callId, io, roomName) {
        this.productId = productId;
        this.callId = callId;
        this.io = io;
        this.roomName = roomName; // LiveKit room to send data messages
        this.livekitRoomSvc = new RoomServiceClient(
            process.env.LIVEKIT_URL,
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET
        );
        this.product = null;
        this.navigator = new Navigator();
        this.conversationHistory = [];
        this.messages = [];
        this.currentLanguage = 'en';
        this.isAgentSpeaking = false;
        this.isProcessing = false;
        this.isActive = false;
        this.hasGreeted = false;
        this.transcript = '';
        this.startTime = null;
        this.interruptRequested = false;
        this.interruptMessage = '';
        this.speechSequence = 0;
        this.pendingUserTurn = null;
        this.currentSpeechController = null;
        this.lastActionKey = null; // Track last action to detect repetition
        this.lastAgentMessage = ''; // Track what the agent was saying (for interruption context)
        this.wasInterrupted = false; // Whether the current turn is from an interruption
        this.idleTimer = null; // Timer for proactive idle check-in
        this.autoEndTimer = null; // Timer for 45s auto-end on inactivity
        this.idlePromptCount = 0; // How many idle prompts we've sent
        this.sessionTimer = null; // Hard kill timer for max session duration
        this.sessionWarningTimer = null; // 1-minute warning before forced end
    }

    // ── Configurable Timeouts ──
    static IDLE_TIMEOUT_MS = 10000;     // 10 seconds of silence before checking in
    static AUTO_END_TIMEOUT_MS = 45000; // 45 seconds of silence before auto-ending session
    static MAX_SESSION_MS = (parseInt(process.env.MAX_SESSION_DURATION_SECONDS) || 300) * 1000; // Default: 5 minutes

    startIdleTimer() {
        this.clearIdleTimer();
        if (!this.isActive) return;

        // 1. Check-in prompt every 10 seconds (max 2 prompts)
        if (this.idlePromptCount < 2) {
            this.idleTimer = setTimeout(async () => {
                if (!this.isActive || this.isProcessing || this.isAgentSpeaking) return;

                this.idlePromptCount++;
                console.log(`⏰ Idle timeout (10s) — prompting user (${this.idlePromptCount}/2)`);

                const prompts = [
                    "Hey, just checking in — is there anything else you'd like me to show you?",
                    "Still there? Feel free to ask me anything or I can continue showing you around!"
                ];
                const prompt = prompts[this.idlePromptCount - 1] || prompts[0];

                await this.agentSpeak(prompt);
                this.conversationHistory.push({ role: 'assistant', content: prompt });
                this.transcript += `\nAgent: ${prompt}`;

                // Schedule next check-in
                this.startIdleTimer();
            }, CallOrchestrator.IDLE_TIMEOUT_MS);
        }

        // 2. Auto-End Inactivity Timer (45 seconds total silence)
        if (!this.autoEndTimer) {
            this.autoEndTimer = setTimeout(async () => {
                if (!this.isActive) return;

                console.log('⌛ 45s inactivity reached — auto-ending session');
                const farewell = `It looks like you're away. I'm going to end our demo session for now. Thanks for exploring ${this.product?.name || 'our demo'}!`;
                await this.agentSpeak(farewell);

                this.io.to(this.callId).emit('demo-ended', { callId: this.callId, reason: 'inactive' });
                await this.end('', '', 'completed', 'inactive');
            }, CallOrchestrator.AUTO_END_TIMEOUT_MS);
        }
    }

    clearIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
        if (this.autoEndTimer) {
            clearTimeout(this.autoEndTimer);
            this.autoEndTimer = null;
        }
    }

    resetIdleTimer() {
        this.idlePromptCount = 0; // Reset count when user speaks
        this.clearIdleTimer();
    }

    async start() {
        try {
            this.product = await Product.findById(this.productId);
            if (!this.product) throw new Error('Product not found');
            if (this.product.explorationStatus !== 'ready') {
                throw new Error('Product exploration not complete yet');
            }

            this.isActive = true;
            this.startTime = Date.now();

            // Launch browser and login (uses stored cookies if available to bypass form login)
            await this.navigator.launch();
            const _email = this.product.credentials?.email ? decrypt(this.product.credentials.email) : '';
            const _password = this.product.credentials?.password ? decrypt(this.product.credentials.password) : '';
            await this.navigator.login(
                this.product.url,
                this.product.knowledgeMap.loginSteps,
                _email,
                _password,
                this.product.sessionCookies || null,
                this.product.demoStartUrl || null
            );

            // ── Hard Session Duration Limit ──
            // Schedule a 1-minute warning before the hard limit
            const warningMs = CallOrchestrator.MAX_SESSION_MS - 60000;
            if (warningMs > 0) {
                this.sessionWarningTimer = setTimeout(async () => {
                    if (!this.isActive) return;
                    const remainSec = Math.round((CallOrchestrator.MAX_SESSION_MS - (Date.now() - this.startTime)) / 1000);
                    await this.agentSpeak(
                        `Just a heads up — we have about ${remainSec} seconds left in this demo. ` +
                        `Is there anything specific you'd like to see before we wrap up?`
                    );
                }, warningMs);
            }

            // Hard kill — forcefully ends the session at the max duration
            this.sessionTimer = setTimeout(async () => {
                if (!this.isActive) return;
                console.log(`⏰ Session ${this.callId} hit max duration (${CallOrchestrator.MAX_SESSION_MS / 1000}s) — force ending`);
                await this.agentSpeak(
                    `Thanks so much for exploring with me! Our demo time is up. ` +
                    `If you'd like a deeper dive, our team would love to connect with you!`
                );
                this.io.to(this.callId).emit('demo-ended', { callId: this.callId, reason: 'max_duration' });
                await this.end('', '', 'completed', 'max_duration');
            }, CallOrchestrator.MAX_SESSION_MS);

            console.log(`✅ Call ${this.callId} started (max duration: ${CallOrchestrator.MAX_SESSION_MS / 1000}s)`);

        } catch (err) {
            console.log('❌ Orchestrator start failed:', err.message);
            this.isActive = false;
            throw err;
        }
    }

    /**
     * Triggered by the frontend when the avatar video track is fully attached and visible.
     */
    async sendGreeting() {
        if (!this.isActive || this.hasGreeted) return;
        this.hasGreeted = true;
        
        console.log(`👋 Avatar is ready on frontend. Sending greeting...`);
        const greeting = `Hi! I'm Sofia. How can I assist you today?`;
        this.transcript += `\nAgent: ${greeting}`;
        this.messages.push({ role: 'agent', content: greeting, timestamp: new Date() });
        await this.agentSpeak(greeting);
    }

    /**
     * Handle a complete audio blob from the client.
     * Client-side VAD detects speech boundaries, records a complete utterance,
     * and sends the blob via socket. We transcribe it and process.
     */
    async handleAudioBlob(audioBuffer) {
        if (!this.isActive) return;

        if (this.currentSpeechController) {
            this.currentSpeechController.abort();
        }

        this.interruptRequested = true;
        this.interruptMessage = 'User interrupted the current response.';
        this.handleAudioPlaybackComplete(); // Resolve pending wait immediately on interrupt
        this.resetIdleTimer(); // User is active — reset idle timer
        this.io.to(this.callId).emit('agent-state', 'processing');

        if (this.isProcessing) {
            this.pendingUserTurn = {
                audioBuffer,
                language: this.currentLanguage
            };
            return;
        }

        try {
            this.isProcessing = true;

            // Transcribe the audio blob via local Whisper
            const result = await transcribeAudio(audioBuffer, this.currentLanguage);
            const transcript = result.text;
            const language = result.language;

            if (!transcript || transcript.trim().length === 0) {
                this.isProcessing = false;
                this.io.to(this.callId).emit('agent-state', 'idle');
                return;
            }

            // Filter out common noise/false-positive transcriptions
            const noise = transcript.trim().toLowerCase();
            const noisePatterns = [
                /^(um|uh|hmm|ah|oh|huh)$/,
                /^\W+$/,                    // Only punctuation/symbols
                /^.{1,2}$/,                 // Single or double character
                /^(you|the|a|i|it|is)$/,    // Common single-word false positives
            ];
            if (noisePatterns.some(p => p.test(noise))) {
                console.log(`🔇 Filtered noise transcript: "${transcript}"`);
                this.isProcessing = false;
                this.io.to(this.callId).emit('agent-state', 'idle');
                return;
            }

            // Filter out acoustic echo ONLY if Sofia was actively speaking during capture AND transcript is a long duplicate
            if (this.isAgentSpeaking && this.lastAgentMessage && transcript.trim().length > 15) {
                const cleanLast = this.lastAgentMessage.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
                const cleanTranscript = transcript.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
                if (cleanLast.includes(cleanTranscript) && cleanTranscript.length > 20) {
                    console.log(`🔇 Filtered acoustic echo of agent's own voice: "${transcript}"`);
                    this.isProcessing = false;
                    this.io.to(this.callId).emit('agent-state', 'idle');
                    return;
                }
            }

            // Mark this turn as an interruption if the agent was speaking
            this.wasInterrupted = this.isAgentSpeaking;

            await this.handleUserSpeech(transcript, language);
        } catch (err) {
            console.log('❌ Audio blob processing error:', err.message);
            this.isProcessing = false;
            this.io.to(this.callId).emit('agent-state', 'idle');
        }
    }

    async handleUserSpeech(transcript, language) {
        try {
            console.log(`👤 User (${language}): ${transcript}`);

            this.speechSequence += 1;
            const interruptId = this.speechSequence;

            this.currentLanguage = language || this.currentLanguage;
            this.transcript += `\nUser: ${transcript}`;
            this.messages.push({ role: 'user', content: transcript, timestamp: new Date() });

            this.conversationHistory.push({
                role: 'user',
                content: transcript
            });

            // If this was an interruption, inject context so the LLM addresses it then resumes
            if (this.wasInterrupted && this.lastAgentMessage) {
                this.conversationHistory.push({
                    role: 'system',
                    content: `[System: The user just interrupted you while you were saying: "${this.lastAgentMessage.substring(0, 100)}...". Address their question/request first, then naturally resume or offer to continue where you left off.]`
                });
                console.log('🔀 Injected interruption context for LLM');
                this.wasInterrupted = false;
            }

            this.io.to(this.callId).emit('user-transcript', {
                text: transcript,
                language: this.currentLanguage
            });

            // Reset repetition tracker on new user input
            this.lastActionKey = null;

            let stepCount = 0;
            const maxSteps = 5;

            while (stepCount < maxSteps) {
                if (this.interruptRequested && interruptId < this.speechSequence) {
                    console.log('🛑 Interrupted by newer user turn; stopping current follow-up.');
                    break;
                }
                stepCount++;
                
                this.io.to(this.callId).emit('agent-thinking', true);
                this.io.to(this.callId).emit('agent-state', 'processing');

                // Get current page context so the LLM knows where it is
                const pageContext = await this.navigator.getPageContext();

                const decision = await think(
                    stepCount === 1 ? transcript : '(Continue — the previous action completed successfully. Look at CURRENT PAGE STATE to see where you are now.)',
                    this.currentLanguage,
                    this.product.knowledgeMap,
                    this.conversationHistory,
                    this.product.name,
                    pageContext  // NEW: pass page context to brain
                );

                this.io.to(this.callId).emit('agent-thinking', false);

                // ── SPEAK FIRST, THEN ACT ──
                // This makes the experience feel natural: the agent says what
                // it's about to do ("Let me show you the products"), THEN the
                // browser navigates/clicks. Like a real human demo.

                const responseText = decision.message.content;
                if (responseText) {
                    this.transcript += `\nAgent: ${responseText}`;
                    this.messages.push({ role: 'agent', content: responseText, timestamp: new Date() });
                    this.conversationHistory.push({
                        role: 'assistant',
                        content: responseText
                    });
                    await this.agentSpeak(responseText, interruptId);
                }

                // Now execute the browser action after speaking
                if (decision.finish_reason === 'tool_calls' && decision.message.tool_calls) {
                    for (const toolCall of decision.message.tool_calls) {
                        const toolName = toolCall.function.name;
                        const toolArgs = JSON.parse(toolCall.function.arguments);

                        // Repetition detection: if same action as last turn, force stop
                        const actionKey = `${toolName}:${JSON.stringify(toolArgs)}`;
                        if (actionKey === this.lastActionKey) {
                            console.log(`🔁 Detected repeated action: ${actionKey}. Breaking loop.`);
                            decision.finish_reason = 'stop';
                            break;
                        }
                        this.lastActionKey = actionKey;

                        await this.navigator.executeAction(toolName, toolArgs);
                        this.io.to(this.callId).emit('navigation-event', {
                            tool: toolName,
                            args: toolArgs
                        });
                    }
                }

                // Turn complete: once the agent has spoken and executed actions, wait for user response
                console.log('🛑 Agent finished sequence, waiting for user.');
                this.startIdleTimer();
                break;
            }

            if (stepCount >= maxSteps) {
                console.log('⚠️ Reached maximum autonomous steps (5). Force pausing.');
            }

            await this.checkSessionTimeout();

            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-16);
            }

        } catch (err) {
            console.log('❌ Error handling user speech:', err.message);
            this.io.to(this.callId).emit('agent-thinking', false);
        } finally {
            this.isProcessing = false;
            this.interruptRequested = false;
            this.currentSpeechController = null;
            this.io.to(this.callId).emit('agent-thinking', false);
            this.io.to(this.callId).emit('agent-state', 'idle');

            if (this.pendingUserTurn) {
                const pendingTurn = this.pendingUserTurn;
                this.pendingUserTurn = null;
                await this.handleAudioBlob(pendingTurn.audioBuffer, pendingTurn.language);
            }
        }
    }

    handleAudioPlaybackComplete() {
        if (this.audioPlaybackResolver) {
            this.audioPlaybackResolver();
            this.audioPlaybackResolver = null;
        }
    }

    async waitForAudioPlayback(timeoutMs = 12000) {
        return new Promise(resolve => {
            let timer = null;
            this.audioPlaybackResolver = () => {
                if (timer) clearTimeout(timer);
                resolve();
            };
            timer = setTimeout(() => {
                this.audioPlaybackResolver = null;
                resolve();
            }, timeoutMs);
        });
    }

    async agentSpeak(text, interruptId = 0) {
        try {
            this.isAgentSpeaking = true;
            this.lastAgentMessage = text;
            const controller = new AbortController();
            this.currentSpeechController = controller;
            this.io.to(this.callId).emit('agent-speaking', { text, speaking: true });
            this.io.to(this.callId).emit('agent-state', 'speaking');

            if (this.interruptRequested && interruptId < this.speechSequence) {
                console.log('🛑 Speech canceled because the user interrupted it.');
                this.io.to(this.callId).emit('agent-speaking', { text, speaking: false, interrupted: true });
                return;
            }

            // ── Send speak payload to Keyframe Python agent if connected in room ──
            const payload = JSON.stringify({ type: 'speak', text });
            try {
                const participants = await this.livekitRoomSvc.listParticipants(this.roomName);
                const hasKeyframe = participants && participants.some(
                    p => p.identity === 'keyframe-avatar' || (p.identity && p.identity.includes('keyframe'))
                );

                if (hasKeyframe) {
                    await this.livekitRoomSvc.sendData(
                        this.roomName,
                        Buffer.from(payload),
                        0 // RELIABLE delivery
                    );
                    console.log(`📡 Sent speak data to Keyframe agent: "${text.substring(0, 60)}..."`);
                }
            } catch (e) {
                console.log(`ℹ️ Keyframe check/sendData notice: ${e.message}`);
            }

            // ── Generate and emit direct TTS audio via Socket.IO for guaranteed audio delivery ──
            let audioBuffer = null;
            try {
                audioBuffer = await speak(text, controller.signal);
                if (audioBuffer && audioBuffer.length > 0) {
                    this.io.to(this.callId).emit('agent-audio', audioBuffer);
                    console.log(`🔊 [Direct Audio] Sent ${audioBuffer.length} bytes of audio via socket`);
                }
            } catch (ttsErr) {
                if (ttsErr.name !== 'AbortError') {
                    console.warn(`⚠️ TTS generation failed: ${ttsErr.message}`);
                }
            }

            // Wait for audio speech to complete via frontend event or dynamic timeout
            const timeoutMs = Math.max(2500, Math.ceil((text.length / 14) * 1000) + 1200);
            await this.waitForAudioPlayback(timeoutMs);

            if (this.interruptRequested && interruptId < this.speechSequence) {
                this.io.to(this.callId).emit('agent-speaking', { text, speaking: false, interrupted: true });
                return;
            }

            this.isAgentSpeaking = false;
            this.io.to(this.callId).emit('agent-speaking', { text, speaking: false, interrupted: false });
            this.io.to(this.callId).emit('agent-state', 'idle');

        } catch (err) {
            console.log('❌ Agent speak error:', err.message);
            this.isAgentSpeaking = false;
            this.io.to(this.callId).emit('agent-speaking', { text, speaking: false, interrupted: false });
            this.io.to(this.callId).emit('agent-state', 'idle');
        } finally {
            if (this.currentSpeechController && this.currentSpeechController.signal.aborted) {
                this.currentSpeechController = null;
            }
        }
    }

    async checkSessionTimeout() {
        if (!this.isActive || !this.navigator || !this.navigator.page) return;
        // Only check logout if credentials are configured for this product
        if (!this.product.credentials?.email || !this.product.credentials?.password) return;

        // Check if the target site logged us out (session cookie expired)
        const loggedOut = await this.navigator.checkIfLoggedOut(this.product.url);
        if (loggedOut) {
            console.log('⚠️ Session expired — re-logging in');
            await this.navigator.login(
                this.product.url,
                this.product.knowledgeMap.loginSteps,
                this.product.credentials?.email ? decrypt(this.product.credentials.email) : '',
                this.product.credentials?.password ? decrypt(this.product.credentials.password) : ''
            );
        }
    }

    async end(prospectEmail = '', prospectName = '', status = 'completed', endReason = 'user') {
        try {
            this.isActive = false;
            this.clearIdleTimer(); // Clean up idle timer

            // Clean up session duration timers
            if (this.sessionTimer) { clearTimeout(this.sessionTimer); this.sessionTimer = null; }
            if (this.sessionWarningTimer) { clearTimeout(this.sessionWarningTimer); this.sessionWarningTimer = null; }

            const duration = Math.floor((Date.now() - this.startTime) / 1000);

            // Analyze transcript for satisfaction + qualification + summary
            const {
                summary,
                satisfaction,
                satisfactionReason,
                qualified,
                qualificationReason
            } = await analyzeCallOutcome(this.transcript);

            const update = {
                transcript: this.transcript,
                messages: this.messages,
                summary: summary || '',
                language: this.currentLanguage,
                duration,
                status,
                endReason,
                satisfaction,
                satisfactionReason,
                qualified,
                qualificationReason
            };
            if (prospectEmail) update.prospectEmail = prospectEmail;
            if (prospectName) update.prospectName = prospectName;

            const call = await Call.findByIdAndUpdate(this.callId, update, { new: true });

            // Create Lead + sync to Zoho if qualified
            if (qualified) {
                await this.createLeadAndSyncToZoho(call, qualificationReason);
            }

            await this.navigator.close();
            console.log(`✅ Call ${this.callId} ended — duration: ${duration}s | qualified: ${qualified} | satisfaction: ${satisfaction}`);

        } catch (err) {
            console.log('❌ Error ending call:', err.message);
        }
    }

    async createLeadAndSyncToZoho(call, qualificationReason) {
        try {
            const lead = await Lead.create({
                callId: call._id,
                productId: call.productId,
                clientId: call.clientId,
                prospectName: call.prospectName,
                prospectEmail: call.prospectEmail,
                qualified: true,
                notes: qualificationReason,
                status: 'Not Contacted',
                zohoSyncStatus: isZohoConfigured() ? 'pending' : 'skipped',
            });

            console.log(`🎯 Lead created: ${lead._id}`);

            if (!isZohoConfigured()) {
                console.log('ℹ️ Zoho not configured — lead saved locally only');
                return;
            }

            if (!call.prospectEmail) {
                await Lead.findByIdAndUpdate(lead._id, {
                    zohoSyncStatus: 'skipped',
                    zohoSyncError: 'No email captured for this visitor'
                });
                console.log('⚠️ Skipping Zoho sync — no prospect email');
                return;
            }

            try {
                const product = await Product.findById(call.productId).select('name');
                const { id: zohoLeadId } = await upsertLead({
                    name: call.prospectName,
                    email: call.prospectEmail,
                    productName: product?.name,
                    status: 'Not Contacted',
                    notes: qualificationReason,
                });

                await Lead.findByIdAndUpdate(lead._id, {
                    zohoLeadId,
                    zohoSyncStatus: 'synced',
                    zohoSyncError: ''
                });
                console.log(`✅ Lead synced to Zoho: ${zohoLeadId}`);

            } catch (zohoErr) {
                console.log('⚠️ Zoho sync failed (lead saved locally):', zohoErr.message);
                await Lead.findByIdAndUpdate(lead._id, {
                    zohoSyncStatus: 'failed',
                    zohoSyncError: zohoErr.message.slice(0, 300)
                });
            }

        } catch (err) {
            console.log('❌ Error creating lead:', err.message);
        }
    }
}