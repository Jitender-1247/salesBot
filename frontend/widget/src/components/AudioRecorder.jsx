import { useRef, useCallback, useEffect, useState } from 'react';

// VAD thresholds — tuned for conversational voice and laptop/headset mics
const SILENCE_THRESHOLD       = 0.007; // below this = silence
const SPEECH_THRESHOLD        = 0.013; // above this = speech (sensitive to natural voice)
const SILENCE_DURATION_MS     = 800;   // ms of silence before utterance finishes
const MIN_SPEECH_DURATION_MS  = 180;   // minimum speech length to send (captures short 'yes', 'hi', 'shoes')
const SPEECH_CONFIRM_TICKS    = 2;     // consecutive ticks above threshold before recording starts

export default function AudioRecorder({
    disabled = false,
    onRecordingComplete,
    isProcessing,
    onRecordingStart,
    onRecordingStop,
    onInterrupt,
    isSpeaking,
    onVolumeChange,
}) {
    const mediaRecorderRef   = useRef(null);
    const chunksRef          = useRef([]);
    const streamRef          = useRef(null);
    const analyserRef        = useRef(null);
    const audioContextRef    = useRef(null);
    const vadIntervalRef     = useRef(null);
    const silenceStartRef    = useRef(null);
    const speechStartRef     = useRef(null);
    const isRecordingRef     = useRef(false);
    const speechConfirmRef   = useRef(0);
    const isInitializedRef   = useRef(false);
    const echoCooldownRef    = useRef(0);

    // Keep callbacks in refs so VAD loop never goes stale
    const onRecordingCompleteRef = useRef(onRecordingComplete);
    const onRecordingStartRef    = useRef(onRecordingStart);
    const onRecordingStopRef     = useRef(onRecordingStop);
    const onInterruptRef         = useRef(onInterrupt);
    const onVolumeChangeRef      = useRef(onVolumeChange);
    const isProcessingRef        = useRef(isProcessing);
    const isSpeakingRef          = useRef(isSpeaking);
    const disabledRef            = useRef(disabled);

    useEffect(() => { onRecordingCompleteRef.current = onRecordingComplete; }, [onRecordingComplete]);
    useEffect(() => { onRecordingStartRef.current    = onRecordingStart;    }, [onRecordingStart]);
    useEffect(() => { onRecordingStopRef.current     = onRecordingStop;     }, [onRecordingStop]);
    useEffect(() => { onInterruptRef.current         = onInterrupt;         }, [onInterrupt]);
    useEffect(() => { onVolumeChangeRef.current      = onVolumeChange;      }, [onVolumeChange]);
    useEffect(() => { isProcessingRef.current        = isProcessing;        }, [isProcessing]);
    useEffect(() => { isSpeakingRef.current          = isSpeaking;          }, [isSpeaking]);
    useEffect(() => { disabledRef.current            = disabled;            }, [disabled]);

    // Acoustic Echo Guard: Brief 200ms buffer after Sofia finishes speaking
    useEffect(() => {
        if (!isSpeaking) {
            echoCooldownRef.current = Date.now() + 200;
        }
    }, [isSpeaking]);

    const [isListening,  setIsListening]  = useState(false);
    const [isCapturing,  setIsCapturing]  = useState(false);
    const [volume,       setVolume]       = useState(0);

    // ── Start recording a new utterance ──
    const startCapture = useCallback(() => {
        if (!streamRef.current || isRecordingRef.current) return;

        chunksRef.current    = [];
        isRecordingRef.current = true;
        setIsCapturing(true);

        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: mimeType });
            isRecordingRef.current = false;
            setIsCapturing(false);
            if (blob.size > 1500) { // Valid utterance (~80ms minimum)
                onRecordingCompleteRef.current(blob);
            }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100);
        speechStartRef.current = Date.now();
        onRecordingStartRef.current?.();
    }, []);

    // ── Stop current recording ──
    const stopCapture = useCallback(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            onRecordingStopRef.current?.();
        }
        silenceStartRef.current = null;
        speechStartRef.current  = null;
    }, []);

    // ── Toggle manual capture (Push/Tap to Talk) ──
    const toggleCapture = useCallback(() => {
        if (isRecordingRef.current) {
            stopCapture();
        } else {
            if (isSpeakingRef.current) {
                onInterruptRef.current?.();
            }
            startCapture();
        }
    }, [startCapture, stopCapture]);

    // ── Read RMS volume from analyser ──
    const getVolume = useCallback(() => {
        if (!analyserRef.current) return 0;
        const data = new Uint8Array(analyserRef.current.fftSize);
        analyserRef.current.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
        }
        return Math.sqrt(sum / data.length);
    }, []);

    // ── Core VAD loop — runs every 30ms ──
    const runVAD = useCallback(() => {
        if (disabledRef.current) return;

        const vol = getVolume();
        setVolume(vol);
        onVolumeChangeRef.current?.(vol);

        const now = Date.now();

        // ── Voice interruption: If user speaks clearly while Sofia is speaking, trigger interrupt ──
        if (isSpeakingRef.current) {
            if (vol > 0.038) {
                speechConfirmRef.current += 1;
                if (speechConfirmRef.current >= 2) {
                    onInterruptRef.current?.();
                    startCapture();
                    speechConfirmRef.current = 0;
                    return;
                }
            } else {
                speechConfirmRef.current = 0;
            }
            silenceStartRef.current = null;
            return;
        }

        // ── Echo cooldown: brief buffer so speaker output reverberation isn't picked up ──
        if (now < echoCooldownRef.current) {
            silenceStartRef.current = null;
            speechConfirmRef.current = 0;
            return;
        }

        const isSpeech = vol > SPEECH_THRESHOLD;
        const isSilent = vol < SILENCE_THRESHOLD;

        if (isRecordingRef.current) {
            // Currently recording — look for end-of-utterance silence
            if (isSilent) {
                if (silenceStartRef.current === null) {
                    silenceStartRef.current = now;
                } else if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
                    const dur = speechStartRef.current ? now - speechStartRef.current : 0;
                    if (dur > MIN_SPEECH_DURATION_MS) {
                        stopCapture(); // Valid utterance — send it
                    } else {
                        // Too short — discard
                        if (mediaRecorderRef.current?.state === 'recording') {
                            mediaRecorderRef.current.stop();
                        }
                        isRecordingRef.current = false;
                        setIsCapturing(false);
                        silenceStartRef.current = null;
                        speechStartRef.current  = null;
                    }
                }
            } else {
                silenceStartRef.current = null; // reset silence timer while active
            }
        } else if (!isProcessingRef.current) {
            // Not recording — wait for speech to start
            if (isSpeech) {
                speechConfirmRef.current += 1;
                if (speechConfirmRef.current >= SPEECH_CONFIRM_TICKS) {
                    startCapture();
                    speechConfirmRef.current = 0;
                }
            } else {
                speechConfirmRef.current = 0;
            }
        }
    }, [getVolume, startCapture, stopCapture]);

    // ── Init microphone once ──
    useEffect(() => {
        if (isInitializedRef.current) return;
        isInitializedRef.current = true;

        const initMic = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        channelCount: 1,
                        sampleRate: 16000,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });

                streamRef.current = stream;

                const ctx      = new AudioContext({ sampleRate: 16000 });
                const source   = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 512;
                analyser.smoothingTimeConstant = 0.3;
                source.connect(analyser);

                audioContextRef.current = ctx;
                analyserRef.current     = analyser;
                setIsListening(true);

                // Unlock audio playback context
                const unlock = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
                unlock.volume = 0;
                unlock.play().catch(() => {});

            } catch (err) {
                console.error('[AudioRecorder] Mic access denied:', err.message);
            }
        };

        initMic();

        return () => {
            if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
            streamRef.current?.getTracks().forEach(t => t.stop());
            audioContextRef.current?.close();
        };
    }, []);

    // ── Start / stop VAD loop when mic is ready ──
    useEffect(() => {
        if (!isListening) return;
        vadIntervalRef.current = setInterval(runVAD, 30);
        return () => clearInterval(vadIntervalRef.current);
    }, [isListening, runVAD]);

    // ── Stop recording when externally disabled ──
    useEffect(() => {
        if (disabled && isRecordingRef.current) stopCapture();
    }, [disabled, stopCapture]);

    // ── Keyboard shortcut: Spacebar to toggle or hold to talk ──
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                if (!isRecordingRef.current && !isProcessingRef.current) {
                    if (isSpeakingRef.current) onInterruptRef.current?.();
                    startCapture();
                }
            }
        };

        const onKeyUp = (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                if (isRecordingRef.current) {
                    stopCapture();
                }
            }
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, [startCapture, stopCapture]);

    const barH = Math.min(24, Math.max(4, volume * 350));

    return (
        <div className="audio-controls-panel">
            <button
                type="button"
                className={`mic-pill-btn ${isCapturing ? 'capturing' : isSpeaking ? 'agent-speaking' : isProcessing ? 'processing' : 'ready'}`}
                onClick={toggleCapture}
                title={isCapturing ? 'Click to finish speaking' : 'Click to talk (or just speak naturally)'}
            >
                <span className="mic-icon">
                    {isCapturing ? '🔴' : isSpeaking ? '🔊' : isProcessing ? '⏳' : '🎙️'}
                </span>
                <span className="mic-status-text">
                    {isCapturing
                        ? 'Listening to you... (Click to send)'
                        : isSpeaking
                        ? 'Sofia speaking'
                        : isProcessing
                        ? 'Thinking...'
                        : 'Mic on • Speak or click to talk'}
                </span>
                {isCapturing && (
                    <div className="mic-mini-wave">
                        <span style={{ height: `${barH}px` }} />
                        <span style={{ height: `${Math.max(4, barH * 0.8)}px` }} />
                        <span style={{ height: `${Math.max(4, barH * 1.2)}px` }} />
                    </div>
                )}
            </button>
        </div>
    );
}
