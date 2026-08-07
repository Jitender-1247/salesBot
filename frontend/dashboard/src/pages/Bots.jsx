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
        description: 'AI voice agent that gives live, personalized product demos to your website visitors.',
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
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 p-8 animate-fade-in">
                {/* Welcome Header */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold">
                        Good day,{' '}
                        <span style={{
                            background: 'linear-gradient(135deg, #c4b5fd, #8b5cf6)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}>
                            {client.name?.split(' ')[0]} 👋
                        </span>
                    </h1>
                    <p className="mt-1" style={{ color: '#5c5672', fontSize: '13px' }}>
                        Choose a bot to see its full analytics and conversations
                    </p>
                </div>

                <div className="grid grid-cols-3 gap-5 stagger">
                    {BOT_TYPES.map(bot => (
                        <button
                            key={bot.id}
                            onClick={() => navigate(`/bots/${bot.id}`)}
                            className="glass-card text-left p-6 cursor-pointer group animate-slide-up"
                            style={{ border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'Inter, sans-serif' }}
                        >
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white mb-4"
                                style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                                {bot.personaName.charAt(0)}
                            </div>
                            <h2 className="text-lg font-semibold text-white group-hover:text-[#c4b5fd] transition-colors">
                                {bot.name}
                            </h2>
                            <p className="text-[11px] font-medium mt-0.5" style={{ color: '#7c3aed' }}>
                                Persona: {bot.personaName}
                            </p>
                            <p className="text-[13px] mt-2 leading-relaxed" style={{ color: '#5c5672' }}>
                                {bot.description}
                            </p>

                            <div className="flex items-center gap-6 mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <div>
                                    <p className="text-white font-bold text-lg">
                                        {loading ? '—' : stats?.totalCalls ?? 0}
                                    </p>
                                    <p className="text-[11px]" style={{ color: '#5c5672' }}>Sessions</p>
                                </div>
                                <div>
                                    <p className="text-white font-bold text-lg">
                                        {loading ? '—' : stats?.qualifiedLeads ?? 0}
                                    </p>
                                    <p className="text-[11px]" style={{ color: '#5c5672' }}>Leads</p>
                                </div>
                                <div className="ml-auto transition-colors" style={{ color: '#5c5672' }}>
                                    <span className="group-hover:text-[#a78bfa]">→</span>
                                </div>
                            </div>
                        </button>
                    ))}

                    <div className="rounded-[14px] p-6 flex flex-col items-center justify-center text-center"
                        style={{ border: '1px dashed rgba(255,255,255,0.08)' }}>
                        <p className="text-3xl mb-3 opacity-30">➕</p>
                        <p className="text-[13px]" style={{ color: '#5c5672' }}>More bot types coming soon</p>
                    </div>
                </div>
            </main>
        </div>
    );
}