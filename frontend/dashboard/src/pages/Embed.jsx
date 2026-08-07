import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

export default function Embed() {
    const { id } = useParams();
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    const serverUrl = 'http://localhost:5000';
    const embedCode = `<script src="${serverUrl}/agent.js" data-product-id="${id}" data-server="${serverUrl}"></script>`;

    useEffect(() => { fetchProduct(); }, [id]);

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

    const handleCopy = () => {
        navigator.clipboard.writeText(embedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) return (
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="w-7 h-7 rounded-full animate-spin" style={{ border: '2px solid rgba(124,58,237,0.2)', borderTopColor: '#a78bfa' }} />
            </main>
        </div>
    );

    return (
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 p-8 animate-fade-in">
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-2 text-[12px]">
                        <Link to="/products" style={{ color: '#5c5672' }} className="hover:text-white">Products</Link>
                        <span style={{ color: '#3d3852' }}>→</span>
                        <Link to={`/products/${id}`} style={{ color: '#5c5672' }} className="hover:text-white">{product?.name}</Link>
                        <span style={{ color: '#3d3852' }}>→</span>
                        <span className="text-white">Embed Code</span>
                    </div>
                    <h1 className="text-2xl font-bold">Embed Code</h1>
                    <p className="text-[13px] mt-1" style={{ color: '#5c5672' }}>
                        Add this one line of code to your website to activate the AI demo agent
                    </p>
                </div>

                <div className="max-w-2xl flex flex-col gap-5">
                    {product?.explorationStatus !== 'ready' && (
                        <div className="rounded-[12px] p-4 flex items-center gap-3"
                            style={{ background: 'rgba(250, 204, 21, 0.06)', border: '1px solid rgba(250, 204, 21, 0.15)', borderLeft: '3px solid #fbbf24' }}>
                            <p className="text-[13px] font-medium" style={{ color: '#fbbf24' }}>
                                ⚠️ Your product is still being explored. The embed will work once exploration is complete.
                            </p>
                        </div>
                    )}

                    {/* Code Card */}
                    <div className="glass-card p-6">
                        <h2 className="text-white font-semibold text-[14px] mb-4">Your Embed Code</h2>
                        <div className="rounded-[10px] p-4 mb-4 font-mono text-[12px] overflow-x-auto break-all"
                            style={{ background: '#0a0a14', border: '1px solid rgba(124, 58, 237, 0.2)', color: '#c4b5fd' }}>
                            <code>{embedCode}</code>
                        </div>
                        <button onClick={handleCopy}
                            className={`sb-btn-primary w-full py-3 ${copied ? '!bg-green-600' : ''}`}>
                            {copied ? '✅ Copied!' : '📋 Copy Embed Code'}
                        </button>
                    </div>

                    {/* Steps */}
                    <div className="glass-card p-6">
                        <h2 className="text-white font-semibold text-[14px] mb-4">How to add it</h2>
                        <div className="flex flex-col gap-4">
                            {[
                                { step: '01', title: 'Copy the embed code above', desc: 'Click the copy button to copy the script tag' },
                                { step: '02', title: 'Paste before </body> tag', desc: 'Open your website\'s HTML and paste the code just before closing body tag' },
                                { step: '03', title: 'That\'s it!', desc: 'A floating "Live Demo" button will appear on your website automatically' },
                            ].map(item => (
                                <div key={item.step} className="flex gap-4">
                                    <span className="font-bold text-[13px] w-6 flex-shrink-0" style={{ color: '#7c3aed' }}>{item.step}</span>
                                    <div>
                                        <p className="text-white text-[13px] font-medium">{item.title}</p>
                                        <p className="text-[12px] mt-0.5" style={{ color: '#5c5672' }}>{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="glass-card p-6">
                        <h2 className="text-white font-semibold text-[14px] mb-4">What visitors will see</h2>
                        <div className="rounded-[10px] p-8 relative min-h-32 flex items-center justify-center overflow-hidden"
                            style={{ background: '#0a0a14', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <p className="text-[13px]" style={{ color: '#3d3852' }}>Your website content here</p>
                            <div className="absolute bottom-4 right-4 text-white px-4 py-2.5 rounded-full text-[13px] font-semibold flex items-center gap-2 shadow-lg cursor-pointer"
                                style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 4px 20px rgba(124,58,237,0.4)' }}>
                                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#4ade80' }} />
                                Live Demo
                            </div>
                        </div>
                        <p className="text-[11px] mt-3 text-center" style={{ color: '#5c5672' }}>
                            A floating "Live Demo" button appears in the bottom right corner of your site
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}