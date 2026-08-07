import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function TestUI() {
    const [selectedTheme, setSelectedTheme] = useState('d'); // Default to Cyberpunk Neon

    const themes = {
        d: {
            id: 'd',
            name: '⚡ Cyberpunk Neon Prism',
            desc: 'Multi-color gradient borders, electric cyan/magenta glow, futuristic dark glass',
            bg: '#06070c',
            sidebarBg: 'rgba(10, 11, 18, 0.95)',
            cardBg: 'rgba(14, 16, 26, 0.85)',
            cardBorder: '1px solid rgba(236, 72, 153, 0.3)',
            cardShadow: '0 0 20px rgba(6, 182, 212, 0.15)',
            accent: '#06b6d4',
            accentGrad: 'linear-gradient(135deg, #ec4899, #8b5cf6, #06b6d4)',
            textMain: '#ffffff',
            textSub: '#94a3b8',
            isLight: false,
        },
        e: {
            id: 'e',
            name: '🍏 Apple Dark Titanium',
            desc: 'Metallic slate texture, specular inset highlights, clean luxury layout',
            bg: '#111216',
            sidebarBg: '#18191f',
            cardBg: '#1c1d24',
            cardBorder: '1px solid rgba(255, 255, 255, 0.1)',
            cardShadow: 'inset 0 1px 1px rgba(255,255,255,0.15), 0 10px 30px rgba(0,0,0,0.5)',
            accent: '#38bdf8',
            accentGrad: 'linear-gradient(135deg, #6366f1, #38bdf8)',
            textMain: '#f8fafc',
            textSub: '#94a3b8',
            isLight: false,
        },
        f: {
            id: 'f',
            name: '🌌 Horizon Aurora Glow',
            desc: 'Deep cosmic violet background, floating cards with glowing top-light beams',
            bg: '#0a0817',
            sidebarBg: 'rgba(15, 12, 33, 0.9)',
            cardBg: 'rgba(21, 17, 46, 0.8)',
            cardBorder: '1px solid rgba(168, 85, 247, 0.25)',
            cardTopBorder: '3px solid #a855f7',
            cardShadow: '0 12px 40px rgba(168, 85, 247, 0.2)',
            accent: '#a855f7',
            accentGrad: 'linear-gradient(135deg, #c084fc, #6366f1)',
            textMain: '#faf5ff',
            textSub: '#c084fc',
            isLight: false,
        },
        g: {
            id: 'g',
            name: '☀️ Luxury Apple Light Mode',
            desc: 'Pure snow-white layout, crisp drop shadows, high contrast text & purple accents',
            bg: '#f8fafc',
            sidebarBg: '#ffffff',
            cardBg: '#ffffff',
            cardBorder: '1px solid #e2e8f0',
            cardShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
            accent: '#7c3aed',
            accentGrad: 'linear-gradient(135deg, #7c3aed, #6366f1)',
            textMain: '#0f172a',
            textSub: '#64748b',
            isLight: true,
        },
        a: {
            id: 'a',
            name: 'Linear Obsidian',
            desc: 'Minimal violet glow',
            bg: '#080911',
            sidebarBg: 'rgba(12, 13, 22, 0.9)',
            cardBg: 'rgba(16, 18, 30, 0.75)',
            cardBorder: '1px solid rgba(255, 255, 255, 0.08)',
            accent: '#8b5cf6',
            accentGrad: 'linear-gradient(135deg, #7c3aed, #6366f1)',
            textMain: '#f8fafc',
            textSub: '#94a3b8',
            isLight: false,
        },
        b: {
            id: 'b',
            name: 'Supabase Glass',
            desc: 'Emerald neon glass',
            bg: '#070f14',
            sidebarBg: 'rgba(9, 20, 26, 0.85)',
            cardBg: 'rgba(14, 28, 36, 0.7)',
            cardBorder: '1px solid rgba(16, 185, 129, 0.2)',
            accent: '#10b981',
            accentGrad: 'linear-gradient(135deg, #10b981, #06b6d4)',
            textMain: '#f0fdf4',
            textSub: '#86efac',
            isLight: false,
        },
    };

    const current = themes[selectedTheme];

    return (
        <div className="min-h-screen flex flex-col transition-colors duration-300"
            style={{ backgroundColor: current.bg, color: current.textMain, fontFamily: 'Inter, sans-serif' }}>

            {/* Top Concept Switcher Toolbar */}
            <div className="sticky top-0 z-50 px-6 py-4 flex flex-col gap-3 border-b"
                style={{
                    backgroundColor: current.isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(10, 11, 20, 0.95)',
                    backdropFilter: 'blur(16px)',
                    borderColor: current.isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.1)',
                }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">✨</span>
                        <div>
                            <h2 className="text-base font-extrabold" style={{ color: current.textMain }}>
                                Select Your Favorite Design Concept
                            </h2>
                            <p className="text-xs" style={{ color: current.textSub }}>
                                {current.desc}
                            </p>
                        </div>
                    </div>

                    <Link to="/" className="text-xs font-semibold px-4 py-2 rounded-xl border transition-colors"
                        style={{
                            borderColor: current.isLight ? '#cbd5e1' : 'rgba(255,255,255,0.15)',
                            color: current.textMain,
                        }}>
                        ← Back to Dashboard
                    </Link>
                </div>

                {/* Theme Selector Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {Object.values(themes).map(t => (
                        <button
                            key={t.id}
                            onClick={() => setSelectedTheme(t.id)}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer flex-shrink-0 flex items-center gap-2 ${selectedTheme === t.id
                                    ? 'shadow-xl scale-105'
                                    : 'opacity-70 hover:opacity-100'
                                }`}
                            style={{
                                background: selectedTheme === t.id ? t.accentGrad : (current.isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)'),
                                color: selectedTheme === t.id ? '#ffffff' : current.textMain,
                                border: selectedTheme === t.id ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                            }}
                        >
                            <span>{t.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Demo Preview Layout */}
            <div className="flex-1 flex">

                {/* Sidebar Preview */}
                <aside className="w-[250px] p-5 flex flex-col justify-between border-r"
                    style={{ background: current.sidebarBg, borderColor: current.isLight ? '#e2e8f0' : 'rgba(255, 255, 255, 0.08)' }}>
                    <div>
                        <div className="flex items-center gap-3 mb-8 px-2">
                            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-lg"
                                style={{ background: current.accentGrad }}>
                                ⚡
                            </div>
                            <span className="font-extrabold text-xl tracking-tight" style={{ color: current.textMain, fontFamily: 'Outfit, sans-serif' }}>
                                SalesBot
                            </span>
                        </div>

                        <div className="space-y-1.5">
                            {[
                                { label: 'Bots', icon: '🤖' },
                                { label: 'Products', icon: '📦' },
                                { label: 'Analytics', icon: '📊' },
                                { label: 'Settings', icon: '⚙' },
                            ].map((item, idx) => (
                                <div key={item.label} className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${idx === 0 ? 'shadow-md' : ''
                                    }`}
                                    style={{
                                        background: idx === 0 ? (current.isLight ? '#f1f5f9' : 'rgba(255,255,255,0.08)') : 'transparent',
                                        color: idx === 0 ? current.textMain : current.textSub,
                                        borderLeft: idx === 0 ? `4px solid ${current.accent}` : '4px solid transparent'
                                    }}>
                                    <div className="flex items-center gap-3">
                                        <span>{item.icon}</span>
                                        <span>{item.label}</span>
                                    </div>
                                    {idx === 0 && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: current.accent }} />}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-3.5 rounded-2xl flex items-center gap-3"
                        style={{
                            background: current.isLight ? '#f1f5f9' : 'rgba(255,255,255,0.04)',
                            border: current.isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.05)'
                        }}>
                        <div className="w-9 h-9 rounded-xl text-white font-bold flex items-center justify-center text-xs shadow-md"
                            style={{ background: current.accentGrad }}>
                            J
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold truncate" style={{ color: current.textMain }}>Jitender</p>
                            <p className="text-[10px] truncate" style={{ color: current.textSub }}>jitender@salesbot.ai</p>
                        </div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 p-8 space-y-8 overflow-y-auto">

                    {/* Header Banner */}
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase mb-2"
                                style={{ background: current.isLight ? '#f1f5f9' : 'rgba(255,255,255,0.08)', color: current.accent }}>
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: current.accent }} />
                                Preview Concept
                            </div>
                            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: current.textMain, fontFamily: 'Outfit, sans-serif' }}>
                                Executive Dashboard & Analytics
                            </h1>
                            <p className="text-xs mt-1" style={{ color: current.textSub }}>
                                Real-time AI sales metrics for Zoho CRM & Live Web Demos
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button className="px-5 py-3 rounded-xl text-xs font-bold text-white shadow-xl cursor-pointer transition-transform hover:scale-105"
                                style={{ background: current.accentGrad }}>
                                🚀 Add New Product
                            </button>
                        </div>
                    </div>

                    {/* Metric Cards Grid */}
                    <div className="grid grid-cols-4 gap-5">
                        {[
                            { label: 'Total Sessions', val: '1,428', change: '+18.4%', icon: '📞' },
                            { label: 'Qualified Leads', val: '384', change: '+24.1%', icon: '🎯' },
                            { label: 'Conversion Rate', val: '26.8%', change: '+3.2%', icon: '📈' },
                            { label: 'Avg Duration', val: '3m 42s', change: '+12s', icon: '⏱' },
                        ].map((card, i) => (
                            <div key={i} className="p-6 rounded-2xl relative overflow-hidden transition-transform hover:-translate-y-1"
                                style={{
                                    background: current.cardBg,
                                    border: current.cardBorder,
                                    borderTop: current.cardTopBorder || current.cardBorder,
                                    boxShadow: current.cardShadow || 'none',
                                }}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-inner"
                                        style={{ background: current.isLight ? '#f1f5f9' : 'rgba(255,255,255,0.06)' }}>
                                        {card.icon}
                                    </div>
                                    <span className="text-[11px] font-extrabold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                                        {card.change}
                                    </span>
                                </div>
                                <p className="text-3xl font-extrabold font-mono tracking-tight" style={{ color: current.textMain }}>
                                    {card.val}
                                </p>
                                <p className="text-xs font-semibold mt-1" style={{ color: current.textSub }}>{card.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Chart & Sentiment Preview */}
                    <div className="grid grid-cols-3 gap-6">
                        {/* SVG Bar Chart */}
                        <div className="col-span-2 p-6 rounded-2xl"
                            style={{
                                background: current.cardBg,
                                border: current.cardBorder,
                                borderTop: current.cardTopBorder || current.cardBorder,
                                boxShadow: current.cardShadow || 'none',
                            }}>
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-base font-bold text-white" style={{ color: current.textMain }}>Daily Session Activity</h3>
                                    <p className="text-xs" style={{ color: current.textSub }}>Live demo volume over the last 7 days</p>
                                </div>
                                <span className="text-xs font-semibold px-3 py-1 rounded-lg" style={{ background: current.isLight ? '#f1f5f9' : 'rgba(255,255,255,0.05)', color: current.textSub }}>
                                    Last 7 Days
                                </span>
                            </div>

                            <div className="flex items-end justify-between gap-3 h-40 pt-4">
                                {[45, 78, 60, 92, 115, 85, 140].map((h, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                        <div className="w-full rounded-t-xl transition-all duration-300 hover:opacity-80"
                                            style={{
                                                height: `${(h / 140) * 120}px`,
                                                background: current.accentGrad,
                                                boxShadow: `0 4px 15px ${current.accent}40`,
                                            }} />
                                        <span className="text-[11px] font-bold font-mono" style={{ color: current.textSub }}>
                                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Sentiment Breakdown */}
                        <div className="p-6 rounded-2xl"
                            style={{
                                background: current.cardBg,
                                border: current.cardBorder,
                                borderTop: current.cardTopBorder || current.cardBorder,
                                boxShadow: current.cardShadow || 'none',
                            }}>
                            <h3 className="text-base font-bold mb-1" style={{ color: current.textMain }}>Visitor Sentiment</h3>
                            <p className="text-xs mb-6" style={{ color: current.textSub }}>AI transcript analysis</p>
                            <div className="space-y-4">
                                {[
                                    { label: '🙂 Positive', pct: 68, color: '#10b981' },
                                    { label: '😐 Neutral', pct: 22, color: '#8b5cf6' },
                                    { label: '🙁 Negative', pct: 10, color: '#f43f5e' },
                                ].map(s => (
                                    <div key={s.label}>
                                        <div className="flex justify-between text-xs font-bold mb-1">
                                            <span style={{ color: current.textMain }}>{s.label}</span>
                                            <span style={{ color: current.textSub }}>{s.pct}%</span>
                                        </div>
                                        <div className="w-full h-2.5 rounded-full overflow-hidden"
                                            style={{ background: current.isLight ? '#e2e8f0' : 'rgba(255,255,255,0.06)' }}>
                                            <div className="h-full rounded-full transition-all" style={{ width: `${s.pct}%`, backgroundColor: s.color }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Table Preview */}
                    <div className="p-6 rounded-2xl"
                        style={{
                            background: current.cardBg,
                            border: current.cardBorder,
                            borderTop: current.cardTopBorder || current.cardBorder,
                            boxShadow: current.cardShadow || 'none',
                        }}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-bold" style={{ color: current.textMain }}>Recent Qualified Lead Pipeline</h3>
                            <span className="text-xs font-semibold text-purple-400">View All →</span>
                        </div>
                        <div className="space-y-3">
                            {[
                                { name: 'Sarah Connor', email: 'sarah@cyberdyne.io', status: '✅ Synced to Zoho CRM', time: '2 mins ago' },
                                { name: 'Alex Mercer', email: 'alex@gentek.com', status: '✅ Synced to Zoho CRM', time: '14 mins ago' },
                                { name: 'Elena Fisher', email: 'elena@unmapped.org', status: '⏳ Syncing...', time: '1 hour ago' },
                            ].map((row, i) => (
                                <div key={i} className="flex items-center justify-between p-4 rounded-xl transition-all"
                                    style={{
                                        background: current.isLight ? '#f8fafc' : 'rgba(255,255,255,0.03)',
                                        border: current.isLight ? '1px solid #e2e8f0' : '1px solid rgba(255,255,255,0.05)',
                                    }}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full font-bold flex items-center justify-center text-sm shadow-md"
                                            style={{ background: current.accentGrad, color: '#ffffff' }}>
                                            {row.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="text-xs font-extrabold" style={{ color: current.textMain }}>{row.name}</p>
                                            <p className="text-[11px]" style={{ color: current.textSub }}>{row.email}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 text-xs">
                                        <span className="px-3 py-1.5 rounded-full font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20">
                                            {row.status}
                                        </span>
                                        <span className="text-[11px] font-medium" style={{ color: current.textSub }}>{row.time}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </main>
            </div>
        </div>
    );
}
