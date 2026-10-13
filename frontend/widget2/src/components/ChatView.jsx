import { useState, useCallback, useRef, useEffect } from 'react';
import AudioPlayer from './AudioPlayer';
import AudioRecorder from './AudioRecorder';
import KeyframeAvatar from './KeyframeAvatar';

function LocalAvatar({ speaking, onReady }) {
    useEffect(() => {
        onReady?.();
    }, [onReady]);

    return (
        <div className={`chat-avatar-fallback ${speaking ? 'speaking' : ''}`}>
            {speaking && (
                <>
                    <div className="chat-avatar-halo halo-1" />
                    <div className="chat-avatar-halo halo-2" />
                    <div className="chat-avatar-halo halo-3" />
                </>
            )}

            <div className={`chat-avatar-photo-frame ${speaking ? 'speaking' : ''}`}>
                <img
                    src="/widget2/alex-avatar.png"
                    alt="Sofia"
                    onError={(e) => { e.target.src = '/alex-avatar.png'; }}
                />
            </div>
        </div>
    );
}

const stateLabels = {
    idle: 'Ready to chat',
    listening: 'Listening...',
    transcribing: 'Listening...',
    processing: 'Thinking...',
    speaking: 'Sofia is speaking',
    error: 'Error',
};

export default function ChatView({ callData, socket, onEnd }) {
    const [agentState, setAgentState] = useState('idle');
    const [messages, setMessages] = useState([]);
    const [displayedText, setDisplayedText] = useState('');
    const [userText, setUserText] = useState('');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [duration, setDuration] = useState(0);
    const [chatInput, setChatInput] = useState('');
    const [micVolume, setMicVolume] = useState(0);
    const [maxDuration, setMaxDuration] = useState(
        parseInt(import.meta.env.VITE_MAX_SESSION_DURATION || '300')
    );

    const audioPlayerRef = useRef(null);
    const timerRef = useRef(null);
    const typingRef = useRef(null);
    const messagesEndRef = useRef(null);

    const genId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const defaultSuggestions = [
        "What does this product do?",
        "What are the key features?",
        "Who is this best for?",
        "Tell me about pricing",
    ];
    const suggestions = (callData?.suggestedQuestions && callData.suggestedQuestions.length > 0)
        ? callData.suggestedQuestions
        : defaultSuggestions;

    // Session duration timer
    useEffect(() => {
        timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        return () => clearInterval(timerRef.current);
    }, []);

    // Session config from backend
    useEffect(() => {
        if (!socket) return;
        const onConfig = (config) => {
            if (config.maxDurationSeconds) setMaxDuration(config.maxDurationSeconds);
        };
        socket.on('session-config', onConfig);
        return () => socket.off('session-config', onConfig);
    }, [socket]);

    // Auto-scroll messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, displayedText, userText]);

    // Timeout safety for processing state
    useEffect(() => {
        if (agentState === 'processing') {
            const timer = setTimeout(() => {
                setAgentState('idle');
            }, 7000);
            return () => clearTimeout(timer);
        }
    }, [agentState]);

    // Socket listeners
    useEffect(() => {
        if (!socket) return;

        const onAgentSpeaking = (data) => {
            if (data.speaking) {
                setAgentState('speaking');
                setIsSpeaking(true);

                clearInterval(typingRef.current);
                setDisplayedText('');

                const words = data.text.split(' ');
                const msPerWord = 350;
                let wordIdx = 0;

                typingRef.current = setInterval(() => {
                    wordIdx++;
                    setDisplayedText(words.slice(0, wordIdx).join(' '));
                    if (wordIdx >= words.length) {
                        clearInterval(typingRef.current);
                    }
                }, msPerWord);
            } else {
                clearInterval(typingRef.current);
                if (data.interrupted) {
                    audioPlayerRef.current?.stop();
                    setDisplayedText('');
                }
                setAgentState('idle');
                setIsSpeaking(false);
            }
        };

        const onAgentAudioStreamStart = () => {
            audioPlayerRef.current?.startStreaming();
        };

        const onAgentAudioChunk = (data) => {
            if (data.audio) {
                audioPlayerRef.current?.enqueueAudioChunk(data.audio);
            }
        };

        const onAgentState = (state) => {
            setAgentState(state);
            if (state === 'speaking') {
                setIsSpeaking(true);
            } else if (state === 'idle') {
                setIsSpeaking(false);
            }
        };

        const onUserTranscript = (data) => {
            if (data.text) {
                const trimmed = data.text.trim();
                setUserText(trimmed);
                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === 'user' && last.content === trimmed) return prev;
                    return [...prev, {
                        id: genId(),
                        role: 'user',
                        content: trimmed,
                        timestamp: new Date()
                    }];
                });
                setTimeout(() => setUserText(''), 4000);
            }
        };

        socket.on('agent-speaking', onAgentSpeaking);
        socket.on('agent-audio-stream-start', onAgentAudioStreamStart);
        socket.on('agent-audio-chunk', onAgentAudioChunk);
        socket.on('agent-state', onAgentState);
        socket.on('user-transcript', onUserTranscript);

        return () => {
            socket.off('agent-speaking', onAgentSpeaking);
            socket.off('agent-audio-stream-start', onAgentAudioStreamStart);
            socket.off('agent-audio-chunk', onAgentAudioChunk);
            socket.off('agent-state', onAgentState);
            socket.off('user-transcript', onUserTranscript);
        };
    }, [socket]);

    const handleRecordingComplete = useCallback((audioBlob) => {
        if (!socket || !callData) return;
        setAgentState('processing');
        socket.emit('audio-blob', {
            callId: callData.callId,
            audio: audioBlob
        });
    }, [socket, callData]);

    const handlePlaybackEnd = useCallback(() => {
        setAgentState('idle');
        setIsSpeaking(false);
        setDisplayedText(prev => {
            if (prev) {
                setMessages(m => {
                    const last = m[m.length - 1];
                    if (last && last.role === 'agent' && last.content === prev) return m;
                    return [...m, {
                        id: genId(),
                        role: 'agent',
                        content: prev,
                        timestamp: new Date()
                    }];
                });
            }
            return '';
        });
        if (socket && callData) {
            socket.emit('audio-playback-complete', { callId: callData.callId });
        }
    }, [socket, callData]);

    const handlePlaybackStart = useCallback(() => {
        setAgentState('speaking');
        setIsSpeaking(true);
    }, []);

    const handleRecordingStart = useCallback(() => {
        setAgentState('listening');
    }, []);

    const handleInterrupt = useCallback(() => {
        audioPlayerRef.current?.stop();
        setAgentState('idle');
        setIsSpeaking(false);
    }, []);

    const handleAvatarReady = useCallback(() => {
        if (socket && callData) {
            console.log('[ChatView] Live 3D Avatar connected');
            socket.emit('avatar-ready', { callId: callData.callId });
        }
    }, [socket, callData]);

    const sendUserMessage = (text) => {
        const trimmed = text.trim();
        if (!trimmed || !socket || !callData) return;
        setUserText(trimmed);
        setMessages(prev => [...prev, {
            id: genId(),
            role: 'user',
            content: trimmed,
            timestamp: new Date()
        }]);
        socket.emit('user-message', {
            callId: callData.callId,
            text: trimmed
        });
        setTimeout(() => setUserText(''), 4000);
    };

    const handleSendText = (e) => {
        e?.preventDefault();
        sendUserMessage(chatInput);
        setChatInput('');
    };

    const formatDuration = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    const remaining = Math.max(0, maxDuration - duration);
    const isUrgent = remaining <= 60;

    return (
        <div className="chat-container">
            {/* Header */}
            <header className="chat-header">
                <div className="chat-header-info">
                    <div className="chat-header-avatar">
                        👩‍💼
                        <span className="chat-online-dot" />
                    </div>
                    <div>
                        <h1 className="chat-header-title">Sofia</h1>
                        <p className="chat-header-subtitle">1-on-1 AI Product Consultant</p>
                    </div>
                </div>

                <div className="chat-header-actions">
                    <div className="chat-mode-badge">
                        <span className="chat-live-pulse" />
                        1-on-1 Chat
                    </div>
                    <span className={`chat-timer ${isUrgent ? 'timer-urgent' : ''}`}
                          title={`${formatDuration(duration)} elapsed / ${formatDuration(maxDuration)} max`}>
                        ⏱️ {formatDuration(remaining)}
                    </span>
                    <button className="chat-end-btn" onClick={onEnd} title="End Conversation">
                        <span>📵</span>
                        <span>End</span>
                    </button>
                </div>
            </header>

            {/* Main Stage: Hero Avatar Video + Live Visualizer */}
            <section className="chat-stage">
                <div className="chat-avatar-viewport">
                    {callData?.livekitUrl && callData?.visitorToken ? (
                        <KeyframeAvatar
                            livekitUrl={callData.livekitUrl}
                            token={callData.visitorToken}
                            speaking={isSpeaking}
                            onReady={handleAvatarReady}
                        />
                    ) : (
                        <LocalAvatar
                            speaking={isSpeaking}
                            onReady={handleAvatarReady}
                        />
                    )}

                    {/* Status Pill overlay */}
                    <div className={`chat-status-pill status-${agentState}`}>
                        <span className="chat-status-orb" />
                        <span>{stateLabels[agentState] || 'Ready'}</span>
                        {isSpeaking && (
                            <div className="chat-speaking-wave">
                                <span /><span /><span />
                            </div>
                        )}
                    </div>
                </div>

                {/* Real-time word-by-word active caption banner */}
                {displayedText && (
                    <div className="chat-speech-caption">
                        <span className="caption-speaker">Sofia</span>
                        <p className="caption-text">"{displayedText}"</p>
                    </div>
                )}
                {!displayedText && userText && (
                    <div className="chat-speech-caption user-caption">
                        <span className="caption-speaker">You</span>
                        <p className="caption-text">"{userText}"</p>
                    </div>
                )}
            </section>

            {/* Quick Suggestion Chips */}
            {messages.length < 3 && (
                <div className="chat-suggestions-bar">
                    <span className="suggestions-label">💡 Suggested questions:</span>
                    <div className="suggestions-scroll">
                        {suggestions.map((item, idx) => (
                            <button
                                key={idx}
                                className="suggestion-chip"
                                onClick={() => sendUserMessage(item)}
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Conversation Stream (Scrollable) */}
            <div className="chat-messages-box">
                {messages.length === 0 && !displayedText && !userText ? (
                    <div className="chat-empty-state">
                        <div className="empty-sparkle">✨</div>
                        <p className="empty-title">Ask Sofia Anything</p>
                        <p className="empty-desc">
                            Speak into your microphone or type below. Sofia has full knowledge of features, pricing, and use cases.
                        </p>
                    </div>
                ) : (
                    messages.map((m) => {
                        const isUser = m.role === 'user';
                        return (
                            <div key={m.id} className={`chat-bubble-row ${isUser ? 'user-row' : 'agent-row'}`}>
                                <div className="chat-bubble">
                                    <span className="chat-bubble-author">{isUser ? 'You' : 'Sofia'}</span>
                                    <p className="chat-bubble-text">{m.content}</p>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Voice & Text Input Controls */}
            <div className="chat-controls-bar">
                <AudioRecorder
                    disabled={false}
                    onRecordingComplete={handleRecordingComplete}
                    isProcessing={agentState === 'processing'}
                    onRecordingStart={handleRecordingStart}
                    onRecordingStop={() => {}}
                    onInterrupt={handleInterrupt}
                    isSpeaking={agentState === 'speaking'}
                    onVolumeChange={setMicVolume}
                />

                <form className="chat-input-form" onSubmit={handleSendText}>
                    <input
                        type="text"
                        className="chat-text-input"
                        placeholder="Type a message or speak..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                    />
                    <button
                        type="submit"
                        className="chat-send-btn"
                        disabled={!chatInput.trim()}
                        title="Send message"
                    >
                        ➤
                    </button>
                </form>
            </div>

            {/* Hidden Audio Player for streamed TTS audio */}
            <div style={{ display: 'none' }}>
                <AudioPlayer
                    ref={audioPlayerRef}
                    muted={false}
                    onPlaybackStart={handlePlaybackStart}
                    onPlaybackEnd={handlePlaybackEnd}
                />
            </div>
        </div>
    );
}
