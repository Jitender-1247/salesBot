import { useState, useEffect, useRef, useCallback } from 'react';
import VideoAvatar from './VideoAvatar';
import AudioPlayer from './AudioPlayer';
import AudioRecorder from './AudioRecorder';
import KnowledgeCard from './KnowledgeCard';
import ProductCard from './ProductCard';

const statusLabels = (name) => ({
    idle: 'Online & Ready',
    listening: 'Listening to you...',
    transcribing: 'Listening...',
    processing: 'Thinking...',
    speaking: `${name} is speaking`,
    error: 'Reconnecting...'
});

const FALLBACK_AVATAR_IMG = '/alex-avatar.png';

export default function ChatView({
    callData,
    socket,
    persona = { name: 'Sofia', role: 'AI Sales Specialist' },
    avatarImg = '/widget3/alex-avatar.png',
    onEnd,
    onMinimize,
    knowledgeMap = null
}) {
    const agentName = persona.name || 'Sofia';
    const STATUS_LABELS = statusLabels(agentName);
    const [agentState, setAgentState] = useState('idle');
    const [messages, setMessages] = useState([]);
    const [liveCaption, setLiveCaption] = useState('');
    const [userLiveText, setUserLiveText] = useState('');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [sessionSeconds, setSessionSeconds] = useState(0);
    const [inputText, setInputText] = useState('');
    const [activeCard, setActiveCard] = useState(null);
    const [activeProduct, setActiveProduct] = useState(null);
    const [maxDuration, setMaxDuration] = useState(300);
    // Human handover: none | requested | human | unavailable | timeout | cancelled | released
    const [handover, setHandover] = useState({ state: 'none', agentName: '' });
    const isHumanLive = handover.state === 'human';
    const handoverEnabled = callData?.handover?.mode && callData.handover.mode !== 'off';

    const audioPlayerRef = useRef(null);
    const timerIntervalRef = useRef(null);
    const captionIntervalRef = useRef(null);
    const messagesEndRef = useRef(null);

    const makeMsgId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Build suggested questions from knowledge map
    const suggestedQuestions = callData?.suggestedQuestions?.length > 0
        ? callData.suggestedQuestions
        : [
            'What makes your product unique?',
            'What are the core features?',
            'Who is this designed for?',
            'Tell me about pricing & plans'
        ];

    // Session timer
    useEffect(() => {
        timerIntervalRef.current = setInterval(() => {
            setSessionSeconds(prev => prev + 1);
        }, 1000);
        return () => clearInterval(timerIntervalRef.current);
    }, []);

    // Session config
    useEffect(() => {
        if (!socket) return;
        const handleConfig = (cfg) => {
            if (cfg.maxDurationSeconds) setMaxDuration(cfg.maxDurationSeconds);
        };
        socket.on('session-config', handleConfig);
        return () => socket.off('session-config', handleConfig);
    }, [socket]);

    // Scroll to latest message
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, liveCaption, userLiveText]);

    // Safety timeout for 'processing'
    useEffect(() => {
        if (agentState === 'processing') {
            const t = setTimeout(() => setAgentState('idle'), 7000);
            return () => clearTimeout(t);
        }
    }, [agentState]);

    // Socket event handlers
    useEffect(() => {
        if (!socket) return;

        const handleSpeaking = (data) => {
            if (data.speaking) {
                setAgentState('speaking');
                setIsSpeaking(true);
                clearInterval(captionIntervalRef.current);
                setLiveCaption('');

                // Word-by-word typewriter
                const words = (data.text || '').split(' ');
                let i = 0;
                captionIntervalRef.current = setInterval(() => {
                    i++;
                    setLiveCaption(words.slice(0, i).join(' '));
                    if (i >= words.length) clearInterval(captionIntervalRef.current);
                }, 320);

                // Auto-trigger Knowledge Card if text mentions a known page/feature
                if (knowledgeMap?.pages?.length) {
                    const match = knowledgeMap.pages.find(p =>
                        data.text.toLowerCase().includes(p.name.toLowerCase()) ||
                        (p.keyFeatures && p.keyFeatures.some(f => data.text.toLowerCase().includes(f.toLowerCase())))
                    );
                    if (match) {
                        setActiveCard(match);
                    }
                }
            } else {
                clearInterval(captionIntervalRef.current);
                if (data.interrupted) {
                    audioPlayerRef.current?.stop();
                    setLiveCaption('');
                }
                setAgentState('idle');
                setIsSpeaking(false);
            }
        };

        const handleStreamStart = () => {
            audioPlayerRef.current?.startStreaming();
        };

        const handleAudioChunk = (data) => {
            if (data.audio) {
                audioPlayerRef.current?.enqueueAudioChunk(data.audio);
            }
        };

        const handleState = (state) => {
            setAgentState(state);
            if (state === 'speaking') setIsSpeaking(true);
            else if (state === 'idle') setIsSpeaking(false);
        };

        const handleUserTranscript = (data) => {
            if (data.text) {
                const text = data.text.trim();
                setUserLiveText(text);
                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === 'user' && last.content === text) return prev;
                    return [...prev, { id: makeMsgId(), role: 'user', content: text, timestamp: new Date() }];
                });
                setTimeout(() => setUserLiveText(''), 3500);
            }
        };

        const handleAgentCard = (card) => {
            if (card) {
                setActiveCard(card);
            }
        };

        const handleProductCard = (product) => {
            if (product) {
                setActiveCard(null);
                setActiveProduct(product);
            }
        };

        const handleHandoverUpdate = (update) => {
            setHandover({ state: update.state, agentName: update.agentName || '' });
            if (update.state === 'human') {
                clearInterval(captionIntervalRef.current);
                setLiveCaption('');
                setIsSpeaking(false);
                setAgentState('idle');
            }
        };

        const handleHumanMessage = ({ text, author }) => {
            if (!text) return;
            setMessages(prev => [...prev, { id: makeMsgId(), role: 'human', author, content: text, timestamp: new Date() }]);
        };

        socket.on('agent-speaking', handleSpeaking);
        socket.on('agent-audio-stream-start', handleStreamStart);
        socket.on('agent-audio-chunk', handleAudioChunk);
        socket.on('agent-state', handleState);
        socket.on('user-transcript', handleUserTranscript);
        socket.on('agent-card', handleAgentCard);
        socket.on('product-card', handleProductCard);
        socket.on('handover-update', handleHandoverUpdate);
        socket.on('human-message', handleHumanMessage);

        return () => {
            socket.off('agent-speaking', handleSpeaking);
            socket.off('agent-audio-stream-start', handleStreamStart);
            socket.off('agent-audio-chunk', handleAudioChunk);
            socket.off('agent-state', handleState);
            socket.off('user-transcript', handleUserTranscript);
            socket.off('agent-card', handleAgentCard);
            socket.off('product-card', handleProductCard);
            socket.off('handover-update', handleHandoverUpdate);
            socket.off('human-message', handleHumanMessage);
        };
    }, [socket, knowledgeMap]);

    // Audio handlers
    const handleRecordingComplete = useCallback((blob) => {
        if (!socket || !callData) return;
        setAgentState('processing');
        socket.emit('audio-blob', { callId: callData.callId, audio: blob });
    }, [socket, callData]);

    const handlePlaybackEnd = useCallback(() => {
        setAgentState('idle');
        setIsSpeaking(false);
        setLiveCaption(prev => {
            if (prev) {
                setMessages(m => {
                    const last = m[m.length - 1];
                    if (last && last.role === 'agent' && last.content === prev) return m;
                    return [...m, { id: makeMsgId(), role: 'agent', content: prev, timestamp: new Date() }];
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
            socket.emit('avatar-ready', { callId: callData.callId });
        }
    }, [socket, callData]);

    const handleSendMessage = (textToSend) => {
        const text = textToSend.trim();
        if (!text || !socket || !callData) return;

        setUserLiveText(text);
        setMessages(prev => [...prev, { id: makeMsgId(), role: 'user', content: text, timestamp: new Date() }]);
        socket.emit('user-message', { callId: callData.callId, text });
        setTimeout(() => setUserLiveText(''), 3500);
    };

    const requestHuman = () => {
        if (!socket || !callData) return;
        setHandover({ state: 'requested', agentName: '' });
        socket.emit('request-human', { callId: callData.callId });
    };

    const cancelHuman = () => {
        if (!socket || !callData) return;
        socket.emit('cancel-human', { callId: callData.callId });
    };

    const handleProductOpen = (product) => {
        if (socket && callData) socket.emit('product-click', { callId: callData.callId, sku: product.sku });
    };

    const handleFormSubmit = (e) => {
        e?.preventDefault();
        handleSendMessage(inputText);
        setInputText('');
    };

    const formatTimer = (sec) => {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const remainingSec = Math.max(0, maxDuration - sessionSeconds);

    return (
        <div className="chat-modal-view">
            {/* Header */}
            <header className="chat-top-header">
                <div className="agent-identity">
                    <div className="agent-avatar-thumb">
                        <img
                            src={avatarImg}
                            alt={agentName}
                            onError={(e) => { e.target.src = FALLBACK_AVATAR_IMG; }}
                        />
                        <span className="online-indicator-dot" />
                    </div>
                    <div>
                        <div className="agent-title-row">
                            <h2 className="agent-name">{isHumanLive ? handover.agentName : agentName}</h2>
                            {isHumanLive
                                ? <span className="badge-ai badge-live">● LIVE · Human</span>
                                : <span className="badge-ai">AI Video Agent</span>}
                        </div>
                        <p className="agent-subtitle">{isHumanLive ? 'Human specialist' : persona.role}</p>
                    </div>
                </div>

                <div className="header-right-controls">
                    {handoverEnabled && !isHumanLive && handover.state !== 'requested' && (
                        <button
                            type="button"
                            className="talk-human-btn"
                            onClick={requestHuman}
                            title="Talk to a human specialist"
                        >
                            🙋 Talk to a human
                        </button>
                    )}
                    <div className="time-pill" title="Time remaining">
                        <span className="clock-icon">⏱️</span>
                        <span>{formatTimer(remainingSec)}</span>
                    </div>
                    {onMinimize && (
                        <button
                            type="button"
                            className="header-icon-btn"
                            onClick={onMinimize}
                            title="Minimize to floating bubble"
                        >
                            🗕
                        </button>
                    )}
                    <button
                        type="button"
                        className="header-icon-btn close-btn"
                        onClick={onEnd}
                        title="End Consultation"
                    >
                        ✕
                    </button>
                </div>
            </header>

            {/* Human handover status */}
            {handover.state === 'requested' && (
                <div className="handover-banner handover-pending">
                    <span className="handover-spinner" />
                    <span>Let me connect you with a specialist… {agentName} will keep helping while you wait.</span>
                    <button type="button" className="handover-banner-btn" onClick={cancelHuman}>Cancel</button>
                </div>
            )}
            {isHumanLive && (
                <div className="handover-banner handover-live">
                    <span className="live-dot" />
                    <span>LIVE: you're connected to {handover.agentName}. Your microphone is shared with them.</span>
                </div>
            )}
            {['unavailable', 'timeout'].includes(handover.state) && (
                <div className="handover-banner handover-info">
                    <span>Our specialists are busy right now. We've noted your request and will follow up.</span>
                </div>
            )}

            {/* Split Content Area: Video Stage (Left) & Chat/Cards (Right) */}
            <div className="chat-body-split">
                {/* Left: Video Stage */}
                <div className="stage-column">
                    <div className="video-card-container">
                        <VideoAvatar
                            livekitUrl={callData?.livekitUrl}
                            token={callData?.visitorToken}
                            speaking={isSpeaking}
                            onReady={handleAvatarReady}
                            avatarImg={avatarImg}
                            agentName={agentName}
                            humanName={isHumanLive ? handover.agentName : ''}
                            micEnabled={isHumanLive}
                        />

                        {/* Real-time status badge */}
                        <div className={`status-overlay-pill status-${isHumanLive ? 'speaking' : agentState}`}>
                            <span className="status-ping" />
                            <span>{isHumanLive ? `Live with ${handover.agentName}` : (STATUS_LABELS[agentState] || 'Ready')}</span>
                        </div>

                        {/* Speaking waveform overlay */}
                        {isSpeaking && (
                            <div className="waveform-overlay">
                                <span /><span /><span /><span />
                            </div>
                        )}
                    </div>

                    {/* Live Spoken Captions */}
                    {liveCaption && (
                        <div className="live-caption-card agent-caption animate-fade-in">
                            <span className="caption-speaker-label">{agentName}</span>
                            <p className="caption-text">"{liveCaption}"</p>
                        </div>
                    )}
                    {!liveCaption && userLiveText && (
                        <div className="live-caption-card user-caption animate-fade-in">
                            <span className="caption-speaker-label">You</span>
                            <p className="caption-text">"{userLiveText}"</p>
                        </div>
                    )}

                    {/* Shoppable product recommended by the agent */}
                    {activeProduct && (
                        <ProductCard
                            product={activeProduct}
                            agentName={agentName}
                            onDismiss={() => setActiveProduct(null)}
                            onOpen={handleProductOpen}
                            onAsk={(p) => handleSendMessage(`Tell me more about ${p.name}`)}
                        />
                    )}

                    {/* Dynamic Knowledge Card if active */}
                    {!activeProduct && activeCard && (
                        <KnowledgeCard
                            card={activeCard}
                            agentName={agentName}
                            onDismiss={() => setActiveCard(null)}
                            onAction={(card) => {
                                if (card.askMore) {
                                    handleSendMessage(`Can you explain more about ${card.name}?`);
                                }
                            }}
                        />
                    )}
                </div>

                {/* Right: Conversation Stream & Controls */}
                <div className="conversation-column">
                    {/* Suggested Question Chips */}
                    {messages.length < 4 && (
                        <div className="suggested-chips-bar">
                            <div className="chips-title">Popular Questions:</div>
                            <div className="chips-scroll">
                                {suggestedQuestions.map((q, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        className="suggestion-chip-btn"
                                        onClick={() => handleSendMessage(q)}
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Message History */}
                    <div className="messages-scroll-area">
                        {messages.length === 0 && !liveCaption && !userLiveText ? (
                            <div className="empty-chat-placeholder">
                                <div className="placeholder-avatar-ring">
                                    <img
                                        src={avatarImg}
                                        alt={agentName}
                                        onError={(e) => { e.target.src = FALLBACK_AVATAR_IMG; }}
                                    />
                                </div>
                                <h4>{agentName} is ready to talk</h4>
                                <p>Speak into your microphone or tap a question below to start.</p>
                            </div>
                        ) : (
                            messages.map((m) => {
                                const isUser = m.role === 'user';
                                const isHumanMsg = m.role === 'human';
                                return (
                                    <div key={m.id} className={`message-bubble-row ${isUser ? 'user-align' : 'agent-align'}`}>
                                        <div className={`message-bubble ${isUser ? 'bubble-user' : isHumanMsg ? 'bubble-agent bubble-human' : 'bubble-agent'}`}>
                                            <div className="bubble-author">{isUser ? 'You' : isHumanMsg ? `${m.author} · Specialist` : agentName}</div>
                                            <div className="bubble-text">{m.content}</div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Bottom Input & Voice Controls */}
                    <div className="chat-bottom-dock">
                        <AudioRecorder
                            disabled={false}
                            onRecordingComplete={handleRecordingComplete}
                            isProcessing={agentState === 'processing'}
                            onRecordingStart={handleRecordingStart}
                            onRecordingStop={() => {}}
                            onInterrupt={handleInterrupt}
                            isSpeaking={isSpeaking}
                            onVolumeChange={() => {}}
                        />

                        <form className="chat-text-input-form" onSubmit={handleFormSubmit}>
                            <input
                                type="text"
                                className="chat-text-input"
                                placeholder={isHumanLive ? `Message ${handover.agentName}...` : 'Type a message or speak...'}
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                            />
                            <button
                                type="submit"
                                className="chat-send-btn"
                                disabled={!inputText.trim()}
                                title="Send Message"
                            >
                                ➤
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* Hidden Audio Player for Streaming TTS */}
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
