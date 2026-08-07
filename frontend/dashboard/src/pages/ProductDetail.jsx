import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

export default function ProductDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [sessionCookies, setSessionCookies] = useState('');
    const [demoStartUrl, setDemoStartUrl] = useState('');
    const [savingSession, setSavingSession] = useState(false);
    const [sessionSaved, setSessionSaved] = useState(false);

    useEffect(() => {
        fetchProduct();
        const interval = setInterval(() => {
            if (product?.explorationStatus === 'exploring') fetchProduct();
        }, 5000);
        return () => clearInterval(interval);
    }, [id]);

    const fetchProduct = async () => {
        try {
            const res = await api.get(`/products/${id}`);
            setProduct(res.data);
            setSessionCookies(res.data.sessionCookies || '');
            setDemoStartUrl(res.data.demoStartUrl || '');
        } catch (err) {
            console.log('Error fetching product:', err);
        } finally {
            setLoading(false);
        }
    };

    const saveSession = async () => {
        try {
            setSavingSession(true);
            await api.patch(`/products/${id}/session`, { sessionCookies, demoStartUrl });
            setSessionSaved(true);
            setTimeout(() => setSessionSaved(false), 3000);
        } catch (err) {
            console.log('Error saving session:', err);
        } finally {
            setSavingSession(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm(`Remove "${product.name}"? This will permanently delete this bot along with all conversations and leads.`)) return;
        try {
            setDeleting(true);
            await api.delete(`/products/${id}`);
            navigate('/products');
        } catch (err) {
            console.log('Error deleting product:', err);
            setDeleting(false);
            alert('Failed to remove the bot. Please try again.');
        }
    };

    if (loading) return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full animate-spin border-2 border-purple-500 border-t-transparent" />
            </main>
        </div>
    );

    if (!product) return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <p style={{ color: 'var(--text-sub)' }}>Product not found</p>
            </main>
        </div>
    );

    const statusBanner = (status) => {
        const map = {
            exploring: { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.25)', color: '#f59e0b', icon: '🔍', text: 'AI agent is exploring your product... This usually takes 2-5 minutes.' },
            failed: { bg: 'rgba(244, 63, 94, 0.08)', border: 'rgba(244, 63, 94, 0.25)', color: '#f43f5e', icon: '❌', text: 'Exploration failed. Please check your credentials and try again.' },
            ready: { bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.25)', color: '#10b981', icon: '✅', text: 'Agent is ready! Embed it on your website to start getting live demos.' },
        };
        const s = map[status];
        if (!s) return null;
        return (
            <div className="rounded-2xl p-4 mb-6 flex items-center gap-3 border-l-4"
                style={{ background: s.bg, border: `1px solid ${s.border}`, borderLeftColor: s.color }}>
                {status === 'exploring' && <div className="w-4 h-4 rounded-full animate-spin border-2 border-amber-400 border-t-transparent" />}
                <p className="text-xs font-bold" style={{ color: s.color }}>{s.icon} {s.text}</p>
            </div>
        );
    };

    const statusBadge = (status) => {
        const map = { ready: 'status-pill-green', exploring: 'status-pill-yellow', failed: 'status-pill-red' };
        return <span className={`status-pill ${map[status] || 'status-pill-purple'}`}>{status}</span>;
    };

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 p-8 overflow-y-auto animate-fade-in relative z-10 space-y-6">

                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-2 text-xs font-semibold" style={{ color: 'var(--text-sub)' }}>
                            <Link to="/products" className="hover:text-white">Products</Link>
                            <span>→</span>
                            <span style={{ color: 'var(--text-main)' }}>{product.name}</span>
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
                            {product.name}
                        </h1>
                        <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-sub)' }}>{product.url}</p>
                    </div>
                    <Link to={`/embed/${id}`} className="ultra-btn-primary no-underline text-xs flex-shrink-0">
                        Get Embed Code
                    </Link>
                </div>

                {statusBanner(product.explorationStatus)}

                <div className="grid grid-cols-2 gap-6">

                    {/* Product Summary */}
                    <div className="ultra-card p-6">
                        <h2 className="font-bold text-sm mb-4" style={{ color: 'var(--text-main)' }}>Product Summary</h2>
                        {product.knowledgeMap?.productSummary ? (
                            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-sub)' }}>
                                {product.knowledgeMap.productSummary}
                            </p>
                        ) : (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Summary will appear after exploration completes</p>
                        )}
                    </div>

                    {/* Stats */}
                    <div className="ultra-card p-6">
                        <h2 className="font-bold text-sm mb-4" style={{ color: 'var(--text-main)' }}>Exploration Stats</h2>
                        <div className="space-y-3">
                            {[
                                { label: 'Status', value: statusBadge(product.explorationStatus) },
                                { label: 'Pages Mapped', value: <span className="font-bold text-xs font-mono" style={{ color: 'var(--text-main)' }}>{product.knowledgeMap?.pages?.length || 0}</span> },
                                { label: 'Added', value: <span className="font-bold text-xs" style={{ color: 'var(--text-main)' }}>{new Date(product.createdAt).toLocaleDateString()}</span> },
                            ].map((row, i) => (
                                <div key={i} className="flex justify-between items-center text-xs">
                                    <span style={{ color: 'var(--text-sub)' }}>{row.label}</span>
                                    {row.value}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Knowledge Map */}
                    {product.knowledgeMap?.pages?.length > 0 && (
                        <div className="col-span-2 ultra-card p-6">
                            <h2 className="font-bold text-sm mb-4" style={{ color: 'var(--text-main)' }}>
                                Knowledge Map
                                <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-sub)' }}>
                                    ({product.knowledgeMap.pages.length} pages explored)
                                </span>
                            </h2>
                            <div className="grid grid-cols-2 gap-4">
                                {product.knowledgeMap.pages.map((page, i) => (
                                    <div key={i} className="p-4 rounded-xl space-y-2"
                                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)' }}>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold font-mono" style={{ color: 'var(--accent-primary)' }}>
                                                {String(i + 1).padStart(2, '0')}
                                            </span>
                                            <h3 className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>{page.name}</h3>
                                        </div>
                                        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-sub)' }}>
                                            {page.description}
                                        </p>
                                        {page.keyFeatures?.length > 0 && (
                                            <div className="flex flex-wrap gap-1 pt-1">
                                                {page.keyFeatures.slice(0, 3).map((f, j) => (
                                                    <span key={j} className="status-pill status-pill-purple text-[10px]">{f}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Session Import */}
                <div className="ultra-card p-6 space-y-4">
                    <div className="flex items-start gap-3">
                        <span className="text-2xl">🍪</span>
                        <div>
                            <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>
                                Session Import <span className="status-pill status-pill-purple text-[10px] ml-2">Bypass Login</span>
                            </h2>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>
                                Paste session cookies here to allow the AI agent to bypass login forms.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-sub)' }}>Session Cookies (JSON)</label>
                            <textarea value={sessionCookies} onChange={e => setSessionCookies(e.target.value)}
                                placeholder='[{"name":"ZCTOKEN","value":"...","domain":".zoho.com","path":"/"}]'
                                className="ultra-input ultra-input-mono h-24 resize-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-sub)' }}>
                                Demo Start URL <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
                            </label>
                            <input type="text" value={demoStartUrl} onChange={e => setDemoStartUrl(e.target.value)}
                                placeholder="https://crm.zoho.com/crm/org.../tab/Leads" className="ultra-input text-xs" />
                        </div>
                        <button onClick={saveSession} disabled={savingSession} className="ultra-btn-primary text-xs">
                            {savingSession ? 'Saving...' : sessionSaved ? '✅ Saved!' : 'Save Session'}
                        </button>
                    </div>
                </div>

                {/* Danger Zone */}
                <div className="ultra-card p-6 flex items-center justify-between"
                    style={{ borderColor: 'rgba(244, 63, 94, 0.2)' }}>
                    <div>
                        <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Remove this bot</h2>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>
                            Permanently deletes this bot along with all conversations and leads.
                        </p>
                    </div>
                    <button onClick={handleDelete} disabled={deleting}
                        className="px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                        style={{
                            background: 'rgba(244, 63, 94, 0.1)',
                            border: '1px solid rgba(244, 63, 94, 0.3)',
                            color: '#f43f5e',
                        }}>
                        {deleting ? 'Removing...' : '🗑 Remove Bot'}
                    </button>
                </div>
            </main>
        </div>
    );
}