import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Room, RoomEvent, Track } from 'livekit-client';
import Sidebar from '../components/Sidebar';

const BACKEND_URL = import.meta.env.PROD
    ? ''
    : (import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000');

const NAME_KEY = 'liveConsoleName';

function beep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch { /* audio blocked until the page is interacted with */ }
}

const reasonLabel = {
    visitor_request: 'Visitor asked for a human',
    ai_escalation: 'AI escalated',
    human_first: 'Human-first routing',
    agent_initiated: 'Joined by specialist'
};

/** Human specialists: get paged on handover requests, take over calls with camera + mic, chat, hand back. */
export default function LiveConsole() {
    const client = JSON.parse(localStorage.getItem('client') || '{}');
    const [displayName, setDisplayName] = useState(() => localStorage.getItem(NAME_KEY) || client.name || '');
    const [online, setOnline] = useState(false);
    const [authError, setAuthError] = useState('');
    const [agentsOnline, setAgentsOnline] = useState(0);
    const [calls, setCalls] = useState([]); // console snapshots
    const [session, setSession] = useState(null); // call this specialist has taken
    const [sessionMessages, setSessionMessages] = useState([]);
    const [sessionEnded, setSessionEnded] = useState(false);
    const [draft, setDraft] = useState('');
    const [micOn, setMicOn] = useState(true);
    const [camOn, setCamOn] = useState(true);
    const [mediaError, setMediaError] = useState('');

    const socketRef = useRef(null);
    const roomRef = useRef(null);
    const localVideoRef = useRef(null);
    const audioContainerRef = useRef(null);
    const messagesEndRef = useRef(null);
    const sessionRef = useRef(null);
    useEffect(() => { sessionRef.current = session; }, [session]);

    const upsertCall = useCallback((snapshot) => {
        setCalls(prev => {
            const rest = prev.filter(c => c.callId !== snapshot.callId);
            return [snapshot, ...rest];
        });
    }, []);

    const patchCall = useCallback((callId, patch) => {
        setCalls(prev => prev.map(c => (c.callId === callId ? { ...c, ...patch } : c)));
    }, []);

    const leaveRoom = useCallback(async () => {
        const room = roomRef.current;
        roomRef.current = null;
        if (room) await room.disconnect();
        if (audioContainerRef.current) audioContainerRef.current.innerHTML = '';
    }, []);

    // ── Socket ──
    const goOnline = () => {
        const name = displayName.trim();
        if (!name) return;
        localStorage.setItem(NAME_KEY, name);
        setAuthError('');

        const s = io(BACKEND_URL, { transports: ['websocket', 'polling'] });
        socketRef.current = s;

        const auth = () => s.emit('agent-auth', { token: localStorage.getItem('token'), name }, (res) => {
            if (!res?.ok) {
                setAuthError(res?.message || 'Could not go online');
                s.disconnect();
                setOnline(false);
                return;
            }
            setOnline(true);
            setCalls(res.calls || []);
            setAgentsOnline(res.agentsOnline || 1);
        });

        s.on('connect', auth); // also re-authenticates after a reconnect

        s.on('agents-online', ({ count }) => setAgentsOnline(count));

        s.on('handover-requested', (snapshot) => {
            upsertCall(snapshot);
            beep();
            if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
                new Notification('Visitor waiting for a specialist', { body: `${snapshot.prospectName || 'A visitor'} on ${snapshot.productName}` });
            }
        });
        s.on('handover-cancelled', ({ callId }) => patchCall(callId, { state: 'none' }));
        s.on('handover-taken', ({ callId, humanName }) => patchCall(callId, { state: 'human', humanName }));
        s.on('call-ended', ({ callId }) => {
            setCalls(prev => prev.filter(c => c.callId !== callId));
            if (sessionRef.current?.callId === callId) {
                setSessionEnded(true);
                leaveRoom();
            }
        });
        s.on('call-message', (msg) => {
            if (sessionRef.current?.callId === msg.callId) {
                setSessionMessages(prev => [...prev, { ...msg, timestamp: new Date() }]);
            }
        });

        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    };

    const goOffline = async () => {
        await leaveRoom();
        socketRef.current?.disconnect();
        socketRef.current = null;
        setOnline(false);
        setSession(null);
        setCalls([]);
    };

    // Refresh the list of live calls (new AI conversations don't page anyone)
    useEffect(() => {
        if (!online) return;
        const t = setInterval(() => {
            socketRef.current?.emit('agent-list-calls', {}, (res) => {
                if (res?.ok) {
                    setCalls(res.calls);
                    setAgentsOnline(res.agentsOnline);
                }
            });
        }, 8000);
        return () => clearInterval(t);
    }, [online]);

    useEffect(() => () => {
        roomRef.current?.disconnect();
        socketRef.current?.disconnect();
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [sessionMessages]);

    // ── Taking a call ──
    const joinMedia = async (livekitUrl, token) => {
        setMediaError('');
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track) => {
            // Hear the visitor (and anything else in the room); the avatar is silenced server-side
            if (track.kind === Track.Kind.Audio && audioContainerRef.current) {
                audioContainerRef.current.appendChild(track.attach());
            }
        });
        room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach(el => el.remove()));

        await room.connect(livekitUrl, token);
        try {
            await room.localParticipant.enableCameraAndMicrophone();
        } catch (err) {
            setMediaError(`Camera/microphone unavailable (${err.message}). You can still chat by text.`);
            try { await room.localParticipant.setMicrophoneEnabled(true); } catch { /* text only */ }
        }
        const cam = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
        if (cam && localVideoRef.current) cam.attach(localVideoRef.current);
        setMicOn(room.localParticipant.isMicrophoneEnabled);
        setCamOn(room.localParticipant.isCameraEnabled);
    };

    const acceptCall = (callId) => {
        socketRef.current?.emit('agent-accept', { callId }, async (res) => {
            if (!res?.ok) {
                alert(res?.message || 'Could not take this call');
                return;
            }
            const { token, livekitUrl, messages, ...snapshot } = res.session;
            setSession(snapshot);
            setSessionMessages(messages || []);
            setSessionEnded(false);
            patchCall(callId, { state: 'human', humanName: displayName });
            try {
                await joinMedia(livekitUrl, token);
            } catch (err) {
                setMediaError(`Could not join the video room: ${err.message}`);
            }
        });
    };

    const sendMessage = (e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text || !session) return;
        socketRef.current?.emit('agent-message', { callId: session.callId, text });
        setDraft('');
    };

    const closeSession = async (event) => {
        if (session && !sessionEnded) socketRef.current?.emit(event, { callId: session.callId });
        await leaveRoom();
        setSession(null);
        setSessionMessages([]);
    };

    const toggleMic = async () => {
        const lp = roomRef.current?.localParticipant;
        if (!lp) return;
        await lp.setMicrophoneEnabled(!micOn);
        setMicOn(!micOn);
    };

    const toggleCam = async () => {
        const lp = roomRef.current?.localParticipant;
        if (!lp) return;
        await lp.setCameraEnabled(!camOn);
        setCamOn(!camOn);
        const cam = lp.getTrackPublication(Track.Source.Camera)?.track;
        if (cam && localVideoRef.current) cam.attach(localVideoRef.current);
    };

    const waiting = calls.filter(c => c.state === 'requested');
    const live = calls.filter(c => c.state !== 'requested');

    const callRow = (c, action) => (
        <div key={c.callId} className="p-4 rounded-xl space-y-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)' }}>
            <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: 'var(--text-main)' }}>{c.prospectName || 'Anonymous visitor'}</p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--text-sub)' }}>{c.prospectEmail || 'no email'} · {c.productName}</p>
                </div>
                {action}
            </div>
            {c.state === 'requested' && (
                <span className="status-pill status-pill-yellow text-[10px]">{reasonLabel[c.reason] || 'Waiting'}</span>
            )}
            {c.state === 'human' && <span className="status-pill status-pill-green text-[10px]">With {c.humanName}</span>}
            {c.state === 'none' && <span className="status-pill status-pill-purple text-[10px]">With {c.agentName} (AI)</span>}
            {c.messages?.length > 0 && (
                <p className="text-[11px] italic truncate" style={{ color: 'var(--text-muted)' }}>
                    “{c.messages[c.messages.length - 1].content}”
                </p>
            )}
        </div>
    );

    return (
        <div className="flex min-h-screen">
            <Sidebar />
            <main className="flex-1 min-w-0 p-8 overflow-y-auto animate-fade-in relative z-10 space-y-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: 'var(--text-main)', fontFamily: 'Outfit, sans-serif' }}>
                            Live Console
                        </h1>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>
                            Take over AI video calls when a visitor needs a human. Keep this tab open to receive requests.
                        </p>
                    </div>
                    {online ? (
                        <div className="flex items-center gap-3">
                            <span className="status-pill status-pill-green">● Online · {agentsOnline} specialist{agentsOnline === 1 ? '' : 's'}</span>
                            <button className="ultra-btn-secondary text-xs" onClick={goOffline}>Go offline</button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <input className="ultra-input text-xs" style={{ width: 200 }} placeholder="Your display name" value={displayName} onChange={e => setDisplayName(e.target.value)} />
                            <button className="ultra-btn-primary text-xs" disabled={!displayName.trim()} onClick={goOnline}>Go online</button>
                        </div>
                    )}
                </div>

                {authError && <p className="text-xs font-semibold" style={{ color: '#f43f5e' }}>{authError}</p>}

                {!online ? (
                    <div className="ultra-card p-10 text-center">
                        <p className="text-sm font-bold" style={{ color: 'var(--text-main)' }}>You're offline</p>
                        <p className="text-xs mt-2" style={{ color: 'var(--text-sub)' }}>
                            While at least one specialist is online, the AI offers visitors a human and pages this console.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-6" style={{ gridTemplateColumns: 'minmax(260px, 340px) 1fr' }}>
                        {/* Queue */}
                        <div className="space-y-6">
                            <div className="ultra-card p-5 space-y-3">
                                <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>🙋 Waiting ({waiting.length})</h2>
                                {waiting.length === 0
                                    ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No one is waiting.</p>
                                    : waiting.map(c => callRow(c,
                                        <button className="ultra-btn-primary text-xs flex-shrink-0" disabled={Boolean(session)} onClick={() => acceptCall(c.callId)}>Accept</button>
                                    ))}
                            </div>
                            <div className="ultra-card p-5 space-y-3">
                                <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>🎥 Live conversations ({live.length})</h2>
                                {live.length === 0
                                    ? <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No active calls.</p>
                                    : live.map(c => callRow(c, c.state === 'none' && (
                                        <button className="ultra-btn-secondary text-xs flex-shrink-0" disabled={Boolean(session)} onClick={() => acceptCall(c.callId)}>Join</button>
                                    )))}
                            </div>
                        </div>

                        {/* Active session */}
                        <div className="ultra-card p-5 flex flex-col" style={{ minHeight: 560 }}>
                            {!session ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Accept a request to start talking with the visitor.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between gap-3 mb-4">
                                        <div>
                                            <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>
                                                {session.prospectName || 'Visitor'} <span className="font-normal text-xs" style={{ color: 'var(--text-sub)' }}>· {session.productName}</span>
                                            </h2>
                                            <p className="text-[11px]" style={{ color: 'var(--text-sub)' }}>
                                                {sessionEnded ? 'Call ended' : `You took over from ${session.agentName}. The visitor sees your camera and hears you.`}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            {!sessionEnded && (
                                                <>
                                                    <button className="ultra-btn-secondary text-xs" onClick={toggleMic}>{micOn ? '🎙️ Mute' : '🔇 Unmute'}</button>
                                                    <button className="ultra-btn-secondary text-xs" onClick={toggleCam}>{camOn ? '📷 Camera off' : '📷 Camera on'}</button>
                                                    <button className="ultra-btn-secondary text-xs" onClick={() => closeSession('agent-release')}>↩ Hand back to {session.agentName}</button>
                                                    <button className="text-xs font-semibold px-3 rounded-xl cursor-pointer" style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', color: '#f43f5e' }}
                                                        onClick={() => closeSession('agent-end-call')}>End call</button>
                                                </>
                                            )}
                                            {sessionEnded && <button className="ultra-btn-secondary text-xs" onClick={() => closeSession(null)}>Close</button>}
                                        </div>
                                    </div>

                                    {mediaError && <p className="text-[11px] mb-3 font-semibold" style={{ color: '#f59e0b' }}>{mediaError}</p>}

                                    <div className="flex gap-4 flex-1 min-h-0">
                                        <div className="w-56 flex-shrink-0">
                                            <video ref={localVideoRef} autoPlay playsInline muted className="w-full rounded-xl" style={{ background: '#000', aspectRatio: '3 / 4', objectFit: 'cover' }} />
                                            <p className="text-[10px] mt-1 text-center" style={{ color: 'var(--text-muted)' }}>Your camera (what the visitor sees)</p>
                                            <div ref={audioContainerRef} style={{ display: 'none' }} />
                                        </div>

                                        <div className="flex-1 flex flex-col min-w-0">
                                            <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: 420 }}>
                                                {sessionMessages.map((m, i) => (
                                                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                                                        <div className="max-w-[80%] px-3 py-2 rounded-xl text-xs" style={{
                                                            background: m.role === 'user' ? 'var(--bg-input)' : m.role === 'human' ? 'rgba(16,185,129,0.12)' : 'rgba(139,92,246,0.12)',
                                                            border: '1px solid var(--border-light)',
                                                            color: 'var(--text-main)'
                                                        }}>
                                                            <p className="text-[10px] font-bold mb-0.5" style={{ color: 'var(--text-sub)' }}>
                                                                {m.role === 'user' ? 'Visitor' : m.role === 'human' ? (m.author || 'You') : `${m.author || session.agentName} (AI)`}
                                                            </p>
                                                            {m.content}
                                                        </div>
                                                    </div>
                                                ))}
                                                <div ref={messagesEndRef} />
                                            </div>
                                            {!sessionEnded && (
                                                <form onSubmit={sendMessage} className="flex gap-2 mt-3">
                                                    <input className="ultra-input text-xs" placeholder="Type a message to the visitor (or just talk)" value={draft} onChange={e => setDraft(e.target.value)} />
                                                    <button className="ultra-btn-primary text-xs" disabled={!draft.trim()}>Send</button>
                                                </form>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
