import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

const BOT_INFO = {
    salesbot: {
        name: 'SalesBot',
        personaName: 'Alex',
        icon: '⚡',
        description: 'AI voice agent that gives live, personalized product demos to your website visitors.',
    },
};

export default function BotInstances() {
    const { botType } = useParams();
    const bot = BOT_INFO[botType];

    const [products, setProducts] = useState([]);
    const [calls, setCalls] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!bot) return;
        fetchData();
    }, [botType]);

    const fetchData = async () => {
        try {
            const [productsRes, callsRes] = await Promise.all([
                api.get('/products'),
                api.get('/calls'),
            ]);
            setProducts(productsRes.data);
            setCalls(callsRes.data);
        } catch (err) {
            console.log('Error fetching bot instances:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!bot) {
        return (
            <div className="flex min-h-screen bg-[#0f0f0f]">
                <Sidebar />
                <main className="flex-1 p-8 flex items-center justify-center">
                    <div className="text-center">
                        <p className="text-4xl mb-4">🤖</p>
                        <h1 className="text-xl font-semibold text-white mb-2">Bot not found</h1>
                        <p className="text-gray-500 text-sm mb-6">"{botType}" isn't a bot type yet.</p>
                        <Link to="/" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
                            ← Back to Bots
                        </Link>
                    </div>
                </main>
            </div>
        );
    }

    // Per-product quick stats, computed client-side from the full calls list
    const statsForProduct = (productId) => {
        const productCalls = calls.filter(c => c.productId?._id === productId || c.productId === productId);
        return {
            sessions: productCalls.length,
            leads: productCalls.filter(c => c.qualified).length,
        };
    };

    return (
        <div className="flex min-h-screen bg-[#0f0f0f]">
            <Sidebar />
            <main className="flex-1 p-8">
                <div className="mb-8">
                    <Link to="/" className="text-gray-500 hover:text-gray-300 text-sm mb-2 inline-block">
                        ← Bots
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-base font-bold text-white">
                            {bot.personaName.charAt(0)}
                        </div>
                        <h1 className="text-2xl font-bold text-white">{bot.name}</h1>
                    </div>
                    <p className="text-indigo-400 text-xs font-medium mt-1 ml-[52px]">
                        Persona: {bot.personaName}
                    </p>
                    <p className="text-gray-500 mt-1">{bot.description}</p>
                </div>

                {loading ? (
                    <div className="text-gray-500 text-sm">Loading...</div>
                ) : products.length === 0 ? (
                    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-16 text-center">
                        <p className="text-4xl mb-4">⚡</p>
                        <h3 className="text-lg font-semibold text-white mb-2">No bots of this type yet</h3>
                        <p className="text-gray-500 text-sm mb-6">Add a product to spin up a {bot.name} instance for it</p>
                        <Link
                            to="/products/new"
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors text-sm"
                        >
                            + Add Product
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 gap-5">
                        {products.map(p => {
                            const stats = statsForProduct(p._id);
                            return (
                                <Link
                                    key={p._id}
                                    to={`/bots/${botType}/${p._id}`}
                                    className="text-left bg-[#1a1a1a] border border-[#2a2a2a] hover:border-indigo-500 rounded-xl p-6 transition-colors group"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-indigo-950 flex items-center justify-center text-2xl mb-4">
                                        {bot.icon}
                                    </div>
                                    <h2 className="text-lg font-semibold text-white group-hover:text-indigo-300 transition-colors">
                                        {p.name}
                                    </h2>
                                    <p className="text-gray-500 text-sm mt-2 truncate">{p.url}</p>

                                    <div className="flex items-center gap-2 mt-3">
                                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${p.explorationStatus === 'ready'
                                            ? 'bg-green-950 text-green-400'
                                            : p.explorationStatus === 'exploring'
                                                ? 'bg-yellow-950 text-yellow-400 animate-pulse'
                                                : p.explorationStatus === 'failed'
                                                    ? 'bg-red-950 text-red-400'
                                                    : 'bg-gray-800 text-gray-400'
                                            }`}>
                                            {p.explorationStatus === 'exploring' ? '🔍 Exploring' :
                                                p.explorationStatus === 'ready' ? '✅ Ready' :
                                                    p.explorationStatus === 'failed' ? '❌ Failed' : '⏳ Pending'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-4 mt-5 pt-5 border-t border-[#2a2a2a]">
                                        <div>
                                            <p className="text-white font-bold text-lg">{stats.sessions}</p>
                                            <p className="text-gray-600 text-xs">Sessions</p>
                                        </div>
                                        <div>
                                            <p className="text-white font-bold text-lg">{stats.leads}</p>
                                            <p className="text-gray-600 text-xs">Leads</p>
                                        </div>
                                        <div className="ml-auto text-gray-600 group-hover:text-indigo-400 transition-colors">
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