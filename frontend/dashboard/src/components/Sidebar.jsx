import { Link, useLocation, useNavigate } from 'react-router-dom';
import ThemeDrawer from './ThemeDrawer';

const navItems = [
    { path: '/', icon: '⚡', label: 'Bots' },
    { path: '/products', icon: '📦', label: 'Products' },
];

export default function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const client = JSON.parse(localStorage.getItem('client') || '{}');

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('client');
        navigate('/login');
    };

    const isActive = (path) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    };

    return (
        <aside className="w-[260px] h-screen sticky top-0 flex flex-col flex-shrink-0 relative z-20 transition-all duration-300"
            style={{
                background: 'var(--bg-sidebar)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                borderRight: '1px solid var(--border-light)',
            }}
        >
            {/* Brand Header */}
            <div className="px-6 py-6 border-b flex-shrink-0" style={{ borderColor: 'var(--border-light)' }}>
                <Link to="/" className="flex items-center gap-3 no-underline group">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shadow-lg transition-transform duration-200 group-hover:scale-105"
                        style={{
                            background: 'var(--accent-gradient)',
                            boxShadow: 'var(--shadow-glow)',
                        }}>
                        ⚡
                    </div>
                    <div>
                        <span className="text-xl font-extrabold tracking-tight block"
                            style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--text-main)' }}>
                            SalesBot
                        </span>
                        <span className="text-[10px] font-bold tracking-wider uppercase block -mt-1"
                            style={{ color: 'var(--accent-primary)' }}>
                            Enterprise AI
                        </span>
                    </div>
                </Link>
            </div>

            {/* Main Navigation */}
            <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                <div className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>
                    Navigation
                </div>

                {navItems.map(item => {
                    const active = isActive(item.path);
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className="flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13.5px] font-semibold no-underline transition-all duration-200 relative group"
                            style={{
                                background: active ? 'var(--accent-gradient)' : 'transparent',
                                color: active ? '#ffffff' : 'var(--text-sub)',
                                boxShadow: active ? 'var(--shadow-glow)' : 'none',
                            }}
                        >
                            <span className={`text-lg w-6 text-center transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-110'}`}>
                                {item.icon}
                            </span>
                            <span>{item.label}</span>
                        </Link>
                    );
                })}

                <div className="pt-4 px-3 mb-2 text-[10px] font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>
                    Quick Actions
                </div>

                <Link
                    to="/products/new"
                    className="flex items-center gap-3.5 px-4 py-3 rounded-2xl text-[13.5px] font-semibold no-underline transition-all duration-200"
                    style={{
                        background: 'var(--bg-surface)',
                        color: 'var(--accent-primary)',
                        border: '1px dashed var(--border-hover)',
                    }}
                >
                    <span className="text-lg w-6 text-center">✨</span>
                    <span>Add Product</span>
                </Link>

                <div className="pt-4 px-3 mb-2 text-[10px] font-extrabold uppercase tracking-wider"
                    style={{ color: 'var(--text-muted)' }}>
                    Theme Customizer
                </div>
                <div className="px-1">
                    <ThemeDrawer />
                </div>
            </nav>

            {/* User Info Footer */}
            <div className="p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border-light)' }}>
                <div className="flex items-center gap-3 p-3 rounded-2xl"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-md"
                        style={{ background: 'var(--accent-gradient)' }}>
                        {client.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold truncate" style={{ color: 'var(--text-main)' }}>
                            {client.name || 'User'}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                            {client.email || 'user@company.com'}
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleLogout}
                    className="w-full mt-2 py-2 px-3 text-[12px] font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    style={{
                        color: 'var(--text-muted)',
                        background: 'transparent',
                        border: '1px solid transparent',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.color = '#f43f5e';
                        e.currentTarget.style.background = 'rgba(244, 63, 94, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.2)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.color = 'var(--text-muted)';
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'transparent';
                    }}
                >
                    <span>Sign out</span>
                </button>
            </div>
        </aside>
    );
}