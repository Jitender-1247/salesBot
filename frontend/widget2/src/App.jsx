import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import ChatView from './components/ChatView';

const SERVER_URL = import.meta.env.PROD
    ? ''
    : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000');

export default function App() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('pid');

    const [screen, setScreen] = useState('landing');
    const [socket, setSocket] = useState(null);
    const [callData, setCallData] = useState(null);
    const [error, setError] = useState('');
    const [userForm, setUserForm] = useState({ name: '', email: '' });
    const [queueInfo, setQueueInfo] = useState(null);

    useEffect(() => {
        const s = io(SERVER_URL);
        setSocket(s);

        s.on('connect', () => console.log('✅ [Widget2] Socket connected'));

        s.on('chat-started', (data) => {
            setCallData(data);
            setScreen('calling');
        });

        s.on('demo-started', (data) => {
            setCallData(data);
            setScreen('calling');
        });

        s.on('demo-error', (data) => {
            setError(data.message);
            setScreen('landing');
        });

        s.on('demo-queued', (data) => {
            setQueueInfo(data);
            setScreen('queued');
        });

        s.on('chat-ended', () => {
            setScreen('end');
        });

        s.on('demo-ended', () => {
            setScreen('end');
        });

        return () => s.disconnect();
    }, []);

    const startChat = (e) => {
        if (e) e.preventDefault();
        if (!socket || !productId) return;
        setError('');
        socket.emit('start-chat', {
            productId,
            prospectName: userForm.name,
            prospectEmail: userForm.email,
        });
        setScreen('loading');
    };

    const endChat = () => {
        if (socket && callData) {
            socket.emit('end-chat', {
                callId: callData.callId,
                prospectEmail: userForm.email,
                prospectName: userForm.name,
            });
        }
        setScreen('end');
    };

    if (!productId) {
        return (
            <div className="no-product">
                <p>No product ID provided</p>
            </div>
        );
    }

    // ── Landing Screen ──
    if (screen === 'landing') {
        return (
            <div className="landing-screen">
                <div className="landing-card">
                    {/* Glowing Avatar Header */}
                    <div className="landing-avatar-wrapper">
                        <div className="landing-avatar-glow" />
                        <div className="landing-avatar">👩‍💼</div>
                        <div className="landing-online-badge">
                            <span className="online-dot" /> Live 1-on-1
                        </div>
                    </div>

                    <h2>Hi, I'm Sofia</h2>
                    <p className="subtitle">Your 1-on-1 AI Specialist</p>
                    <p className="description">
                        Have a real-time, one-on-one voice & text conversation with Sofia.
                        Ask anything about our features, use cases, and pricing.
                    </p>

                    <form onSubmit={startChat} className="landing-form">
                        <div className="form-group">
                            <label>Full Name</label>
                            <div className="input-with-icon">
                                <span className="input-icon">👤</span>
                                <input
                                    type="text"
                                    placeholder="John Smith"
                                    value={userForm.name}
                                    onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Work Email</label>
                            <div className="input-with-icon">
                                <span className="input-icon">✉️</span>
                                <input
                                    type="email"
                                    placeholder="john@company.com"
                                    value={userForm.email}
                                    onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        {error && <div className="landing-error">⚠️ {error}</div>}

                        <button
                            type="submit"
                            className="start-btn"
                            disabled={!userForm.name.trim() || !userForm.email.trim()}
                        >
                            <span>💬</span>
                            <span>Start 1-on-1 Chat</span>
                        </button>
                    </form>

                    <div className="landing-trust-bar">
                        <span>⚡ Instant AI Consultation</span>
                        <span>•</span>
                        <span>🔒 100% Free & Private</span>
                    </div>
                </div>
            </div>
        );
    }

    // ── Queue Screen ──
    if (screen === 'queued' && queueInfo) {
        return (
            <div className="queue-screen">
                <div className="queue-card">
                    <div className="queue-icon">⏳</div>
                    <h2>You're in Line!</h2>
                    <p className="queue-subtitle">
                        Our AI specialists are currently speaking with other visitors.
                    </p>
                    <div className="queue-position">
                        <span className="queue-number">{queueInfo.position}</span>
                        <span className="queue-label">
                            {queueInfo.position === 1 ? 'person' : 'people'} ahead of you
                        </span>
                    </div>
                    <p className="queue-wait">
                        Estimated wait: ~{Math.ceil(queueInfo.estimatedWaitSeconds / 60)} min
                    </p>
                    <button className="start-btn mt-6" onClick={() => { setScreen('landing'); setQueueInfo(null); }}>
                        ← Go Back
                    </button>
                </div>
            </div>
        );
    }

    // ── Loading Screen ──
    if (screen === 'loading') {
        return (
            <div className="loading-screen">
                <div className="loading-card">
                    <div className="loading-avatar-icon">
                        <div className="pulsing-glow" />
                        👩‍💼
                    </div>
                    <h2>Connecting with Sofia</h2>
                    <p className="loading-sub">Preparing your 1-on-1 consultation session...</p>
                    <div className="loading-spinner" />
                    <div className="loading-steps">
                        <span className="step-badge">1. Loading Product Knowledge</span>
                        <span className="step-badge">2. Connecting Video & Audio</span>
                    </div>
                </div>
            </div>
        );
    }

    // ── Calling Screen ──
    if (screen === 'calling' && callData) {
        return (
            <ChatView
                callData={callData}
                socket={socket}
                onEnd={endChat}
            />
        );
    }

    // ── Thank You Screen ──
    if (screen === 'end') {
        return (
            <div className="thankyou-screen">
                <div className="thankyou-card">
                    <div className="thankyou-icon">🎉</div>
                    <h2>Thanks for connecting!</h2>
                    <p>Sofia has logged your conversation. Our team will follow up with you shortly.</p>
                    <button className="start-btn mt-6" onClick={() => setScreen('landing')}>
                        🔄 Start New Session
                    </button>
                </div>
            </div>
        );
    }

    return null;
}
