import { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from 'livekit-server-sdk';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Call recording via LiveKit Egress (room composite → MP4 on S3-compatible storage).
 *
 * Off unless storage is configured:
 *   RECORDING_S3_BUCKET, RECORDING_S3_REGION, RECORDING_S3_ACCESS_KEY, RECORDING_S3_SECRET
 *   RECORDING_S3_ENDPOINT        (optional, for R2 / MinIO / Spaces)
 *   RECORDING_PUBLIC_BASE_URL    (optional, e.g. a CloudFront URL; used to build the playback link)
 */
const {
    RECORDING_S3_BUCKET,
    RECORDING_S3_REGION,
    RECORDING_S3_ACCESS_KEY,
    RECORDING_S3_SECRET,
    RECORDING_S3_ENDPOINT,
    RECORDING_PUBLIC_BASE_URL
} = process.env;

export function isRecordingConfigured() {
    return Boolean(RECORDING_S3_BUCKET && RECORDING_S3_ACCESS_KEY && RECORDING_S3_SECRET && process.env.LIVEKIT_URL);
}

function egressClient() {
    return new EgressClient(
        process.env.LIVEKIT_URL.replace('wss://', 'https://'),
        process.env.LIVEKIT_API_KEY,
        process.env.LIVEKIT_API_SECRET
    );
}

function recordingKey(callId) {
    return `recordings/${callId}.mp4`;
}

/** Playback URL for a recording, or the storage location when no public base URL is configured. */
export function recordingUrl(callId) {
    const key = recordingKey(callId);
    return RECORDING_PUBLIC_BASE_URL
        ? `${RECORDING_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`
        : `s3://${RECORDING_S3_BUCKET}/${key}`;
}

/** Start recording a room. Returns the egress id, or '' when recording is unavailable. */
export async function startRecording(roomName, callId) {
    if (!isRecordingConfigured()) return '';
    try {
        const output = new EncodedFileOutput({
            fileType: EncodedFileType.MP4,
            filepath: recordingKey(callId),
            output: {
                case: 's3',
                value: new S3Upload({
                    accessKey: RECORDING_S3_ACCESS_KEY,
                    secret: RECORDING_S3_SECRET,
                    region: RECORDING_S3_REGION || '',
                    endpoint: RECORDING_S3_ENDPOINT || '',
                    bucket: RECORDING_S3_BUCKET,
                    forcePathStyle: Boolean(RECORDING_S3_ENDPOINT)
                })
            }
        });
        const info = await egressClient().startRoomCompositeEgress(roomName, { file: output }, { layout: 'speaker' });
        console.log(`🎥 [${callId}] Recording started (egress ${info.egressId})`);
        return info.egressId;
    } catch (err) {
        console.warn(`⚠️ [${callId}] Could not start recording:`, err.message);
        return '';
    }
}

export async function stopRecording(egressId, callId) {
    if (!egressId) return false;
    try {
        await egressClient().stopEgress(egressId);
        console.log(`🎥 [${callId}] Recording stopped`);
        return true;
    } catch (err) {
        // Egress also ends by itself when the room empties; "not active" is not a failure
        console.warn(`ℹ️ [${callId}] Stop recording notice:`, err.message);
        return !/failed/i.test(err.message);
    }
}
