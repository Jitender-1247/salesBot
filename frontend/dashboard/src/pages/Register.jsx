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
            style={{ background: '#07070f' }}>

            <div className="absolute inset-0 pointer-events-none" style={{
                background: 'radial-gradient(ellipse 600px 400px at 50% 40%, rgba(124, 58, 237, 0.08), transparent)',
            }} />

            <div className="w-full max-w-[400px] relative z-10 animate-fade-in">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2.5 mb-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm"
                            style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                            ⚡
                        </div>
                        <span className="text-xl font-bold"
                            style={{
                                background: 'linear-gradient(135deg, #c4b5fd, #8b5cf6)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}>
                            SalesBot
                        </span>
                    </div>
                    <p style={{ color: '#5c5672', fontSize: '13px' }}>AI-powered sales demo platform</p>
                </div>

                <div className="glass-card p-8">
                    <h2 className="text-xl font-semibold mb-1">Create your account</h2>
                    <p style={{ color: '#5c5672', fontSize: '13px', marginBottom: '28px' }}>
                        Start converting visitors into customers
                    </p>

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
                        <div>
                            <label className="block text-[12px] font-medium mb-2" style={{ color: '#9892a6' }}>
                                Full Name
                            </label>
                            <input
                                type="text"
                                className="sb-input"
                                placeholder="John Smith"
                                value={form.name}
                                onChange={e => setForm({ ...form, name: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium mb-2" style={{ color: '#9892a6' }}>
                                Email
                            </label>
                            <input
                                type="email"
                                className="sb-input"
                                placeholder="you@company.com"
                                value={form.email}
                                onChange={e => setForm({ ...form, email: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[12px] font-medium mb-2" style={{ color: '#9892a6' }}>
                                Password
                            </label>
                            <input
                                type="password"
                                className="sb-input"
                                placeholder="••••••••"
                                value={form.password}
                                onChange={e => setForm({ ...form, password: e.target.value })}
                                required
                            />
                        </div>
                        <button type="submit" disabled={loading} className="sb-btn-primary w-full py-3 mt-1">
                            {loading ? 'Creating account...' : 'Create account'}
                        </button>
                    </form>

                    <p className="text-center mt-6" style={{ color: '#5c5672', fontSize: '13px' }}>
                        Already have an account?{' '}
                        <Link to="/login" className="font-semibold">Sign in</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}