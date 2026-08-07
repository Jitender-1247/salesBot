import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';

export default function Register() {
    const navigate = useNavigate();
    const [form, setForm] = useState({ name: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/register', form);
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('client', JSON.stringify(res.data.client));
            navigate('/');
        } catch (err) {
            setError(err.response?.data?.message || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"
            style={{ backgroundColor: '#080911' }}>

            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full pointer-events-none"
                style={{
                    background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(99, 102, 241, 0.05) 50%, transparent 80%)',
                    filter: 'blur(60px)',
                }} />

            <div className="w-full max-w-[420px] relative z-10 animate-fade-in">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shadow-xl"
                            style={{
                                background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                                boxShadow: '0 0 25px rgba(124, 58, 237, 0.4)',
                            }}>
                            ⚡
                        </div>
                        <span className="text-2xl font-extrabold tracking-tight gradient-text"
                            style={{ fontFamily: 'Outfit, sans-serif' }}>
                            SalesBot
                        </span>
                    </div>
                    <p className="text-slate-400 text-xs font-medium tracking-wide">
                        Enterprise AI Sales Agent Platform
                    </p>
                </div>

                <div className="ultra-card-static p-8">
                    <h2 className="text-2xl font-bold mb-1 gradient-text text-left" style={{ fontFamily: 'Outfit, sans-serif' }}>
                        Create an account
                    </h2>
                    <p className="text-slate-400 text-xs mb-6 text-left">
                        Start converting website visitors with AI voice agents
                    </p>

                    {error && (
                        <div className="mb-6 px-4 py-3 rounded-xl text-xs font-medium flex items-center gap-2"
                            style={{
                                background: 'rgba(244, 63, 94, 0.1)',
                                border: '1px solid rgba(244, 63, 94, 0.25)',
                                color: '#fb7185',
                            }}>
                            <span>⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5 text-left">
                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-2">
                                Full Name
                            </label>
                            <input
                                type="text"
                                className="ultra-input"
                                placeholder="John Smith"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-2">
                                Work Email
                            </label>
                            <input
                                type="email"
                                className="ultra-input"
                                placeholder="you@company.com"
                                value={form.email}
                                onChange={e => setForm({ ...form, email: e.target.value })}
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-300 mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                className="ultra-input"
                                placeholder="••••••••"
                                value={form.password}
                                onChange={e => setForm({ ...form, password: e.target.value })}
                                required
                            />
                        </div>

                        <button type="submit" disabled={loading} className="ultra-btn-primary w-full py-3.5 mt-2">
                            {loading ? 'Creating account...' : 'Create Account'}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
                        <p className="text-slate-400 text-xs">
                            Already have an account?{' '}
                            <Link to="/login" className="font-semibold text-purple-400 hover:text-purple-300">
                                Sign in
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}