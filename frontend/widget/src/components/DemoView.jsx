import { useState, useCallback, useRef, useEffect } from 'react';
import AudioPlayer from './AudioPlayer';
import AudioRecorder from './AudioRecorder';
import KeyframeAvatar from './KeyframeAvatar';

// Self-contained animated avatar — no external 3D service needed
function LocalAvatar({ speaking, onReady }) {
    const videoRef = useRef(null);

    useEffect(() => {
        // Fire onReady immediately — no waiting for external service
        onReady?.();
    }, [onReady]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        if (speaking) {
            video.playbackRate = 1.1;
            video.play().catch(() => {});
        } else {
            video.playbackRate = 0.8;
            video.play().catch(() => {});
        }
    }, [speaking]);

    return (
        <div style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'radial-gradient(ellipse at center, #1e1b4b 0%, #09090b 100%)',
            overflow: 'hidden',
        }}>
            {/* Pulsing rings when speaking */}
            {speaking && (
                <>
                    <div style={{
                        position: 'absolute', width: '130px', height: '130px',
                        borderRadius: '50%', border: '2px solid rgba(167,139,250,0.4)',
                        animation: 'avatarPulse 1.5s ease-in-out infinite',
                        pointerEvents: 'none',
                    }} />
                    <div style={{
                        position: 'absolute', width: '155px', height: '155px',
                        borderRadius: '50%', border: '2px solid rgba(167,139,250,0.2)',
                        animation: 'avatarPulse 1.5s ease-in-out infinite 0.3s',
                        pointerEvents: 'none',
                    }} />
                </>
            )}

            <div style={{
                width: '100px', height: '100px', borderRadius: '50%',
                overflow: 'hidden',
                border: speaking
                    ? '3px solid rgba(167,139,250,0.9)'
                    : '3px solid rgba(167,139,250,0.35)',
                boxShadow: speaking
                    ? '0 0 24px rgba(124,58,237,0.6)'
                    : '0 8px 32px rgba(124,58,237,0.25)',
                transition: 'all 0.4s ease',
                flexShrink: 0,
                position: 'relative',
            }}>
                <img
                    src="/widget/alex-avatar.png"
                    alt="Sofia"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.target.src = '/alex-avatar.png'; }}
                />
            </div>

            {/* Name label */}
            <div style={{
                position: 'absolute', bottom: '10px',
                display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '0.7rem', fontWeight: 700, color: '#f3f4f6',
                padding: '3px 10px',
                background: 'rgba(10,10,18,0.75)',
                borderRadius: '10px', backdropFilter: 'blur(8px)',
                letterSpacing: '0.04em',
            }}>
                <span style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: speaking ? '#10b981' : '#6b7280',
                    boxShadow: speaking ? '0 0 6px #10b981' : 'none',
                    transition: 'all 0.3s',
                }} />
                Sofia
            </div>
        </div>
    );
}

const stateLabels = {
    idle: 'Ready',
    listening: 'Listening',
    processing: 'Thinking',
    speaking: 'Speaking',
    error: 'Error',
};

export default function DemoView({ callData, socket, screenImage, onEnd }) {
    const [agentState, setAgentState] = useState('idle');
    const [messages, setMessages] = useState([]);
    const [agentText, setAgentText] = useState('');
    const [userText, setUserText] = useState('');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [duration, setDuration] = useState(0);
    const [livekitUrl, setLivekitUrl] = useState('');
    const [visitorToken, setVisitorToken] = useState('');
    const audioPlayerRef = useRef(null);
    const timerRef = useRef(null);
    const typingRef = useRef(null);
    const audioReceivedRef = useRef(false);
    const messagesEndRef = useRef(null);

    const [displayedText, setDisplayedText] = useState('');
    const [micVolume, setMicVolume] = useState(0);
    const [isAvatarReady, setIsAvatarReady] = useState(false);
    const [maxDuration, setMaxDuration] = useState(
        parseInt(import.meta.env.VITE_MAX_SESSION_DURATION || '300')
    ); // default 5 min, overridden by backend config

    const [chatInput, setChatInput] = useState('');
    const genId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Safety fallback: auto-dismiss loading overlay after 4 seconds max if video track connection is delayed
    useEffect(() => {
        const timer = setTimeout(() => {
            setIsAvatarReady(true);
        }, 4000);
        return () => clearTimeout(timer);
    }, []);

    // Duration timer
    useEffect(() => {
        timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        return () => clearInterval(timerRef.current);
    }, []);

    // Listen for session config from backend (max duration, etc.)
    useEffect(() => {
        if (!socket) return;
        const onConfig = (config) => {
            if (config.maxDurationSeconds) setMaxDuration(config.maxDurationSeconds);
        };
        socket.on('session-config', onConfig);
        return () => socket.off('session-config', onConfig);
    }, [socket]);

    // Auto scroll messages container
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, displayedText, userText]);

    // Safeguard: auto-clear processing state after 7 seconds if no active stream arrives
    useEffect(() => {
        if (agentState === 'processing') {
            const timer = setTimeout(() => {
                setAgentState('idle');
            }, 7000);
            return () => clearTimeout(timer);
        }
    }, [agentState]);

    // Socket event listeners
    useEffect(() => {
        if (!socket) return;

        const onAgentSpeaking = (data) => {
            setAgentText(data.text);
            if (data.speaking) {
                setAgentState('speaking');
                setIsSpeaking(true);

                // Word-by-word typewriter effect
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
                setIsSpeaking(false);
                setAgentState('idle');
            }
        };

        const onAgentThinking = (thinking) => {
            setAgentState(thinking ? 'processing' : 'idle');
        };

        const onAgentState = (state) => {
            setAgentState(state || 'idle');
        };

        const onUserTranscript = (data) => {
            if (!data.text) return;
            setUserText(data.text);

            // Add user message to live transcript history stream
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'user' && last.content === data.text) return prev;
                return [...prev, {
                    id: genId(),
                    role: 'user',
                    content: data.text,
                    timestamp: new Date(),
                }];
            });

            setTimeout(() => setUserText(''), 5000);
        };

        const onAgentAudio = (audioData) => {
            if (!audioReceivedRef.current) {
                audioReceivedRef.current = true;
                window.speechSynthesis?.cancel();
            }
            const blob = new Blob([audioData], { type: 'audio/mp3' });
            const url = URL.createObjectURL(blob);
            audioPlayerRef.current?.enqueue(url);
        };

        const onAgentMessage = (data) => {
            if (data.role && data.content) {
                setMessages(prev => [...prev, {
                    id: genId(),
                    role: data.role === 'assistant' ? 'agent' : data.role,
                    content: data.content,
                    timestamp: new Date(),
                }]);
            }
        };

        socket.on('agent-speaking', onAgentSpeaking);
        socket.on('agent-thinking', onAgentThinking);
        socket.on('agent-state', onAgentState);
        socket.on('user-transcript', onUserTranscript);
        socket.on('agent-audio', onAgentAudio);
        socket.on('agent-message', onAgentMessage);

        return () => {
            socket.off('agent-speaking', onAgentSpeaking);
            socket.off('agent-thinking', onAgentThinking);
            socket.off('agent-state', onAgentState);
            socket.off('user-transcript', onUserTranscript);
            socket.off('agent-audio', onAgentAudio);
            socket.off('agent-message', onAgentMessage);
        };
    }, [socket]);

    // Track agent messages from agent-speaking events
    useEffect(() => {
        if (agentText) {
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'agent' && last._updating) {
                    return prev.map((m, i) =>
                        i === prev.length - 1 ? { ...m, content: agentText } : m
                    );
                }
                return [...prev, {
                    id: genId(),
                    role: 'agent',
                    content: agentText,
                    timestamp: new Date(),
                    _updating: true,
                }];
            });
        }
    }, [agentText]);

    const handleRecordingComplete = useCallback((audioBlob) => {
        if (!socket || !callData) return;

        audioBlob.arrayBuffer().then(buffer => {
            socket.emit('audio-blob', {
                callId: callData.callId,
                audio: buffer,
            });
        });
    }, [socket, callData]);

    const handlePlaybackEnd = useCallback(() => {
        setAgentState('idle');
        setIsSpeaking(false);
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

    const handleRecordingStop = useCallback(() => { }, []);

    const handleInterrupt = useCallback(() => {
        audioPlayerRef.current?.stop();
        setAgentState('idle');
        setIsSpeaking(false);
    }, []);

    const formatDuration = (s) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    const handleAvatarReady = useCallback(() => {
        setIsAvatarReady(true);
        if (socket && callData) {
            console.log('[DemoView] Live 3D Avatar connected — starting demo in sync!');
            socket.emit('avatar-ready', { callId: callData.callId });
        }
    }, [socket, callData]);

    const handleSendText = (e) => {
        e?.preventDefault();
        const trimmed = chatInput.trim();
        if (!trimmed || !socket || !callData) return;
        setChatInput('');
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

    return (
        <div className="app-container">
            {/* Fullscreen Loading Overlay — waits for Live 3D Avatar to connect */}
            {!isAvatarReady && (
                <div className="demo-loading-overlay">
                    <div className="demo-loading-card">
                        <div className="demo-loading-avatar-icon" style={{ overflow: 'hidden', padding: 0 }}>
                            <img src="/widget/alex-avatar.png" alt="Sofia" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} onError={(e) => { e.target.src = '/alex-avatar.png'; }} />
                        </div>
                        <h2 className="demo-loading-title">Connecting Live AI Agent</h2>
                        <p className="demo-loading-subtitle">
                            Starting 3D Avatar & Live Browser Session...
                        </p>
                        <div className="demo-loading-spinner" />
                        <span className="demo-loading-status">Synchronizing video & audio...</span>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="app-header">
                <div>
                    <h1 className="app-title">Sofia</h1>
                    <p className="app-subtitle">AI Demo Specialist</p>
                </div>
                <div className="header-right">
                    <div className="live-badge">
                        <span className="live-dot" />
                        Live Demo
                    </div>
                    {(() => {
                        const remaining = Math.max(0, maxDuration - duration);
                        const isUrgent = remaining <= 60;
                        return (
                            <span className={`header-timer ${isUrgent ? 'timer-urgent' : ''}`}
                                  title={`${formatDuration(duration)} elapsed / ${formatDuration(maxDuration)} max`}>
                                {formatDuration(remaining)} left
                            </span>
                        );
                    })()}
                    <button className="end-demo-btn" onClick={onEnd} title="End Demo">
                        <span>📵</span>
                        <span>End Call</span>
                    </button>
                </div>
            </header>

            {/* Main Content — Left Browser View, Right Side Panel with Avatar & Live Transcript */}
            <main className="main-content">

                {/* Left Column: Product Screen View */}
                <div className="glass-card demo-panel">
                    <div className="screen-view">
                        {/* Agent Status Badge */}
                        <div className="agent-status-badge">
                            <div className={`agent-status-orb ${agentState}`} />
                            <span className="agent-status-text">{stateLabels[agentState] || 'Ready'}</span>
                        </div>

                        {screenImage ? (() => {
                            if (typeof screenImage !== 'string') return null;
                            const s = screenImage.trim();
                            if (!s) return null;
                            const validSrc = (s.startsWith('blob:') || s.startsWith('http://') || s.startsWith('https://'))
                                ? s
                                : `data:image/jpeg;base64,${s.replace(/^(data:image\/[a-zA-Z0-9.+_-]+;base64,)+/i, '')}`;
                            return (
                                <img
                                    src={validSrc}
                                    alt="Live demo screen"
                                />
                            );
                        })() : (
                            <div className="screen-placeholder">
                                <div className="screen-placeholder-icon">🖥️</div>
                                <p>Loading live product screen...</p>
                            </div>
                        )}
                    </div>

                    {/* Hidden Audio Handler for Live TTS Audio Playback */}
                    <div style={{ display: 'none' }}>
                        <AudioPlayer
                            ref={audioPlayerRef}
                            muted={false}
                            onPlaybackStart={handlePlaybackStart}
                            onPlaybackEnd={handlePlaybackEnd}
                        />
                    </div>
                </div>

                {/* Right Column: Avatar on Top, Live Transcript & Controls Below */}
                <div className="side-panel">
                    {/* Top: Avatar Video Card with Natural Portrait Aspect Ratio */}
                    <div className="side-avatar-card glass-card">
                        <div className="side-avatar-header">
                            <span className="side-avatar-dot" />
                            <span className="side-avatar-title">Sofia • AI Avatar</span>
                        </div>
                        <div className="side-avatar-video-wrapper">
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
                        </div>
                    </div>

                    {/* Bottom: Live Transcript, Interactive Mic & Chat Bar */}
                    <div className="side-transcript-card glass-card">
                        <div className="side-transcript-header">
                            <span>💬 Live Transcript</span>
                            {agentState === 'speaking' ? (
                                <span className="speaking-tag">Sofia Speaking...</span>
                            ) : agentState === 'listening' ? (
                                <span className="speaking-tag !bg-cyan-500/20 !text-cyan-400">Listening...</span>
                            ) : null}
                        </div>

                        {/* Real-time word-by-word active speech banner */}
                        {displayedText ? (
                            <div className="active-speech-banner">
                                <span className="banner-label">Sofia</span>
                                <p>"{displayedText}"</p>
                            </div>
                        ) : userText ? (
                            <div className="active-speech-banner user-banner">
                                <span className="banner-label">You</span>
                                <p>"{userText}"</p>
                            </div>
                        ) : null}

                        {/* Scrollable Conversation Stream */}
                        <div className="side-messages-container">
                            {messages.length === 0 && !displayedText && !userText ? (
                                <div className="transcript-empty-state">
                                    <span className="empty-icon">🎧</span>
                                    <p>Live transcript will stream here as you and Sofia speak.</p>
                                </div>
                            ) : (
                                messages.map((m) => {
                                    const isUser = m.role === 'user';
                                    return (
                                        <div key={m.id} className={`transcript-bubble-row ${isUser ? 'user' : 'agent'}`}>
                                            <div className="transcript-bubble">
                                                <span className="bubble-author">{isUser ? 'You' : 'Sofia'}</span>
                                                <p className="bubble-text">{m.content}</p>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Live Microphone Controls & Chat Input */}
                        <div className="transcript-footer-controls">
                            <AudioRecorder
                                disabled={false}
                                onRecordingComplete={handleRecordingComplete}
                                isProcessing={agentState === 'processing'}
                                onRecordingStart={handleRecordingStart}
                                onRecordingStop={handleRecordingStop}
                                onInterrupt={handleInterrupt}
                                isSpeaking={agentState === 'speaking'}
                                onVolumeChange={setMicVolume}
                            />
                            <form className="transcript-chat-form" onSubmit={handleSendText}>
                                <input
                                    type="text"
                                    className="transcript-chat-input"
                                    placeholder="Type a request (or speak)..."
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                />
                                <button
                                    type="submit"
                                    className="transcript-chat-submit"
                                    disabled={!chatInput.trim()}
                                    title="Send message"
                                >
                                    ➤
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

            </main>
        </div>
    );
}
