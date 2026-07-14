import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

const AudioPlayer = forwardRef(function AudioPlayer({ onPlaybackEnd, onPlaybackStart }, ref) {
    const audioEls = useRef(null);
    const activeIdx = useRef(0);
    const loadedUrls = useRef(['', '']);
    const queueRef = useRef([]);
    const isPlayingRef = useRef(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [bars, setBars] = useState(Array(20).fill(4));

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
        if (!isPlaying) { setBars(Array(20).fill(4)); return; }
        const id = setInterval(() => {
            setBars(prev => prev.map(() => Math.random() * 28 + 4));
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

        const curIdx = activeIdx.current;
        const curAudio = els[curIdx];
        const currentUrl = queueRef.current.shift();

        if (loadedUrls.current[curIdx] !== currentUrl) {
            curAudio.src = currentUrl;
            loadedUrls.current[curIdx] = currentUrl;
        }

        preloadNext();

        curAudio.onended = () => {
            curAudio.onended = null;
            curAudio.onerror = null;
            URL.revokeObjectURL(currentUrl);
            loadedUrls.current[curIdx] = '';
            activeIdx.current = 1 - curIdx;
            playNext();
        };

        curAudio.onerror = () => {
            curAudio.onended = null;
            curAudio.onerror = null;
            URL.revokeObjectURL(currentUrl);
            loadedUrls.current[curIdx] = '';
            activeIdx.current = 1 - curIdx;
            playNext();
        };

        curAudio.play()
            .then(() => {
                if (!isPlayingRef.current) {
                    isPlayingRef.current = true;
                    setIsPlaying(true);
                    onPlaybackStart?.();
                }
            })
            .catch(err => {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                console.warn('Audio play error:', err);
                URL.revokeObjectURL(currentUrl);
                loadedUrls.current[curIdx] = '';
                activeIdx.current = 1 - curIdx;
                if (isPlayingRef.current) playNext();
            });
    }, [onPlaybackEnd, onPlaybackStart, preloadNext]);

    const enqueue = useCallback((url) => {
        queueRef.current.push(url);
        if (!isPlayingRef.current) {
            activeIdx.current = 0;
            isPlayingRef.current = true;
            playNext();
        } else {
            preloadNext();
        }
    }, [playNext, preloadNext]);

    const stop = useCallback(() => {
        const els = audioEls.current;
        if (els) {
            els.forEach((a, i) => {
                a.pause();
                a.onended = null;
                a.onerror = null;
                a.src = '';
                loadedUrls.current[i] = '';
            });
        }
        queueRef.current.forEach(url => URL.revokeObjectURL(url));
        queueRef.current = [];
        isPlayingRef.current = false;
        setIsPlaying(false);
    }, []);

    const isActive = useCallback(() => {
        return isPlayingRef.current || queueRef.current.length > 0;
    }, []);

    useImperativeHandle(ref, () => ({ enqueue, stop, isActive }), [enqueue, stop, isActive]);

    if (!isPlaying) return null;

    return (
        <div className="audio-waveform" aria-label="Audio playing">
            {bars.map((height, i) => (
                <div
                    key={i}
                    className="wave-bar"
                    style={{ height: `${height}px`, opacity: 0.8 }}
                />
            ))}
        </div>
    );
});

export default AudioPlayer;
