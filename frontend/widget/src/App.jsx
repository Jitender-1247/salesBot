import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import DemoView from './components/DemoView';

const SERVER_URL = import.meta.env.PROD
    ? ''   // production: use relative URLs, Nginx proxies /api/ and /socket.io/
    : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000');


export default function App() {
    const [screen, setScreen] = useState('landing');
    const [socket, setSocket] = useState(null);
    const [callData, setCallData] = useState(null);
    const [error, setError] = useState('');
    const [screenImage, setScreenImage] = useState(null);
    const [userForm, setUserForm] = useState({ name: '', email: '' });
    const [queueInfo, setQueueInfo] = useState(null); // { position, estimatedWaitSeconds }

    const params = new URLSearchParams(window.location.search);
    const productId = params.get('pid');

    useEffect(() => {
        const s = io(SERVER_URL);
        setSocket(s);

        s.on('connect', () => console.log('✅ Socket connected'));

        s.on('demo-started', (data) => {
            setCallData(data);
            setScreen('calling');
        });

        s.on('demo-error', (data) => {
            setError(data.message);
            setScreen('landing');
        });

        // Binary screenshot transport: receives ArrayBuffer, converts to Blob URL
        // This is ~33% smaller than Base64 and avoids CPU-heavy string encoding
        s.on('screen-update', (data) => {
            if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
                const blob = new Blob([data], { type: 'image/jpeg' });
                const url = URL.createObjectURL(blob);
                setScreenImage((prev) => {
                    if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                    return url;
                });
            } else if (data?.image) {
                // Fallback for legacy Base64 format
                setScreenImage(data.image);
            }
        });

        // Queue screen: server is at capacity, show position
        s.on('demo-queued', (data) => {
            setQueueInfo(data);
            setScreen('queued');
        });

        s.on('demo-ended', () => {
            setScreen('end');
        });

        return () => s.disconnect();
    }, []);

    const startDemo = (e) => {
        if (e) e.preventDefault();
        if (!socket || !productId) return;
        setError('');
        setScreenImage(null);
        socket.emit('start-demo', {
            productId,
            prospectName: userForm.name,
            prospectEmail: userForm.email,
        });
        setScreen('loading');
    };

    const endDemo = () => {
        if (socket && callData) {
            socket.emit('end-demo', {
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
                            <span className="online-dot" /> Live AI
                        </div>
                    </div>

                    <h2>Hi, I'm Sofia</h2>
                    <p className="subtitle">Your AI Demo Specialist</p>
                    <p className="description">
                        Experience a real-time, interactive tour of this product.
                        Ask me anything — I'll explain features and navigate live for you.
                    </p>

                    {/* Pre-session Lead Collection Form */}
                    <form onSubmit={startDemo} className="landing-form">
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
                            <span>🚀</span>
                            <span>Start Live Demo</span>
                        </button>
                    </form>

                    <div className="landing-trust-bar">
                        <span>⚡ 2-5 Min Demo</span>
                        <span>•</span>
                        <span>🔒 100% Free & Private</span>
                    </div>
                </div>
            </div>
        );
    }

    // ── Queue Screen (server at capacity) ──
    if (screen === 'queued' && queueInfo) {
        return (
            <div className="queue-screen">
                <div className="queue-card">
                    <div className="queue-icon">⏳</div>
                    <h2>You're in Line!</h2>
                    <p className="queue-subtitle">
                        Our demo servers are busy helping other visitors.
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
                    <div className="queue-progress">
                        <div className="queue-progress-bar" />
                    </div>
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
                    <h2>Starting Your Live Demo</h2>
                    <p className="loading-sub">Connecting to AI Demo Specialist & launching browser...</p>
                    <div className="loading-spinner" />
                    <div className="loading-steps">
                        <span className="step-badge">1. Initializing Sofia AI</span>
                        <span className="step-badge">2. Connecting Video & Audio</span>
                    </div>
                </div>
            </div>
        );
    }

    // ── Demo View (main experience) ──
    if (screen === 'calling' && callData) {
        return (
            <DemoView
                callData={callData}
                socket={socket}
                screenImage={screenImage}
                onEnd={endDemo}
            />
        );
    }

    // ── Thank You Screen ──
    if (screen === 'end') {
        return (
            <div className="thankyou-screen">
                <div className="thankyou-card">
                    <div className="thankyou-icon">🎉</div>
                    <h2>Thanks for the demo!</h2>
                    <p>Sofia has logged your session. Our team will follow up with you shortly.</p>
                    <button className="start-btn mt-6" onClick={() => setScreen('landing')}>
                        🔄 Restart Demo
                    </button>
                </div>
            </div>
        );
    }

    return null;
}