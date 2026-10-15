import { useRef, useEffect, useState, useMemo } from 'react';
import {
    LiveKitRoom,
    useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

const DEFAULT_AVATAR_IMG = '/widget3/alex-avatar.png';
const FALLBACK_AVATAR_IMG = '/alex-avatar.png';

function LiveTrackPlayer({ speaking, onReady, avatarImg = DEFAULT_AVATAR_IMG }) {
    const videoRef = useRef(null);
    const readyReported = useRef(false);
    const [hasVideoTrack, setHasVideoTrack] = useState(false);

    const tracks = useTracks(
        [
            { source: Track.Source.Camera, withPlaceholder: false },
            { source: Track.Source.ScreenShare, withPlaceholder: false },
            { source: Track.Source.Unknown, withPlaceholder: false }
        ],
        { onlySubscribed: false }
    );

    const remoteTrack = tracks.find(t => !t.participant.isLocal && t.publication?.track);

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (onReady && !readyReported.current) {
                readyReported.current = true;
                onReady();
            }
        }, 2000);
        return () => clearTimeout(timeout);
    }, [onReady]);

    useEffect(() => {
        if (!remoteTrack?.publication?.track || !videoRef.current) return;
        const track = remoteTrack.publication.track;
        track.attach(videoRef.current);
        setHasVideoTrack(true);

        if (onReady && !readyReported.current) {
            readyReported.current = true;
            onReady();
        }

        return () => {
            track.detach(videoRef.current);
            setHasVideoTrack(false);
        };
    }, [remoteTrack, onReady]);

    return (
        <div className="avatar-stage-viewport">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                className="avatar-live-video"
                style={{ display: hasVideoTrack ? 'block' : 'none' }}
            />

            {!hasVideoTrack && (
                <div className={`avatar-photorealistic-stage ${speaking ? 'speaking' : ''}`}>
                    <div className="avatar-ambient-glow" />
                    <div className={`avatar-speaking-ring ring-1 ${speaking ? 'active' : ''}`} />
                    <div className={`avatar-speaking-ring ring-2 ${speaking ? 'active' : ''}`} />
                    <div className={`avatar-speaking-ring ring-3 ${speaking ? 'active' : ''}`} />
                    
                    <div className="avatar-frame-circle">
                        <img
                            src={avatarImg}
                            alt="Sofia"
                            className="avatar-img"
                            onError={(e) => { e.target.src = FALLBACK_AVATAR_IMG; }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function VideoAvatar({
    livekitUrl,
    token,
    speaking = false,
    onReady,
    avatarImg = DEFAULT_AVATAR_IMG
}) {
    const roomOptions = useMemo(() => ({
        adaptiveStream: false,
        dynacast: false
    }), []);

    useEffect(() => {
        if (!livekitUrl || !token) {
            const timer = setTimeout(() => {
                onReady?.();
            }, 800);
            return () => clearTimeout(timer);
        }
    }, [livekitUrl, token, onReady]);

    if (!livekitUrl || !token) {
        return (
            <div className="avatar-stage-viewport">
                <div className={`avatar-photorealistic-stage ${speaking ? 'speaking' : ''}`}>
                    <div className="avatar-ambient-glow" />
                    <div className={`avatar-speaking-ring ring-1 ${speaking ? 'active' : ''}`} />
                    <div className={`avatar-speaking-ring ring-2 ${speaking ? 'active' : ''}`} />
                    <div className="avatar-frame-circle">
                        <img
                            src={avatarImg}
                            alt="Sofia"
                            className="avatar-img"
                            onError={(e) => { e.target.src = FALLBACK_AVATAR_IMG; }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <LiveKitRoom
            serverUrl={livekitUrl}
            token={token}
            connect={true}
            audio={false}
            video={false}
            options={roomOptions}
            onError={(e) => {
                console.warn('[VideoAvatar] LiveKit connect:', e?.message || e);
                onReady?.();
            }}
            onDisconnected={() => {
                onReady?.();
            }}
            style={{ display: 'contents' }}
        >
            <LiveTrackPlayer
                speaking={speaking}
                onReady={onReady}
                avatarImg={avatarImg}
            />
        </LiveKitRoom>
    );
}
