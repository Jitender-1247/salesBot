import { useRef, useCallback, useEffect, useState } from 'react';

// VAD thresholds — tuned for conversational sales voice
const DEFAULT_SPEECH_THRESHOLD  = 0.013;
const SILENCE_DURATION_MS       = 550;
const MIN_SPEECH_DURATION_MS    = 180;
const MAX_RECORDING_DURATION_MS = 6000;
const SPEECH_CONFIRM_TICKS      = 2;

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
    const ambientNoiseRef    = useRef(0.006);

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

    useEffect(() => {
        if (!isSpeaking) {
            echoCooldownRef.current = Date.now() + 200;
        }
    }, [isSpeaking]);

    const [isListening,  setIsListening]  = useState(false);
    const [volume,       setVolume]       = useState(0);
    const [speechActive, setSpeechActive] = useState(false);
    const [isMuted,      setIsMuted]      = useState(false);
    const [micDenied,    setMicDenied]    = useState(false);

    const stopRecording = useCallback(() => {
        if (!isRecordingRef.current) return;
        isRecordingRef.current = false;
        setSpeechActive(false);

        const duration = Date.now() - (speechStartRef.current || 0);

        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }

        if (duration < MIN_SPEECH_DURATION_MS) {
            chunksRef.current = [];
            onRecordingStopRef.current?.();
            return;
        }

        setTimeout(() => {
            if (chunksRef.current.length > 0) {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
                chunksRef.current = [];
                onRecordingCompleteRef.current?.(blob);
            }
            onRecordingStopRef.current?.();
        }, 80);
    }, []);

    const startRecording = useCallback(() => {
        if (isRecordingRef.current) return;
        if (!streamRef.current || streamRef.current.getAudioTracks().length === 0) return;
        if (disabledRef.current || isProcessingRef.current) return;

        chunksRef.current = [];
        silenceStartRef.current = null;
        speechStartRef.current = Date.now();

        try {
            const options = { mimeType: 'audio/webm;codecs=opus' };
            const recorder = MediaRecorder.isTypeSupported(options.mimeType)
                ? new MediaRecorder(streamRef.current, options)
                : new MediaRecorder(streamRef.current);

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.start(100);
            mediaRecorderRef.current = recorder;
            isRecordingRef.current = true;
            setSpeechActive(true);
            onRecordingStartRef.current?.();
        } catch (err) {
            console.error('[AudioRecorder] Failed to start recorder:', err);
        }
    }, []);

    const checkVAD = useCallback(() => {
        if (!analyserRef.current || isMuted) return;

        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);

        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        const normalizedVol = Math.min(1, avg * 3.5);

        setVolume(normalizedVol);
        onVolumeChangeRef.current?.(normalizedVol);

        if (isSpeakingRef.current && Date.now() < echoCooldownRef.current) return;

        if (avg < ambientNoiseRef.current * 1.5) {
            ambientNoiseRef.current = ambientNoiseRef.current * 0.95 + avg * 0.05;
        }

        const dynamicThreshold = Math.max(
            DEFAULT_SPEECH_THRESHOLD,
            ambientNoiseRef.current * 2.5
        );

        const isSpeakingNow = avg > dynamicThreshold;

        if (isSpeakingRef.current && isSpeakingNow) {
            speechConfirmRef.current += 1;
            if (speechConfirmRef.current >= 3) {
                speechConfirmRef.current = 0;
                onInterruptRef.current?.();
            }
            return;
        }

        if (disabledRef.current || isProcessingRef.current) {
            if (isRecordingRef.current) stopRecording();
            return;
        }

        if (isSpeakingNow) {
            speechConfirmRef.current += 1;
            silenceStartRef.current = null;

            if (!isRecordingRef.current && speechConfirmRef.current >= SPEECH_CONFIRM_TICKS) {
                startRecording();
            }

            if (isRecordingRef.current && speechStartRef.current) {
                const elapsed = Date.now() - speechStartRef.current;
                if (elapsed >= MAX_RECORDING_DURATION_MS) {
                    stopRecording();
                    speechConfirmRef.current = 0;
                }
            }
        } else {
            speechConfirmRef.current = 0;

            if (isRecordingRef.current) {
                if (!silenceStartRef.current) {
                    silenceStartRef.current = Date.now();
                } else {
                    const elapsed = Date.now() - silenceStartRef.current;
                    if (elapsed >= SILENCE_DURATION_MS) {
                        silenceStartRef.current = null;
                        stopRecording();
                    }
                }
            }
        }
    }, [isMuted, startRecording, stopRecording]);

    const initAudio = useCallback(async () => {
        if (isInitializedRef.current) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl:  true,
                    channelCount:     1,
                    sampleRate:       { ideal: 16000 },
                }
            });

            streamRef.current = stream;

            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioCtx();
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;

            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(analyser);

            audioContextRef.current = audioCtx;
            analyserRef.current     = analyser;
            isInitializedRef.current = true;
            setIsListening(true);
            setMicDenied(false);

            vadIntervalRef.current = setInterval(checkVAD, 40);
        } catch (err) {
            console.warn('[AudioRecorder] Mic access error:', err.message);
            setMicDenied(true);
            setIsListening(false);
        }
    }, [checkVAD]);

    useEffect(() => {
        initAudio();
        return () => {
            if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
            if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
            if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
            isInitializedRef.current = false;
        };
    }, [initAudio]);

    const toggleMute = () => {
        if (!streamRef.current) return;
        const willMute = !isMuted;
        streamRef.current.getAudioTracks().forEach(t => { t.enabled = !willMute; });
        setIsMuted(willMute);
        if (willMute && isRecordingRef.current) stopRecording();
    };

    return (
        <div className="mic-control-wrapper">
            <button
                type="button"
                className={`mic-btn ${isListening ? 'active' : ''} ${speechActive ? 'speaking' : ''} ${isMuted ? 'muted' : ''}`}
                onClick={toggleMute}
                title={isMuted ? 'Unmute Microphone' : speechActive ? 'Listening to you...' : 'Microphone Active'}
            >
                <div className={`mic-halo ${speechActive ? 'active' : ''}`} />
                <span className="mic-icon">
                    {micDenied ? '🚫' : isMuted ? '🔇' : speechActive ? '🎙️' : '🎤'}
                </span>
            </button>
            <span className="mic-hint-text">
                {micDenied
                    ? 'Microphone blocked'
                    : isMuted
                    ? 'Mic Muted'
                    : speechActive
                    ? 'Listening...'
                    : 'Auto-voice active'}
            </span>
        </div>
    );
}
