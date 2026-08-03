import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

// Fixed list of bot products. Add more entries here as new bot types ship.
const BOT_TYPES = [
    {
        id: 'salesbot',
        name: 'SalesBot',
        personaName: 'Alex',
        icon: '⚡',
        description: 'AI voice agent that gives live, personalized product demos to your website visitors.',
        color: 'from-indigo-600 to-indigo-800',
    },
];

export default function Bots() {
    const navigate = useNavigate();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const client = JSON.parse(localStorage.getItem('client') || '{}');

    useEffect(() => {
        fetchStats();
    }, []);

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
        <div className="flex min-h-screen bg-[#0f0f0f]">
            <Sidebar />

            <main className="flex-1 p-8">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-white">
                        Good day, {client.name?.split(' ')[0]} 👋
                    </h1>
                    <p className="text-gray-500 mt-1">Choose a bot to see its full analytics and conversations</p>
                </div>

                <div className="grid grid-cols-3 gap-5">
                    {BOT_TYPES.map(bot => (
                        <button
                            key={bot.id}
                            onClick={() => navigate(`/bots/${bot.id}`)}
                            className="text-left bg-[#1a1a1a] border border-[#2a2a2a] hover:border-indigo-500 rounded-xl p-6 transition-colors group"
                        >
                            <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${bot.color} flex items-center justify-center text-xl font-bold text-white mb-4`}>
                                {bot.personaName.charAt(0)}
                            </div>
                            <h2 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors">
                                {bot.name}
                            </h2>
                            <p className="text-indigo-400 text-xs font-medium mt-0.5">
                                Persona: {bot.personaName}
                            </p>
                            <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                                {bot.description}
                            </p>

                            <div className="flex items-center gap-4 mt-5 pt-5 border-t border-[#2a2a2a]">
                                <div>
                                    <p className="text-white font-bold text-lg">
                                        {loading ? '—' : stats?.totalCalls ?? 0}
                                    </p>
                                    <p className="text-gray-600 text-xs">Sessions</p>
                                </div>
                                <div>
                                    <p className="text-white font-bold text-lg">
                                        {loading ? '—' : stats?.qualifiedLeads ?? 0}
                                    </p>
                                    <p className="text-gray-600 text-xs">Leads</p>
                                </div>
                                <div className="ml-auto text-gray-600 group-hover:text-indigo-400 transition-colors">
                                    →
                                </div>
                            </div>
                        </button>
                    ))}

                    {/* Placeholder for future bot types */}
                    <div className="border border-dashed border-[#2a2a2a] rounded-xl p-6 flex flex-col items-center justify-center text-center">
                        <p className="text-3xl mb-3 opacity-40">➕</p>
                        <p className="text-gray-600 text-sm">More bot types coming soon</p>
                    </div>
                </div>
            </main>
        </div>
    );
}