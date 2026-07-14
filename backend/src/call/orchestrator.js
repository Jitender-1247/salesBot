import { transcribeAudio } from '../agent/stt.js';
import { speak } from '../agent/tts.js';
import { think } from '../agent/brain/index.js';
import { Navigator } from '../agent/navigator/index.js';
import { decrypt } from '../utils/encryption.js';
import { generateToken } from '../call/room.js';
import Product from '../models/Product.js';
import Call from '../models/Call.js';
import dotenv from 'dotenv';
dotenv.config();

export class CallOrchestrator {
    constructor(productId, callId, io) {
        this.productId = productId;
        this.callId = callId;
        this.io = io;
        this.product = null;
        this.navigator = new Navigator();
        this.conversationHistory = [];
        this.currentLanguage = 'en';
        this.isAgentSpeaking = false;
        this.isProcessing = false;
        this.isActive = false;
        this.transcript = '';
        this.startTime = null;
        this.interruptRequested = false;
        this.interruptMessage = '';
        this.speechSequence = 0;
        this.pendingUserTurn = null;
        this.currentSpeechController = null;
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

            // Launch browser and login
            await this.navigator.launch();
            await this.navigator.login(
                this.product.url,
                this.product.knowledgeMap.loginSteps,
                decrypt(this.product.credentials.email),
                decrypt(this.product.credentials.password)
            );

            // Opening message
            await this.agentSpeak(
                `Hi there! I'm Alex, your personal demo guide for ${this.product.name}. I'm logged in and ready to show you around. What would you like to see first?`
            );

            console.log(`✅ Call ${this.callId} started`);

        } catch (err) {
            console.log('❌ Orchestrator start failed:', err.message);
            this.isActive = false;
            throw err;
        }
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

            this.conversationHistory.push({
                role: 'user',
                content: transcript
            });

            this.io.to(this.callId).emit('user-transcript', {
                text: transcript,
                language: this.currentLanguage
            });

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

                const decision = await think(
                    // We only send the original transcript in the first step, otherwise we rely on history
                    stepCount === 1 ? transcript : "(Proceed with next step)",
                    this.currentLanguage,
                    this.product.knowledgeMap,
                    this.conversationHistory,
                    this.product.name
                );

                this.io.to(this.callId).emit('agent-thinking', false);

                if (decision.finish_reason === 'tool_calls' && decision.message.tool_calls) {
                    for (const toolCall of decision.message.tool_calls) {
                        const toolName = toolCall.function.name;
                        const toolArgs = JSON.parse(toolCall.function.arguments);
                        await this.navigator.executeAction(toolName, toolArgs);
                        this.io.to(this.callId).emit('navigation-event', {
                            tool: toolName,
                            args: toolArgs
                        });
                    }
                }

                const responseText = decision.message.content;
                if (responseText) {
                    this.transcript += `\nAgent: ${responseText}`;
                    this.conversationHistory.push({
                        role: 'assistant',
                        content: responseText
                    });
                    await this.agentSpeak(responseText, interruptId);
                }

                // If agent wants to wait (finish_reason is stop), break the loop
                if (decision.finish_reason === 'stop') {
                    console.log('🛑 Agent finished sequence, waiting for user.');
                    break;
                } else {
                    // Inject system message telling it to proceed
                    this.conversationHistory.push({
                        role: 'system',
                        content: '[System: Action executed. Proceed with next step or output [WAIT] to stop.]'
                    });
                }
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
            this.io.to(this.callId).emit('agent-state', 'idle');

            if (this.pendingUserTurn) {
                const pendingTurn = this.pendingUserTurn;
                this.pendingUserTurn = null;
                await this.handleAudioBlob(pendingTurn.audioBuffer, pendingTurn.language);
            }
        }
    }

    async agentSpeak(text, interruptId = 0) {
        try {
            this.isAgentSpeaking = true;
            const controller = new AbortController();
            this.currentSpeechController = controller;
            this.io.to(this.callId).emit('agent-speaking', { text, speaking: true });
            this.io.to(this.callId).emit('agent-state', 'speaking');

            if (this.interruptRequested && interruptId < this.speechSequence) {
                console.log('🛑 Speech canceled because the user interrupted it.');
                this.io.to(this.callId).emit('agent-speaking', { text, speaking: false, interrupted: true });
                return;
            }

            const audio = await speak(text, controller.signal);
            if (this.interruptRequested && interruptId < this.speechSequence) {
                console.log('🛑 Audio canceled because the user interrupted it.');
                this.io.to(this.callId).emit('agent-speaking', { text, speaking: false, interrupted: true });
                return;
            }

            this.io.to(this.callId).emit('agent-audio', audio);

            this.isAgentSpeaking = false;
            this.io.to(this.callId).emit('agent-speaking', { text, speaking: false, interrupted: false });

        } catch (err) {
            console.log('❌ Agent speak error:', err.message);
            this.isAgentSpeaking = false;
        } finally {
            if (this.currentSpeechController && this.currentSpeechController.signal.aborted) {
                this.currentSpeechController = null;
            }
        }
    }

    async checkSessionTimeout() {
        const loggedOut = await this.navigator.checkIfLoggedOut(this.product.url);
        if (loggedOut) {
            console.log('⚠️ Session expired — re-logging in');
            await this.navigator.login(
                this.product.url,
                this.product.knowledgeMap.loginSteps,
                decrypt(this.product.credentials.email),
                decrypt(this.product.credentials.password)
            );
        }

        const elapsed = Date.now() - this.startTime;
        if (elapsed > 30 * 60 * 1000) {
            await this.agentSpeak(
                "We've covered a lot today! I'd love to have someone from our team follow up with you. Can I get your email address?"
            );
        }
    }

    async end(prospectEmail = '', prospectName = '') {
        try {
            this.isActive = false;

            const duration = Math.floor((Date.now() - this.startTime) / 1000);
            await Call.findByIdAndUpdate(this.callId, {
                transcript: this.transcript,
                language: this.currentLanguage,
                duration,
                prospectEmail,
                prospectName,
                status: 'completed'
            });

            await this.navigator.close();

            console.log(`✅ Call ${this.callId} ended — duration: ${duration}s`);

        } catch (err) {
            console.log('❌ Error ending call:', err.message);
        }
    }
}