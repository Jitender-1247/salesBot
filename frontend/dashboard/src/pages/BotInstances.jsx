import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
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
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-4xl mb-4">🤖</p>
                    <h1 className="text-xl font-semibold text-white mb-2">Bot not found</h1>
                    <p className="text-[13px] mb-6" style={{ color: '#5c5672' }}>"{botType}" isn't a bot type yet.</p>
                    <Link to="/" className="font-medium text-[13px]">← Back to Bots</Link>
                </div>
            </main>
        </div>
    );

    const statsFor = (pid) => {
        const pc = calls.filter(c => c.productId?._id === pid || c.productId === pid);
        return { sessions: pc.length, leads: pc.filter(c => c.qualified).length };
    };

    const statusBadge = (s) => {
        const m = { ready: { c: 'sb-badge-green', l: '✅ Ready' }, exploring: { c: 'sb-badge-yellow', l: '🔍 Exploring' }, failed: { c: 'sb-badge-red', l: '❌ Failed' } };
        const x = m[s] || { c: 'sb-badge-gray', l: '⏳ Pending' };
        return <span className={`sb-badge ${x.c} ${s === 'exploring' ? 'animate-pulse' : ''}`}>{x.l}</span>;
    };

    return (
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 p-8 animate-fade-in">
                <div className="mb-8">
                    <Link to="/" className="text-[12px] mb-2 inline-block" style={{ color: '#5c5672' }}>← Bots</Link>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                            style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                            {bot.personaName.charAt(0)}
                        </div>
                        <h1 className="text-2xl font-bold">{bot.name}</h1>
                    </div>
                    <p className="text-[11px] font-medium mt-1 ml-[52px]" style={{ color: '#7c3aed' }}>
                        Persona: {bot.personaName}
                    </p>
                    <p className="text-[13px] mt-1" style={{ color: '#5c5672' }}>{bot.description}</p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-7 h-7 rounded-full animate-spin" style={{ border: '2px solid rgba(124,58,237,0.2)', borderTopColor: '#a78bfa' }} />
                    </div>
                ) : products.length === 0 ? (
                    <div className="glass-card p-16 text-center">
                        <p className="text-4xl mb-4">⚡</p>
                        <h3 className="text-lg font-semibold text-white mb-2">No bots of this type yet</h3>
                        <p className="text-[13px] mb-6" style={{ color: '#5c5672' }}>Add a product to spin up a {bot.name} instance</p>
                        <Link to="/products/new" className="sb-btn-primary no-underline">+ Add Product</Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-5 stagger">
                        {products.map(p => {
                            const s = statsFor(p._id);
                            return (
                                <Link key={p._id} to={`/bots/${botType}/${p._id}`}
                                    className="glass-card text-left p-6 group no-underline animate-slide-up">
                                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-4"
                                        style={{ background: 'rgba(124, 58, 237, 0.12)' }}>
                                        {bot.icon}
                                    </div>
                                    <h2 className="text-lg font-semibold text-white group-hover:text-[#c4b5fd] transition-colors">{p.name}</h2>
                                    <p className="text-[12px] mt-2 truncate" style={{ color: '#5c5672' }}>{p.url}</p>
                                    <div className="mt-3">{statusBadge(p.explorationStatus)}</div>
                                    <div className="flex items-center gap-6 mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div>
                                            <p className="text-white font-bold text-lg">{s.sessions}</p>
                                            <p className="text-[11px]" style={{ color: '#5c5672' }}>Sessions</p>
                                        </div>
                                        <div>
                                            <p className="text-white font-bold text-lg">{s.leads}</p>
                                            <p className="text-[11px]" style={{ color: '#5c5672' }}>Leads</p>
                                        </div>
                                        <div className="ml-auto" style={{ color: '#5c5672' }}>
                                            <span className="group-hover:text-[#a78bfa] transition-colors">→</span>
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