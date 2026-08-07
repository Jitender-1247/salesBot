import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

const BOT_INFO = {
    salesbot: { name: 'SalesBot', personaName: 'Sofia', icon: '⚡' },
};

const COLORS = ['#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#38bdf8', '#06b6d4'];

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
    const [hoveredBar, setHoveredBar] = useState(null);

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

    if (loading) return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full animate-spin border-2 border-purple-500 border-t-transparent" />
            </main>
        </div>
    );

    if (!product) return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-4xl mb-4">🔍</p>
                    <h1 className="text-xl font-semibold text-white mb-2">Bot instance not found</h1>
                    <Link to={`/bots/${botType}`} className="text-xs font-semibold text-purple-400">← Back to {bot.name}</Link>
                </div>
            </main>
        </div>
    );

    const daysData = analytics?.callsPerDay || [];
    const maxCount = Math.max(...daysData.map(d => d.count), 1);
    const peakDay = daysData.reduce((max, d) => (d.count > (max?.count || 0) ? d : max), null);

    // Calculate SVG Area Path coordinates
    const chartWidth = 480;
    const chartHeight = 110;
    const points = daysData.map((d, i) => {
        const x = (i / Math.max(daysData.length - 1, 1)) * (chartWidth - 40) + 20;
        const y = chartHeight - (d.count / maxCount) * (chartHeight - 30) - 15;
        return { x, y, count: d.count, date: d.date };
    });

    const pathD = points.length > 1
        ? points.reduce((acc, p, i, a) => {
            if (i === 0) return `M ${p.x} ${p.y}`;
            const prev = a[i - 1];
            const cx = (prev.x + p.x) / 2;
            return `${acc} C ${cx} ${prev.y}, ${cx} ${p.y}, ${p.x} ${p.y}`;
        }, '')
        : '';

    const areaD = pathD ? `${pathD} L ${points[points.length - 1]?.x || 0} ${chartHeight} L ${points[0]?.x || 0} ${chartHeight} Z` : '';

    const statCards = [
        { label: 'Total Sessions', value: analytics?.totalCalls || 0, icon: '📞', color: '#c4b5fd' },
        { label: 'Completed', value: analytics?.completedCalls || 0, icon: '✅', color: '#10b981' },
        { label: 'Incomplete', value: analytics?.incompleteCalls || 0, icon: '⚠️', color: '#f59e0b' },
        { label: 'Qualified Leads', value: analytics?.qualifiedLeads || 0, icon: '🎯', color: '#8b5cf6' },
        { label: 'Conversion Rate', value: `${analytics?.conversionRate || 0}%`, icon: '📈', color: '#38bdf8' },
        { label: 'Avg Duration', value: formatDuration(analytics?.avgDuration || 0), icon: '⏱', color: '#06b6d4' },
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
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 p-8 overflow-y-auto animate-fade-in relative z-10 space-y-8">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <Link to={`/bots/${botType}`} className="text-xs font-semibold mb-2 inline-block" style={{ color: 'var(--text-sub)' }}>
                            ← {bot.name}
                        </Link>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-bold text-white shadow-lg"
                                style={{ background: 'var(--accent-gradient)' }}>
                                {bot.personaName.charAt(0)}
                            </div>
                            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
                                {product.name}
                            </h1>
                        </div>
                        <p className="text-xs font-semibold mt-1 ml-[52px]" style={{ color: 'var(--accent-primary)' }}>
                            AI Agent: {bot.personaName} • {product.url}
                        </p>
                    </div>
                    <button onClick={handleExport} className="ultra-btn-secondary text-xs">
                        📥 Export Sessions CSV
                    </button>
                </div>

                {/* Stat Cards Grid */}
                <div className="grid grid-cols-6 gap-4">
                    {statCards.map((stat) => (
                        <div key={stat.label} className="ultra-card p-5">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-3 shadow-inner"
                                style={{ background: 'rgba(139, 92, 246, 0.12)' }}>
                                {stat.icon}
                            </div>
                            <p className="text-2xl font-extrabold font-mono tracking-tight" style={{ color: stat.color }}>
                                {stat.value}
                            </p>
                            <p className="text-xs font-semibold mt-1" style={{ color: 'var(--text-sub)' }}>{stat.label}</p>
                        </div>
                    ))}
                </div>

                {/* Enhanced Interactive Charts Grid */}
                <div className="grid grid-cols-4 gap-6">

                    {/* Illuminated Area & Bar Chart */}
                    <div className="col-span-2 ultra-card p-6 flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Sessions — Last 7 Days</h2>
                                {peakDay && peakDay.count > 0 && (
                                    <p className="text-[11px] font-semibold text-purple-400 mt-0.5">
                                        🔥 Peak Activity: {peakDay.date.split(',')[0]} ({peakDay.count} sessions)
                                    </p>
                                )}
                            </div>
                            <span className="text-[11px] font-semibold px-3 py-1 rounded-full"
                                style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-sub)' }}>
                                Live Curve & Volume
                            </span>
                        </div>

                        {/* Interactive SVG Area Curve */}
                        <div className="relative w-full h-[120px] mb-2">
                            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full overflow-visible">
                                <defs>
                                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.45" />
                                        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
                                    </linearGradient>
                                    <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#ec4899" />
                                        <stop offset="50%" stopColor="#8b5cf6" />
                                        <stop offset="100%" stopColor="#06b6d4" />
                                    </linearGradient>
                                </defs>

                                {/* Glowing Area Fill */}
                                {areaD && <path d={areaD} fill="url(#areaGradient)" />}

                                {/* Smooth Spline Curve */}
                                {pathD && (
                                    <path
                                        d={pathD}
                                        fill="none"
                                        stroke="url(#strokeGradient)"
                                        strokeWidth="3.5"
                                        strokeLinecap="round"
                                        style={{ filter: 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.6))' }}
                                    />
                                )}

                                {/* Interactive Data Nodes */}
                                {points.map((p, i) => (
                                    <g key={i} className="group cursor-pointer" onMouseEnter={() => setHoveredBar(i)} onMouseLeave={() => setHoveredBar(null)}>
                                        <circle
                                            cx={p.x}
                                            cy={p.y}
                                            r={hoveredBar === i ? 6.5 : 4}
                                            fill="#ffffff"
                                            stroke="#8b5cf6"
                                            strokeWidth="3"
                                            className="transition-all duration-200"
                                            style={{ filter: 'drop-shadow(0 0 6px #8b5cf6)' }}
                                        />
                                    </g>
                                ))}
                            </svg>
                        </div>

                        {/* Dual Bar Layout with Date Labels */}
                        <div className="flex items-end justify-between gap-3 pt-2 border-t" style={{ borderColor: 'var(--border-light)' }}>
                            {daysData.map((day, i) => {
                                const isHovered = hoveredBar === i;
                                return (
                                    <div
                                        key={i}
                                        className="flex-1 flex flex-col items-center gap-1.5 cursor-pointer group"
                                        onMouseEnter={() => setHoveredBar(i)}
                                        onMouseLeave={() => setHoveredBar(null)}
                                    >
                                        <span className={`text-[11px] font-bold font-mono transition-transform ${isHovered ? 'scale-125 text-purple-400' : ''}`}
                                            style={{ color: day.count > 0 ? 'var(--text-main)' : 'var(--text-muted)' }}>
                                            {day.count}
                                        </span>
                                        <div
                                            className="w-full rounded-t-lg transition-all duration-300"
                                            style={{
                                                height: `${Math.max((day.count / maxCount) * 55, day.count > 0 ? 8 : 3)}px`,
                                                opacity: day.count === 0 ? 0.2 : isHovered ? 1 : 0.85,
                                                background: isHovered ? 'linear-gradient(180deg, #ec4899 0%, #8b5cf6 100%)' : 'var(--accent-gradient)',
                                                boxShadow: isHovered ? '0 0 15px rgba(236,72,153,0.5)' : day.count > 0 ? '0 0 10px rgba(139,92,246,0.2)' : 'none',
                                            }}
                                        />
                                        <span className={`text-[11px] font-bold text-center leading-tight transition-colors ${isHovered ? 'text-white' : ''}`}
                                            style={{ color: 'var(--text-sub)' }}>
                                            {day.date.split(',')[0]}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Language breakdown */}
                    <div className="ultra-card p-6">
                        <h2 className="font-bold text-sm mb-6" style={{ color: 'var(--text-main)' }}>Language Breakdown</h2>
                        {analytics?.languages?.length === 0 ? (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No data captured yet</p>
                        ) : (
                            <div className="space-y-4">
                                {analytics?.languages?.map((lang, i) => {
                                    const pct = analytics.totalCalls > 0
                                        ? Math.round((lang.count / analytics.totalCalls) * 100)
                                        : 0;
                                    return (
                                        <div key={lang.language}>
                                            <div className="flex justify-between items-center mb-1 text-xs font-semibold">
                                                <span className="uppercase" style={{ color: 'var(--text-main)' }}>{lang.language}</span>
                                                <span style={{ color: 'var(--text-sub)' }}>{lang.count} ({pct}%)</span>
                                            </div>
                                            <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                                                <div className="h-full rounded-full transition-all"
                                                    style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Visitor Sentiment (Measured by Groq Llama 3.3 70B AI) */}
                    <div className="ultra-card p-6 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Visitor Sentiment</h2>
                                <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20"
                                    title="Sentiment is analyzed automatically from the conversation transcript by Groq Llama 3.3 70B AI model at the end of each session.">
                                    🤖 Groq AI Sensed
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-400 mb-5 leading-tight">
                                Evaluated from real-time visitor speech & responses
                            </p>
                        </div>

                        {!analytics?.satisfaction || analytics.totalCalls === 0 ? (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No data captured yet</p>
                        ) : (
                            <div className="space-y-4">
                                {[
                                    { key: 'positive', label: '🙂 Positive (Engaged)', color: '#10b981' },
                                    { key: 'neutral', label: '😐 Neutral (Polite)', color: '#8b5cf6' },
                                    { key: 'negative', label: '🙁 Negative (Confused)', color: '#f43f5e' },
                                    { key: 'unknown', label: '❓ Unclear', color: '#64748b' },
                                ].map(({ key, label, color }) => {
                                    const count = analytics.satisfaction[key] || 0;
                                    const pct = analytics.totalCalls > 0
                                        ? Math.round((count / analytics.totalCalls) * 100)
                                        : 0;
                                    return (
                                        <div key={key}>
                                            <div className="flex justify-between items-center mb-1 text-xs font-semibold">
                                                <span style={{ color: 'var(--text-main)' }}>{label}</span>
                                                <span style={{ color: 'var(--text-sub)' }}>{count} ({pct}%)</span>
                                            </div>
                                            <div className="w-full rounded-full h-2 overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                                                <div className="h-full rounded-full transition-all"
                                                    style={{ width: `${pct}%`, backgroundColor: color }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Tabs Bar */}
                <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border-light)' }}>
                    <div className="flex gap-3">
                        <button onClick={() => setActiveTab('sessions')}
                            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${activeTab === 'sessions' ? 'ultra-btn-primary' : 'ultra-btn-secondary'}`}>
                            📞 Conversations ({calls.length})
                        </button>
                        <button onClick={() => setActiveTab('leads')}
                            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${activeTab === 'leads' ? 'ultra-btn-primary' : 'ultra-btn-secondary'}`}>
                            🎯 Qualified Leads ({leads.length})
                        </button>
                    </div>

                    {activeTab === 'sessions' && (
                        <div className="flex items-center gap-3">
                            <input type="text" placeholder="Search sessions by visitor name or email..."
                                className="ultra-input text-xs w-[280px]" value={search} onChange={e => setSearch(e.target.value)} />
                            <select className="ultra-input text-xs w-auto cursor-pointer" value={filterQualified} onChange={e => setFilterQualified(e.target.value)}>
                                <option value="all">All leads</option>
                                <option value="yes">Qualified Only</option>
                                <option value="no">Unqualified</option>
                            </select>
                            <select className="ultra-input text-xs w-auto cursor-pointer" value={filterLanguage} onChange={e => setFilterLanguage(e.target.value)}>
                                <option value="all">All languages</option>
                                {languages.map(lang => (
                                    <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Tab Contents */}
                {activeTab === 'sessions' && (
                    filteredCalls.length === 0 ? (
                        <div className="ultra-card p-16 text-center">
                            <p className="text-4xl mb-4">📞</p>
                            <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-main)' }}>No conversations found</h3>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Try adjusting your search query or filters</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredCalls.map(call => (
                                <Link key={call._id} to={`/calls/${call._id}`}
                                    className="ultra-card p-5 flex items-center justify-between no-underline group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-base shadow-md font-bold"
                                            style={{ background: 'var(--accent-gradient)', color: '#ffffff' }}>
                                            👤
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm transition-colors group-hover:text-purple-300" style={{ color: 'var(--text-main)' }}>
                                                {call.prospectName || 'Anonymous Visitor'}
                                            </p>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>
                                                {call.prospectEmail || 'No email captured'}
                                            </p>
                                            <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>
                                                {call.productId?.name} • {new Date(call.createdAt).toLocaleDateString()} • {formatDuration(call.duration || 0)}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {call.qualified && <span className="status-pill status-pill-green">✅ Qualified</span>}
                                        {call.satisfaction && call.satisfaction !== 'unknown' && (
                                            <span className="text-sm" title={call.satisfactionReason || ''}>
                                                {call.satisfaction === 'positive' ? '🙂' : call.satisfaction === 'negative' ? '🙁' : '😐'}
                                            </span>
                                        )}
                                        <span className={`status-pill ${call.status === 'completed' ? 'status-pill-green' : call.status === 'active' ? 'status-pill-yellow' : 'status-pill-purple'}`}>
                                            {call.status}
                                        </span>
                                        {call.language && (
                                            <span className="text-[10px] px-2.5 py-1 rounded-md uppercase font-mono font-bold"
                                                style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-sub)' }}>
                                                {call.language}
                                            </span>
                                        )}
                                        <span className="text-base transition-transform group-hover:translate-x-1" style={{ color: 'var(--text-muted)' }}>→</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )
                )}

                {activeTab === 'leads' && (
                    leads.length === 0 ? (
                        <div className="ultra-card p-16 text-center">
                            <p className="text-4xl mb-4">🎯</p>
                            <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-main)' }}>No leads captured yet</h3>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Leads will automatically appear when visitors leave contact info</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {leads.map(lead => (
                                <div key={lead._id} className="ultra-card p-5 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-base font-bold shadow-md"
                                            style={{ background: 'var(--accent-gradient)', color: '#ffffff' }}>
                                            👤
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>{lead.prospectName || 'Unknown Lead'}</p>
                                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-sub)' }}>{lead.prospectEmail || 'No email'}</p>
                                            <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>
                                                {lead.productId?.name} • Captured {new Date(lead.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="status-pill status-pill-purple">{lead.status || 'Not Contacted'}</span>
                                        <span className={`status-pill ${lead.zohoSyncStatus === 'synced' ? 'status-pill-green' : lead.zohoSyncStatus === 'failed' ? 'status-pill-red' : 'status-pill-yellow'}`}
                                            title={lead.zohoSyncError || ''}>
                                            {lead.zohoSyncStatus === 'synced' ? '✅ Synced to Zoho CRM' : lead.zohoSyncStatus === 'failed' ? '⚠️ Zoho Sync Failed' : '⏳ Syncing to CRM'}
                                        </span>
                                        <span className={`status-pill ${lead.qualified ? 'status-pill-green' : 'status-pill-purple'}`}>
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