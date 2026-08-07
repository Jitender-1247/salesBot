import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

const BOT_INFO = {
    salesbot: { name: 'SalesBot', personaName: 'Sofia', icon: '⚡' },
};

const COLORS = ['#7c3aed', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
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

    if (!bot) return (
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-4xl mb-4">🤖</p>
                    <h1 className="text-xl font-semibold text-white mb-2">Bot not found</h1>
                    <p className="text-[13px] mb-6" style={{ color: '#5c5672' }}>"{botType}" isn't a bot type yet.</p>
                    <Link to="/" className="text-[13px] font-medium">← Back to Bots</Link>
                </div>
            </main>
        </div>
    );

    if (loading) return (
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="w-7 h-7 rounded-full animate-spin" style={{ border: '2px solid rgba(124,58,237,0.2)', borderTopColor: '#a78bfa' }} />
            </main>
        </div>
    );

    if (!product) return (
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-4xl mb-4">🔍</p>
                    <h1 className="text-xl font-semibold text-white mb-2">Bot instance not found</h1>
                    <Link to={`/bots/${botType}`} className="text-[13px] font-medium">← Back to {bot.name}</Link>
                </div>
            </main>
        </div>
    );

    const maxCount = analytics?.callsPerDay
        ? Math.max(...analytics.callsPerDay.map(d => d.count), 1)
        : 1;

    const statCards = [
        { label: 'Total Sessions', value: analytics?.totalCalls || 0, icon: '📞', color: '#c4b5fd' },
        { label: 'Completed', value: analytics?.completedCalls || 0, icon: '✅', color: '#4ade80' },
        { label: 'Incomplete', value: analytics?.incompleteCalls || 0, icon: '⚠️', color: '#fbbf24' },
        { label: 'Qualified Leads', value: analytics?.qualifiedLeads || 0, icon: '🎯', color: '#a78bfa' },
        { label: 'Conversion Rate', value: `${analytics?.conversionRate || 0}%`, icon: '📈', color: '#f59e0b' },
        { label: 'Avg Duration', value: formatDuration(analytics?.avgDuration || 0), icon: '⏱', color: '#60a5fa' },
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
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 p-8 overflow-y-auto animate-fade-in">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <Link to={`/bots/${botType}`} className="text-[12px] mb-2 inline-block" style={{ color: '#5c5672' }}>
                            ← {bot.name}
                        </Link>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white"
                                style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                                {bot.personaName.charAt(0)}
                            </div>
                            <h1 className="text-2xl font-bold">{product.name}</h1>
                        </div>
                        <p className="text-[11px] font-medium mt-1 ml-[52px]" style={{ color: '#7c3aed' }}>
                            {bot.personaName} • {bot.name}
                        </p>
                        <p className="text-[13px] mt-1" style={{ color: '#5c5672' }}>{product.url}</p>
                    </div>
                    <button onClick={handleExport} className="sb-btn-ghost text-[13px]">
                        📥 Export CSV
                    </button>
                </div>

                {/* Stat Cards */}
                <div className="grid grid-cols-6 gap-4 mb-8 stagger">
                    {statCards.map((stat) => (
                        <div key={stat.label} className="glass-card p-5 animate-slide-up">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg mb-3"
                                style={{ background: 'rgba(124, 58, 237, 0.12)' }}>
                                {stat.icon}
                            </div>
                            <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                            <p className="text-[11px] mt-1" style={{ color: '#5c5672' }}>{stat.label}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-4 gap-5 mb-6">
                    {/* Calls per day chart */}
                    <div className="col-span-2 glass-card p-6">
                        <h2 className="text-white font-semibold text-[14px] mb-6">Sessions — Last 7 Days</h2>
                        <div className="flex items-end justify-between gap-2 h-32">
                            {analytics?.callsPerDay?.map((day, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                    <span className="text-[11px]" style={{ color: '#5c5672' }}>{day.count}</span>
                                    <div className="w-full rounded-t-md transition-all hover:opacity-80"
                                        style={{
                                            height: `${Math.max((day.count / maxCount) * BAR_MAX_HEIGHT, day.count > 0 ? 8 : 2)}px`,
                                            opacity: day.count === 0 ? 0.2 : 1,
                                            background: 'linear-gradient(180deg, #a78bfa 0%, #7c3aed 100%)',
                                        }}
                                    />
                                    <span className="text-[11px] text-center leading-tight" style={{ color: '#3d3852' }}>
                                        {day.date.split(',')[0]}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Language breakdown */}
                    <div className="glass-card p-6">
                        <h2 className="text-white font-semibold text-[14px] mb-6">Language Breakdown</h2>
                        {analytics?.languages?.length === 0 ? (
                            <p className="text-[13px]" style={{ color: '#3d3852' }}>No data yet</p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {analytics?.languages?.map((lang, i) => {
                                    const pct = analytics.totalCalls > 0
                                        ? Math.round((lang.count / analytics.totalCalls) * 100)
                                        : 0;
                                    return (
                                        <div key={lang.language}>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[12px] font-medium uppercase text-white">{lang.language}</span>
                                                <span className="text-[11px]" style={{ color: '#5c5672' }}>{lang.count} ({pct}%)</span>
                                            </div>
                                            <div className="w-full rounded-full h-1.5" style={{ background: '#0a0a14' }}>
                                                <div className="h-1.5 rounded-full transition-all"
                                                    style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Visitor satisfaction */}
                    <div className="glass-card p-6">
                        <h2 className="text-white font-semibold text-[14px] mb-6">Visitor Satisfaction</h2>
                        {!analytics?.satisfaction || analytics.totalCalls === 0 ? (
                            <p className="text-[13px]" style={{ color: '#3d3852' }}>No data yet</p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {[
                                    { key: 'positive', label: '🙂 Positive', color: '#22c55e' },
                                    { key: 'neutral', label: '😐 Neutral', color: '#8b5cf6' },
                                    { key: 'negative', label: '🙁 Negative', color: '#ef4444' },
                                    { key: 'unknown', label: '❔ Unclear', color: '#5c5672' },
                                ].map(({ key, label, color }) => {
                                    const count = analytics.satisfaction[key] || 0;
                                    const pct = analytics.totalCalls > 0
                                        ? Math.round((count / analytics.totalCalls) * 100)
                                        : 0;
                                    return (
                                        <div key={key}>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[12px] font-medium text-white">{label}</span>
                                                <span className="text-[11px]" style={{ color: '#5c5672' }}>{count} ({pct}%)</span>
                                            </div>
                                            <div className="w-full rounded-full h-1.5" style={{ background: '#0a0a14' }}>
                                                <div className="h-1.5 rounded-full transition-all"
                                                    style={{ width: `${pct}%`, backgroundColor: color }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-5">
                    <button onClick={() => setActiveTab('sessions')}
                        className={`px-4 py-2 rounded-[10px] text-[13px] font-medium cursor-pointer transition-all duration-150 ${activeTab === 'sessions' ? 'sb-btn-primary' : 'sb-btn-ghost'}`}>
                        📞 Conversations ({calls.length})
                    </button>
                    <button onClick={() => setActiveTab('leads')}
                        className={`px-4 py-2 rounded-[10px] text-[13px] font-medium cursor-pointer transition-all duration-150 ${activeTab === 'leads' ? 'sb-btn-primary' : 'sb-btn-ghost'}`}>
                        🎯 Leads ({leads.length})
                    </button>
                </div>

                {activeTab === 'sessions' && (
                    <>
                        <div className="flex gap-3 mb-5">
                            <input type="text" placeholder="Search by name, email or product..."
                                className="sb-input flex-1" value={search} onChange={e => setSearch(e.target.value)} />
                            <select className="sb-input w-auto" value={filterQualified} onChange={e => setFilterQualified(e.target.value)}>
                                <option value="all">All leads</option>
                                <option value="yes">Qualified</option>
                                <option value="no">Unqualified</option>
                            </select>
                            <select className="sb-input w-auto" value={filterLanguage} onChange={e => setFilterLanguage(e.target.value)}>
                                <option value="all">All languages</option>
                                {languages.map(lang => (
                                    <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                                ))}
                            </select>
                        </div>

                        {filteredCalls.length === 0 ? (
                            <div className="glass-card p-16 text-center">
                                <p className="text-4xl mb-4">📞</p>
                                <h3 className="text-lg font-semibold text-white mb-2">No conversations found</h3>
                                <p className="text-[13px]" style={{ color: '#5c5672' }}>Try adjusting your filters</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 stagger">
                                {filteredCalls.map(call => (
                                    <Link key={call._id} to={`/calls/${call._id}`}
                                        className="glass-card p-4 flex items-center justify-between no-underline group animate-slide-up">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-base"
                                                style={{ background: 'rgba(124, 58, 237, 0.12)' }}>
                                                👤
                                            </div>
                                            <div>
                                                <p className="text-white font-medium text-[13px] group-hover:text-[#c4b5fd] transition-colors">
                                                    {call.prospectName || 'Anonymous visitor'}
                                                </p>
                                                <p className="text-[12px] mt-0.5" style={{ color: '#5c5672' }}>
                                                    {call.prospectEmail || 'No email captured'}
                                                </p>
                                                <p className="text-[11px] mt-1" style={{ color: '#3d3852' }}>
                                                    {call.productId?.name} • {new Date(call.createdAt).toLocaleDateString()} • {formatDuration(call.duration || 0)}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {call.qualified && <span className="sb-badge sb-badge-green">✅ Qualified</span>}
                                            {call.satisfaction && call.satisfaction !== 'unknown' && (
                                                <span className="text-xs" title={call.satisfactionReason || ''}>
                                                    {call.satisfaction === 'positive' ? '🙂' : call.satisfaction === 'negative' ? '🙁' : '😐'}
                                                </span>
                                            )}
                                            <span className={`sb-badge ${call.status === 'completed' ? 'sb-badge-green' : call.status === 'active' ? 'sb-badge-yellow animate-pulse' : 'sb-badge-gray'}`}>
                                                {call.status}
                                            </span>
                                            {call.language && (
                                                <span className="text-[10px] px-2 py-0.5 rounded uppercase font-mono" style={{ background: '#0a0a14', color: '#5c5672' }}>
                                                    {call.language}
                                                </span>
                                            )}
                                            <span className="text-[13px] group-hover:text-[#a78bfa] transition-colors" style={{ color: '#5c5672' }}>→</span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'leads' && (
                    leads.length === 0 ? (
                        <div className="glass-card p-16 text-center">
                            <p className="text-4xl mb-4">🎯</p>
                            <h3 className="text-lg font-semibold text-white mb-2">No leads yet</h3>
                            <p className="text-[13px]" style={{ color: '#5c5672' }}>Leads appear when visitors leave contact info</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 stagger">
                            {leads.map(lead => (
                                <div key={lead._id} className="glass-card p-4 flex items-center justify-between animate-slide-up">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-base"
                                            style={{ background: 'rgba(124, 58, 237, 0.12)' }}>👤</div>
                                        <div>
                                            <p className="text-white font-medium text-[13px]">{lead.prospectName || 'Unknown'}</p>
                                            <p className="text-[12px] mt-0.5" style={{ color: '#5c5672' }}>{lead.prospectEmail || 'No email'}</p>
                                            <p className="text-[11px] mt-1" style={{ color: '#3d3852' }}>
                                                {lead.productId?.name} • {new Date(lead.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="sb-badge sb-badge-violet">{lead.status || 'Not Contacted'}</span>
                                        <span className={`sb-badge ${lead.zohoSyncStatus === 'synced' ? 'sb-badge-green' : lead.zohoSyncStatus === 'failed' ? 'sb-badge-red' : lead.zohoSyncStatus === 'skipped' ? 'sb-badge-gray' : 'sb-badge-yellow'}`}
                                            title={lead.zohoSyncError || ''}>
                                            {lead.zohoSyncStatus === 'synced' ? '✅ Synced to Zoho' : lead.zohoSyncStatus === 'failed' ? '⚠️ Zoho sync failed' : lead.zohoSyncStatus === 'skipped' ? '— Not synced' : '⏳ Syncing...'}
                                        </span>
                                        <span className={`sb-badge ${lead.qualified ? 'sb-badge-green' : 'sb-badge-gray'}`}>
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