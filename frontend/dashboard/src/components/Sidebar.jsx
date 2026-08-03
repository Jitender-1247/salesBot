import { Link, useLocation, useNavigate } from 'react-router-dom';

const navItems = [
    { path: '/', icon: '🤖', label: 'Bots' },
    { path: '/products', icon: '⚙', label: 'Products' },
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

    return (
        <div className="w-64 min-h-screen bg-[#1a1a1a] border-r border-[#2a2a2a] flex flex-col">
            <div className="px-6 py-6 border-b border-[#2a2a2a]">
                <span className="text-xl font-black text-indigo-500">⚡ SalesBot</span>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
                {navItems.map(item => {
                    const isActive = location.pathname === item.path;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${isActive
                                ? 'bg-indigo-600 text-white'
                                : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                                }`}
                        >
                            <span>{item.icon}</span>
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
                <Link
                    to="/products/new"
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-indigo-400 hover:bg-indigo-950 hover:text-indigo-300 transition-colors mt-4"
                >
                    <span>+</span>
                    <span>Add Product</span>
                </Link>
            </nav>
            <div className="px-3 py-4 border-t border-[#2a2a2a]">
                <div className="flex items-center gap-3 px-4 py-3 rounded-lg">
                    <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                        {client.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{client.name}</p>
                        <p className="text-xs text-gray-500 truncate">{client.email}</p>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="w-full mt-2 px-4 py-2 text-sm text-gray-500 hover:text-red-400 hover:bg-red-950 rounded-lg transition-colors text-left"
                >
                    Sign out
                </button>
            </div>
        </div>
    );
}