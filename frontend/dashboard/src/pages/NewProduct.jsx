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
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-x-hidden p-8 animate-fade-in">

                <div className="mb-8">
                    <h1 className="text-2xl font-bold">Add New Product</h1>
                    <p className="mt-1" style={{ color: '#5c5672', fontSize: '13px' }}>
                        Submit your product and our AI will explore it automatically
                    </p>
                </div>

                <div className="max-w-2xl">

                    {/* Info Banner */}
                    <div className="glass-card p-4 mb-6 flex gap-3"
                        style={{ borderLeft: '3px solid #7c3aed' }}>
                        <span className="text-lg">💡</span>
                        <div>
                            <p className="text-[13px] font-medium" style={{ color: '#c4b5fd' }}>
                                Session Cookies are Primary
                            </p>
                            <p className="text-[12px] mt-1" style={{ color: '#7c6da0' }}>
                                For products requiring login (Zoho, Salesforce, custom apps), import your session cookies below to skip login, CAPTCHAs, and 2FA instantly.
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-5 px-4 py-3 rounded-[10px] text-[13px] font-medium"
                            style={{
                                background: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                color: '#f87171',
                            }}>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

                        {/* 1. Product Info */}
                        <div className="glass-card p-6">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
                                    style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>1</div>
                                <h3 className="text-white font-semibold text-[14px]">Product Info</h3>
                            </div>
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="block text-[12px] font-medium mb-2" style={{ color: '#9892a6' }}>
                                        Product Name
                                    </label>
                                    <input className="sb-input" placeholder="e.g. Zoho CRM, Salesforce"
                                        value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                                </div>
                                <div>
                                    <label className="block text-[12px] font-medium mb-2" style={{ color: '#9892a6' }}>
                                        Base Product / Login URL
                                    </label>
                                    <input className="sb-input" type="url" placeholder="https://crm.zoho.in"
                                        value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} required />
                                </div>
                            </div>
                        </div>

                        {/* 2. Session Cookies */}
                        <div className="glass-card p-6" style={{ borderColor: 'rgba(124, 58, 237, 0.15)' }}>
                            <div className="flex items-center gap-3 mb-1">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
                                    style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>2</div>
                                <h3 className="text-white font-semibold text-[14px] flex items-center gap-2">
                                    <span>🍪</span> Session Cookies
                                    <span className="sb-badge sb-badge-violet text-[10px]">Primary</span>
                                </h3>
                            </div>
                            <p className="text-[11px] mb-4 ml-10" style={{ color: '#5c5672' }}>
                                Use Cookie Editor extension to export cookies as JSON and paste below.
                            </p>
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="block text-[11px] font-medium mb-1.5" style={{ color: '#9892a6' }}>
                                        Session Cookies (JSON)
                                    </label>
                                    <textarea className="sb-input sb-input-mono h-24 resize-none"
                                        placeholder='[{"name":"JSESSIONID","value":"...","domain":".zoho.in","path":"/"}]'
                                        value={form.sessionCookies}
                                        onChange={e => setForm({ ...form, sessionCookies: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-medium mb-1.5" style={{ color: '#9892a6' }}>
                                        Demo Start URL <span style={{ color: '#3d3852' }}>(Dashboard page after login)</span>
                                    </label>
                                    <input className="sb-input" type="url"
                                        placeholder="https://crm.zoho.in/crm/tab/Home/begin"
                                        value={form.demoStartUrl}
                                        onChange={e => setForm({ ...form, demoStartUrl: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        {/* 3. Credentials Fallback */}
                        <details className="glass-card p-6 group">
                            <summary className="font-semibold text-[14px] cursor-pointer flex items-center justify-between list-none text-white">
                                <span className="flex items-center gap-3">
                                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
                                        style={{ background: 'rgba(124, 58, 237, 0.2)' }}>3</span>
                                    <span>🔐 Login Credentials</span>
                                    <span className="text-[11px] font-normal" style={{ color: '#5c5672' }}>(Optional Fallback)</span>
                                </span>
                                <span className="text-[11px] group-open:rotate-180 transition-transform" style={{ color: '#7c3aed' }}>▼</span>
                            </summary>
                            <p className="text-[11px] mt-2 mb-4 ml-10" style={{ color: '#5c5672' }}>
                                Used automatically if session cookies expire or are not provided.
                            </p>
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="block text-[12px] font-medium mb-2" style={{ color: '#9892a6' }}>
                                        Email / Username
                                    </label>
                                    <input className="sb-input" placeholder="demo@yourproduct.com"
                                        value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-[12px] font-medium mb-2" style={{ color: '#9892a6' }}>
                                        Password
                                    </label>
                                    <input className="sb-input" type="password" placeholder="••••••••"
                                        value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                                </div>
                            </div>
                        </details>

                        {/* Extra Knowledge */}
                        <div className="glass-card p-6">
                            <h3 className="text-white font-semibold text-[14px] mb-1">Extra Knowledge</h3>
                            <p className="text-[11px] mb-4" style={{ color: '#5c5672' }}>
                                Tell the agent anything extra — pricing, audience, features, FAQs.
                            </p>
                            <textarea className="sb-input resize-none" rows={5}
                                placeholder="Our pricing starts at $49/month. We target B2B SaaS companies..."
                                value={form.extraKnowledge}
                                onChange={e => setForm({ ...form, extraKnowledge: e.target.value })} />
                        </div>

                        <button type="submit" disabled={loading} className="sb-btn-primary w-full py-3.5">
                            {loading ? '🔍 Submitting & starting exploration...' : '🚀 Submit Product'}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}