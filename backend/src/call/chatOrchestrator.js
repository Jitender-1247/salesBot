import { transcribeAudio } from '../agent/stt.js';
import { streamSpeech, streamPcmSpeech, PCM_SAMPLE_RATE } from '../agent/tts.js';
import { thinkChat } from '../agent/brain/chatBrain.js';
import { resolvePersona } from '../agent/persona.js';
import { RoomServiceClient } from 'livekit-server-sdk';
import Product from '../models/Product.js';
import Call from '../models/Call.js';
import { analyzeCallOutcome } from '../agent/sentiment.js';
import { isZohoConfigured } from '../integrations/zoho.js';
import Lead from '../models/Lead.js';
import { agentRoom, hasOnlineAgents } from './liveAgents.js';
import { generateToken } from './room.js';
import { startRecording, stopRecording, recordingUrl } from './recording.js';
import dotenv from 'dotenv';
dotenv.config();

export class ChatOrchestrator {
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
        this.persona = resolvePersona(null);
        this.catalog = [];
        this.clientId = '';
        this.prospectName = '';
        this.prospectEmail = '';
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
        this.speechSequence = 0;
        this.pendingUserTurn = null;
        this.currentSpeechController = null;
        this.lastAgentMessage = '';
        this.wasInterrupted = false;
        this.idleTimer = null;
        this.autoEndTimer = null;
        this.idlePromptCount = 0;
        this.sessionTimer = null;
        this.sessionWarningTimer = null;

        // Commerce attribution
        this.productsShown = new Set();
        this.productClicks = [];

        // Human handover: 'none' → 'requested' → 'human' (→ back to 'none' on release/timeout)
        this.handoverState = 'none';
        this.handoverTimer = null;
        this.handoverInfo = { requested: false, outcome: 'none', reason: '', agentName: '' };
        this.humanAgent = null; // { name, socketId }

        this.egressId = '';
        this.lastChunkSentAt = 0;
        this.playbackCompletedAt = 0;
        // Resolves once the product/persona has loaded, so the greeting uses the right persona
        this.loaded = new Promise(resolve => { this.markLoaded = resolve; });
    }

    static IDLE_TIMEOUT_MS = 12000;     // 12s silence before checking in
    static AUTO_END_TIMEOUT_MS = 60000; // 60s total silence before auto-ending
    static MAX_SESSION_MS = (parseInt(process.env.MAX_SESSION_DURATION_SECONDS) || 300) * 1000;
    static MAX_HUMAN_SESSION_MS = (parseInt(process.env.MAX_HUMAN_SESSION_SECONDS) || 1800) * 1000;

    get agentName() {
        return this.persona.name;
    }

    /** Whether the AI may offer / trigger a handover right now. */
    canHandover() {
        return this.product?.handover?.mode !== 'off' && this.handoverState === 'none' && hasOnlineAgents(this.clientId);
    }

    /** Record a line of the conversation and mirror it to the Live Console while a human is involved. */
    logMessage(role, content, author) {
        const label = role === 'user' ? 'User' : author;
        this.transcript += `\n${label}: ${content}`;
        this.messages.push({ role, content, author: author || '', timestamp: new Date() });
        if (this.handoverState !== 'none') {
            this.io.to(agentRoom(this.clientId)).emit('call-message', { callId: this.callId, role, author: author || '', content });
        }
    }

    startIdleTimer() {
        this.clearIdleTimer();
        if (!this.isActive || this.handoverState !== 'none') return;

        // 1. Proactive check-in prompts
        if (this.idlePromptCount < 2) {
            this.idleTimer = setTimeout(async () => {
                if (!this.isActive || this.isProcessing || this.isAgentSpeaking || this.handoverState !== 'none') return;

                this.idlePromptCount++;
                console.log(`⏰ [Chat ${this.callId}] Idle check-in (${this.idlePromptCount}/2)`);

                const prompts = [
                    `I'm here whenever you have any other questions about ${this.product?.name || 'our product'}!`,
                    `Still there? Feel free to ask about our pricing, features, or how other customers use this!`
                ];
                const prompt = prompts[this.idlePromptCount - 1] || prompts[0];

                await this.agentSpeak(prompt);
                this.conversationHistory.push({ role: 'assistant', content: prompt });
                this.transcript += `\n${this.agentName}: ${prompt}`;

                this.startIdleTimer();
            }, ChatOrchestrator.IDLE_TIMEOUT_MS);
        }

        // 2. Auto-End Inactivity Timer
        if (!this.autoEndTimer) {
            this.autoEndTimer = setTimeout(async () => {
                if (!this.isActive || this.handoverState !== 'none') return;

                console.log(`⌛ [Chat ${this.callId}] Inactivity timeout reached — ending chat`);
                const farewell = `It looks like you stepped away. I'll wrap up our conversation for now. Feel free to start a new chat anytime!`;
                await this.agentSpeak(farewell);

                this.io.to(this.callId).emit('chat-ended', { callId: this.callId, reason: 'inactive' });
                this.io.to(this.callId).emit('demo-ended', { callId: this.callId, reason: 'inactive' });
                await this.end('', '', 'completed', 'inactive');
            }, ChatOrchestrator.AUTO_END_TIMEOUT_MS);
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
        this.idlePromptCount = 0;
        this.clearIdleTimer();
    }

    clearSessionTimers() {
        if (this.sessionTimer) { clearTimeout(this.sessionTimer); this.sessionTimer = null; }
        if (this.sessionWarningTimer) { clearTimeout(this.sessionWarningTimer); this.sessionWarningTimer = null; }
    }

    /** Hard cap on session length; AI sessions get a 1-minute warning first. */
    scheduleSessionLimit(maxMs, { warn = true } = {}) {
        this.clearSessionTimers();
        const elapsed = this.startTime ? Date.now() - this.startTime : 0;
        const remaining = Math.max(60000, maxMs - elapsed);

        if (warn && remaining > 60000) {
            this.sessionWarningTimer = setTimeout(async () => {
                if (!this.isActive || this.handoverState === 'human') return;
                await this.agentSpeak(
                    `Just a quick note — we have about a minute remaining in this chat session. ` +
                    `Is there anything else you'd like to ask before we wrap up?`
                );
            }, remaining - 60000);
        }

        this.sessionTimer = setTimeout(async () => {
            if (!this.isActive) return;
            console.log(`⏰ [Chat ${this.callId}] Max session duration reached — ending`);
            if (this.handoverState !== 'human') {
                await this.agentSpeak(
                    `Thank you so much for chatting with me today! Our session time is up. ` +
                    `Our team will follow up with you shortly!`
                );
            }
            this.io.to(this.callId).emit('chat-ended', { callId: this.callId, reason: 'max_duration' });
            this.io.to(this.callId).emit('demo-ended', { callId: this.callId, reason: 'max_duration' });
            await this.end('', '', 'completed', 'max_duration');
        }, remaining);
    }

    async start({ prospectName = '', prospectEmail = '', supportsPcm = false } = {}) {
        this.supportsPcm = supportsPcm;
        try {
            this.product = await Product.findById(this.productId);
            if (!this.product) throw new Error('Product not found');

            this.persona = resolvePersona(this.product);
            this.catalog = this.product.catalog || [];
            this.clientId = this.product.clientId.toString();
            this.currentLanguage = this.persona.language || 'en';
            this.prospectName = prospectName;
            this.prospectEmail = prospectEmail;

            this.isActive = true;
            this.startTime = Date.now();
            this.markLoaded();

            console.log(`💬 [ChatOrchestrator] 1-on-1 Avatar Chat active for ${this.product.name} as ${this.agentName}`);

            this.scheduleSessionLimit(ChatOrchestrator.MAX_SESSION_MS);

            if (this.product.recordingEnabled) {
                this.egressId = await startRecording(this.roomName, this.callId);
                if (this.egressId) {
                    await Call.findByIdAndUpdate(this.callId, { recording: { egressId: this.egressId, status: 'recording', url: '' } });
                }
            }

        } catch (err) {
            console.log('❌ [ChatOrchestrator] Start failed:', err.message);
            this.isActive = false;
            this.markLoaded();
            throw err;
        }
    }

    async sendGreeting() {
        if (this.hasGreeted) return;
        this.hasGreeted = true;
        await Promise.race([this.loaded, new Promise(r => setTimeout(r, 3000))]);
        if (!this.product) return; // start() failed
        this.isActive = true;

        console.log(`👋 [Chat ${this.callId}] Sending 1-on-1 greeting to visitor...`);

        // Human-first: connect a specialist straight away and let the AI cover the wait
        if (this.product?.handover?.mode === 'human_first' && hasOnlineAgents(this.clientId)) {
            const greeting = `Hi! I'm ${this.agentName}. I'm connecting you with one of our specialists right now. While we wait, feel free to ask me anything.`;
            this.logMessage('agent', greeting, this.agentName);
            await this.agentSpeak(greeting);
            await this.requestHandover('human_first');
            return;
        }

        const greeting = this.persona.greeting;
        this.logMessage('agent', greeting, this.agentName);
        await this.agentSpeak(greeting);
    }

    async handleAudioBlob(audioBuffer) {
        if (!this.isActive) return;

        // A live specialist is talking over LiveKit audio: transcribe for the record and their captions only
        if (this.handoverState === 'human') {
            try {
                const { text } = await transcribeAudio(audioBuffer, this.currentLanguage);
                if (text && text.trim().length > 2) this.handleUserSpeech(text.trim(), this.currentLanguage);
            } catch (err) {
                console.log('❌ [Chat] Transcription during human session failed:', err.message);
            }
            return;
        }

        if (this.currentSpeechController) {
            this.currentSpeechController.abort();
        }

        this.interruptRequested = true;
        this.handleAudioPlaybackComplete();
        this.resetIdleTimer();
        this.io.to(this.callId).emit('agent-state', 'transcribing');

        if (this.isProcessing) {
            this.pendingUserTurn = {
                audioBuffer,
                language: this.currentLanguage
            };
            return;
        }

        try {
            this.isProcessing = true;

            const result = await transcribeAudio(audioBuffer, this.currentLanguage);
            const transcript = result.text;
            const language = result.language;

            if (!transcript || transcript.trim().length === 0) {
                this.isProcessing = false;
                this.io.to(this.callId).emit('agent-state', 'idle');
                return;
            }

            // Noise filter
            const noise = transcript.trim().toLowerCase();
            const noisePatterns = [/^(um|uh|hmm|ah|oh|huh)$/, /^\W+$/, /^.{1,2}$/, /^(you|the|a|i|it|is)$/];
            if (noisePatterns.some(p => p.test(noise))) {
                console.log(`🔇 [Chat] Filtered noise transcript: "${transcript}"`);
                this.isProcessing = false;
                this.io.to(this.callId).emit('agent-state', 'idle');
                return;
            }

            // Echo cancellation filter
            if (this.isAgentSpeaking && this.lastAgentMessage && transcript.trim().length > 15) {
                const cleanLast = this.lastAgentMessage.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
                const cleanTranscript = transcript.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
                if (cleanLast.includes(cleanTranscript) && cleanTranscript.length > 20) {
                    console.log(`🔇 [Chat] Filtered acoustic echo: "${transcript}"`);
                    this.isProcessing = false;
                    this.io.to(this.callId).emit('agent-state', 'idle');
                    return;
                }
            }

            this.wasInterrupted = this.isAgentSpeaking;
            await this.handleUserSpeech(transcript, language);

        } catch (err) {
            console.log('❌ [Chat] Audio processing error:', err.message);
            this.isProcessing = false;
            this.io.to(this.callId).emit('agent-state', 'idle');
        }
    }

    async handleUserSpeech(transcript, language) {
        // While a specialist has the call, the visitor's words go to them, not the AI
        if (this.handoverState === 'human') {
            this.io.to(this.callId).emit('user-transcript', { text: transcript, language: this.currentLanguage });
            this.logMessage('user', transcript);
            return;
        }

        try {
            console.log(`👤 [Chat ${this.callId}] User: "${transcript}"`);

            this.currentLanguage = language || this.currentLanguage;
            this.io.to(this.callId).emit('user-transcript', {
                text: transcript,
                language: this.currentLanguage
            });

            this.speechSequence += 1;
            const interruptId = this.speechSequence;

            this.logMessage('user', transcript);
            this.conversationHistory.push({ role: 'user', content: transcript });

            if (this.wasInterrupted && this.lastAgentMessage) {
                this.conversationHistory.push({
                    role: 'system',
                    content: `[System: The user interrupted you while you said: "${this.lastAgentMessage.substring(0, 80)}...". Address their question first, then naturally continue.]`
                });
                this.wasInterrupted = false;
            }

            this.io.to(this.callId).emit('agent-thinking', true);
            this.io.to(this.callId).emit('agent-state', 'processing');

            const decision = await thinkChat(
                transcript,
                this.currentLanguage,
                this.product.knowledgeMap,
                this.conversationHistory,
                this.product.name,
                { persona: this.persona, catalog: this.catalog, handoverAvailable: this.canHandover() }
            );

            this.io.to(this.callId).emit('agent-thinking', false);

            const responseText = decision.content;
            if (responseText) {
                this.logMessage('agent', responseText, this.agentName);
                this.conversationHistory.push({ role: 'assistant', content: responseText });

                this.emitProductCards(decision.showProducts);

                // Check if response matches a section in knowledgeMap and emit visual card
                if (!decision.showProducts?.length && this.product.knowledgeMap?.pages?.length) {
                    const match = this.product.knowledgeMap.pages.find(p =>
                        p.name && (
                            responseText.toLowerCase().includes(p.name.toLowerCase()) ||
                            (transcript && transcript.toLowerCase().includes(p.name.toLowerCase()))
                        )
                    );
                    if (match) {
                        this.io.to(this.callId).emit('agent-card', {
                            name: match.name,
                            description: match.description,
                            keyFeatures: match.keyFeatures,
                            url: match.url,
                            screenshot: match.screenshot
                        });
                    }
                }

                await this.agentSpeak(responseText, interruptId);
            }

            if (decision.handover) {
                await this.requestHandover('ai_escalation');
            } else {
                this.startIdleTimer();
            }

            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-16);
            }

        } catch (err) {
            console.log('❌ [Chat] Error in user speech turn:', err.message);
            this.io.to(this.callId).emit('agent-thinking', false);
        } finally {
            this.isProcessing = false;
            this.interruptRequested = false;
            this.currentSpeechController = null;
            this.io.to(this.callId).emit('agent-thinking', false);
            this.io.to(this.callId).emit('agent-state', 'idle');

            if (this.pendingUserTurn) {
                const turn = this.pendingUserTurn;
                this.pendingUserTurn = null;
                await this.handleAudioBlob(turn.audioBuffer);
            }
        }
    }

    // ── Shoppable product cards ──

    emitProductCards(skus = []) {
        for (const sku of skus) {
            const item = this.catalog.find(c => c.sku === sku);
            if (!item) continue;
            this.productsShown.add(sku);
            this.io.to(this.callId).emit('product-card', {
                sku: item.sku,
                name: item.name,
                description: item.description,
                price: item.price,
                currency: item.currency,
                image: item.image,
                url: item.url,
                ctaLabel: item.ctaLabel
            });
        }
    }

    recordProductClick(sku) {
        if (!this.catalog.some(c => c.sku === sku)) return;
        this.productClicks.push({ sku, at: new Date() });
        this.transcript += `\n[Visitor clicked product ${sku}]`;
        console.log(`🛒 [Chat ${this.callId}] Product click: ${sku}`);
    }

    // ── Human handover ──

    /** Summary of this call for the Live Console. */
    consoleSnapshot() {
        return {
            callId: this.callId,
            productId: this.productId,
            productName: this.product?.name || '',
            agentName: this.agentName,
            prospectName: this.prospectName,
            prospectEmail: this.prospectEmail,
            state: this.handoverState,
            reason: this.handoverInfo.reason,
            requestedAt: this.handoverInfo.requestedAt,
            humanName: this.humanAgent?.name || '',
            messages: this.messages.slice(-30)
        };
    }

    async requestHandover(reason) {
        if (!this.isActive || this.handoverState !== 'none') return;
        if (this.product?.handover?.mode === 'off') return;

        this.handoverInfo = { ...this.handoverInfo, requested: true, requestedAt: new Date(), reason };

        if (!hasOnlineAgents(this.clientId)) {
            this.handoverInfo.outcome = 'unavailable';
            this.io.to(this.callId).emit('handover-update', { state: 'unavailable' });
            const msg = `Our specialists aren't online right now, but I've noted your request and the team will follow up with you. Meanwhile, I'm happy to keep helping.`;
            this.logMessage('agent', msg, this.agentName);
            await this.agentSpeak(msg);
            this.startIdleTimer();
            return;
        }

        console.log(`🙋 [Chat ${this.callId}] Handover requested (${reason})`);
        this.handoverState = 'requested';
        this.clearIdleTimer();
        this.io.to(this.callId).emit('handover-update', { state: 'requested' });
        this.io.to(agentRoom(this.clientId)).emit('handover-requested', this.consoleSnapshot());

        const waitMs = (this.product?.handover?.waitSeconds || 45) * 1000;
        this.handoverTimer = setTimeout(() => this.handoverTimedOut(), waitMs);
    }

    async handoverTimedOut() {
        this.handoverTimer = null;
        if (this.handoverState !== 'requested') return;
        console.log(`⌛ [Chat ${this.callId}] No specialist accepted in time — AI continues`);
        this.handoverState = 'none';
        this.handoverInfo.outcome = 'timeout';
        this.io.to(this.callId).emit('handover-update', { state: 'timeout' });
        this.io.to(agentRoom(this.clientId)).emit('handover-cancelled', { callId: this.callId });
        const msg = `It's taking our specialists a bit longer than usual, so I've passed your details on and they'll get back to you. In the meantime, I'm right here. What else can I help with?`;
        this.logMessage('agent', msg, this.agentName);
        await this.agentSpeak(msg);
        this.startIdleTimer();
    }

    cancelHandover() {
        if (this.handoverState !== 'requested') return;
        if (this.handoverTimer) { clearTimeout(this.handoverTimer); this.handoverTimer = null; }
        this.handoverState = 'none';
        this.handoverInfo.outcome = 'cancelled';
        this.io.to(this.callId).emit('handover-update', { state: 'cancelled' });
        this.io.to(agentRoom(this.clientId)).emit('handover-cancelled', { callId: this.callId });
        this.startIdleTimer();
    }

    /**
     * A specialist takes the call. Returns the LiveKit credentials they need to join with camera + mic.
     * Throws if the call is no longer waiting for a human.
     */
    async humanAccept(name, socketId) {
        if (!this.isActive) throw new Error('This call has ended');
        if (this.handoverState === 'human') throw new Error(`${this.humanAgent?.name || 'Another specialist'} already took this call`);

        if (this.handoverTimer) { clearTimeout(this.handoverTimer); this.handoverTimer = null; }
        if (this.currentSpeechController) this.currentSpeechController.abort();
        this.clearIdleTimer();
        this.isAgentSpeaking = false;

        this.handoverState = 'human';
        this.humanAgent = { name, socketId };
        this.handoverInfo = { ...this.handoverInfo, requested: true, outcome: 'accepted', agentName: name, acceptedAt: new Date() };
        if (!this.handoverInfo.reason) this.handoverInfo.reason = 'agent_initiated';
        this.scheduleSessionLimit(ChatOrchestrator.MAX_HUMAN_SESSION_MS, { warn: false });

        // Silence the avatar while the human speaks
        this.sendAvatarData({ type: 'stop' });

        const token = await generateToken(this.roomName, `human-${socketId}`);
        this.transcript += `\n[${name} joined the call]`;
        this.io.to(this.callId).emit('agent-speaking', { text: '', speaking: false, interrupted: true });
        this.io.to(this.callId).emit('handover-update', { state: 'human', agentName: name });
        this.io.to(agentRoom(this.clientId)).emit('handover-taken', { callId: this.callId, humanName: name });
        console.log(`🧑‍💼 [Chat ${this.callId}] ${name} took over the call`);

        return {
            ...this.consoleSnapshot(),
            messages: this.messages.slice(-100),
            livekitUrl: process.env.LIVEKIT_URL,
            token
        };
    }

    humanMessage(text) {
        if (this.handoverState !== 'human') return;
        this.logMessage('human', text, this.humanAgent.name);
        this.io.to(this.callId).emit('human-message', { text, author: this.humanAgent.name });
    }

    /** Specialist hands the visitor back to the AI (or dropped off). */
    async humanRelease({ dropped = false } = {}) {
        if (this.handoverState !== 'human') return;
        const name = this.humanAgent?.name || 'Our specialist';
        this.transcript += `\n[${name} left the call]`;
        this.handoverState = 'none';
        this.humanAgent = null;
        this.scheduleSessionLimit(ChatOrchestrator.MAX_SESSION_MS + (Date.now() - this.startTime));
        this.io.to(this.callId).emit('handover-update', { state: 'released', agentName: name });

        const msg = dropped
            ? `Looks like ${name} got disconnected. I'm back with you. What else can I help with?`
            : `Thanks for chatting with ${name}! I'm still here if you have any other questions.`;
        this.logMessage('agent', msg, this.agentName);
        await this.agentSpeak(msg);
        this.startIdleTimer();
    }

    // ── Speech ──

    handleAudioPlaybackComplete() {
        this.playbackCompletedAt = Date.now();
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

    /** Send a data message to the Keyframe avatar sidecar, if it has joined the room. */
    async sendAvatarData(message) {
        try {
            const participants = await this.livekitRoomSvc.listParticipants(this.roomName);
            const hasKeyframe = participants && participants.some(
                p => p.identity === 'keyframe-avatar' || (p.identity && p.identity.includes('keyframe'))
            );
            if (hasKeyframe) {
                await this.livekitRoomSvc.sendData(this.roomName, Buffer.from(JSON.stringify(message)), 0);
                return true;
            }
        } catch (e) {
            // Keyframe check notice
        }
        return false;
    }

    async agentSpeak(text, interruptId = 0) {
        // The AI stays quiet while a specialist has the call
        if (this.handoverState === 'human') return;

        try {
            this.isAgentSpeaking = true;
            this.lastAgentMessage = text;
            const controller = new AbortController();
            this.currentSpeechController = controller;
            const voice = { provider: this.persona.voiceProvider, id: this.persona.voiceId };

            if (this.interruptRequested && interruptId < this.speechSequence) {
                console.log('🛑 [Chat] Speech interrupted by user.');
                this.io.to(this.callId).emit('agent-speaking', { text, speaking: false, interrupted: true });
                return;
            }

            // Exactly one voice: the Keyframe avatar (lip-synced, its own TTS) when it is in the room,
            // otherwise sentence-by-sentence audio streamed to the widget. Never both.
            const avatarLive = await this.sendAvatarData({ type: 'speak', text, voice });
            const room = this.io.to(this.callId);

            // 'mode' tells the widget when to reveal the caption: with each audio chunk, or when the avatar starts talking
            room.emit('agent-speaking', { text, speaking: true, mode: avatarLive ? 'avatar' : 'audio' });
            room.emit('agent-state', 'speaking');

            if (avatarLive) {
                console.log(`📡 [Chat] Avatar speaking: "${text.substring(0, 50)}..."`);
            } else {
                try {
                    room.emit('agent-audio-stream-start', { text });

                    // Widgets that can play raw PCM get true streaming (~0.4s to first sound)
                    let streamedBytes = 0;
                    if (this.supportsPcm) {
                        streamedBytes = await streamPcmSpeech(text, {
                            signal: controller.signal,
                            voice,
                            onPcm: (buf) => room.emit('agent-audio-pcm', { audio: buf.toString('base64'), sampleRate: PCM_SAMPLE_RATE })
                        });
                        if (streamedBytes) {
                            this.lastChunkSentAt = Date.now();
                            room.emit('agent-audio-pcm-end', { text });
                        }
                    }

                    // Otherwise (or if streaming failed): sentence-by-sentence MP3, each with its caption text
                    if (!streamedBytes && !controller.signal.aborted) await streamSpeech(text, {
                        signal: controller.signal,
                        voice,
                        onChunk: ({ audio, text: piece, index, total }) => {
                            this.lastChunkSentAt = Date.now();
                            room.emit('agent-audio-chunk', { audio: audio.toString('base64'), text: piece, index, total });
                        }
                    });
                } catch (ttsErr) {
                    if (ttsErr.name !== 'AbortError') {
                        console.warn(`⚠️ [Chat] TTS streaming error: ${ttsErr.message}`);
                    }
                }
            }

            // Wait for the widget to finish playing (avatar mode has no signal, so it's estimated from length)
            const timeoutMs = Math.max(2500, Math.ceil((text.length / 14) * 1000) + 1200);
            if (avatarLive || !(this.playbackCompletedAt > this.lastChunkSentAt)) {
                await this.waitForAudioPlayback(timeoutMs);
            }

            if (this.interruptRequested && interruptId < this.speechSequence) {
                this.io.to(this.callId).emit('agent-speaking', { text, speaking: false, interrupted: true });
                return;
            }

            this.isAgentSpeaking = false;
            this.io.to(this.callId).emit('agent-speaking', { text, speaking: false, interrupted: false });
            this.io.to(this.callId).emit('agent-state', 'idle');

        } catch (err) {
            console.log('❌ [Chat] Agent speak error:', err.message);
            this.isAgentSpeaking = false;
            this.io.to(this.callId).emit('agent-speaking', { text, speaking: false, interrupted: false });
            this.io.to(this.callId).emit('agent-state', 'idle');
        } finally {
            if (this.currentSpeechController?.signal.aborted) {
                this.currentSpeechController = null;
            }
        }
    }

    async end(prospectEmail = '', prospectName = '', status = 'completed', endReason = 'user') {
        if (this.ended) return;
        this.ended = true;
        try {
            this.isActive = false;
            this.clearIdleTimer();
            this.clearSessionTimers();
            if (this.handoverTimer) { clearTimeout(this.handoverTimer); this.handoverTimer = null; }

            if (this.handoverState !== 'none') {
                if (this.handoverState === 'requested') this.handoverInfo.outcome = 'cancelled';
                this.io.to(agentRoom(this.clientId)).emit('call-ended', { callId: this.callId });
            }

            const recordingStopped = this.egressId ? await stopRecording(this.egressId, this.callId) : false;

            const duration = Math.floor((Date.now() - this.startTime) / 1000);

            // Analyze transcript
            const {
                summary,
                satisfaction,
                satisfactionReason,
                qualified,
                qualificationReason,
                leadScore,
                leadScoreReason
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
                qualificationReason,
                leadScore,
                leadScoreReason,
                productsShown: [...this.productsShown],
                productClicks: this.productClicks,
                handover: this.handoverInfo,
                mode: 'chat'
            };
            if (this.egressId) {
                update.recording = {
                    egressId: this.egressId,
                    url: recordingStopped ? recordingUrl(this.callId) : '',
                    status: recordingStopped ? 'completed' : 'failed'
                };
            }
            if (prospectEmail) update.prospectEmail = prospectEmail;
            if (prospectName) update.prospectName = prospectName;

            const call = await Call.findByIdAndUpdate(this.callId, update, { new: true });

            // Hot leads are worth a follow-up even when the visitor never said the magic words
            if (qualified || leadScore === 'hot') {
                await Lead.create({
                    callId: call._id,
                    productId: call.productId,
                    clientId: call.clientId,
                    prospectName: call.prospectName,
                    prospectEmail: call.prospectEmail,
                    qualified,
                    leadScore,
                    notes: [qualificationReason, leadScoreReason].filter(Boolean).join(' | '),
                    status: 'Not Contacted',
                    zohoSyncStatus: isZohoConfigured() ? 'pending' : 'skipped',
                });
                console.log(`🎯 [Chat] Lead created for session: ${call._id} (${leadScore})`);
            }

            console.log(`✅ [Chat] Call ${this.callId} ended — duration: ${duration}s | qualified: ${qualified} | score: ${leadScore} | satisfaction: ${satisfaction}`);

        } catch (err) {
            console.log('❌ [Chat] Error ending call:', err.message);
        }
    }
}
