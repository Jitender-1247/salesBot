import { transcribeAudio } from '../agent/stt.js';
import { speak } from '../agent/tts.js';
import { thinkChat } from '../agent/brain/chatBrain.js';
import { RoomServiceClient } from 'livekit-server-sdk';
import Product from '../models/Product.js';
import Call from '../models/Call.js';
import { analyzeCallOutcome } from '../agent/sentiment.js';
import { isZohoConfigured } from '../integrations/zoho.js';
import Lead from '../models/Lead.js';
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
    }

    static IDLE_TIMEOUT_MS = 12000;     // 12s silence before checking in
    static AUTO_END_TIMEOUT_MS = 60000; // 60s total silence before auto-ending
    static MAX_SESSION_MS = (parseInt(process.env.MAX_SESSION_DURATION_SECONDS) || 300) * 1000;

    startIdleTimer() {
        this.clearIdleTimer();
        if (!this.isActive) return;

        // 1. Proactive check-in prompts
        if (this.idlePromptCount < 2) {
            this.idleTimer = setTimeout(async () => {
                if (!this.isActive || this.isProcessing || this.isAgentSpeaking) return;

                this.idlePromptCount++;
                console.log(`⏰ [Chat ${this.callId}] Idle check-in (${this.idlePromptCount}/2)`);

                const prompts = [
                    `I'm here whenever you have any other questions about ${this.product?.name || 'our product'}!`,
                    `Still there? Feel free to ask about our pricing, features, or how other customers use this!`
                ];
                const prompt = prompts[this.idlePromptCount - 1] || prompts[0];

                await this.agentSpeak(prompt);
                this.conversationHistory.push({ role: 'assistant', content: prompt });
                this.transcript += `\nSofia: ${prompt}`;

                this.startIdleTimer();
            }, ChatOrchestrator.IDLE_TIMEOUT_MS);
        }

        // 2. Auto-End Inactivity Timer
        if (!this.autoEndTimer) {
            this.autoEndTimer = setTimeout(async () => {
                if (!this.isActive) return;

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

    async start() {
        try {
            this.product = await Product.findById(this.productId);
            if (!this.product) throw new Error('Product not found');

            this.isActive = true;
            this.startTime = Date.now();

            console.log(`💬 [ChatOrchestrator] 1-on-1 Avatar Chat active for ${this.product.name} (zero browser overhead)`);

            // 1-minute warning before hard session cap
            const warningMs = ChatOrchestrator.MAX_SESSION_MS - 60000;
            if (warningMs > 0) {
                this.sessionWarningTimer = setTimeout(async () => {
                    if (!this.isActive) return;
                    const remainSec = Math.round((ChatOrchestrator.MAX_SESSION_MS - (Date.now() - this.startTime)) / 1000);
                    await this.agentSpeak(
                        `Just a quick note — we have about ${remainSec} seconds remaining in this chat session. ` +
                        `Is there anything else you'd like to ask before we wrap up?`
                    );
                }, warningMs);
            }

            // Session hard duration limit
            this.sessionTimer = setTimeout(async () => {
                if (!this.isActive) return;
                console.log(`⏰ [Chat ${this.callId}] Max session duration reached — ending`);
                await this.agentSpeak(
                    `Thank you so much for chatting with me today! Our session time is up. ` +
                    `Our team will follow up with you shortly!`
                );
                this.io.to(this.callId).emit('chat-ended', { callId: this.callId, reason: 'max_duration' });
                this.io.to(this.callId).emit('demo-ended', { callId: this.callId, reason: 'max_duration' });
                await this.end('', '', 'completed', 'max_duration');
            }, ChatOrchestrator.MAX_SESSION_MS);

        } catch (err) {
            console.log('❌ [ChatOrchestrator] Start failed:', err.message);
            this.isActive = false;
            throw err;
        }
    }

    async sendGreeting() {
        if (this.hasGreeted) return;
        this.hasGreeted = true;
        this.isActive = true;

        console.log(`👋 [Chat ${this.callId}] Sending 1-on-1 greeting to visitor...`);
        const greeting = `Hi! I'm Sofia, your AI product specialist for ${this.product?.name || 'this product'}. What can I tell you about today?`;
        this.transcript += `\nSofia: ${greeting}`;
        this.messages.push({ role: 'agent', content: greeting, timestamp: new Date() });
        await this.agentSpeak(greeting);
    }

    async handleAudioBlob(audioBuffer) {
        if (!this.isActive) return;

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
        try {
            console.log(`👤 [Chat ${this.callId}] User: "${transcript}"`);

            this.currentLanguage = language || this.currentLanguage;
            this.io.to(this.callId).emit('user-transcript', {
                text: transcript,
                language: this.currentLanguage
            });

            this.speechSequence += 1;
            const interruptId = this.speechSequence;

            this.transcript += `\nUser: ${transcript}`;
            this.messages.push({ role: 'user', content: transcript, timestamp: new Date() });
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
                this.product.name
            );

            this.io.to(this.callId).emit('agent-thinking', false);

            const responseText = decision.content;
            if (responseText) {
                this.transcript += `\nSofia: ${responseText}`;
                this.messages.push({ role: 'agent', content: responseText, timestamp: new Date() });
                this.conversationHistory.push({ role: 'assistant', content: responseText });

                // Check if response matches a section in knowledgeMap and emit visual card
                if (this.product.knowledgeMap?.pages?.length) {
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

            this.startIdleTimer();

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
                console.log('🛑 [Chat] Speech interrupted by user.');
                this.io.to(this.callId).emit('agent-speaking', { text, speaking: false, interrupted: true });
                return;
            }

            // Send speak data to Keyframe avatar in LiveKit room for lip sync
            const payload = JSON.stringify({ type: 'speak', text });
            try {
                const participants = await this.livekitRoomSvc.listParticipants(this.roomName);
                const hasKeyframe = participants && participants.some(
                    p => p.identity === 'keyframe-avatar' || (p.identity && p.identity.includes('keyframe'))
                );
                if (hasKeyframe) {
                    await this.livekitRoomSvc.sendData(this.roomName, Buffer.from(payload), 0);
                    console.log(`📡 [Chat] Sent speak data to Keyframe avatar: "${text.substring(0, 50)}..."`);
                }
            } catch (e) {
                // Keyframe check notice
            }

            // Sentence-level TTS streaming
            try {
                const roomEmitter = this.io.to(this.callId);
                await speak(text, controller.signal, roomEmitter);
            } catch (ttsErr) {
                if (ttsErr.name !== 'AbortError') {
                    console.warn(`⚠️ [Chat] TTS streaming error: ${ttsErr.message}`);
                }
            }

            // Wait for audio playback
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
        try {
            this.isActive = false;
            this.clearIdleTimer();

            if (this.sessionTimer) { clearTimeout(this.sessionTimer); this.sessionTimer = null; }
            if (this.sessionWarningTimer) { clearTimeout(this.sessionWarningTimer); this.sessionWarningTimer = null; }

            const duration = Math.floor((Date.now() - this.startTime) / 1000);

            // Analyze transcript
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
                qualificationReason,
                mode: 'chat'
            };
            if (prospectEmail) update.prospectEmail = prospectEmail;
            if (prospectName) update.prospectName = prospectName;

            const call = await Call.findByIdAndUpdate(this.callId, update, { new: true });

            if (qualified) {
                await Lead.create({
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
                console.log(`🎯 [Chat] Lead created for qualified session: ${call._id}`);
            }

            console.log(`✅ [Chat] Call ${this.callId} ended — duration: ${duration}s | qualified: ${qualified} | satisfaction: ${satisfaction}`);

        } catch (err) {
            console.log('❌ [Chat] Error ending call:', err.message);
        }
    }
}
