import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

/**
 * DIDAvatar
 *
 * Uses D-ID's Talks Streaming API to display a real-time lip-syncing
 * talking head video avatar. The backend proxies all D-ID API calls so
 * the API key is never exposed to the browser.
 *
 * Flow:
 *   1. Component mounts → POST /api/did-stream/create → get ICE servers + WebRTC offer
 *   2. Browser creates RTCPeerConnection, generates SDP answer
 *   3. POST /api/did-stream/sdp with the answer → WebRTC handshake completes
 *   4. ICE candidates exchanged via /api/did-stream/ice
 *   5. When `processAudio(mp3Buffer)` is called from DemoView:
 *      → Convert MP3 to base64 → POST /api/did-stream/talk → D-ID animates avatar
 *   6. On unmount → DELETE /api/did-stream/:streamId
 */
const DIDAvatar = forwardRef(({ speaking, onStart, onEnd, onFallback }, ref) => {
    const videoRef = useRef(null);
    const pcRef = useRef(null);           // RTCPeerConnection
    const streamIdRef = useRef(null);
    const sessionIdRef = useRef(null);
    const isConnectedRef = useRef(false);
    const audioQueueRef = useRef([]);      // Queue MP3s while connecting
    const processingRef = useRef(false);

    const [status, setStatus] = useState('idle'); // idle | connecting | connected | error | fallback
    const [errorMsg, setErrorMsg] = useState('');

    // ── Helper: convert ArrayBuffer/Buffer to base64 ──
    const toBase64 = (buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    };

    // ── Process queued audio once connected ──
    const drainQueue = async () => {
        if (processingRef.current || audioQueueRef.current.length === 0) return;
        if (!isConnectedRef.current) return;

        processingRef.current = true;
        while (audioQueueRef.current.length > 0) {
            const mp3Buffer = audioQueueRef.current.shift();
            await sendAudioToD_ID(mp3Buffer);
        }
        processingRef.current = false;
    };

    // ── Send a single MP3 chunk to D-ID ──
    const sendAudioToD_ID = async (mp3Buffer) => {
        if (!streamIdRef.current || !sessionIdRef.current) return;
        try {
            const base64Audio = toBase64(mp3Buffer);
            const res = await fetch(`${BACKEND_URL}/api/did-stream/talk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    streamId: streamIdRef.current,
                    sessionId: sessionIdRef.current,
                    audioBase64: base64Audio,
                    mimeType: 'audio/mpeg',
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                console.error('D-ID talk error:', err);
            }
        } catch (err) {
            console.error('Error sending audio to D-ID:', err.message);
        }
    };

    // ── Main WebRTC initialization ──
    useEffect(() => {
        let isMounted = true;
        let pc = null;

        const connect = async () => {
            setStatus('connecting');

            try {
                // 1. Create D-ID stream session (backend proxies)
                const createRes = await fetch(`${BACKEND_URL}/api/did-stream/create`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });

                if (!createRes.ok) {
                    const err = await createRes.json();
                    const detail = err.details || err.error || 'Failed to create D-ID stream';
                    // Detect session limit / quota errors and degrade gracefully
                    if (createRes.status === 403 || detail.toLowerCase().includes('forbidden') || detail.toLowerCase().includes('sessions')) {
                        console.warn('D-ID session limit hit — using CSS fallback avatar');
                        if (isMounted) {
                            setStatus('fallback');
                            if (onFallback) onFallback(); // signal DemoView to unmute AudioPlayer
                        }
                        return;
                    }
                    throw new Error(detail);
                }

                const { id: streamId, session_id: sessionId, offer, ice_servers } = await createRes.json();
                if (!isMounted) return;

                streamIdRef.current = streamId;
                sessionIdRef.current = sessionId;
                console.log('✅ D-ID stream created:', streamId);

                // 2. Create WebRTC peer connection with D-ID's ICE servers
                pc = new RTCPeerConnection({ iceServers: ice_servers });
                pcRef.current = pc;

                // 3. When remote track arrives, attach it to the video element and show immediately
                pc.ontrack = (event) => {
                    if (!isMounted) return;
                    console.log('🎬 D-ID video track received');
                    if (videoRef.current && event.streams?.[0]) {
                        videoRef.current.srcObject = event.streams[0];
                        // Show the video as soon as we have the stream — don't wait for connectionState
                        setStatus('connected');
                        isConnectedRef.current = true;
                        if (onStart) onStart();
                        drainQueue();
                    }
                };

                // 4. Send ICE candidates to D-ID backend proxy
                pc.onicecandidate = async (event) => {
                    if (!isMounted) return;
                    try {
                        await fetch(`${BACKEND_URL}/api/did-stream/ice`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                streamId,
                                sessionId,
                                candidate: event.candidate,
                            }),
                        });
                    } catch (e) {
                        console.error('ICE send error:', e.message);
                    }
                };

                pc.onconnectionstatechange = () => {
                    if (!isMounted) return;
                    console.log('WebRTC state:', pc.connectionState);
                    if (pc.connectionState === 'connected') {
                        isConnectedRef.current = true;
                        setStatus('connected');
                        if (onStart) onStart();
                        drainQueue();
                    } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                        isConnectedRef.current = false;
                        console.warn('WebRTC connection lost — falling back to CSS avatar');
                        setStatus('fallback');
                        if (onFallback) onFallback();
                        if (onEnd) onEnd();
                    }
                };

                // Also watch ICE connection state — often transitions faster than connectionState
                pc.oniceconnectionstatechange = () => {
                    if (!isMounted) return;
                    console.log('ICE state:', pc.iceConnectionState);
                    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                        if (!isConnectedRef.current) {
                            isConnectedRef.current = true;
                            setStatus('connected');
                            if (onStart) onStart();
                            drainQueue();
                        }
                    } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                        isConnectedRef.current = false;
                        console.warn('ICE connection lost — falling back to CSS avatar');
                        setStatus('fallback');
                        if (onFallback) onFallback();
                        if (onEnd) onEnd();
                    }
                };

                // 5. Set the remote SDP offer from D-ID
                await pc.setRemoteDescription(new RTCSessionDescription(offer));

                // 6. Create SDP answer
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                // 7. Send SDP answer to D-ID via backend proxy
                const sdpRes = await fetch(`${BACKEND_URL}/api/did-stream/sdp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ streamId, sessionId, answer }),
                });

                if (!sdpRes.ok) {
                    const err = await sdpRes.json();
                    throw new Error(err.details || err.error || 'SDP exchange failed');
                }

                console.log('✅ D-ID WebRTC handshake complete');

            } catch (err) {
                if (!isMounted) return;
                console.error('D-ID connect error:', err.message);
                setStatus('error');
                setErrorMsg(err.message);
            }
        };

        connect();

        return () => {
            isMounted = false;
            isConnectedRef.current = false;

            // Clean up WebRTC connection
            if (pc) {
                pc.close();
            }

            // Delete the D-ID stream to free quota
            if (streamIdRef.current && sessionIdRef.current) {
                fetch(`${BACKEND_URL}/api/did-stream/${streamIdRef.current}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: sessionIdRef.current }),
                }).catch(() => {});
            }
        };
    }, []);

    // ── Expose processAudio to parent via ref ──
    useImperativeHandle(ref, () => ({
        async processAudio(mp3ArrayBuffer) {
            // Enqueue the audio
            audioQueueRef.current.push(mp3ArrayBuffer);

            if (isConnectedRef.current) {
                drainQueue();
            }
            // If not yet connected, it stays in queue and drainQueue() is called on connect
        }
    }));

    // ── Render ──

    // CSS pulsing orb fallback when D-ID is unavailable
    if (status === 'fallback') {
        return (
            <div className="avatar-3d-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div
                    style={{
                        width: '72px', height: '72px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        boxShadow: speaking
                            ? '0 0 0 8px rgba(99,102,241,0.3), 0 0 0 16px rgba(99,102,241,0.15)'
                            : '0 0 0 0px rgba(99,102,241,0)',
                        transition: 'box-shadow 0.2s ease',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '28px',
                    }}
                >
                    🤖
                </div>
                <div className="avatar-name-label" style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none', zIndex: 10 }}>
                    <span className={`avatar-name-dot ${speaking ? 'speaking' : ''}`} />
                    Alex
                </div>
            </div>
        );
    }

    // Error state
    if (status === 'error') {
        return (
            <div className="avatar-3d-fallback" style={{ padding: '12px', textAlign: 'center' }}>
                <div className="avatar-3d-fallback-icon">⚠️</div>
                <span style={{ fontSize: '0.65rem', lineHeight: '1.3' }}>{errorMsg}</span>
            </div>
        );
    }

    return (
        <div className="avatar-3d-container">
            {/* Loading state */}
            {status !== 'connected' && (
                <div className="avatar-3d-fallback">
                    <div className="avatar-3d-fallback-icon">
                        {status === 'connecting' ? '🔄' : '⏳'}
                    </div>
                    <span>{status === 'connecting' ? 'Connecting avatar...' : 'Starting...'}</span>
                </div>
            )}

            {/* D-ID WebRTC Video Stream */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: status === 'connected' ? 'block' : 'none',
                    borderRadius: 'inherit',
                }}
            />

            {/* Name label */}
            <div className="avatar-name-label" style={{ zIndex: 10 }}>
                <span className={`avatar-name-dot ${speaking ? 'speaking' : ''}`} />
                Alex
            </div>
        </div>
    );
});

DIDAvatar.displayName = 'DIDAvatar';
export default DIDAvatar;
