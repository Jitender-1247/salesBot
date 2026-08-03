import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

export default function ProductDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        fetchProduct();
        // Poll status if exploring
        const interval = setInterval(() => {
            if (product?.explorationStatus === 'exploring') {
                fetchProduct();
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [id]);

    const fetchProduct = async () => {
        try {
            const res = await api.get(`/products/${id}`);
            setProduct(res.data);
        } catch (err) {
            console.log('Error fetching product:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        const confirmed = window.confirm(
            `Remove "${product.name}"? This will permanently delete this bot along with all of its conversations and leads. This can't be undone.`
        );
        if (!confirmed) return;

        try {
            setDeleting(true);
            await api.delete(`/products/${id}`);
            navigate('/products');
        } catch (err) {
            console.log('Error deleting product:', err);
            setDeleting(false);
            alert('Failed to remove the bot. Please try again.');
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-screen bg-[#0f0f0f]">
                <Sidebar />
                <main className="flex-1 p-8">
                    <p className="text-gray-500">Loading...</p>
                </main>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="flex min-h-screen bg-[#0f0f0f]">
                <Sidebar />
                <main className="flex-1 p-8">
                    <p className="text-gray-500">Product not found</p>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-[#0f0f0f]">
            <Sidebar />

            <main className="flex-1 p-8">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <Link to="/products" className="text-gray-500 hover:text-white text-sm">
                                Products
                            </Link>
                            <span className="text-gray-600">→</span>
                            <span className="text-white text-sm">{product.name}</span>
                        </div>
                        <h1 className="text-2xl font-bold text-white">{product.name}</h1>
                        <p className="text-gray-500 text-sm mt-1">{product.url}</p>
                    </div>
                    <Link
                        to={`/embed/${id}`}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm"
                    >
                        Get Embed Code
                    </Link>
                </div>

                {/* Status Banner */}
                {product.explorationStatus === 'exploring' && (
                    <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-4 mb-6 flex items-center gap-3">
                        <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                        <p className="text-yellow-400 text-sm font-medium">
                            AI agent is exploring your product... This usually takes 2-5 minutes.
                        </p>
                    </div>
                )}

                {product.explorationStatus === 'failed' && (
                    <div className="bg-red-950 border border-red-800 rounded-xl p-4 mb-6">
                        <p className="text-red-400 text-sm font-medium">
                            ❌ Exploration failed. Please check your credentials and try again.
                        </p>
                    </div>
                )}

                {product.explorationStatus === 'ready' && (
                    <div className="bg-green-950 border border-green-800 rounded-xl p-4 mb-6">
                        <p className="text-green-400 text-sm font-medium">
                            ✅ Agent is ready! Embed it on your website to start getting demos.
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-6">

                    {/* Product Summary */}
                    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
                        <h2 className="text-white font-semibold mb-4">Product Summary</h2>
                        {product.knowledgeMap?.productSummary ? (
                            <p className="text-gray-400 text-sm leading-relaxed">
                                {product.knowledgeMap.productSummary}
                            </p>
                        ) : (
                            <p className="text-gray-600 text-sm">
                                Summary will appear after exploration completes
                            </p>
                        )}
                    </div>

                    {/* Stats */}
                    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
                        <h2 className="text-white font-semibold mb-4">Exploration Stats</h2>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500 text-sm">Status</span>
                                <span className={`text-sm font-medium px-2 py-1 rounded-full ${product.explorationStatus === 'ready'
                                    ? 'bg-green-950 text-green-400'
                                    : product.explorationStatus === 'exploring'
                                        ? 'bg-yellow-950 text-yellow-400'
                                        : product.explorationStatus === 'failed'
                                            ? 'bg-red-950 text-red-400'
                                            : 'bg-gray-800 text-gray-400'
                                    }`}>
                                    {product.explorationStatus}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500 text-sm">Pages Mapped</span>
                                <span className="text-white text-sm font-medium">
                                    {product.knowledgeMap?.pages?.length || 0}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500 text-sm">Added</span>
                                <span className="text-white text-sm font-medium">
                                    {new Date(product.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Knowledge Map */}
                    {product.knowledgeMap?.pages?.length > 0 && (
                        <div className="col-span-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
                            <h2 className="text-white font-semibold mb-4">
                                Knowledge Map
                                <span className="text-gray-500 text-sm font-normal ml-2">
                                    ({product.knowledgeMap.pages.length} pages explored)
                                </span>
                            </h2>
                            <div className="grid grid-cols-2 gap-3">
                                {product.knowledgeMap.pages.map((page, i) => (
                                    <div
                                        key={i}
                                        className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-lg p-4"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-indigo-400 text-xs font-bold">
                                                {String(i + 1).padStart(2, '0')}
                                            </span>
                                            <h3 className="text-white text-sm font-medium">{page.name}</h3>
                                        </div>
                                        <p className="text-gray-500 text-xs leading-relaxed mb-3">
                                            {page.description}
                                        </p>
                                        {page.keyFeatures?.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {page.keyFeatures.slice(0, 3).map((feature, j) => (
                                                    <span
                                                        key={j}
                                                        className="text-xs bg-indigo-950 text-indigo-400 px-2 py-0.5 rounded-full"
                                                    >
                                                        {feature}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Danger Zone */}
                <div className="mt-8 bg-[#1a1a1a] border border-red-900/40 rounded-xl p-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-white font-semibold">Remove this bot</h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Permanently deletes this bot along with all of its conversations and leads. This can't be undone.
                        </p>
                    </div>
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="bg-red-950 border border-red-800 hover:bg-red-900 text-red-400 font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                        {deleting ? 'Removing...' : '🗑 Remove Bot'}
                    </button>
                </div>
            </main>
        </div>
    );
}