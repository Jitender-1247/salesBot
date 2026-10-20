import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import ChatView from './components/ChatView';

const BACKEND_URL = import.meta.env.PROD
    ? ''
    : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000');
const AVATAR_IMG = '/widget3/alex-avatar.png';
const FALLBACK_AVATAR_IMG = '/alex-avatar.png';

export default function App() {
    // URL param for product ID
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('pid') || 'test-product';

    // Widget states: 'bubble' (collapsed), 'modal' (expanded)
    const [isExpanded, setIsExpanded] = useState(false);
    const [bubbleDismissed, setBubbleDismissed] = useState(false);

    // Screen inside widget: 'landing', 'loading', 'calling', 'end', 'queued'
    const [screen, setScreen] = useState('landing');
    const [socket, setSocket] = useState(null);
    const [callData, setCallData] = useState(null);
    // Latest session, readable from socket handlers (which are registered once)
    const callDataRef = useRef(null);
    useEffect(() => { callDataRef.current = callData; }, [callData]);
    const [errorMessage, setErrorMessage] = useState('');
    const [userForm, setUserForm] = useState({ name: '', email: '' });
    const [queueInfo, setQueueInfo] = useState(null);

    // Initialize socket connection
    useEffect(() => {
        const s = io(BACKEND_URL, {
            transports: ['websocket', 'polling']
        });
        setSocket(s);

        s.on('connect', () => {
            console.log('✅ [Widget3] Socket connected');
            // After a reconnect the server sees a new socket: reclaim the running session
            const active = callDataRef.current;
            if (active?.callId && active.sessionToken) {
                s.emit('resume-session', { callId: active.callId, sessionToken: active.sessionToken });
            }
        });

        s.on('session-resumed', ({ callId }) => console.log(`🔁 [Widget3] Session resumed: ${callId}`));

        s.on('session-expired', () => {
            callDataRef.current = null;
            setScreen('end');
        });

        s.on('chat-started', (data) => {
            setCallData(data);
            setScreen('calling');
        });

        s.on('demo-started', (data) => {
            setCallData(data);
            setScreen('calling');
        });

        s.on('demo-error', (err) => {
            setErrorMessage(err.message || 'Session error');
            setScreen('landing');
        });

        s.on('demo-queued', (info) => {
            setQueueInfo(info);
            setScreen('queued');
        });

        s.on('chat-ended', () => {
            setScreen('end');
        });

        s.on('demo-ended', () => {
            setScreen('end');
        });

        return () => {
            s.disconnect();
        };
    }, []);

    // Start 1-on-1 Chat
    const handleStartChat = (e) => {
        e?.preventDefault();
        if (!socket || !productId) return;

        setErrorMessage('');
        setScreen('loading');

        socket.emit('start-chat', {
            productId,
            prospectName: userForm.name,
            prospectEmail: userForm.email
        });
    };

    // End Chat
    const handleEndChat = () => {
        if (socket && callData) {
            socket.emit('end-call', { callId: callData.callId });
        }
        setScreen('end');
    };

    return (
        <div className="widget3-root">
            {/* ── 1. Floating Video Bubble (SaleAssist Style Idle Presence) ── */}
            <div
                className={`floating-video-bubble-container ${isExpanded ? 'hidden' : ''}`}
                style={{ display: isExpanded ? 'none' : 'flex' }}
            >
                {!bubbleDismissed && (
                    <div className="bubble-tooltip-pill animate-fade-in">
                        <button
                            type="button"
                            className="tooltip-close"
                            onClick={(e) => {
                                e.stopPropagation();
                                setBubbleDismissed(true);
                            }}
                            title="Dismiss preview"
                        >
                            ✕
                        </button>
                        <div className="tooltip-content" onClick={() => setIsExpanded(true)}>
                            <div className="tooltip-title">Talk to Sofia</div>
                            <div className="tooltip-sub">AI Product Specialist • 1-on-1 Video</div>
                        </div>
                    </div>
                )}

                <button
                    type="button"
                    className="avatar-launcher-bubble"
                    onClick={() => setIsExpanded(true)}
                    title="Open Video Consultation"
                >
                    <div className="bubble-pulse-halo" />
                    <div className="bubble-avatar-frame">
                        <img
                            src={AVATAR_IMG}
                            alt="Sofia"
                            onError={(e) => { e.target.src = FALLBACK_AVATAR_IMG; }}
                        />
                    </div>
                    <span className="bubble-online-badge">
                        <span className="live-dot" /> Live
                    </span>
                </button>
            </div>

            {/* ── 2. Expanded Video Consultation Container ── */}
            {isExpanded && (
                <div className="modal-backdrop animate-fade-in">
                    <div className="video-consultation-modal animate-scale-up">

                        {/* ── Screen A: Landing Form ── */}
                        {screen === 'landing' && (
                            <div className="landing-card-view">
                                <button
                                    type="button"
                                    className="modal-top-close-btn"
                                    onClick={() => setIsExpanded(false)}
                                    title="Close"
                                >
                                    ✕
                                </button>

                                <div className="landing-hero-section">
                                    <div className="hero-avatar-halo-frame">
                                        <div className="hero-avatar-ambient" />
                                        <div className="hero-avatar-img-circle">
                                            <img
                                                src={AVATAR_IMG}
                                                alt="Sofia"
                                                onError={(e) => { e.target.src = FALLBACK_AVATAR_IMG; }}
                                            />
                                        </div>
                                        <div className="hero-live-badge">
                                            <span className="live-dot" /> 1-on-1 Video Agent
                                        </div>
                                    </div>

                                    <h1 className="hero-title">Meet Sofia</h1>
                                    <p className="hero-subtitle">Your Dedicated AI Sales & Solutions Specialist</p>
                                    <p className="hero-desc">
                                        Ask anything about features, integrations, pricing, or custom enterprise solutions over a real-time 1-on-1 voice conversation.
                                    </p>
                                </div>

                                <form className="consultation-lead-form" onSubmit={handleStartChat}>
                                    <div className="form-row">
                                        <label>Your Name</label>
                                        <input
                                            type="text"
                                            placeholder="Sarah Connor"
                                            value={userForm.name}
                                            onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className="form-row">
                                        <label>Work Email</label>
                                        <input
                                            type="email"
                                            placeholder="sarah@company.com"
                                            value={userForm.email}
                                            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                                            required
                                        />
                                    </div>

                                    {errorMessage && (
                                        <div className="error-alert">
                                            ⚠️ {errorMessage}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        className="start-consultation-btn"
                                        disabled={!userForm.name.trim() || !userForm.email.trim()}
                                    >
                                        <span>🎥</span>
                                        <span>Start 1-on-1 Video Chat</span>
                                    </button>
                                </form>

                                <div className="consultation-trust-footer">
                                    <span>⚡ Powered by Complete Product Knowledge</span>
                                    <span>•</span>
                                    <span>🔒 Private & Free</span>
                                </div>
                            </div>
                        )}

                        {/* ── Screen B: Loading / Connecting (Consistent Avatar Image!) ── */}
                        {screen === 'loading' && (
                            <div className="loading-card-view animate-fade-in">
                                <div className="loading-avatar-stage">
                                    <div className="loading-avatar-pulsing-rings" />
                                    <div className="loading-avatar-circle">
                                        {/* EXACT SAME AVATAR IMAGE HERE */}
                                        <img
                                            src={AVATAR_IMG}
                                            alt="Sofia"
                                            onError={(e) => { e.target.src = FALLBACK_AVATAR_IMG; }}
                                        />
                                    </div>
                                    <div className="loading-spinner-ring" />
                                </div>

                                <h2 className="loading-title">Connecting with Sofia</h2>
                                <p className="loading-desc">Setting up your private 1-on-1 video sales session...</p>

                                <div className="loading-milestones">
                                    <div className="milestone-pill active">
                                        <span className="milestone-icon">✓</span>
                                        <span>Loading Product Knowledge</span>
                                    </div>
                                    <div className="milestone-pill active">
                                        <span className="milestone-icon">⏳</span>
                                        <span>Initializing Voice & Avatar</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Screen C: Active Calling / 1-on-1 Chat ── */}
                        {screen === 'calling' && callData && (
                            <ChatView
                                callData={callData}
                                socket={socket}
                                onEnd={handleEndChat}
                                onMinimize={() => setIsExpanded(false)}
                                knowledgeMap={callData?.knowledgeMap}
                            />
                        )}

                        {/* ── Screen D: Queue Screen ── */}
                        {screen === 'queued' && queueInfo && (
                            <div className="queued-card-view">
                                <div className="queue-avatar-circle">
                                    <img
                                        src={AVATAR_IMG}
                                        alt="Sofia"
                                        onError={(e) => { e.target.src = FALLBACK_AVATAR_IMG; }}
                                    />
                                </div>
                                <h2>You're in queue</h2>
                                <p className="queue-pos">Position #{queueInfo.position}</p>
                                <p className="queue-wait">Estimated wait: ~{Math.ceil(queueInfo.estimatedWaitSeconds / 60)} min</p>
                                <button className="start-consultation-btn secondary" onClick={() => setScreen('landing')}>
                                    ← Back
                                </button>
                            </div>
                        )}

                        {/* ── Screen E: End / Thank You Screen ── */}
                        {screen === 'end' && (
                            <div className="end-card-view animate-fade-in">
                                <div className="end-avatar-circle">
                                    <img
                                        src={AVATAR_IMG}
                                        alt="Sofia"
                                        onError={(e) => { e.target.src = FALLBACK_AVATAR_IMG; }}
                                    />
                                </div>
                                <h2>Thank You!</h2>
                                <p className="end-desc">
                                    Sofia has noted your questions and insights. Our team will follow up with you at <strong>{userForm.email || 'your email'}</strong>.
                                </p>
                                <button
                                    type="button"
                                    className="start-consultation-btn"
                                    onClick={() => {
                                        setScreen('landing');
                                        setCallData(null);
                                    }}
                                >
                                    🔄 Start Another Session
                                </button>
                            </div>
                        )}

                    </div>
                </div>
            )}
        </div>
    );
}
