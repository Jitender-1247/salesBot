import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import api from '../api';

export default function CallDetail() {
    const { id } = useParams();
    const [call, setCall] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCall();
    }, [id]);

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
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
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

    if (loading) {
        return (
            <div className="flex min-h-screen bg-[#0f0f0f]">
                <Sidebar />
                <main className="flex-1 p-8 flex items-center justify-center">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </main>
            </div>
        );
    }

    if (!call) {
        return (
            <div className="flex min-h-screen bg-[#0f0f0f]">
                <Sidebar />
                <main className="flex-1 p-8">
                    <p className="text-gray-500">Session not found</p>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-[#0f0f0f]">
            <Sidebar />
            <main className="flex-1 p-8 overflow-y-auto">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <Link to={`/bots/salesbot/${call.productId?._id}`} className="text-gray-500 hover:text-white text-sm transition-colors">
                                {call.productId?.name || 'Bot Dashboard'}
                            </Link>
                            <span className="text-gray-600">→</span>
                            <span className="text-white text-sm">
                                {call.prospectName || 'Anonymous visitor'}
                            </span>
                        </div>
                        <h1 className="text-2xl font-bold text-white">Session Detail</h1>
                        <p className="text-gray-500 mt-1">
                            {new Date(call.createdAt).toLocaleString()}
                        </p>
                    </div>
                    <button
                        onClick={handleExportSingle}
                        className="flex items-center gap-2 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-indigo-500 text-gray-300 hover:text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                    >
                        📥 Export Session
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-6 mb-6">

                    {/* Session Info */}
                    <div className="col-span-1 space-y-4">

                        {/* Prospect card */}
                        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
                            <h2 className="text-white font-semibold mb-4">Prospect</h2>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-12 h-12 bg-indigo-950 rounded-full flex items-center justify-center text-xl">
                                    👤
                                </div>
                                <div>
                                    <p className="text-white font-medium">
                                        {call.prospectName || 'Anonymous visitor'}
                                    </p>
                                    <p className="text-gray-500 text-sm">
                                        {call.prospectEmail || 'No email captured'}
                                    </p>
                                </div>
                            </div>
                            <div className={`text-center py-2 rounded-lg text-sm font-medium ${call.qualified
                                ? 'bg-green-950 text-green-400'
                                : 'bg-gray-800 text-gray-400'
                                }`}>
                                {call.qualified ? '✅ Qualified Lead' : 'Not Qualified'}
                            </div>
                        </div>

                        {/* Session stats */}
                        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-5">
                            <h2 className="text-white font-semibold mb-4">Session Stats</h2>
                            <div className="space-y-3">
                                {[
                                    { label: 'Product', value: call.productId?.name || 'Unknown' },
                                    { label: 'Duration', value: formatDuration(call.duration || 0) },
                                    { label: 'Language', value: (call.language || 'en').toUpperCase() },
                                    { label: 'Messages', value: `${call.messages?.length || 0} total` },
                                    { label: 'Status', value: call.status },
                                    {
                                        label: 'Satisfaction',
                                        value: call.satisfaction === 'positive' ? '🙂 Positive'
                                            : call.satisfaction === 'negative' ? '🙁 Negative'
                                                : call.satisfaction === 'neutral' ? '😐 Neutral'
                                                    : '❔ Unclear'
                                    },
                                ].map(item => (
                                    <div key={item.label} className="flex justify-between items-center">
                                        <span className="text-gray-500 text-sm">{item.label}</span>
                                        <span className="text-white text-sm font-medium">{item.value}</span>
                                    </div>
                                ))}
                            </div>
                            {call.satisfactionReason && (
                                <p className="text-gray-600 text-xs mt-4 pt-4 border-t border-[#2a2a2a] leading-relaxed">
                                    {call.satisfactionReason}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Transcript Timeline */}
                    <div className="col-span-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6">
                        <h2 className="text-white font-semibold mb-6">
                            Conversation Transcript
                            <span className="text-gray-500 text-sm font-normal ml-2">
                                ({call.messages?.length || 0} messages)
                            </span>
                        </h2>

                        {!call.messages || call.messages.length === 0 ? (
                            <div className="text-center py-16">
                                <p className="text-4xl mb-3">💬</p>
                                <p className="text-gray-500 text-sm">No transcript available for this session</p>
                                {call.transcript && (
                                    <div className="mt-4 bg-[#0f0f0f] rounded-lg p-4 text-left">
                                        <p className="text-gray-400 text-sm whitespace-pre-wrap">{call.transcript}</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                                {call.messages.map((msg, i) => (
                                    <div
                                        key={i}
                                        className={`flex gap-3 ${msg.role === 'agent' ? 'flex-row' : 'flex-row-reverse'}`}
                                    >
                                        {/* Avatar */}
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${msg.role === 'agent'
                                            ? 'bg-indigo-600'
                                            : 'bg-gray-700'
                                            }`}>
                                            {msg.role === 'agent' ? '🤖' : '👤'}
                                        </div>

                                        {/* Message */}
                                        <div className={`max-w-lg ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                                            <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'agent'
                                                ? 'bg-[#0f0f0f] text-gray-200 rounded-tl-sm'
                                                : 'bg-indigo-600 text-white rounded-tr-sm'
                                                }`}>
                                                {msg.content}
                                            </div>
                                            <span className="text-gray-600 text-xs mt-1 px-1">
                                                {msg.role === 'agent' ? 'Alex' : 'Visitor'} • {formatTime(msg.timestamp)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}