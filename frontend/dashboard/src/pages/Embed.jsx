import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

export default function Embed() {
    const { id } = useParams();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    const serverUrl = 'http://localhost:5000';
    const embedCode = `<script src="${serverUrl}/agent.js" data-product-id="${id}" data-server="${serverUrl}"></script>`;

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
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold" style={{ color: 'var(--text-sub)' }}>
                        <Link to="/products" className="hover:text-white">Products</Link>
                        <span>→</span>
                        <Link to={`/products/${id}`} className="hover:text-white">{product?.name}</Link>
                        <span>→</span>
                        <span style={{ color: 'var(--text-main)' }}>Embed Code</span>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
                        Embed Widget Code
                    </h1>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>
                        Add this single script tag to your website HTML to launch the AI sales avatar
                    </p>
                </div>

                <div className="max-w-2xl space-y-6">
                    {product?.explorationStatus !== 'ready' && (
                        <div className="rounded-2xl p-4 flex items-center gap-3 border-l-4"
                            style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderLeftColor: '#f59e0b' }}>
                            <p className="text-xs font-bold text-amber-400">
                                ⚠️ Product exploration in progress. Embed code will activate live once exploration completes.
                            </p>
                        </div>
                    )}

                    {/* Code Card */}
                    <div className="ultra-card p-6 space-y-4">
                        <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Your Live Embed Code</h2>
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
                                { step: '01', title: 'Copy Embed Code', desc: 'Click the copy button above to retrieve your unique script tag.' },
                                { step: '02', title: 'Paste Before </body>', desc: 'Open your website HTML template and paste the code right before the closing </body> tag.' },
                                { step: '03', title: 'Live Demonstration Ready', desc: 'A floating "Live Demo" button will automatically appear in the bottom right corner of your website.' },
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
                                Live Demo
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}