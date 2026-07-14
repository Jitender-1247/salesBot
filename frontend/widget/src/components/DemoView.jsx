import { useState, useCallback, useRef, useEffect } from 'react';
import AudioPlayer from './AudioPlayer';
import AudioRecorder from './AudioRecorder';
import ConversationPanel from './ConversationPanel';
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
    const audioPlayerRef = useRef(null);
    const timerRef = useRef(null);

    const genId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Duration timer
    useEffect(() => {
        timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
        return () => clearInterval(timerRef.current);
    }, []);

    // Socket event listeners
    useEffect(() => {
        if (!socket) return;

        const onAgentSpeaking = (data) => {
            setAgentText(data.text);
            if (data.speaking) {
                setAgentState('speaking');
                setIsSpeaking(true);
            } else {
                if (data.interrupted) {
                    audioPlayerRef.current?.stop();
                }
                setIsSpeaking(false);
            }
        };

        const onAgentThinking = (thinking) => {
            if (thinking) setAgentState('processing');
        };

        const onAgentState = (state) => {
            setAgentState(state);
        };

        const onUserTranscript = (data) => {
            setUserText(data.text);
            setTimeout(() => setUserText(''), 5000);
        };

        const onAgentAudio = (audioData) => {
            // Convert audio buffer to blob URL and enqueue
            const blob = new Blob([audioData], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            audioPlayerRef.current?.enqueue(url);
        };

        const onAgentMessage = (data) => {
            // If the backend sends a structured message
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
                // Update if last message is from agent, otherwise add new
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

    // Track user messages from user-transcript events
    useEffect(() => {
        if (userText) {
            setMessages(prev => [...prev, {
                id: genId(),
                role: 'user',
                content: userText,
                timestamp: new Date(),
            }]);
        }
    }, [userText]);

    // Handle recording complete — send audio blob to server
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
    }, []);

    const handlePlaybackStart = useCallback(() => {
        setAgentState('speaking');
        setIsSpeaking(true);
    }, []);

    const handleRecordingStart = useCallback(() => {
        setAgentState('listening');
    }, []);

    const handleRecordingStop = useCallback(() => {
        // State will transition to 'processing' when the server responds
    }, []);

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

    return (
        <div className="app-container">
            {/* Header */}
            <header className="app-header">
                <div>
                    <h1 className="app-title">Alex</h1>
                    <p className="app-subtitle">AI Demo Specialist</p>
                </div>
                <div className="header-right">
                    <div className="live-badge">
                        <span className="live-dot" />
                        Live Demo
                    </div>
                    <span className="header-timer">{formatDuration(duration)}</span>
                    <button className="end-demo-btn" onClick={onEnd} title="End Demo">
                        📵
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="main-content">
                {/* Demo Panel (left — screen + avatar overlay) */}
                <div className="glass-card demo-panel">
                    <div className="screen-view">
                        {/* Agent Status Badge */}
                        <div className="agent-status-badge">
                            <div className={`agent-status-orb ${agentState}`} />
                            <span className="agent-status-text">{stateLabels[agentState] || 'Ready'}</span>
                        </div>

                        {screenImage ? (
                            <img
                                src={`data:image/jpeg;base64,${screenImage}`}
                                alt="Live demo screen"
                            />
                        ) : (
                            <div className="screen-placeholder">
                                <div className="screen-placeholder-icon">🖥️</div>
                                <p>Loading demo screen...</p>
                            </div>
                        )}

                        {/* User transcript badge (top right) */}
                        {userText && (
                            <div className="user-transcript-badge">
                                <p>"{userText}"</p>
                            </div>
                        )}

                        {/* Avatar overlay removed permanently */}

                        {/* Agent transcript overlay (bottom, next to avatar) */}
                        {agentText && (
                            <div className="agent-transcript-overlay">
                                <p>{agentText}</p>
                            </div>
                        )}
                    </div>

                    {/* Controls Bar */}
                    <div className="controls-bar">
                        <AudioPlayer
                            ref={audioPlayerRef}
                            onPlaybackStart={handlePlaybackStart}
                            onPlaybackEnd={handlePlaybackEnd}
                        />
                        <AudioRecorder
                            disabled={false}
                            onRecordingComplete={handleRecordingComplete}
                            isProcessing={agentState === 'processing'}
                            onRecordingStart={handleRecordingStart}
                            onRecordingStop={handleRecordingStop}
                            onInterrupt={handleInterrupt}
                            isSpeaking={agentState === 'speaking'}
                        />
                    </div>
                </div>

                {/* Conversation Panel (right sidebar) */}
                <ConversationPanel
                    messages={messages}
                    isProcessing={agentState === 'processing'}
                />
            </main>
        </div>
    );
}
