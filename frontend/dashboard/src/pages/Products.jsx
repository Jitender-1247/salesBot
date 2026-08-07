import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

export default function Products() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchProducts(); }, []);

    const fetchProducts = async () => {
        try {
            const res = await api.get('/products');
            setProducts(res.data);
        } catch (err) {
            console.log('Error fetching products:', err);
        } finally {
            setLoading(false);
        }
    };

    const statusBadge = (status) => {
        const map = {
            ready: { cls: 'status-pill-green', label: '✅ Ready' },
            exploring: { cls: 'status-pill-yellow', label: '🔍 Exploring...' },
            failed: { cls: 'status-pill-red', label: '❌ Failed' },
        };
        const s = map[status] || { cls: 'status-pill-purple', label: '⏳ Pending' };
        return (
            <span className={`status-pill ${s.cls} ${status === 'exploring' ? 'animate-pulse' : ''}`}>
                {s.label}
            </span>
        );
    };

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 p-8 animate-fade-in relative z-10 space-y-8">

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
                            Products & Agents
                        </h1>
                        <p className="text-xs mt-1 font-medium" style={{ color: 'var(--text-sub)' }}>
                            Manage your AI demo applications and embed widgets
                        </p>
                    </div>
                    <Link to="/products/new" className="ultra-btn-primary no-underline text-xs">
                        + Add New Product
                    </Link>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 rounded-full animate-spin border-2 border-purple-500 border-t-transparent" />
                    </div>
                ) : products.length === 0 ? (
                    <div className="ultra-card p-16 text-center">
                        <p className="text-4xl mb-4">⚡</p>
                        <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text-main)' }}>No products yet</h3>
                        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>Add your first product to generate an AI demo agent</p>
                        <Link to="/products/new" className="ultra-btn-primary no-underline text-xs">
                            Add your first product
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {products.map(product => (
                            <div key={product._id} className="ultra-card p-5 flex items-center justify-between min-w-0">
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 shadow-md"
                                        style={{ background: 'var(--accent-gradient)', color: '#ffffff' }}>
                                        📦
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-extrabold text-sm truncate" style={{ color: 'var(--text-main)' }}>
                                            {product.name}
                                        </h3>
                                        <p className="text-xs mt-0.5 truncate font-mono" style={{ color: 'var(--text-sub)' }}>
                                            {product.url}
                                        </p>
                                        <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                            Added {new Date(product.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                                    {statusBadge(product.explorationStatus)}
                                    <Link to={`/products/${product._id}`} className="ultra-btn-secondary text-xs no-underline">
                                        View Details →
                                    </Link>
                                    <Link to={`/embed/${product._id}`} className="ultra-btn-primary text-xs no-underline py-2 px-4">
                                        Get Embed Code
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}