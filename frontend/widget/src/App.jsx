import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import DemoView from './components/DemoView';

const SERVER_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export default function App() {
    const [screen, setScreen] = useState('landing');
    const [socket, setSocket] = useState(null);
    const [callData, setCallData] = useState(null);
    const [error, setError] = useState('');
    const [screenImage, setScreenImage] = useState(null);
    const [endForm, setEndForm] = useState({ name: '', email: '' });
    const [submitted, setSubmitted] = useState(false);

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

        s.on('screen-update', (data) => {
            setScreenImage(data.image);
        });

        s.on('demo-ended', () => {
            setScreen('end');
        });

        return () => s.disconnect();
    }, []);

    const startDemo = () => {
        if (!socket || !productId) return;
        setError('');
        setScreenImage(null);
        socket.emit('start-demo', { productId });
        setScreen('loading');
    };

    const endDemo = (email, name) => {
        if (!socket || !callData) return;
        socket.emit('end-demo', {
            callId: callData.callId,
            prospectEmail: email,
            prospectName: name,
        });
    };

    const handleEndSubmit = () => {
        endDemo(endForm.email, endForm.name);
        setSubmitted(true);
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
                    <div className="landing-avatar">🤖</div>
                    <h2>Hi! I'm Alex</h2>
                    <p className="subtitle">Your AI demo specialist</p>
                    <p className="description">
                        I'll give you a live, personalized tour of this product.
                        Ask me anything — I'll navigate and explain in real time.
                    </p>

                    <div className="landing-features">
                        {[
                            { icon: '🎙️', text: 'Voice powered — just speak naturally' },
                            { icon: '🌐', text: 'Works in any language' },
                            { icon: '⚡', text: 'Live navigation — I show, not just tell' },
                        ].map((item, i) => (
                            <div key={i} className="landing-feature">
                                <span className="feature-icon">{item.icon}</span>
                                <span className="feature-text">{item.text}</span>
                            </div>
                        ))}
                    </div>

                    {error && <div className="landing-error">{error}</div>}

                    <button className="start-btn" onClick={startDemo}>
                        <span>🚀</span>
                        <span>Start Live Demo</span>
                    </button>

                    <p className="landing-footer">
                        Takes about 2-5 minutes • No signup required
                    </p>
                </div>
            </div>
        );
    }

    // ── Loading Screen ──
    if (screen === 'loading') {
        return (
            <div className="loading-screen">
                <div className="loading-spinner" />
                <p>Starting your demo...</p>
                <p className="loading-sub">Logging into product...</p>
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
                onEnd={() => setScreen('ending')}
            />
        );
    }

    // ── End Call Form ──
    if (screen === 'ending') {
        if (submitted) {
            return (
                <div className="thankyou-screen">
                    <div className="thankyou-icon">🎉</div>
                    <h2>Thanks for joining!</h2>
                    <p>Our team will be in touch soon.</p>
                </div>
            );
        }

        return (
            <div className="endcall-screen">
                <div className="endcall-card">
                    <div className="endcall-header">
                        <div className="endcall-icon">👋</div>
                        <h2>Great talking with you!</h2>
                        <p className="endcall-subtitle">
                            Leave your details and our team will follow up with a personalized offer.
                        </p>
                    </div>

                    <div className="endcall-form">
                        <div className="form-group">
                            <label>Your Name</label>
                            <input
                                type="text"
                                placeholder="John Smith"
                                value={endForm.name}
                                onChange={e => setEndForm({ ...endForm, name: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Your Email</label>
                            <input
                                type="email"
                                placeholder="you@company.com"
                                value={endForm.email}
                                onChange={e => setEndForm({ ...endForm, email: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="endcall-actions">
                        <button className="submit-btn" onClick={handleEndSubmit}>
                            Submit & Get Follow Up
                        </button>
                        <button className="skip-btn" onClick={() => endDemo('', '')}>
                            Skip
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Thank You Screen ──
    if (screen === 'end') {
        return (
            <div className="thankyou-screen">
                <div className="thankyou-icon">🎉</div>
                <h2>Thanks for the demo!</h2>
                <p>Our team will be in touch soon.</p>
            </div>
        );
    }

    return null;
}