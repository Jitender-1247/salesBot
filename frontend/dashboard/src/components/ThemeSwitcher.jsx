import { useTheme } from '../context/ThemeContext';

export default function ThemeSwitcher() {
    const { theme, setTheme, themes } = useTheme();

    return (
        <div className="flex items-center gap-1.5 p-1 rounded-xl"
            style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
            }}>
            {themes.map(t => {
                const isActive = theme === t.id;
                return (
                    <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${isActive ? 'shadow-md scale-105' : 'opacity-60 hover:opacity-100'
                            }`}
                        style={{
                            background: isActive ? 'var(--accent-gradient)' : 'transparent',
                            color: isActive ? '#ffffff' : 'var(--text-main)',
                        }}
                        title={`Switch to ${t.name} Theme`}
                    >
                        <span>{t.icon}</span>
                        <span className="hidden sm:inline">{t.name}</span>
                    </button>
                );
            })}
        </div>
    );
}
