import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || '';

// ── Redis Client Factory ──
// Returns null if REDIS_URL is not configured (local dev fallback)
let pubClient = null;
let subClient = null;

if (REDIS_URL) {
    pubClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 200, 5000),
        lazyConnect: true,
    });
    subClient = pubClient.duplicate();

    pubClient.on('connect', () => console.log('🔴 Redis pub client connected'));
    pubClient.on('error', (err) => console.log('❌ Redis pub error:', err.message));
    subClient.on('error', (err) => console.log('❌ Redis sub error:', err.message));
} else {
    console.log('ℹ️ REDIS_URL not set — using in-memory session tracking (single-node only)');
}

export { pubClient, subClient };

// ── Concurrency helpers ──
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 50;
const SESSION_PREFIX = 'salesbot:session:';
const QUEUE_PREFIX = 'salesbot:queue:';

// In-memory fallback for dev (no Redis)
const localSessions = new Set();
const localQueue = [];

/**
 * Try to acquire a session slot.
 * Returns { allowed: true } or { allowed: false, position: N, estimatedWaitSeconds: N }
 */
export async function acquireSessionSlot(callId) {
    if (pubClient) {
        // Redis mode: use a sorted set for active sessions
        const activeCount = await pubClient.scard('salesbot:active_sessions');
        if (activeCount >= MAX_CONCURRENT) {
            // Add to queue
            const position = await pubClient.rpush('salesbot:session_queue', callId);
            return {
                allowed: false,
                position,
                estimatedWaitSeconds: position * 60, // rough estimate: 1 min per queued session
            };
        }
        // Add to active set with TTL (auto-expire if server crashes)
        const maxSessionSec = parseInt(process.env.MAX_SESSION_DURATION_SECONDS) || 300;
        await pubClient.sadd('salesbot:active_sessions', callId);
        await pubClient.set(`${SESSION_PREFIX}${callId}`, Date.now().toString(), 'EX', maxSessionSec + 120);
        return { allowed: true };
    } else {
        // Local fallback
        if (localSessions.size >= MAX_CONCURRENT) {
            localQueue.push(callId);
            return {
                allowed: false,
                position: localQueue.length,
                estimatedWaitSeconds: localQueue.length * 60,
            };
        }
        localSessions.add(callId);
        return { allowed: true };
    }
}

/**
 * Release a session slot and promote the next queued session.
 * Returns the next queued callId (or null if queue is empty).
 */
export async function releaseSessionSlot(callId) {
    if (pubClient) {
        await pubClient.srem('salesbot:active_sessions', callId);
        await pubClient.del(`${SESSION_PREFIX}${callId}`);
        // Pop next from queue
        const next = await pubClient.lpop('salesbot:session_queue');
        return next || null;
    } else {
        localSessions.delete(callId);
        return localQueue.shift() || null;
    }
}

/**
 * Get current queue position for a callId.
 */
export async function getQueuePosition(callId) {
    if (pubClient) {
        const queue = await pubClient.lrange('salesbot:session_queue', 0, -1);
        const idx = queue.indexOf(callId);
        return idx >= 0 ? idx + 1 : 0;
    } else {
        const idx = localQueue.indexOf(callId);
        return idx >= 0 ? idx + 1 : 0;
    }
}

/**
 * Get active session count.
 */
export async function getActiveSessionCount() {
    if (pubClient) {
        return await pubClient.scard('salesbot:active_sessions');
    }
    return localSessions.size;
}

export { MAX_CONCURRENT };
