import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

export default function Products() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProducts();
    }, []);

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

    return (
        <div className="flex min-h-screen bg-[#0f0f0f]">
            <Sidebar />

            <main className="flex-1 min-w-0 overflow-x-hidden p-8">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Products</h1>
                        <p className="text-gray-500 mt-1">Manage your AI demo agents</p>
                    </div>
                    <Link
                        to="/products/new"
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm"
                    >
                        + Add Product
                    </Link>
                </div>

                {/* Products List */}
                {loading ? (
                    <div className="text-gray-500 text-sm">Loading...</div>
                ) : products.length === 0 ? (
                    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-16 text-center">
                        <p className="text-4xl mb-4">⚡</p>
                        <h3 className="text-lg font-semibold text-white mb-2">No products yet</h3>
                        <p className="text-gray-500 text-sm mb-6">Add your first product to get started</p>
                        <Link
                            to="/products/new"
                            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors text-sm"
                        >
                            Add your first product
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {products.map(product => (
                            <div
                                key={product._id}
                                className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 flex items-center justify-between hover:border-indigo-500 transition-colors min-w-0"
                            >
                                <div className="flex items-center gap-4 min-w-0 flex-1">
                                    <div className="w-12 h-12 bg-indigo-950 rounded-xl flex items-center justify-center text-2xl">
                                        ⚙
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-white font-semibold">{product.name}</h3>
                                        <p className="text-gray-500 text-sm mt-0.5 truncate">{product.url}</p>
                                        <p className="text-gray-600 text-xs mt-1">
                                            Added {new Date(product.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                                    <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${product.explorationStatus === 'ready'
                                            ? 'bg-green-950 text-green-400'
                                            : product.explorationStatus === 'exploring'
                                                ? 'bg-yellow-950 text-yellow-400 animate-pulse'
                                                : product.explorationStatus === 'failed'
                                                    ? 'bg-red-950 text-red-400'
                                                    : 'bg-gray-800 text-gray-400'
                                        }`}>
                                        {product.explorationStatus === 'exploring' ? '🔍 Exploring...' :
                                            product.explorationStatus === 'ready' ? '✅ Ready' :
                                                product.explorationStatus === 'failed' ? '❌ Failed' : '⏳ Pending'}
                                    </span>

                                    <Link
                                        to={`/products/${product._id}`}
                                        className="text-sm text-indigo-400 hover:text-indigo-300 font-medium"
                                    >
                                        View →
                                    </Link>

                                    <Link
                                        to={`/embed/${product._id}`}
                                        className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors font-medium"
                                    >
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