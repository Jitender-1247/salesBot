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
            ready: { cls: 'sb-badge-green', label: '✅ Ready' },
            exploring: { cls: 'sb-badge-yellow', label: '🔍 Exploring...' },
            failed: { cls: 'sb-badge-red', label: '❌ Failed' },
        };
        const s = map[status] || { cls: 'sb-badge-gray', label: '⏳ Pending' };
        return <span className={`sb-badge ${s.cls} ${status === 'exploring' ? 'animate-pulse' : ''}`}>{s.label}</span>;
    };

    return (
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-x-hidden p-8 animate-fade-in">

                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold">Products</h1>
                        <p className="mt-1" style={{ color: '#5c5672', fontSize: '13px' }}>
                            Manage your AI demo agents
                        </p>
                    </div>
                    <Link to="/products/new" className="sb-btn-primary no-underline">
                        + Add Product
                    </Link>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-7 h-7 rounded-full animate-spin"
                            style={{ border: '2px solid rgba(124,58,237,0.2)', borderTopColor: '#a78bfa' }} />
                    </div>
                ) : products.length === 0 ? (
                    <div className="glass-card p-16 text-center">
                        <p className="text-4xl mb-4">⚡</p>
                        <h3 className="text-lg font-semibold text-white mb-2">No products yet</h3>
                        <p className="text-[13px] mb-6" style={{ color: '#5c5672' }}>Add your first product to get started</p>
                        <Link to="/products/new" className="sb-btn-primary no-underline">
                            Add your first product
                        </Link>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3 stagger">
                        {products.map(product => (
                            <div key={product._id}
                                className="glass-card p-5 flex items-center justify-between min-w-0 animate-slide-up">
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                    <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                                        style={{ background: 'rgba(124, 58, 237, 0.12)' }}>
                                        📦
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-white font-semibold text-[14px]">{product.name}</h3>
                                        <p className="text-[12px] mt-0.5 truncate" style={{ color: '#5c5672' }}>{product.url}</p>
                                        <p className="text-[11px] mt-1" style={{ color: '#3d3852' }}>
                                            Added {new Date(product.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                                    {statusBadge(product.explorationStatus)}
                                    <Link to={`/products/${product._id}`}
                                        className="sb-btn-ghost text-[12px] no-underline">
                                        View →
                                    </Link>
                                    <Link to={`/embed/${product._id}`}
                                        className="sb-btn-primary text-[12px] no-underline py-2 px-4">
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