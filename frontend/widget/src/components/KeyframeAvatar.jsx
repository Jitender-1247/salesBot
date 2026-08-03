import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
    LiveKitRoom,
    useTracks,
    RoomAudioRenderer,
} from '@livekit/components-react';
import { Track } from 'livekit-client';

/**
 * KeyframeVideoTrack
 * Uses useTracks() which automatically subscribes to tracks —
 * finds the first Camera/Unknown source video from a remote participant
 * (the Keyframe agent is the only one publishing video in this room).
 */
function KeyframeVideoTrack({ speaking, onReady }) {
    const videoRef = useRef(null);

    // useTracks auto-subscribes and returns live track refs
    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: false },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
            { source: Track.Source.Unknown, withPlaceholder: false },
        ],
        { onlySubscribed: false }
    );

    // Filter to remote participants only (not the local visitor)
    const avatarTrack = tracks.find(t => !t.participant.isLocal && t.publication?.track);

    console.log('[Keyframe] tracks found:', tracks.length, '| remote avatar track:', !!avatarTrack);

    useEffect(() => {
        if (!avatarTrack?.publication?.track || !videoRef.current) return;

        const track = avatarTrack.publication.track;
        console.log('[Keyframe] ✅ Attaching video track from:', avatarTrack.participant.identity);
        track.attach(videoRef.current);
        
        if (onReady) {
            onReady();
        }

        return () => {
            track.detach(videoRef.current);
        };
    }, [avatarTrack, onReady]);

    const hasTrack = !!avatarTrack?.publication?.track;

    return (
        <div className="avatar-3d-container">
            {!hasTrack && (
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: '8px',
                    zIndex: 5,
                }}>
                    <div style={{
                        width: '64px', height: '64px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '26px', animation: 'pulse 1.5s ease-in-out infinite',
                    }}>
                        ⏳
                    </div>
                    <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)' }}>
                        Avatar joining...
                    </span>
                </div>
            )}

            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                    width: '100%', height: '100%',
                    objectFit: 'cover',
                    borderRadius: 'inherit',
                    display: hasTrack ? 'block' : 'none',
                }}
            />

            <div className="avatar-name-label" style={{ zIndex: 10 }}>
                <span className={`avatar-name-dot ${speaking ? 'speaking' : ''}`} />
                Sofia
            </div>
        </div>
    );
}

/**
 * KeyframeAvatar
 * Connects to the LiveKit room and renders the Keyframe avatar video track.
 */
export default function KeyframeAvatar({ livekitUrl, token, speaking, onReady }) {
    // Memoize so LiveKitRoom doesn't reconnect on every re-render
    const roomOptions = useMemo(() => ({
        adaptiveStream: false,
        dynacast: false,
    }), []);

    if (!livekitUrl || !token) {
        return (
            <div className="avatar-3d-container" style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}>
                <div style={{
                    width: '64px', height: '64px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '26px',
                }}>🤖</div>
                <div className="avatar-name-label" style={{ position: 'relative', bottom: 'auto', left: 'auto', transform: 'none' }}>
                    <span className={`avatar-name-dot ${speaking ? 'speaking' : ''}`} />
                    Sofia
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
