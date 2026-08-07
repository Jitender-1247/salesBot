import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

const BOT_TYPES = [
    {
        id: 'salesbot',
        name: 'SalesBot',
        personaName: 'Sofia',
        icon: '⚡',
        description: 'AI voice & vision sales agent that gives live, personalized product demos to your website visitors.',
    },
];

export default function Bots() {
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const client = JSON.parse(localStorage.getItem('client') || '{}');

    useEffect(() => { fetchStats(); }, []);

    const fetchStats = async () => {
        try {
            const res = await api.get('/calls/analytics');
            setStats(res.data);
        } catch (err) {
            console.log('Error fetching stats:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen">
            <Sidebar />

            <main className="flex-1 min-w-0 p-10 animate-fade-in relative z-10">

                {/* Welcome Header */}
                <div className="flex items-center justify-between mb-10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="status-pill status-pill-purple">
                                <span className="status-dot-pulse" style={{ color: '#8b5cf6' }} />
                                Executive Dashboard
                            </span>
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight">
                            Good day, <span className="gradient-text">{client.name?.split(' ')[0] || 'Partner'}</span> 👋
                        </h1>
                        <p className="text-slate-400 text-sm mt-1">
                            Select an AI agent type to view performance metrics, live sessions, and qualified lead pipelines.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="ultra-card-static px-5 py-3 flex items-center gap-4">
                            <div>
                                <p className="text-xs text-slate-400 font-medium">Total Demo Sessions</p>
                                <p className="text-xl font-bold text-white font-mono">{loading ? '—' : stats?.totalCalls ?? 0}</p>
                            </div>
                            <div className="w-[1px] h-8 bg-white/10" />
                            <div>
                                <p className="text-xs text-slate-400 font-medium">Qualified Leads</p>
                                <p className="text-xl font-bold text-emerald-400 font-mono">{loading ? '—' : stats?.qualifiedLeads ?? 0}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Agent Cards Grid */}
                <div className="grid grid-cols-3 gap-6">
                    {BOT_TYPES.map(bot => (
                        <button
                            key={bot.id}
                            onClick={() => navigate(`/bots/${bot.id}`)}
                            className="ultra-card p-7 text-left cursor-pointer group flex flex-col justify-between min-h-[300px]"
                        >
                            <div>
                                <div className="flex items-center justify-between mb-5">
                                    <div className="w-13 h-13 rounded-2xl flex items-center justify-center text-xl font-extrabold text-white shadow-xl transition-transform duration-300 group-hover:scale-110"
                                        style={{
                                            background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                                            boxShadow: '0 0 25px rgba(124, 58, 237, 0.4)',
                                        }}>
                                        {bot.personaName.charAt(0)}
                                    </div>
                                    <span className="status-pill status-pill-green">
                                        <span className="status-dot-pulse" style={{ color: '#10b981' }} />
                                        Active Agent
                                    </span>
                                </div>

                                <h2 className="text-xl font-bold text-white group-hover:text-purple-300 transition-colors"
                                    style={{ fontFamily: 'Outfit, sans-serif' }}>
                                    {bot.name}
                                </h2>
                                <p className="text-xs font-semibold text-purple-400 mt-0.5">
                                    AI Persona: {bot.personaName}
                                </p>
                                <p className="text-slate-400 text-xs mt-3 leading-relaxed">
                                    {bot.description}
                                </p>
                            </div>

                            <div className="pt-6 mt-6 border-t border-white/[0.08] flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <div>
                                        <p className="text-white font-bold text-lg font-mono">
                                            {loading ? '—' : stats?.totalCalls ?? 0}
                                        </p>
                                        <p className="text-slate-400 text-[11px] font-medium">Sessions</p>
                                    </div>
                                    <div className="w-[1px] h-6 bg-white/10" />
                                    <div>
                                        <p className="text-emerald-400 font-bold text-lg font-mono">
                                            {loading ? '—' : stats?.qualifiedLeads ?? 0}
                                        </p>
                                        <p className="text-slate-400 text-[11px] font-medium">Leads</p>
                                    </div>
                                </div>

                                <div className="w-9 h-9 rounded-xl bg-white/[0.05] flex items-center justify-center text-slate-400 group-hover:bg-purple-600 group-hover:text-white transition-all duration-200">
                                    →
                                </div>
                            </div>
                        </button>
                    ))}

                    {/* Placeholder Card */}
                    <div className="ultra-card-static p-7 flex flex-col items-center justify-center text-center min-h-[300px]"
                        style={{ borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.1)' }}>
                        <div className="w-12 h-12 rounded-2xl bg-white/[0.03] flex items-center justify-center text-2xl mb-4 text-slate-500">
                            🤖
                        </div>
                        <h3 className="text-base font-semibold text-slate-400 mb-1">Custom Bot Archetypes</h3>
                        <p className="text-slate-500 text-xs max-w-[200px] leading-relaxed">
                            SupportBot, OnboardingBot & LeadGen agents coming in Q3.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}