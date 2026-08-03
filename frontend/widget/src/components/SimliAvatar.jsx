import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { SimliClient, generateSimliSessionToken, generateIceServers } from 'simli-client';

// Shared AudioContext for decoding MP3 chunks. Browsers limit the number of AudioContexts, so we must reuse one.
let sharedAudioCtx = null;
const getAudioCtx = () => {
    if (!sharedAudioCtx) {
        sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    }
    return sharedAudioCtx;
};

const SimliAvatar = forwardRef(({ speaking, onStart, onEnd }, ref) => {
    const videoRef = useRef(null);
    const audioRef = useRef(null);
    const [simliClient, setSimliClient] = useState(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let clientInstance = null;
        let isMounted = true;

        const apiKey = import.meta.env.VITE_SIMLI_API_KEY;
        const faceId = import.meta.env.VITE_SIMLI_FACE_ID;

        if (!apiKey || !faceId || apiKey === 'YOUR_API_KEY_HERE') {
            setError('Simli API Key or Face ID is missing. Please add them to your .env file.');
            return;
        }

        const initClient = async () => {
            try {
                // 1. Generate ICE Servers
                const iceServers = await generateIceServers(apiKey);

                // 2. Generate Session Token
                const tokenResponse = await generateSimliSessionToken({
                    apiKey,
                    config: {
                        faceId: faceId,
                        handleSilence: true,
                        maxSessionLength: 3600,
                        maxIdleTime: 3600,
                        model: "fasttalk"
                    }
                });

                // 3. Initialize SimliClient (v3 constructor signature)
                clientInstance = new SimliClient(
                    tokenResponse.session_token,
                    videoRef.current,
                    audioRef.current,
                    iceServers
                );

                if (!isMounted) {
                    console.log("Component unmounted during Simli initialization, closing orphaned client.");
                    clientInstance.stop();
                    return;
                }

                // Event listeners
                clientInstance.on('connected', () => {
                    if (!isMounted) return;
                    console.log('Simli client connected');
                    setIsInitialized(true);
                    if (onStart) onStart();
                });

                clientInstance.on('disconnected', () => {
                    if (!isMounted) return;
                    console.log('Simli client disconnected');
                    setIsInitialized(false);
                    if (onEnd) onEnd();
                });

                clientInstance.on('failed', () => {
                    if (!isMounted) return;
                    console.log('Simli client failed');
                    setError('Failed to connect to Simli');
                });

                await clientInstance.start();
                if (isMounted) {
                    setSimliClient(clientInstance);
                }
            } catch (err) {
                console.error("Simli initialization error:", err);
                const errMsg = err && err.message ? err.message : String(err);
                setError(errMsg || "Simli initialization failed");
            }
        };

        initClient();

        return () => {
            isMounted = false;
            if (clientInstance) {
                console.log("Closing Simli client on unmount");
                clientInstance.stop();
            }
        };
    }, []);

    // Expose a method to send MP3 buffers from Socket.IO directly to Simli
    useImperativeHandle(ref, () => ({
        async processAudio(mp3ArrayBuffer) {
            if (!simliClient || !isInitialized) return;

            try {
                // Simli expects 16kHz PCM16 mono audio. 
                // We decode the MP3 ArrayBuffer to PCM using Web Audio API.
                const audioCtx = getAudioCtx();
                
                // decodeAudioData consumes the ArrayBuffer, so we might want to copy it if it's used elsewhere,
                // but Socket.IO creates fresh ArrayBuffers.
                const decodedData = await audioCtx.decodeAudioData(mp3ArrayBuffer);
                
                // Get the raw float32 channel data (mono)
                const pcmFloat32 = decodedData.getChannelData(0);
                
                // Convert Float32 (-1.0 to 1.0) to Int16 (-32768 to 32767)
                const pcmInt16 = new Int16Array(pcmFloat32.length);
                for (let i = 0; i < pcmFloat32.length; i++) {
                    const s = Math.max(-1, Math.min(1, pcmFloat32[i]));
                    pcmInt16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                
                // Convert to Uint8Array for the Simli SDK
                const pcmBytes = new Uint8Array(pcmInt16.buffer);
                
                // Send the decoded audio to Simli (it will animate and play it)
                simliClient.sendAudioData(pcmBytes);
                
            } catch (err) {
                console.error('Error decoding/sending audio to Simli:', err);
            }
        }
    }));

    if (error) {
        return (
            <div className="avatar-3d-fallback" style={{ padding: '20px', textAlign: 'center' }}>
                <div className="avatar-3d-fallback-icon">⚠️</div>
                <span style={{ fontSize: '0.65rem', lineHeight: '1.2' }}>{error}</span>
            </div>
        );
    }

    return (
        <div className="avatar-3d-container">
            {!isInitialized && (
                <div className="avatar-3d-fallback">
                    <div className="avatar-3d-fallback-icon">⏳</div>
                    <span>Loading Avatar...</span>
                </div>
            )}
            
            {/* The video element renders the WebRTC stream from Simli */}
            <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted={false}
                style={{
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover',
                    display: isInitialized ? 'block' : 'none'
                }}
            />
            {/* The audio element plays the sound from the WebRTC stream */}
            <audio ref={audioRef} autoPlay />

            <div className="avatar-name-label" style={{ zIndex: 10 }}>
                <span className={`avatar-name-dot ${speaking ? 'speaking' : ''}`} />
                Alex
            </div>
        </div>
    );
});

export default SimliAvatar;
