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

    const Spinner = () => (
        <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 rounded-full animate-spin"
                style={{ border: '2px solid rgba(124,58,237,0.2)', borderTopColor: '#a78bfa' }} />
        </div>
    );

    if (loading) return (
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar /><main className="flex-1 p-8"><Spinner /></main>
        </div>
    );

    if (!product) return (
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 p-8">
                <p style={{ color: '#5c5672' }}>Product not found</p>
            </main>
        </div>
    );

    const statusBanner = (status) => {
        const map = {
            exploring: { bg: 'rgba(250, 204, 21, 0.06)', border: 'rgba(250, 204, 21, 0.15)', color: '#fbbf24', icon: '🔍', text: 'AI agent is exploring your product... This usually takes 2-5 minutes.' },
            failed: { bg: 'rgba(239, 68, 68, 0.06)', border: 'rgba(239, 68, 68, 0.15)', color: '#f87171', icon: '❌', text: 'Exploration failed. Please check your credentials and try again.' },
            ready: { bg: 'rgba(34, 197, 94, 0.06)', border: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', icon: '✅', text: 'Agent is ready! Embed it on your website to start getting demos.' },
        };
        const s = map[status];
        if (!s) return null;
        return (
            <div className="rounded-[12px] p-4 mb-6 flex items-center gap-3"
                style={{ background: s.bg, border: `1px solid ${s.border}`, borderLeft: `3px solid ${s.color}` }}>
                {status === 'exploring' && <div className="w-4 h-4 rounded-full animate-spin" style={{ border: `2px solid ${s.color}`, borderTopColor: 'transparent' }} />}
                <p className="text-[13px] font-medium" style={{ color: s.color }}>{s.icon} {s.text}</p>
            </div>
        );
    };

    const statusBadge = (status) => {
        const map = { ready: 'sb-badge-green', exploring: 'sb-badge-yellow', failed: 'sb-badge-red' };
        return <span className={`sb-badge ${map[status] || 'sb-badge-gray'}`}>{status}</span>;
    };

    return (
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-x-hidden p-8 animate-fade-in">

                {/* Header */}
                <div className="flex items-start justify-between gap-4 mb-8">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-2 text-[12px]">
                            <Link to="/products" style={{ color: '#5c5672' }} className="hover:text-white">Products</Link>
                            <span style={{ color: '#3d3852' }}>→</span>
                            <span className="text-white truncate">{product.name}</span>
                        </div>
                        <h1 className="text-2xl font-bold truncate">{product.name}</h1>
                        <p className="text-[13px] mt-1 truncate" style={{ color: '#5c5672' }}>{product.url}</p>
                    </div>
                    <Link to={`/embed/${id}`} className="sb-btn-primary no-underline flex-shrink-0">
                        Get Embed Code
                    </Link>
                </div>

                {statusBanner(product.explorationStatus)}

                <div className="grid grid-cols-2 gap-5 min-w-0">

                    {/* Product Summary */}
                    <div className="glass-card p-6 min-w-0 overflow-hidden">
                        <h2 className="text-white font-semibold text-[14px] mb-4">Product Summary</h2>
                        {product.knowledgeMap?.productSummary ? (
                            <p className="text-[13px] leading-relaxed break-words" style={{ color: '#9892a6' }}>
                                {product.knowledgeMap.productSummary}
                            </p>
                        ) : (
                            <p className="text-[13px]" style={{ color: '#3d3852' }}>Summary will appear after exploration completes</p>
                        )}
                    </div>

                    {/* Stats */}
                    <div className="glass-card p-6">
                        <h2 className="text-white font-semibold text-[14px] mb-4">Exploration Stats</h2>
                        <div className="flex flex-col gap-3">
                            {[
                                { label: 'Status', value: statusBadge(product.explorationStatus) },
                                { label: 'Pages Mapped', value: <span className="text-white text-[13px] font-medium">{product.knowledgeMap?.pages?.length || 0}</span> },
                                { label: 'Added', value: <span className="text-white text-[13px] font-medium">{new Date(product.createdAt).toLocaleDateString()}</span> },
                            ].map((row, i) => (
                                <div key={i} className="flex justify-between items-center">
                                    <span className="text-[13px]" style={{ color: '#5c5672' }}>{row.label}</span>
                                    {row.value}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Knowledge Map */}
                    {product.knowledgeMap?.pages?.length > 0 && (
                        <div className="col-span-2 glass-card p-6">
                            <h2 className="text-white font-semibold text-[14px] mb-4">
                                Knowledge Map
                                <span className="text-[12px] font-normal ml-2" style={{ color: '#5c5672' }}>
                                    ({product.knowledgeMap.pages.length} pages explored)
                                </span>
                            </h2>
                            <div className="grid grid-cols-2 gap-3 stagger">
                                {product.knowledgeMap.pages.map((page, i) => (
                                    <div key={i} className="rounded-[10px] p-4 animate-slide-up"
                                        style={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[10px] font-bold" style={{ color: '#7c3aed' }}>
                                                {String(i + 1).padStart(2, '0')}
                                            </span>
                                            <h3 className="text-white text-[13px] font-medium">{page.name}</h3>
                                        </div>
                                        <p className="text-[11px] leading-relaxed mb-3" style={{ color: '#5c5672' }}>
                                            {page.description}
                                        </p>
                                        {page.keyFeatures?.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {page.keyFeatures.slice(0, 3).map((f, j) => (
                                                    <span key={j} className="sb-badge sb-badge-violet text-[10px]">{f}</span>
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
                <div className="glass-card mt-5 p-6" style={{ borderColor: 'rgba(124, 58, 237, 0.12)' }}>
                    <div className="flex items-start gap-3 mb-4">
                        <span className="text-2xl">🍪</span>
                        <div>
                            <h2 className="text-white font-semibold text-[14px]">
                                Session Import <span className="sb-badge sb-badge-violet text-[10px] ml-2">Bypass Login</span>
                            </h2>
                            <p className="text-[12px] mt-1" style={{ color: '#5c5672' }}>
                                If the AI can't log in automatically, paste your session cookies here.
                            </p>
                        </div>
                    </div>

                    <details className="mb-4">
                        <summary className="text-[12px] cursor-pointer font-medium" style={{ color: '#a78bfa' }}>
                            How to get your session cookies →
                        </summary>
                        <div className="mt-3 rounded-[10px] p-4 text-[11px] flex flex-col gap-2"
                            style={{ background: '#0a0a14', color: '#5c5672' }}>
                            <p>1. Log into your product manually in Chrome</p>
                            <p>2. Once logged in, press <kbd className="px-1 rounded" style={{ background: '#1a1a2e' }}>F12</kbd> to open DevTools</p>
                            <p>3. Go to <strong className="text-white">Console</strong> tab and paste this script:</p>
                            <pre className="rounded-[8px] p-3 text-[10px] overflow-x-auto whitespace-pre-wrap break-all"
                                style={{ background: '#0e0e1a', color: '#4ade80' }}>
{`copy(JSON.stringify([...document.cookie.split(';').map(c=>{const[k,...v]=c.trim().split('=');return{name:k,value:v.join('='),domain:location.hostname,path:'/'};})]))` }
                            </pre>
                            <p>4. Press Enter — cookies are copied. Paste them below.</p>
                            <p>5. Also paste the URL you land on after login in "Demo Start URL".</p>
                        </div>
                    </details>

                    <div className="flex flex-col gap-3">
                        <div>
                            <label className="block text-[11px] font-medium mb-1.5" style={{ color: '#9892a6' }}>Session Cookies (JSON)</label>
                            <textarea value={sessionCookies} onChange={e => setSessionCookies(e.target.value)}
                                placeholder='[{"name":"ZCTOKEN","value":"...","domain":".zoho.com","path":"/"}]'
                                className="sb-input sb-input-mono h-24 resize-none" />
                        </div>
                        <div>
                            <label className="block text-[11px] font-medium mb-1.5" style={{ color: '#9892a6' }}>
                                Demo Start URL <span style={{ color: '#3d3852' }}>(optional)</span>
                            </label>
                            <input type="text" value={demoStartUrl} onChange={e => setDemoStartUrl(e.target.value)}
                                placeholder="https://crm.zoho.com/crm/org.../tab/Leads" className="sb-input" />
                        </div>
                        <button onClick={saveSession} disabled={savingSession} className="sb-btn-primary w-fit">
                            {savingSession ? 'Saving...' : sessionSaved ? '✅ Saved!' : 'Save Session'}
                        </button>
                    </div>
                </div>

                {/* Danger Zone */}
                <div className="glass-card mt-5 p-6 flex items-center justify-between"
                    style={{ borderColor: 'rgba(239, 68, 68, 0.1)' }}>
                    <div>
                        <h2 className="text-white font-semibold text-[14px]">Remove this bot</h2>
                        <p className="text-[12px] mt-1" style={{ color: '#5c5672' }}>
                            Permanently deletes this bot along with all conversations and leads.
                        </p>
                    </div>
                    <button onClick={handleDelete} disabled={deleting}
                        className="flex-shrink-0 px-4 py-2.5 rounded-[10px] text-[12px] font-semibold cursor-pointer transition-all duration-150"
                        style={{
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: '#f87171',
                            fontFamily: 'Inter, sans-serif',
                            opacity: deleting ? 0.5 : 1,
                        }}>
                        {deleting ? 'Removing...' : '🗑 Remove Bot'}
                    </button>
                </div>
            </main>
        </div>
    );
}