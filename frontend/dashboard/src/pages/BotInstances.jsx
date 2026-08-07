import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import BackButton from '../components/BackButton';
import api from '../api';

const BOT_INFO = {
    salesbot: { name: 'SalesBot', personaName: 'Sofia', icon: '⚡',
        description: 'AI voice agent that gives live, personalized product demos to your website visitors.' },
};

export default function BotInstances() {
    const { botType } = useParams();
    const bot = BOT_INFO[botType];
    const [products, setProducts] = useState([]);
    const [calls, setCalls] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { if (bot) fetchData(); }, [botType]);

    const fetchData = async () => {
        try {
            const [p, c] = await Promise.all([api.get('/products'), api.get('/calls')]);
            setProducts(p.data);
            setCalls(c.data);
        } catch (err) { console.log('Error:', err); }
        finally { setLoading(false); }
    };

    if (!bot) return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-4xl mb-4">🤖</p>
                    <h1 className="text-xl font-semibold text-white mb-2">Bot not found</h1>
                    <p className="text-xs text-slate-400 mb-6">"{botType}" isn't a bot type yet.</p>
                    <Link to="/" className="text-xs font-semibold text-purple-400">← Back to Bots</Link>
                </div>
            </main>
        </div>
    );

    const statsFor = (pid) => {
        const pc = calls.filter(c => c.productId?._id === pid || c.productId === pid);
        return { sessions: pc.length, leads: pc.filter(c => c.qualified).length };
    };

    const statusBadge = (s) => {
        const m = { ready: { c: 'status-pill-green', l: '✅ Ready' }, exploring: { c: 'status-pill-yellow', l: '🔍 Exploring' }, failed: { c: 'status-pill-red', l: '❌ Failed' } };
        const x = m[s] || { c: 'status-pill-purple', l: '⏳ Pending' };
        return <span className={`status-pill ${x.c} ${s === 'exploring' ? 'animate-pulse' : ''}`}>{x.l}</span>;
    };

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-8 animate-fade-in relative z-10 space-y-8">
                <div>
                    <BackButton to="/" label="All Bots" />
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-bold text-white shadow-lg"
                            style={{ background: 'var(--accent-gradient)' }}>
                            {bot.personaName.charAt(0)}
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
                            {bot.name}
                        </h1>
                    </div>
                    <p className="text-xs font-semibold mt-1 ml-[52px]" style={{ color: 'var(--accent-primary)' }}>
                        Persona: {bot.personaName}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>{bot.description}</p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 rounded-full animate-spin border-2 border-purple-500 border-t-transparent" />
                    </div>
                ) : products.length === 0 ? (
                    <div className="ultra-card p-16 text-center">
                        <p className="text-4xl mb-4">⚡</p>
                        <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-main)' }}>No bots of this type yet</h3>
                        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>Add a product to spin up a {bot.name} instance</p>
                        <Link to="/products/new" className="ultra-btn-primary no-underline text-xs">+ Add Product</Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-6">
                        {products.map(p => {
                            const s = statsFor(p._id);
                            return (
                                <Link key={p._id} to={`/bots/${botType}/${p._id}`}
                                    className="ultra-card text-left p-6 group no-underline flex flex-col justify-between">
                                    <div>
                                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl mb-4 shadow-md"
                                            style={{ background: 'var(--accent-gradient)', color: '#ffffff' }}>
                                            {bot.icon}
                                        </div>
                                        <h2 className="text-lg font-bold text-white transition-colors group-hover:text-purple-300" style={{ color: 'var(--text-main)' }}>
                                            {p.name}
                                        </h2>
                                        <p className="text-xs mt-1 truncate font-mono" style={{ color: 'var(--text-sub)' }}>{p.url}</p>
                                        <div className="mt-3">{statusBadge(p.explorationStatus)}</div>
                                    </div>

                                    <div className="flex items-center gap-6 mt-6 pt-5 border-t" style={{ borderColor: 'var(--border-light)' }}>
                                        <div>
                                            <p className="font-bold text-lg font-mono" style={{ color: 'var(--text-main)' }}>{s.sessions}</p>
                                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Sessions</p>
                                        </div>
                                        <div className="w-[1px] h-6 bg-white/10" />
                                        <div>
                                            <p className="font-bold text-lg font-mono text-emerald-400">{s.leads}</p>
                                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Leads</p>
                                        </div>
                                        <div className="ml-auto text-base transition-transform group-hover:translate-x-1" style={{ color: 'var(--text-muted)' }}>
                                            →
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}