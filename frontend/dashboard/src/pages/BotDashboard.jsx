import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

const BOT_INFO = {
    salesbot: {
        name: 'SalesBot',
        personaName: 'Alex',
        icon: '⚡',
    },
};

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
const BAR_MAX_HEIGHT = 80;

export default function BotDashboard() {
    const { botType, productId } = useParams();
    const bot = BOT_INFO[botType];

    const [product, setProduct] = useState(null);
    const [analytics, setAnalytics] = useState(null);
    const [calls, setCalls] = useState([]);
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('sessions');
    const [search, setSearch] = useState('');
    const [filterQualified, setFilterQualified] = useState('all');
    const [filterLanguage, setFilterLanguage] = useState('all');

    useEffect(() => {
        if (!bot) return;
        fetchData();
    }, [botType, productId]);

    const fetchData = async () => {
        try {
            const [productRes, analyticsRes, callsRes, leadsRes] = await Promise.all([
                api.get(`/products/${productId}`),
                api.get('/calls/analytics', { params: { productId } }),
                api.get('/calls', { params: { productId } }),
                api.get('/calls/leads/all', { params: { productId } }),
            ]);
            setProduct(productRes.data);
            setAnalytics(analyticsRes.data);
            setCalls(callsRes.data);
            setLeads(leadsRes.data);
        } catch (err) {
            console.log('Error fetching bot dashboard data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        try {
            const res = await api.get('/calls/export', { params: { productId }, responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${product?.name || botType}-sessions.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            console.log('Export error:', err);
        }
    };

    const formatDuration = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
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

    if (loading) {
        return (
            <div className="flex min-h-screen bg-[#0f0f0f]">
                <Sidebar />
                <main className="flex-1 p-8 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </main>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="flex min-h-screen bg-[#0f0f0f]">
                <Sidebar />
                <main className="flex-1 p-8 flex items-center justify-center">
                    <div className="text-center">
                        <p className="text-4xl mb-4">🔍</p>
                        <h1 className="text-xl font-semibold text-white mb-2">Bot instance not found</h1>
                        <Link to={`/bots/${botType}`} className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
                            ← Back to {bot.name}
                        </Link>
                    </div>
                </main>
            </div>
        );
    }

    const maxCount = analytics?.callsPerDay
        ? Math.max(...analytics.callsPerDay.map(d => d.count), 1)
        : 1;

    const statCards = [
        { label: 'Total Sessions', value: analytics?.totalCalls || 0, icon: '📞', color: 'text-indigo-400', bg: 'bg-indigo-950' },
        { label: 'Completed', value: analytics?.completedCalls || 0, icon: '✅', color: 'text-green-400', bg: 'bg-green-950' },
        { label: 'Incomplete', value: analytics?.incompleteCalls || 0, icon: '⚠️', color: 'text-orange-400', bg: 'bg-orange-950' },
        { label: 'Qualified Leads', value: analytics?.qualifiedLeads || 0, icon: '🎯', color: 'text-purple-400', bg: 'bg-purple-950' },
        { label: 'Conversion Rate', value: `${analytics?.conversionRate || 0}%`, icon: '📈', color: 'text-amber-400', bg: 'bg-amber-950' },
        { label: 'Avg Duration', value: formatDuration(analytics?.avgDuration || 0), icon: '⏱', color: 'text-blue-400', bg: 'bg-blue-950' },
    ];

    const filteredCalls = calls.filter(call => {
        const matchesSearch =
            search === '' ||
            (call.prospectName || '').toLowerCase().includes(search.toLowerCase()) ||
            (call.prospectEmail || '').toLowerCase().includes(search.toLowerCase()) ||
            (call.productId?.name || '').toLowerCase().includes(search.toLowerCase());

        const matchesQualified =
            filterQualified === 'all' ||
            (filterQualified === 'yes' && call.qualified) ||
            (filterQualified === 'no' && !call.qualified);

        const matchesLanguage =
            filterLanguage === 'all' || call.language === filterLanguage;

        return matchesSearch && matchesQualified && matchesLanguage;
    });

    const languages = [...new Set(calls.map(c => c.language).filter(Boolean))];

    return (
        <div className="flex min-h-screen bg-[#0f0f0f]">
            <Sidebar />
            <main className="flex-1 p-8 overflow-y-auto">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link to={`/bots/${botType}`} className="text-gray-500 hover:text-gray-300 text-sm mb-2 inline-block">
                            ← {bot.name}
                        </Link>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-base font-bold text-white">
                                {bot.personaName.charAt(0)}
                            </div>
                            <h1 className="text-2xl font-bold text-white">{product.name}</h1>
                        </div>
                        <p className="text-indigo-400 text-xs font-medium mt-1 ml-[52px]">
                            {bot.personaName} • {bot.name}
                        </p>
                        <p className="text-gray-500 mt-1">{product.url}</p>
                    </div>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-indigo-500 text-gray-300 hover:text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    >
                        📥 Export CSV
                    </button>
                </div>

                {/* Stat Cards */}
                <div className="grid grid-cols-6 gap-4 mb-8">
                    {statCards.map((stat) => (
                        <div key={stat.label} className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
                            <div className={`w-10 h-10 ${stat.bg} rounded-lg flex items-center justify-center text-xl mb-3`}>
                                {stat.icon}
                            </div>
                            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                            <p className="text-gray-500 text-xs mt-1">{stat.label}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-4 gap-6 mb-6">
                    {/* Calls per day chart */}
                    <div className="col-span-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
                        <h2 className="text-white font-semibold mb-6">Sessions — Last 7 Days</h2>
                        <div className="flex items-end justify-between gap-2 h-32">
                            {analytics?.callsPerDay?.map((day, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                    <span className="text-gray-500 text-xs">{day.count}</span>
                                    <div
                                        className="w-full bg-indigo-600 rounded-t-md transition-all hover:bg-indigo-500"
                                        style={{
                                            height: `${Math.max((day.count / maxCount) * BAR_MAX_HEIGHT, day.count > 0 ? 8 : 2)}px`,
                                            opacity: day.count === 0 ? 0.2 : 1
                                        }}
                                    />
                                    <span className="text-gray-600 text-xs text-center leading-tight">
                                        {day.date.split(',')[0]}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Language breakdown */}
                    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
                        <h2 className="text-white font-semibold mb-6">Language Breakdown</h2>
                        {analytics?.languages?.length === 0 ? (
                            <p className="text-gray-600 text-sm">No data yet</p>
                        ) : (
                            <div className="space-y-3">
                                {analytics?.languages?.map((lang, i) => {
                                    const pct = analytics.totalCalls > 0
                                        ? Math.round((lang.count / analytics.totalCalls) * 100)
                                        : 0;
                                    return (
                                        <div key={lang.language}>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-gray-300 text-sm font-medium uppercase">
                                                    {lang.language}
                                                </span>
                                                <span className="text-gray-500 text-xs">{lang.count} ({pct}%)</span>
                                            </div>
                                            <div className="w-full bg-[#2a2a2a] rounded-full h-1.5">
                                                <div
                                                    className="h-1.5 rounded-full transition-all"
                                                    style={{
                                                        width: `${pct}%`,
                                                        backgroundColor: COLORS[i % COLORS.length]
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Visitor satisfaction breakdown — sensed from transcript at call end */}
                    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
                        <h2 className="text-white font-semibold mb-6">Visitor Satisfaction</h2>
                        {!analytics?.satisfaction || analytics.totalCalls === 0 ? (
                            <p className="text-gray-600 text-sm">No data yet</p>
                        ) : (
                            <div className="space-y-3">
                                {[
                                    { key: 'positive', label: '🙂 Positive', color: '#22c55e' },
                                    { key: 'neutral', label: '😐 Neutral', color: '#6366f1' },
                                    { key: 'negative', label: '🙁 Negative', color: '#ef4444' },
                                    { key: 'unknown', label: '❔ Unclear', color: '#6b7280' },
                                ].map(({ key, label, color }) => {
                                    const count = analytics.satisfaction[key] || 0;
                                    const pct = analytics.totalCalls > 0
                                        ? Math.round((count / analytics.totalCalls) * 100)
                                        : 0;
                                    return (
                                        <div key={key}>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-gray-300 text-sm font-medium">{label}</span>
                                                <span className="text-gray-500 text-xs">{count} ({pct}%)</span>
                                            </div>
                                            <div className="w-full bg-[#2a2a2a] rounded-full h-1.5">
                                                <div
                                                    className="h-1.5 rounded-full transition-all"
                                                    style={{ width: `${pct}%`, backgroundColor: color }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Conversations & Leads */}
                <div className="flex gap-2 mb-5">
                    <button
                        onClick={() => setActiveTab('sessions')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'sessions'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-[#1a1a1a] text-gray-400 hover:text-white'
                            }`}
                    >
                        📞 Conversations ({calls.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('leads')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'leads'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-[#1a1a1a] text-gray-400 hover:text-white'
                            }`}
                    >
                        🎯 Leads ({leads.length})
                    </button>
                </div>

                {activeTab === 'sessions' && (
                    <>
                        <div className="flex gap-3 mb-5">
                            <input
                                type="text"
                                placeholder="Search by name, email or product..."
                                className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500 transition-colors"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                            <select
                                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-gray-300 text-sm outline-none focus:border-indigo-500"
                                value={filterQualified}
                                onChange={e => setFilterQualified(e.target.value)}
                            >
                                <option value="all">All leads</option>
                                <option value="yes">Qualified</option>
                                <option value="no">Unqualified</option>
                            </select>
                            <select
                                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-3 py-2.5 text-gray-300 text-sm outline-none focus:border-indigo-500"
                                value={filterLanguage}
                                onChange={e => setFilterLanguage(e.target.value)}
                            >
                                <option value="all">All languages</option>
                                {languages.map(lang => (
                                    <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                                ))}
                            </select>
                        </div>

                        {filteredCalls.length === 0 ? (
                            <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-16 text-center">
                                <p className="text-4xl mb-4">📞</p>
                                <h3 className="text-lg font-semibold text-white mb-2">No conversations found</h3>
                                <p className="text-gray-500 text-sm">Try adjusting your filters</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filteredCalls.map(call => (
                                    <Link
                                        key={call._id}
                                        to={`/calls/${call._id}`}
                                        className="bg-[#1a1a1a] border border-[#2a2a2a] hover:border-indigo-500 rounded-xl p-5 flex items-center justify-between transition-colors group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-indigo-950 rounded-full flex items-center justify-center text-lg">
                                                👤
                                            </div>
                                            <div>
                                                <p className="text-white font-medium group-hover:text-indigo-300 transition-colors">
                                                    {call.prospectName || 'Anonymous visitor'}
                                                </p>
                                                <p className="text-gray-500 text-sm mt-0.5">
                                                    {call.prospectEmail || 'No email captured'}
                                                </p>
                                                <p className="text-gray-600 text-xs mt-1">
                                                    {call.productId?.name} • {new Date(call.createdAt).toLocaleDateString()} • {formatDuration(call.duration || 0)}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {call.qualified && (
                                                <span className="text-xs bg-green-950 text-green-400 px-2 py-1 rounded-full font-medium">
                                                    ✅ Qualified
                                                </span>
                                            )}
                                            {call.satisfaction && call.satisfaction !== 'unknown' && (
                                                <span className="text-xs px-2 py-1 rounded-full font-medium" title={call.satisfactionReason || ''}>
                                                    {call.satisfaction === 'positive' ? '🙂' : call.satisfaction === 'negative' ? '🙁' : '😐'}
                                                </span>
                                            )}
                                            <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${call.status === 'completed'
                                                ? 'bg-green-950 text-green-400'
                                                : call.status === 'active'
                                                    ? 'bg-blue-950 text-blue-400 animate-pulse'
                                                    : 'bg-gray-800 text-gray-400'
                                                }`}>
                                                {call.status}
                                            </span>
                                            {call.language && (
                                                <span className="text-xs bg-[#0f0f0f] text-gray-400 px-2 py-1 rounded-lg uppercase">
                                                    {call.language}
                                                </span>
                                            )}
                                            <span className="text-gray-600 text-sm group-hover:text-indigo-400 transition-colors">→</span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'leads' && (
                    leads.length === 0 ? (
                        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-16 text-center">
                            <p className="text-4xl mb-4">🎯</p>
                            <h3 className="text-lg font-semibold text-white mb-2">No leads yet</h3>
                            <p className="text-gray-500 text-sm">Leads appear when visitors leave their contact info</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {leads.map(lead => (
                                <div
                                    key={lead._id}
                                    className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 bg-purple-950 rounded-full flex items-center justify-center text-lg">👤</div>
                                        <div>
                                            <p className="text-white font-medium">{lead.prospectName || 'Unknown'}</p>
                                            <p className="text-gray-500 text-sm mt-0.5">{lead.prospectEmail || 'No email'}</p>
                                            <p className="text-gray-600 text-xs mt-1">
                                                {lead.productId?.name} • {new Date(lead.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs px-3 py-1.5 rounded-full font-medium bg-indigo-950 text-indigo-300">
                                            {lead.status || 'Not Contacted'}
                                        </span>
                                        <span
                                            className={`text-xs px-2.5 py-1 rounded-full font-medium ${lead.zohoSyncStatus === 'synced' ? 'bg-green-950 text-green-400'
                                                : lead.zohoSyncStatus === 'failed' ? 'bg-red-950 text-red-400'
                                                    : lead.zohoSyncStatus === 'skipped' ? 'bg-gray-800 text-gray-400'
                                                        : 'bg-yellow-950 text-yellow-400'
                                                }`}
                                            title={lead.zohoSyncError || ''}
                                        >
                                            {lead.zohoSyncStatus === 'synced' ? '✅ Synced to Zoho'
                                                : lead.zohoSyncStatus === 'failed' ? '⚠️ Zoho sync failed'
                                                    : lead.zohoSyncStatus === 'skipped' ? '— Not synced'
                                                        : '⏳ Syncing...'}
                                        </span>
                                        <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${lead.qualified ? 'bg-green-950 text-green-400' : 'bg-gray-800 text-gray-400'
                                            }`}>
                                            {lead.qualified ? '✅ Qualified' : 'Unqualified'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </main>
        </div>
    );
}