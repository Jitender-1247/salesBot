import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

export default function CallDetail() {
    const { id } = useParams();
    const [call, setCall] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchCall(); }, [id]);

    const fetchCall = async () => {
        try {
            const res = await api.get(`/calls/${id}`);
            setCall(res.data);
        } catch (err) {
            console.log('Error fetching call:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatDuration = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    const handleExportSingle = () => {
        if (!call) return;
        const lines = [
            `SalesBot Session Report`,
            `========================`,
            `Date: ${new Date(call.createdAt).toLocaleString()}`,
            `Product: ${call.productId?.name || 'Unknown'}`,
            `Prospect: ${call.prospectName || 'Anonymous'} (${call.prospectEmail || 'No email'})`,
            `Duration: ${formatDuration(call.duration || 0)}`,
            `Language: ${call.language || 'en'}`,
            `Qualified: ${call.qualified ? 'Yes' : 'No'}`,
            `Status: ${call.status}`,
            ``,
            `Transcript`,
            `----------`,
            ...(call.messages || []).map(m =>
                `[${formatTime(m.timestamp)}] ${m.role.toUpperCase()}: ${m.content}`
            )
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `session-${id}.txt`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    };

    if (loading) return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full animate-spin border-2 border-purple-500 border-t-transparent" />
            </main>
        </div>
    );

    if (!call) return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-4xl mb-4">🔍</p>
                    <h1 className="text-xl font-semibold text-white mb-2">Session not found</h1>
                    <Link to="/" className="text-xs font-semibold text-purple-400">← Back to Dashboard</Link>
                </div>
            </main>
        </div>
    );

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 p-8 overflow-y-auto animate-fade-in relative z-10 space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-2 text-xs font-semibold" style={{ color: 'var(--text-sub)' }}>
                            <Link to="/" className="hover:text-white">Dashboard</Link>
                            <span>→</span>
                            <span style={{ color: 'var(--text-main)' }}>Session Detail</span>
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
                            {call.prospectName || 'Anonymous Visitor'}
                        </h1>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>
                            {call.prospectEmail || 'No email captured'}
                        </p>
                    </div>
                    <button onClick={handleExportSingle} className="ultra-btn-secondary text-xs">
                        📄 Export Transcript
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-6">
                    {/* Metadata Card */}
                    <div className="ultra-card p-6 flex flex-col gap-3">
                        <h2 className="font-bold text-sm mb-2" style={{ color: 'var(--text-main)' }}>Session Overview</h2>
                        {[
                            { label: 'Product', val: call.productId?.name || 'Unknown' },
                            { label: 'Date', val: new Date(call.createdAt).toLocaleString() },
                            { label: 'Duration', val: formatDuration(call.duration || 0) },
                            { label: 'Status', val: <span className={`status-pill ${call.status === 'completed' ? 'status-pill-green' : 'status-pill-purple'}`}>{call.status}</span> },
                            { label: 'Qualified Lead', val: <span className={`status-pill ${call.qualified ? 'status-pill-green' : 'status-pill-purple'}`}>{call.qualified ? 'Yes' : 'No'}</span> },
                            { label: 'Language', val: <span className="uppercase text-xs font-mono font-bold">{call.language || 'en'}</span> },
                        ].map((item, i) => (
                            <div key={i} className="flex justify-between items-center text-xs">
                                <span style={{ color: 'var(--text-sub)' }}>{item.label}</span>
                                <span className="font-semibold" style={{ color: 'var(--text-main)' }}>{item.val}</span>
                            </div>
                        ))}
                    </div>

                    {/* Sentiment Card */}
                    <div className="ultra-card p-6">
                        <h2 className="font-bold text-sm mb-4" style={{ color: 'var(--text-main)' }}>Visitor Sentiment</h2>
                        {call.satisfaction ? (
                            <div>
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-3xl">
                                        {call.satisfaction === 'positive' ? '🙂' : call.satisfaction === 'negative' ? '🙁' : '😐'}
                                    </span>
                                    <div>
                                        <p className="font-bold text-sm capitalize" style={{ color: 'var(--text-main)' }}>{call.satisfaction}</p>
                                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Sensed from transcript</p>
                                    </div>
                                </div>
                                {call.satisfactionReason && (
                                    <p className="text-xs leading-relaxed p-3 rounded-xl"
                                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-sub)' }}>
                                        "{call.satisfactionReason}"
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sentiment analysis pending or unavailable</p>
                        )}
                    </div>

                    {/* Summary Card */}
                    <div className="ultra-card p-6">
                        <h2 className="font-bold text-sm mb-4" style={{ color: 'var(--text-main)' }}>AI Call Summary</h2>
                        {call.summary ? (
                            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-sub)' }}>{call.summary}</p>
                        ) : (
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No summary generated for this session</p>
                        )}
                    </div>
                </div>

                {/* Transcript */}
                <div className="ultra-card p-6">
                    <h2 className="font-bold text-sm mb-6" style={{ color: 'var(--text-main)' }}>
                        Conversation Transcript
                        <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>
                            ({call.messages?.length || 0} messages)
                        </span>
                    </h2>

                    {!call.messages || call.messages.length === 0 ? (
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No messages recorded for this session</p>
                    ) : (
                        <div className="space-y-4">
                            {call.messages.map((m, i) => {
                                const isUser = m.role === 'user';
                                return (
                                    <div key={i} className={`flex gap-3 max-w-[80%] ${isUser ? 'ml-auto flex-row-reverse' : ''}`}>
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 font-bold shadow-md"
                                            style={{
                                                background: isUser ? 'rgba(139, 92, 246, 0.2)' : 'var(--accent-gradient)',
                                                color: isUser ? 'var(--accent-primary)' : '#ffffff',
                                            }}>
                                            {isUser ? '👤' : '⚡'}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>
                                                    {isUser ? (call.prospectName || 'Visitor') : 'Sofia'}
                                                </span>
                                                <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                                    {formatTime(m.timestamp)}
                                                </span>
                                            </div>
                                            <div className="p-3.5 rounded-2xl text-xs leading-relaxed"
                                                style={{
                                                    background: isUser ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-input)',
                                                    border: `1px solid ${isUser ? 'rgba(139, 92, 246, 0.3)' : 'var(--border-light)'}`,
                                                    color: 'var(--text-main)',
                                                }}>
                                                {m.content}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}