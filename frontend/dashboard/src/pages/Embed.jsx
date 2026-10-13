import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import BackButton from '../components/BackButton';
import api from '../api';

export default function Embed() {
    const { id } = useParams();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [embedMode, setEmbedMode] = useState('choice'); // 'choice' | 'chat' | 'demo'

    const serverUrl = window.location.origin.includes('localhost')
        ? 'http://localhost:5000'
        : window.location.origin;

    const modeAttr = embedMode === 'choice' ? '' : ` data-mode="${embedMode}"`;
    const embedCode = `<script src="${serverUrl}/agent.js" data-product-id="${id}" data-server="${serverUrl}"${modeAttr}></script>`;

    useEffect(() => { fetchProduct(); }, [id]);

    const fetchProduct = async () => {
        try {
            const res = await api.get(`/products/${id}`);
            setProduct(res.data);
        } catch (err) {
            console.log('Error fetching product:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(embedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full animate-spin border-2 border-purple-500 border-t-transparent" />
            </main>
        </div>
    );

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 p-8 overflow-y-auto animate-fade-in relative z-10 space-y-6">

                <div>
                    <BackButton to={`/products/${id}`} label={product?.name || 'Product'} />
                    <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
                        Embed Widget Code
                    </h1>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>
                        Choose your deployment mode and add this single script tag to your website HTML
                    </p>
                </div>

                <div className="max-w-2xl space-y-6">
                    {/* Mode Selector Card */}
                    <div className="ultra-card p-6 space-y-4">
                        <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Select Deployment Mode</h2>
                        <div className="grid grid-cols-3 gap-3">
                            <button
                                type="button"
                                onClick={() => setEmbedMode('choice')}
                                className={`p-4 rounded-xl text-left border transition-all cursor-pointer ${
                                    embedMode === 'choice'
                                        ? 'border-purple-500 bg-purple-500/15 shadow-lg'
                                        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                                }`}
                            >
                                <span className="text-xl block mb-2">🌐</span>
                                <h3 className="font-bold text-xs text-white">Visitor Choice</h3>
                                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                                    Lets your visitor choose between 1-on-1 Chat or Live Demo.
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() => setEmbedMode('chat')}
                                className={`p-4 rounded-xl text-left border transition-all cursor-pointer ${
                                    embedMode === 'chat'
                                        ? 'border-purple-500 bg-purple-500/15 shadow-lg'
                                        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                                }`}
                            >
                                <span className="text-xl block mb-2">💬</span>
                                <h3 className="font-bold text-xs text-white">1-on-1 Avatar Chat</h3>
                                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                                    Direct conversational consultation using all stored knowledge. No browser navigation.
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() => setEmbedMode('demo')}
                                className={`p-4 rounded-xl text-left border transition-all cursor-pointer ${
                                    embedMode === 'demo'
                                        ? 'border-purple-500 bg-purple-500/15 shadow-lg'
                                        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                                }`}
                            >
                                <span className="text-xl block mb-2">⚡</span>
                                <h3 className="font-bold text-xs text-white">Live Product Demo</h3>
                                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                                    Interactive walkthrough where Sofia navigates live in the browser.
                                </p>
                            </button>
                        </div>
                    </div>

                    {embedMode === 'demo' && product?.explorationStatus !== 'ready' && (
                        <div className="rounded-2xl p-4 flex items-center gap-3 border-l-4"
                            style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderLeftColor: '#f59e0b' }}>
                            <p className="text-xs font-bold text-amber-400">
                                ⚠️ Product exploration in progress. Browser demo will activate live once exploration completes. 1-on-1 Avatar Chat is ready now.
                            </p>
                        </div>
                    )}

                    {/* Code Card */}
                    <div className="ultra-card p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Your Live Embed Code</h2>
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                                mode: {embedMode}
                            </span>
                        </div>
                        <div className="rounded-xl p-4 font-mono text-xs overflow-x-auto break-all"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--accent-primary)' }}>
                            <code>{embedCode}</code>
                        </div>
                        <button onClick={handleCopy}
                            className={`ultra-btn-primary w-full py-3.5 text-xs ${copied ? '!bg-emerald-600' : ''}`}>
                            {copied ? '✅ Copied to Clipboard!' : '📋 Copy Embed Code'}
                        </button>
                    </div>

                    {/* Instructions */}
                    <div className="ultra-card p-6 space-y-4">
                        <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Installation Instructions</h2>
                        <div className="space-y-4">
                            {[
                                { step: '01', title: 'Copy Embed Code', desc: 'Click the copy button above to retrieve your configured script tag.' },
                                { step: '02', title: 'Paste Before </body>', desc: 'Open your website HTML template and paste the code right before the closing </body> tag.' },
                                { step: '03', title: 'Live AI Specialist Ready', desc: `A floating button will automatically appear in the bottom right corner of your website (${embedMode === 'chat' ? 'Chat with Sofia' : 'Live Demo'}).` },
                            ].map(item => (
                                <div key={item.step} className="flex gap-4">
                                    <span className="font-extrabold text-sm w-6 flex-shrink-0" style={{ color: 'var(--accent-primary)' }}>{item.step}</span>
                                    <div>
                                        <p className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>{item.title}</p>
                                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="ultra-card p-6 space-y-4">
                        <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Widget Preview</h2>
                        <div className="rounded-2xl p-10 relative min-h-36 flex items-center justify-center overflow-hidden"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)' }}>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>[ Your Website Content ]</p>
                            <div className="absolute bottom-4 right-4 text-white px-4 py-2.5 rounded-full text-xs font-bold flex items-center gap-2 shadow-xl cursor-pointer"
                                style={{ background: 'var(--accent-gradient)', boxShadow: 'var(--shadow-glow)' }}>
                                <div className="w-2.5 h-2.5 rounded-full animate-pulse bg-emerald-400" />
                                {embedMode === 'chat' ? '💬 Chat with Sofia' : '⚡ Live Demo'}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}