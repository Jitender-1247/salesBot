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
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="w-7 h-7 rounded-full animate-spin" style={{ border: '2px solid rgba(124,58,237,0.2)', borderTopColor: '#a78bfa' }} />
            </main>
        </div>
    );

    if (!call) return (
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 p-8 flex items-center justify-center">
                <div className="text-center">
                    <p className="text-4xl mb-4">🔍</p>
                    <h1 className="text-xl font-semibold text-white mb-2">Session not found</h1>
                    <Link to="/" className="text-[13px] font-medium">← Back to Dashboard</Link>
                </div>
            </main>
        </div>
    );

    return (
        <div className="flex min-h-screen" style={{ background: '#07070f' }}>
            <Sidebar />
            <main className="flex-1 min-w-0 p-8 overflow-y-auto animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-2 mb-2 text-[12px]">
                            <Link to="/" style={{ color: '#5c5672' }} className="hover:text-white">Dashboard</Link>
                            <span style={{ color: '#3d3852' }}>→</span>
                            <span className="text-white">Session Detail</span>
                        </div>
                        <h1 className="text-2xl font-bold">
                            {call.prospectName || 'Anonymous Visitor'}
                        </h1>
                        <p className="text-[13px] mt-1" style={{ color: '#5c5672' }}>
                            {call.prospectEmail || 'No email captured'}
                        </p>
                    </div>
                    <button onClick={handleExportSingle} className="sb-btn-ghost text-[13px]">
                        📄 Export Transcript
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-5 mb-8">
                    {/* Metadata Card */}
                    <div className="glass-card p-6 flex flex-col gap-3">
                        <h2 className="text-white font-semibold text-[14px] mb-2">Session Overview</h2>
                        {[
                            { label: 'Product', val: call.productId?.name || 'Unknown' },
                            { label: 'Date', val: new Date(call.createdAt).toLocaleString() },
                            { label: 'Duration', val: formatDuration(call.duration || 0) },
                            { label: 'Status', val: <span className={`sb-badge ${call.status === 'completed' ? 'sb-badge-green' : 'sb-badge-gray'}`}>{call.status}</span> },
                            { label: 'Qualified Lead', val: <span className={`sb-badge ${call.qualified ? 'sb-badge-green' : 'sb-badge-gray'}`}>{call.qualified ? 'Yes' : 'No'}</span> },
                            { label: 'Language', val: <span className="uppercase text-[11px] font-mono">{call.language || 'en'}</span> },
                        ].map((item, i) => (
                            <div key={i} className="flex justify-between items-center text-[13px]">
                                <span style={{ color: '#5c5672' }}>{item.label}</span>
                                <span className="font-medium text-white">{item.val}</span>
                            </div>
                        ))}
                    </div>

                    {/* Satisfaction Card */}
                    <div className="glass-card p-6">
                        <h2 className="text-white font-semibold text-[14px] mb-4">Visitor Sentiment</h2>
                        {call.satisfaction ? (
                            <div>
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-3xl">
                                        {call.satisfaction === 'positive' ? '🙂' : call.satisfaction === 'negative' ? '🙁' : '😐'}
                                    </span>
                                    <div>
                                        <p className="text-white font-semibold text-[15px] capitalize">{call.satisfaction}</p>
                                        <p className="text-[11px]" style={{ color: '#5c5672' }}>Sensed from transcript</p>
                                    </div>
                                </div>
                                {call.satisfactionReason && (
                                    <p className="text-[12px] leading-relaxed p-3 rounded-[8px]" style={{ background: '#0a0a14', color: '#9892a6' }}>
                                        "{call.satisfactionReason}"
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-[13px]" style={{ color: '#3d3852' }}>Sentiment analysis pending or unavailable</p>
                        )}
                    </div>

                    {/* Summary Card */}
                    <div className="glass-card p-6">
                        <h2 className="text-white font-semibold text-[14px] mb-4">AI Call Summary</h2>
                        {call.summary ? (
                            <p className="text-[13px] leading-relaxed" style={{ color: '#9892a6' }}>{call.summary}</p>
                        ) : (
                            <p className="text-[13px]" style={{ color: '#3d3852' }}>No summary generated for this session</p>
                        )}
                    </div>
                </div>

                {/* Transcript */}
                <div className="glass-card p-6">
                    <h2 className="text-white font-semibold text-[14px] mb-6">
                        Conversation Transcript
                        <span className="text-[12px] font-normal ml-2" style={{ color: '#5c5672' }}>
                            ({call.messages?.length || 0} messages)
                        </span>
                    </h2>

                    {!call.messages || call.messages.length === 0 ? (
                        <p className="text-[13px]" style={{ color: '#3d3852' }}>No messages recorded for this session</p>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {call.messages.map((m, i) => {
                                const isUser = m.role === 'user';
                                return (
                                    <div key={i} className={`flex gap-3 max-w-[80%] ${isUser ? 'ml-auto flex-row-reverse' : ''}`}>
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs flex-shrink-0 font-bold"
                                            style={{
                                                background: isUser ? 'rgba(124, 58, 237, 0.2)' : 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                                                color: isUser ? '#c4b5fd' : 'white',
                                            }}>
                                            {isUser ? '👤' : '⚡'}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[11px] font-semibold" style={{ color: isUser ? '#c4b5fd' : '#a78bfa' }}>
                                                    {isUser ? (call.prospectName || 'Visitor') : 'Sofia'}
                                                </span>
                                                <span className="text-[10px]" style={{ color: '#3d3852' }}>
                                                    {formatTime(m.timestamp)}
                                                </span>
                                            </div>
                                            <div className="p-3.5 rounded-[12px] text-[13px] leading-relaxed"
                                                style={{
                                                    background: isUser ? 'rgba(124, 58, 237, 0.12)' : '#0a0a14',
                                                    border: `1px solid ${isUser ? 'rgba(124, 58, 237, 0.25)' : 'rgba(255,255,255,0.05)'}`,
                                                    color: '#f0eef5',
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