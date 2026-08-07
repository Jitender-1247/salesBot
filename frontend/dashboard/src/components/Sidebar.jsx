import { Link, useLocation, useNavigate } from 'react-router-dom';

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
        <aside className="w-[240px] min-h-screen flex flex-col"
            style={{
                background: '#0a0a16',
                borderRight: '1px solid rgba(255,255,255,0.05)',
            }}
        >
            {/* Brand */}
            <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <Link to="/" className="flex items-center gap-2.5 no-underline">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                        ⚡
                    </div>
                    <span className="text-[15px] font-bold tracking-tight"
                        style={{
                            background: 'linear-gradient(135deg, #c4b5fd 0%, #8b5cf6 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}>
                        SalesBot
                    </span>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
                {navItems.map(item => {
                    const active = isActive(item.path);
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium no-underline transition-all duration-150"
                            style={{
                                background: active ? 'rgba(124, 58, 237, 0.12)' : 'transparent',
                                color: active ? '#c4b5fd' : '#6b6580',
                                borderLeft: active ? '2px solid #7c3aed' : '2px solid transparent',
                            }}
                            onMouseEnter={e => {
                                if (!active) {
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                    e.currentTarget.style.color = '#b8b0c8';
                                }
                            }}
                            onMouseLeave={e => {
                                if (!active) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = '#6b6580';
                                }
                            }}
                        >
                            <span className="text-base w-5 text-center">{item.icon}</span>
                            <span>{item.label}</span>
                        </Link>
                    );
                })}

                {/* Add Product shortcut */}
                <Link
                    to="/products/new"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium no-underline mt-3 transition-all duration-150"
                    style={{
                        color: '#7c3aed',
                        border: '1px dashed rgba(124, 58, 237, 0.25)',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(124, 58, 237, 0.08)';
                        e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.4)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.25)';
                    }}
                >
                    <span className="text-base w-5 text-center">＋</span>
                    <span>Add Product</span>
                </Link>
            </nav>

            {/* User */}
            <div className="px-3 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-3 px-3 py-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                        {client.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-white truncate">{client.name}</p>
                        <p className="text-[11px] truncate" style={{ color: '#5c5672' }}>{client.email}</p>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="w-full mt-1 px-3 py-2 text-[12px] rounded-[8px] text-left transition-all duration-150 cursor-pointer"
                    style={{
                        color: '#5c5672',
                        background: 'transparent',
                        border: 'none',
                        fontFamily: 'Inter, sans-serif',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.color = '#f87171';
                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.color = '#5c5672';
                        e.currentTarget.style.background = 'transparent';
                    }}
                >
                    Sign out
                </button>
            </div>
        </aside>
    );
}