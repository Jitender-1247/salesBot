import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const THEMES = [
    { id: 'cyberpunk', name: 'Neon Prism', icon: '🔮', isDefault: true },
    { id: 'titanium', name: 'Dark Titanium', icon: '💎' },
    { id: 'light', name: 'Luxury Light', icon: '☀️' },
    { id: 'supabase', name: 'Emerald Glass', icon: '❇️' },
];

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('salesbot_dashboard_theme') || 'cyberpunk';
    });

    useEffect(() => {
        localStorage.setItem('salesbot_dashboard_theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
