import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
    LiveKitRoom,
    useTracks,
    RoomAudioRenderer,
} from '@livekit/components-react';
import { Track } from 'livekit-client';

/**
 * KeyframeVideoTrack
 * Subscribes to the Keyframe avatar WebRTC video track.
 * Calls onReady() as soon as the live 3D avatar video track attaches to the video element.
 */
function KeyframeVideoTrack({ speaking, onReady }) {
    const videoRef = useRef(null);
    const readyCalledRef = useRef(false);
    const [hasAttachedTrack, setHasAttachedTrack] = useState(false);

    // Auto-subscribe to remote participant tracks (Keyframe agent)
    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: false },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
            { source: Track.Source.Unknown, withPlaceholder: false },
        ],
        { onlySubscribed: false }
    );

    // Filter to remote Keyframe avatar participant track
    const avatarTrack = tracks.find(t => !t.participant.isLocal && t.publication?.track);

    // Fallback: trigger onReady after 2.5s if video track isn't received yet
    useEffect(() => {
        const timer = setTimeout(() => {
            if (onReady && !readyCalledRef.current) {
                readyCalledRef.current = true;
                onReady();
            }
        }, 2500);
        return () => clearTimeout(timer);
    }, [onReady]);

    useEffect(() => {
        if (!avatarTrack?.publication?.track || !videoRef.current) return;

        const track = avatarTrack.publication.track;
        console.log('[Keyframe] ✅ Live 3D Avatar Track connected from:', avatarTrack.participant.identity);
        track.attach(videoRef.current);
        setHasAttachedTrack(true);

        if (onReady && !readyCalledRef.current) {
            readyCalledRef.current = true;
            onReady();
        }

        return () => {
            track.detach(videoRef.current);
            setHasAttachedTrack(false);
        };
    }, [avatarTrack, onReady]);

    return (
        <div className="avatar-3d-container" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at center, #1e1b4b 0%, #09090b 100%)' }}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: 'inherit',
                    display: hasAttachedTrack ? 'block' : 'none',
                }}
            />

            {!hasAttachedTrack && (
                <div className={`avatar-animated-fallback ${speaking ? 'speaking' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div className={`avatar-ring ${speaking ? 'active' : ''}`} />
                    <div className={`avatar-ring avatar-ring-2 ${speaking ? 'active' : ''}`} />
                    <div className="avatar-photo-wrapper" style={{ width: '90px', height: '90px', borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', border: '3px solid rgba(167, 139, 250, 0.4)', boxShadow: '0 8px 32px rgba(124, 58, 237, 0.3)' }}>
                        👩‍💼
                    </div>
                </div>
            )}

            <div className="avatar-name-label" style={{ position: 'absolute', bottom: '10px', zIndex: 10 }}>
                <span className={`avatar-name-dot ${speaking ? 'speaking' : ''}`} style={{ background: speaking ? '#10b981' : '#6b7280' }} />
                Sofia
            </div>
        </div>
    );
}

/**
 * KeyframeAvatar
 * Connects to LiveKit room and streams live 3D avatar video & audio.
 */
export default function KeyframeAvatar({ livekitUrl, token, speaking, onReady }) {
    const roomOptions = useMemo(() => ({
        adaptiveStream: false,
        dynacast: false,
    }), []);

    useEffect(() => {
        if (!livekitUrl || !token) {
            const timer = setTimeout(() => {
                onReady?.();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [livekitUrl, token, onReady]);

    if (!livekitUrl || !token) {
        return (
            <div className="avatar-3d-container" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                <div className="avatar-fallback-wrapper" style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
                    <div className="landing-avatar" style={{ fontSize: '3rem' }}>👩‍💼</div>
                </div>
            </div>
        );
    }

    return (
        <LiveKitRoom
            serverUrl={livekitUrl}
            token={token}
            connect={true}
            audio={true}
            video={false}
            options={roomOptions}
            style={{ display: 'contents' }}
        >
            <RoomAudioRenderer />
            <KeyframeVideoTrack speaking={speaking} onReady={onReady} />
        </LiveKitRoom>
    );
}
