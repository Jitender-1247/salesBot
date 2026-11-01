import { useRef, useEffect, useState, useMemo } from 'react';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    useTracks,
    useLocalParticipant,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

const DEFAULT_AVATAR_IMG = '/widget3/alex-avatar.png';
const FALLBACK_AVATAR_IMG = '/alex-avatar.png';

// Human specialists join the room as "human-<socketId>" (see ChatOrchestrator.humanAccept)
const isHuman = (participant) => participant?.identity?.startsWith('human-');

function AvatarPlaceholder({ speaking, avatarImg, agentName }) {
    return (
        <div className={`avatar-photorealistic-stage ${speaking ? 'speaking' : ''}`}>
            <div className="avatar-ambient-glow" />
            <div className={`avatar-speaking-ring ring-1 ${speaking ? 'active' : ''}`} />
            <div className={`avatar-speaking-ring ring-2 ${speaking ? 'active' : ''}`} />
            <div className={`avatar-speaking-ring ring-3 ${speaking ? 'active' : ''}`} />

            <div className="avatar-frame-circle">
                <img
                    src={avatarImg}
                    alt={agentName}
                    className="avatar-img"
                    onError={(e) => { e.target.src = FALLBACK_AVATAR_IMG; }}
                />
            </div>
        </div>
    );
}

/** Publishes the visitor's microphone only while a human specialist is on the call. */
function MicController({ enabled }) {
    const { localParticipant } = useLocalParticipant();
    useEffect(() => {
        if (!localParticipant) return;
        localParticipant.setMicrophoneEnabled(enabled).catch(err => {
            console.warn('[VideoAvatar] Microphone:', err?.message || err);
        });
    }, [localParticipant, enabled]);
    return null;
}

function LiveTrackPlayer({ speaking, onReady, avatarImg, agentName, humanName }) {
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

    // A specialist's camera takes the stage; otherwise the AI avatar's video
    const remoteTracks = tracks.filter(t => !t.participant.isLocal && t.publication?.track);
    const remoteTrack = remoteTracks.find(t => isHuman(t.participant)) || remoteTracks.find(t => !isHuman(t.participant));
    const showingHuman = isHuman(remoteTrack?.participant);

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
        const el = videoRef.current;
        track.attach(el);
        setHasVideoTrack(true);

        if (onReady && !readyReported.current) {
            readyReported.current = true;
            onReady();
        }

        return () => {
            track.detach(el);
            setHasVideoTrack(false);
        };
    }, [remoteTrack?.publication?.track, onReady]);

    return (
        <div className="avatar-stage-viewport">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="avatar-live-video"
                style={{ display: hasVideoTrack ? 'block' : 'none' }}
            />

            {showingHuman && humanName && (
                <div className="human-name-tag">🧑‍💼 {humanName}</div>
            )}

            {!hasVideoTrack && (
                <AvatarPlaceholder speaking={speaking} avatarImg={avatarImg} agentName={agentName} />
            )}
        </div>
    );
}

export default function VideoAvatar({
    livekitUrl,
    token,
    speaking = false,
    onReady,
    avatarImg = DEFAULT_AVATAR_IMG,
    agentName = 'Sofia',
    humanName = '',
    micEnabled = false
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
                <AvatarPlaceholder speaking={speaking} avatarImg={avatarImg} agentName={agentName} />
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
            {/* Plays the avatar's lip-synced voice and, after a handover, the specialist */}
            <RoomAudioRenderer />
            <MicController enabled={micEnabled} />
            <LiveTrackPlayer
                speaking={speaking}
                onReady={onReady}
                avatarImg={avatarImg}
                agentName={agentName}
                humanName={humanName}
            />
        </LiveKitRoom>
    );
}
