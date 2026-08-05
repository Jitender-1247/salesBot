import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

export default function NewProduct() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        name: '',
        url: '',
        sessionCookies: '',
        demoStartUrl: '',
        email: '',
        password: '',
        extraKnowledge: ''
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
        <div className="flex min-h-screen bg-[#0f0f0f]">
            <Sidebar />

            <main className="flex-1 min-w-0 overflow-x-hidden p-8">

                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-white">Add New Product</h1>
                    <p className="text-gray-500 mt-1">
                        Submit your product and our AI will explore it automatically
                    </p>
                </div>

                <div className="max-w-2xl">

                    {/* Info Banner */}
                    <div className="bg-indigo-950/60 border border-indigo-800/80 rounded-xl p-4 mb-6 flex gap-3">
                        <span className="text-indigo-400 text-lg">💡</span>
                        <div>
                            <p className="text-indigo-300 text-sm font-medium">Session Cookies are Primary</p>
                            <p className="text-indigo-400 text-sm mt-1">
                                For products requiring login (Zoho, Salesforce, custom apps), import your session cookies below to skip login, CAPTCHAs, and 2FA instantly.
                            </p>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-950 border border-red-500 text-red-400 rounded-lg px-4 py-3 text-sm mb-6">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">

                        {/* Product Info */}
                        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
                            <h3 className="text-white font-semibold mb-4">1. Product Info</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Product Name
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 transition-colors"
                                        placeholder="e.g. Zoho CRM, Salesforce"
                                        value={form.name}
                                        onChange={e => setForm({ ...form, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Base Product / Login URL
                                    </label>
                                    <input
                                        type="url"
                                        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 transition-colors"
                                        placeholder="https://crm.zoho.in"
                                        value={form.url}
                                        onChange={e => setForm({ ...form, url: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Primary Method: Session Cookies */}
                        <div className="bg-[#1a1a1a] border border-indigo-900/50 rounded-xl p-6">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-white font-semibold flex items-center gap-2">
                                    <span>🍪</span> 2. Session Cookies <span className="text-xs bg-indigo-950 text-indigo-400 border border-indigo-800 px-2 py-0.5 rounded-full">Primary & Recommended</span>
                                </h3>
                            </div>
                            <p className="text-gray-500 text-xs mb-4">
                                Log into your product in Chrome, open DevTools (F12) or use the Cookie Editor extension, and paste the JSON cookies below to bypass login completely.
                            </p>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                        Session Cookies (JSON)
                                    </label>
                                    <textarea
                                        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white text-xs font-mono h-24 resize-none outline-none focus:border-indigo-500 transition-colors"
                                        placeholder='[{"name":"JSESSIONID","value":"...","domain":".zoho.in","path":"/"}]'
                                        value={form.sessionCookies}
                                        onChange={e => setForm({ ...form, sessionCookies: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                                        Demo Start URL <span className="text-gray-600">(Dashboard/App page after login)</span>
                                    </label>
                                    <input
                                        type="url"
                                        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 transition-colors"
                                        placeholder="https://crm.zoho.in/crm/org.../tab/Leads"
                                        value={form.demoStartUrl}
                                        onChange={e => setForm({ ...form, demoStartUrl: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Secondary Method: Credentials Fallback */}
                        <details className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 group">
                            <summary className="text-white font-semibold cursor-pointer flex items-center justify-between list-none">
                                <span className="flex items-center gap-2">
                                    <span>🔐</span> 3. Login Credentials <span className="text-xs text-gray-500 font-normal">(Optional Fallback)</span>
                                </span>
                                <span className="text-xs text-indigo-400 group-open:rotate-180 transition-transform">▼</span>
                            </summary>
                            <p className="text-gray-500 text-xs mt-2 mb-4">
                                Used automatically as a fallback if your session cookies expire or are not provided.
                            </p>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Email / Username
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 transition-colors"
                                        placeholder="demo@yourproduct.com"
                                        value={form.email}
                                        onChange={e => setForm({ ...form, email: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-400 mb-2">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 transition-colors"
                                        placeholder="••••••••"
                                        value={form.password}
                                        onChange={e => setForm({ ...form, password: e.target.value })}
                                    />
                                </div>
                            </div>
                        </details>

                        {/* Extra Knowledge */}
                        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
                            <h3 className="text-white font-semibold mb-1">Extra Knowledge</h3>
                            <p className="text-gray-500 text-xs mb-4">
                                Tell the agent anything extra it should know — pricing, target audience, key features, FAQs.
                            </p>
                            <textarea
                                className="w-full bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-indigo-500 transition-colors resize-none"
                                placeholder="Our pricing starts at $49/month. We target B2B SaaS companies. Our key differentiator is..."
                                rows={5}
                                value={form.extraKnowledge}
                                onChange={e => setForm({ ...form, extraKnowledge: e.target.value })}
                            />
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl py-4 transition-colors text-sm"
                        >
                            {loading ? '🔍 Submitting & starting exploration...' : '🚀 Submit Product'}
                        </button>
                    </form>
                </div>
            </main>
        </div>
    );
}