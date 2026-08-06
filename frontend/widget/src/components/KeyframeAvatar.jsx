import React, { useEffect, useRef, useMemo } from 'react';
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

    useEffect(() => {
        if (!avatarTrack?.publication?.track || !videoRef.current) return;

        const track = avatarTrack.publication.track;
        console.log('[Keyframe] ✅ Live 3D Avatar Track connected from:', avatarTrack.participant.identity);
        track.attach(videoRef.current);

        if (onReady && !readyCalledRef.current) {
            readyCalledRef.current = true;
            onReady();
        }

        return () => {
            track.detach(videoRef.current);
        };
    }, [avatarTrack, onReady]);

    return (
        <div className="avatar-3d-container" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: 'inherit',
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
 * Connects to LiveKit room and streams live 3D avatar video & audio.
 */
export default function KeyframeAvatar({ livekitUrl, token, speaking, onReady }) {
    const roomOptions = useMemo(() => ({
        adaptiveStream: false,
        dynacast: false,
    }), []);

    if (!livekitUrl || !token) return null;

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
