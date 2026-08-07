import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

export default function NewProduct() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        name: '', url: '', sessionCookies: '', demoStartUrl: '',
        email: '', password: '', extraKnowledge: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/products', form);
            navigate(`/products/${res.data.productId}`);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to submit product');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 p-8 animate-fade-in relative z-10 space-y-8">

                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
                        Add New Product
                    </h1>
                    <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-sub)' }}>
                        Submit your product URL and credentials — our AI will automatically explore and index it
                    </p>
                </div>

                <div className="max-w-2xl">

                    {/* Info Banner */}
                    <div className="ultra-card p-5 mb-6 flex gap-3 border-l-4" style={{ borderLeftColor: 'var(--accent-primary)' }}>
                        <span className="text-xl">💡</span>
                        <div>
                            <p className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>
                                Session Cookies are Primary
                            </p>
                            <p className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>
                                For products requiring login (Zoho, Salesforce, custom apps), import your session cookies below to skip login, CAPTCHAs, and 2FA instantly.
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-6 px-4 py-3 rounded-xl text-xs font-semibold flex items-center gap-2"
                            style={{
                                background: 'rgba(244, 63, 94, 0.1)',
                                border: '1px solid rgba(244, 63, 94, 0.3)',
                                color: '#f43f5e',
                            }}>
                            <span>⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">

                        {/* 1. Product Info */}
                        <div className="ultra-card p-6 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-md"
                                    style={{ background: 'var(--accent-gradient)' }}>1</div>
                                <h3 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Product Info</h3>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-sub)' }}>
                                        Product Name
                                    </label>
                                    <input className="ultra-input" placeholder="e.g. Zoho CRM, Salesforce"
                                        value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-sub)' }}>
                                        Base Product / Login URL
                                    </label>
                                    <input className="ultra-input" type="url" placeholder="https://crm.zoho.in"
                                        value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} required />
                                </div>
                            </div>
                        </div>

                        {/* 2. Session Cookies */}
                        <div className="ultra-card p-6 space-y-4">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-md"
                                    style={{ background: 'var(--accent-gradient)' }}>2</div>
                                <h3 className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
                                    <span>🍪</span> Session Cookies
                                    <span className="status-pill status-pill-purple text-[10px]">Primary & Recommended</span>
                                </h3>
                            </div>
                            <p className="text-xs" style={{ color: 'var(--text-sub)' }}>
                                Export cookies as JSON using the Cookie Editor extension and paste below.
                            </p>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-sub)' }}>
                                        Session Cookies (JSON)
                                    </label>
                                    <textarea className="ultra-input ultra-input-mono h-24 resize-none"
                                        placeholder='[{"name":"JSESSIONID","value":"...","domain":".zoho.in","path":"/"}]'
                                        value={form.sessionCookies}
                                        onChange={e => setForm({ ...form, sessionCookies: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-sub)' }}>
                                        Demo Start URL <span style={{ color: 'var(--text-muted)' }}>(App page after login)</span>
                                    </label>
                                    <input className="ultra-input" type="url"
                                        placeholder="https://crm.zoho.in/crm/tab/Home/begin"
                                        value={form.demoStartUrl}
                                        onChange={e => setForm({ ...form, demoStartUrl: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        {/* 3. Credentials Fallback */}
                        <details className="ultra-card p-6 group">
                            <summary className="font-bold text-sm cursor-pointer flex items-center justify-between list-none"
                                style={{ color: 'var(--text-main)' }}>
                                <span className="flex items-center gap-3">
                                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                                        style={{ background: 'rgba(139, 92, 246, 0.2)' }}>3</span>
                                    <span>🔐 Login Credentials</span>
                                    <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(Optional Fallback)</span>
                                </span>
                                <span className="text-xs font-bold group-open:rotate-180 transition-transform" style={{ color: 'var(--accent-primary)' }}>▼</span>
                            </summary>
                            <p className="text-xs mt-2 mb-4 ml-10" style={{ color: 'var(--text-sub)' }}>
                                Used automatically if session cookies expire or are not provided.
                            </p>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-sub)' }}>
                                        Email / Username
                                    </label>
                                    <input className="ultra-input" placeholder="demo@yourproduct.com"
                                        value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-sub)' }}>
                                        Password
                                    </label>
                                    <input className="ultra-input" type="password" placeholder="••••••••"
                                        value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                                </div>
                            </div>
                        </details>

                        {/* Extra Knowledge */}
                        <div className="ultra-card p-6 space-y-3">
                            <h3 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Extra Knowledge Base</h3>
                            <p className="text-xs" style={{ color: 'var(--text-sub)' }}>
                                Tell the AI agent key business details — pricing plans, target audience, top features, FAQs.
                            </p>
                            <textarea className="ultra-input resize-none" rows={5}
                                placeholder="Our pricing starts at $49/month. We target B2B SaaS companies..."
                                value={form.extraKnowledge}
                                onChange={e => setForm({ ...form, extraKnowledge: e.target.value })} />
                        </div>

                        <button type="submit" disabled={loading} className="ultra-btn-primary w-full py-4 text-sm font-bold">
                            {loading ? '🔍 Submitting & starting exploration...' : '🚀 Submit Product'}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}