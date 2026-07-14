import { useEffect, useRef, useState } from 'react';

export default function Avatar({ speaking, videoUrl, loading }) {
    const videoRef = useRef(null);
    const [videoError, setVideoError] = useState(false);

    const posterUrl = 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=640';
    const avatarVideoUrl = 'https://cdn.coverr.co/videos/coverr-good-vibes-8706/1080p.mp4';
    const effectiveVideoUrl = videoUrl || avatarVideoUrl;

    useEffect(() => {
        setVideoError(false);
    }, [effectiveVideoUrl]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (speaking && !videoError) {
            video.play().catch(() => {});
        } else {
            video.pause();
            if (!loading) video.currentTime = 0;
        }
    }, [speaking, videoError, effectiveVideoUrl, loading]);

    return (
        <div className="avatar-card" aria-label="Alex avatar">
            {effectiveVideoUrl && !videoError ? (
                <div className={`avatar-video-wrapper ${speaking ? 'speaking' : ''} ${loading ? 'loading' : ''}`}>
                    <video
                        ref={videoRef}
                        className="avatar-video"
                        src={effectiveVideoUrl}
                        poster={posterUrl}
                        playsInline
                        muted
                        preload="metadata"
                        loop
                        onError={() => setVideoError(true)}
                        aria-hidden="true"
                    />
                    <div className="avatar-video-overlay" />
                </div>
            ) : (
                <div className={`avatar-face ${speaking ? 'speaking' : ''}`}>
                    <div className="avatar-eye avatar-eye-left" />
                    <div className="avatar-eye avatar-eye-right" />
                    <div className="avatar-mouth" />
                    <div className="avatar-glow" />
                </div>
            )}
            <div className="avatar-label">Alex</div>
        </div>
    );
}
