import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeDrawer() {
    const [isOpen, setIsOpen] = useState(false);
    const { theme, setTheme, themes } = useTheme();

    const activeThemeObj = themes.find(t => t.id === theme) || themes[0];

    const themeDescriptions = {
        cyberpunk: 'Multi-color neon gradient borders, electric cyan/magenta glow, futuristic dark glass',
        titanium: 'Metallic slate texture, specular inset highlights, clean luxury layout',
        light: 'Pure snow-white layout, crisp drop shadows, high contrast text & purple accents',
        supabase: 'Deep emerald translucent glass, neon green status badges, mint highlights',
    };

    return (
        <>
            {/* Sidebar Trigger Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer"
                style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    color: 'var(--text-main)',
                }}
            >
                <div className="flex items-center gap-2 truncate">
                    <span>{activeThemeObj.icon}</span>
                    <span className="truncate">{activeThemeObj.name}</span>
                </div>
                <span className="text-[10px] opacity-60 font-mono">Theme 🎨</span>
            </button>

            {/* Slide-out Drawer Overlay & Panel */}
            {isOpen && (
                <div className="fixed inset-0 z-50 flex justify-end animate-fade-in" style={{ zIndex: 9999 }}>
                    {/* Backdrop */}
                    <div
                        onClick={() => setIsOpen(false)}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                    />

                    {/* Drawer Content */}
                    <div
                        className="relative w-full max-w-md min-h-screen p-6 flex flex-col justify-between shadow-2xl z-10 overflow-y-auto"
                        style={{
                            background: 'var(--bg-sidebar)',
                            borderLeft: '1px solid var(--border-light)',
                            color: 'var(--text-main)',
                            fontFamily: 'Inter, sans-serif',
                        }}
                    >
                        <div>
                            {/* Drawer Header */}
                            <div className="flex items-center justify-between pb-5 mb-6 border-b"
                                style={{ borderColor: 'var(--border-light)' }}>
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg text-white font-bold"
                                        style={{ background: 'var(--accent-gradient)' }}>
                                        🎨
                                    </div>
                                    <div>
                                        <h2 className="text-base font-extrabold" style={{ fontFamily: 'Outfit, sans-serif' }}>
                                            Theme Studio
                                        </h2>
                                        <p className="text-xs opacity-70">Customize dashboard visual theme</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold opacity-60 hover:opacity-100 cursor-pointer"
                                    style={{ background: 'rgba(255,255,255,0.08)' }}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Theme List */}
                            <div className="space-y-4">
                                {themes.map((t) => {
                                    const isSelected = theme === t.id;
                                    return (
                                        <div
                                            key={t.id}
                                            onClick={() => setTheme(t.id)}
                                            className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 relative ${isSelected ? 'ring-2 ring-purple-500 scale-[1.02]' : 'hover:scale-[1.01]'
                                                }`}
                                            style={{
                                                background: 'var(--bg-surface)',
                                                border: '1px solid var(--border-light)',
                                                boxShadow: isSelected ? 'var(--shadow-glow)' : 'none',
                                            }}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-xl">{t.icon}</span>
                                                    <h3 className="text-sm font-bold">{t.name}</h3>
                                                    {t.isDefault && (
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                                                            style={{ background: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd' }}>
                                                            Default
                                                        </span>
                                                    )}
                                                </div>
                                                {isSelected && (
                                                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                                                        style={{ background: 'var(--accent-gradient)' }}>
                                                        ✓
                                                    </span>
                                                )}
                                            </div>

                                            <p className="text-xs opacity-70 leading-relaxed mb-3">
                                                {themeDescriptions[t.id]}
                                            </p>

                                            {/* Preview Color Swatches */}
                                            <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'var(--border-light)' }}>
                                                <div className="w-5 h-5 rounded-full border border-white/20"
                                                    style={{
                                                        background: t.id === 'cyberpunk' ? '#06070c' : t.id === 'titanium' ? '#111216' : t.id === 'light' ? '#ffffff' : '#070f14'
                                                    }} title="Background" />
                                                <div className="w-5 h-5 rounded-full border border-white/20"
                                                    style={{
                                                        background: t.id === 'cyberpunk' ? '#ec4899' : t.id === 'titanium' ? '#38bdf8' : t.id === 'light' ? '#7c3aed' : '#10b981'
                                                    }} title="Accent Color" />
                                                <div className="w-5 h-5 rounded-full border border-white/20"
                                                    style={{
                                                        background: t.id === 'cyberpunk' ? '#06b6d4' : t.id === 'titanium' ? '#6366f1' : t.id === 'light' ? '#38bdf8' : '#06b6d4'
                                                    }} title="Secondary Accent" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Drawer Footer */}
                        <div className="pt-6 border-t mt-6 text-center" style={{ borderColor: 'var(--border-light)' }}>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="ultra-btn-primary w-full py-3"
                            >
                                Apply Theme & Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
