import { useRef, useCallback, useEffect, useState } from 'react';

// VAD thresholds — tuned for typical laptop/phone mic
const SILENCE_THRESHOLD    = 0.015;  // below this = silence
const SPEECH_THRESHOLD     = 0.03;   // above this = speech
const SILENCE_DURATION_MS  = 1200;   // ms of silence before we stop recording
const MIN_SPEECH_DURATION_MS = 500;  // minimum speech length to send
const SPEECH_CONFIRM_TICKS = 2;      // consecutive ticks above threshold before recording starts

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
            if (blob.size > 2000) {                       // ~100ms minimum
                onRecordingCompleteRef.current(blob);
            }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100);
        speechStartRef.current = Date.now();
        onRecordingStartRef.current?.();
    }, []);

    // ── Stop the current recording ──
    const stopCapture = useCallback(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            onRecordingStopRef.current?.();
        }
        silenceStartRef.current = null;
        speechStartRef.current  = null;
    }, []);

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

    // ── Core VAD loop — runs every 30ms, never re-created ──
    const runVAD = useCallback(() => {
        if (disabledRef.current) return;

        const vol      = getVolume();
        setVolume(vol);
        onVolumeChangeRef.current?.(vol);

        const now      = Date.now();
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
                        stopCapture();          // valid utterance — send it
                    } else {
                        // Too short — discard silently
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
                silenceStartRef.current = null;   // reset silence timer while speaking
            }
        } else if (!isProcessingRef.current) {
            // Not recording — wait for speech to start
            if (isSpeech) {
                speechConfirmRef.current += 1;
                if (speechConfirmRef.current >= SPEECH_CONFIRM_TICKS) {
                    if (isSpeakingRef.current) {
                        onInterruptRef.current?.();
                    }
                    startCapture();
                    speechConfirmRef.current = 0;
                }
            } else {
                speechConfirmRef.current = 0;
            }
        }
    }, [getVolume, startCapture, stopCapture]);   // stable deps — never recreates

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

                const ctx     = new AudioContext({ sampleRate: 16000 });
                const source  = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 512;
                analyser.smoothingTimeConstant = 0.3;
                source.connect(analyser);

                audioContextRef.current = ctx;
                analyserRef.current     = analyser;
                setIsListening(true);

                // Unlock audio playback context (browser policy)
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
    }, [isListening, runVAD]);   // runVAD is stable — this only runs once after mic is ready

    // ── Stop recording when externally disabled ──
    useEffect(() => {
        if (disabled && isRecordingRef.current) stopCapture();
    }, [disabled, stopCapture]);

    const barH = Math.min(100, volume * 1000);

    return (
        <div className="record-btn-container">
            <div
                className={`backend-warning-banner ${disabled ? 'visible' : 'hidden'}`}
                aria-hidden={!disabled}
            >
                <span>Backends offline — recording disabled.</span>
            </div>

            <div
                className={`record-btn ${isCapturing ? 'recording' : ''} ${isListening ? 'listening-active' : ''}`}
                aria-label={isCapturing ? 'Recording your voice' : 'Listening for your voice'}
                title={isCapturing ? 'Speaking…' : isListening ? 'Always listening — just speak' : 'Initializing mic…'}
            >
                {isCapturing ? (
                    <div className="voice-bars">
                        {[...Array(5)].map((_, i) => (
                            <div
                                key={i}
                                className="voice-bar"
                                style={{
                                    height: `${Math.max(4, barH * (0.6 + (i % 3) * 0.2))}px`,
                                    animationDelay: `${i * 0.1}s`,
                                }}
                            />
                        ))}
                    </div>
                ) : (
                    <span style={{ fontSize: '1.3rem' }}>🎤</span>
                )}
            </div>

            <div className="record-btn-ring" />
            <div className="keyboard-hint">
                <span>
                    {isCapturing  ? 'Listening…'            :
                     isListening  ? 'Just speak — always on' :
                                    'Setting up mic…'}
                </span>
            </div>
        </div>
    );
}
