import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

const AudioPlayer = forwardRef(function AudioPlayer({ onPlaybackEnd, onPlaybackStart, muted = false }, ref) {
    const audioEls = useRef(null);
    const activeIdx = useRef(0);
    const loadedUrls = useRef(['', '']);
    const queueRef = useRef([]);
    const isPlayingRef = useRef(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [bars, setBars] = useState(Array(18).fill(4));

    useEffect(() => {
        const a = new Audio();
        const b = new Audio();
        a.preload = 'auto';
        b.preload = 'auto';
        audioEls.current = [a, b];
        return () => {
            a.pause(); a.src = ''; a.onended = null; a.onerror = null;
            b.pause(); b.src = ''; b.onended = null; b.onerror = null;
            audioEls.current = null;
        };
    }, []);

    useEffect(() => {
        if (audioEls.current) {
            audioEls.current[0].muted = muted;
            audioEls.current[1].muted = muted;
        }
    }, [muted]);

    useEffect(() => {
        if (!isPlaying) { setBars(Array(18).fill(4)); return; }
        const id = setInterval(() => {
            setBars(prev => prev.map(() => Math.random() * 26 + 4));
        }, 80);
        return () => clearInterval(id);
    }, [isPlaying]);

    const preloadNext = useCallback(() => {
        const els = audioEls.current;
        if (!els || queueRef.current.length === 0) return;
        const idleIdx = 1 - activeIdx.current;
        const nextUrl = queueRef.current[0];
        if (loadedUrls.current[idleIdx] !== nextUrl) {
            els[idleIdx].src = nextUrl;
            els[idleIdx].load();
            loadedUrls.current[idleIdx] = nextUrl;
        }
    }, []);

    const playNext = useCallback(() => {
        const els = audioEls.current;
        if (!els || queueRef.current.length === 0) {
            isPlayingRef.current = false;
            setIsPlaying(false);
            onPlaybackEnd();
            return;
        }

        const url = queueRef.current.shift();
        const currentIdx = activeIdx.current;
        const idleIdx = 1 - currentIdx;
        let elToPlay;

        if (loadedUrls.current[idleIdx] === url) {
            elToPlay = els[idleIdx];
            activeIdx.current = idleIdx;
        } else {
            elToPlay = els[currentIdx];
            if (elToPlay.src !== url) {
                elToPlay.src = url;
                loadedUrls.current[currentIdx] = url;
            }
        }

        preloadNext();

        elToPlay.onended = () => {
            elToPlay.onended = null;
            elToPlay.onerror = null;
            playNext();
        };

        elToPlay.onerror = (e) => {
            console.warn('[AudioPlayer] playback error on chunk:', e);
            elToPlay.onended = null;
            elToPlay.onerror = null;
            playNext();
        };

        elToPlay.play().then(() => {
            if (!isPlayingRef.current) {
                isPlayingRef.current = true;
                setIsPlaying(true);
                onPlaybackStart();
            }
        }).catch(err => {
            console.warn('[AudioPlayer] play() rejected:', err.message);
            playNext();
        });
    }, [preloadNext, onPlaybackStart, onPlaybackEnd]);

    const enqueueAudioChunk = useCallback((base64Audio) => {
        if (!base64Audio) return;
        const audioUrl = `data:audio/mp3;base64,${base64Audio}`;
        queueRef.current.push(audioUrl);

        if (!isPlayingRef.current) {
            isPlayingRef.current = true;
            setIsPlaying(true);
            playNext();
        } else {
            preloadNext();
        }
    }, [playNext, preloadNext]);

    const startStreaming = useCallback(() => {
        // Ready for chunks
    }, []);

    const stop = useCallback(() => {
        queueRef.current = [];
        isPlayingRef.current = false;
        setIsPlaying(false);
        if (audioEls.current) {
            audioEls.current.forEach(el => {
                el.pause();
                el.currentTime = 0;
                el.onended = null;
                el.onerror = null;
            });
        }
        loadedUrls.current = ['', ''];
        onPlaybackEnd();
    }, [onPlaybackEnd]);

    useImperativeHandle(ref, () => ({
        enqueueAudioChunk,
        startStreaming,
        stop,
        isPlaying: () => isPlayingRef.current
    }));

    return (
        <div className="audio-visualizer-container" style={{ display: isPlaying ? 'flex' : 'none' }}>
            <div className="audio-bars">
                {bars.map((h, i) => (
                    <span
                        key={i}
                        className="audio-bar"
                        style={{ height: `${h}px` }}
                    />
                ))}
            </div>
        </div>
    );
});

export default AudioPlayer;
