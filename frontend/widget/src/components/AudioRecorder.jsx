import { useRef, useCallback, useEffect, useState } from 'react';

// VAD (Voice Activity Detection) thresholds
const SILENCE_THRESHOLD = 0.015;
const SPEECH_THRESHOLD = 0.025;
const SILENCE_DURATION_MS = 700;
const MIN_SPEECH_DURATION_MS = 200;

export default function AudioRecorder({
    disabled = false,
    onRecordingComplete,
    isProcessing,
    onRecordingStart,
    onRecordingStop,
    onInterrupt,
    isSpeaking,
}) {
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const streamRef = useRef(null);
    const analyserRef = useRef(null);
    const audioContextRef = useRef(null);
    const vadIntervalRef = useRef(null);
    const silenceStartRef = useRef(null);
    const speechStartRef = useRef(null);
    const isActiveRef = useRef(false);
    const isRecordingRef = useRef(false);

    const [isListening, setIsListening] = useState(false);
    const [isCapturing, setIsCapturing] = useState(false);
    const [volume, setVolume] = useState(0);

    const startCapture = useCallback(() => {
        if (!streamRef.current || isRecordingRef.current) return;

        chunksRef.current = [];
        isRecordingRef.current = true;
        setIsCapturing(true);

        const mediaRecorder = new MediaRecorder(streamRef.current, {
            mimeType: 'audio/webm;codecs=opus',
        });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                chunksRef.current.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
            isRecordingRef.current = false;
            setIsCapturing(false);

            if (audioBlob.size > 1000) {
                onRecordingComplete(audioBlob);
            }
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(100);
        speechStartRef.current = Date.now();
        onRecordingStart();
    }, [onRecordingComplete, onRecordingStart]);

    const stopCapture = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            onRecordingStop();
        }
        silenceStartRef.current = null;
        speechStartRef.current = null;
    }, [onRecordingStop]);

    const getVolume = useCallback(() => {
        if (!analyserRef.current) return 0;
        const data = new Uint8Array(analyserRef.current.fftSize);
        analyserRef.current.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const val = (data[i] - 128) / 128;
            sum += val * val;
        }
        return Math.sqrt(sum / data.length);
    }, []);

    const runVAD = useCallback(() => {
        const vol = getVolume();
        setVolume(vol);

        const now = Date.now();
        const isSpeech = vol > SPEECH_THRESHOLD;
        const isSilence = vol < SILENCE_THRESHOLD;

        if (isRecordingRef.current) {
            if (isSilence) {
                if (silenceStartRef.current === null) {
                    silenceStartRef.current = now;
                } else if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
                    const speechDuration = speechStartRef.current ? now - speechStartRef.current : 0;
                    if (speechDuration > MIN_SPEECH_DURATION_MS) {
                        stopCapture();
                    } else {
                        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                            mediaRecorderRef.current.stop();
                        }
                        isRecordingRef.current = false;
                        setIsCapturing(false);
                        silenceStartRef.current = null;
                        speechStartRef.current = null;
                    }
                }
            } else {
                silenceStartRef.current = null;
            }
        } else if (!isProcessing && !disabled) {
            if (isSpeech) {
                if (isSpeaking) {
                    onInterrupt();
                }
                startCapture();
            }
        }
    }, [getVolume, isProcessing, isSpeaking, onInterrupt, startCapture, stopCapture, disabled]);

    // Initialize microphone and start VAD
    useEffect(() => {
        if (isActiveRef.current) return;
        isActiveRef.current = true;

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

                const ctx = new AudioContext();
                const source = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 512;
                analyser.smoothingTimeConstant = 0.3;
                source.connect(analyser);

                audioContextRef.current = ctx;
                analyserRef.current = analyser;
                setIsListening(true);

                // Unlock audio playback
                try {
                    const silentAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
                    silentAudio.volume = 0;
                    await silentAudio.play().catch(() => {});
                } catch { /* ignore */ }
            } catch (err) {
                console.error('Microphone access denied:', err);
            }
        };

        initMic();

        return () => {
            if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    // Stop recording when disabled
    useEffect(() => {
        if (disabled && isRecordingRef.current) {
            stopCapture();
        }
    }, [disabled, stopCapture]);

    // Run VAD loop
    useEffect(() => {
        if (!isListening || disabled) return;
        vadIntervalRef.current = setInterval(runVAD, 30);
        return () => {
            if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
        };
    }, [isListening, runVAD, disabled]);

    const barHeight = Math.min(100, volume * 800);

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
                title={isCapturing ? 'Speaking...' : isListening ? 'Always listening — just speak' : 'Initializing mic...'}
            >
                {isCapturing ? (
                    <div className="voice-bars">
                        {[...Array(5)].map((_, i) => (
                            <div
                                key={i}
                                className="voice-bar"
                                style={{
                                    height: `${Math.max(4, barHeight * (0.5 + Math.random() * 0.5))}px`,
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
                <span>{isCapturing ? 'Listening...' : isListening ? 'Just speak — always on' : 'Setting up mic...'}</span>
            </div>
        </div>
    );
}
