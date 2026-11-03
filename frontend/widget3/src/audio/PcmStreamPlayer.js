/**
 * Gapless player for the backend's streamed speech: raw 16-bit mono PCM packets
 * (base64, ~100-200ms each) scheduled back-to-back on one AudioContext.
 *
 * Exposes playback progress so captions can follow the actual voice.
 */
let sharedContext = null;

/**
 * One AudioContext for the whole widget. Call it from a click handler (e.g. "Start video chat")
 * so browsers with autoplay restrictions (Safari, Chrome) allow it to play.
 */
export function unlockAudio() {
    if (!sharedContext) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        sharedContext = new Ctx();
    }
    if (sharedContext.state === 'suspended') sharedContext.resume().catch(() => {});
    return sharedContext;
}

export default class PcmStreamPlayer {
    constructor({ onStart, onEnd } = {}) {
        this.onStart = onStart;
        this.onEnd = onEnd;
        this.ctx = null;
        this.reset();
    }

    reset() {
        this.sources = [];
        this.text = '';
        this.startAt = null;      // ctx time the first packet starts
        this.nextTime = 0;        // ctx time the next packet should start
        this.totalSec = 0;
        this.finished = false;    // backend sent agent-audio-pcm-end
        this.active = false;
        clearTimeout(this.startTimer);
        clearTimeout(this.endTimer);
    }

    ensureContext() {
        this.ctx = unlockAudio();
        return this.ctx;
    }

    /** New utterance: forget anything still queued. */
    begin(text) {
        this.stopSources();
        this.reset();
        this.text = text || '';
    }

    push(base64, sampleRate = 24000) {
        const ctx = this.ensureContext();
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const samples = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
        if (!samples.length) return;

        const buffer = ctx.createBuffer(1, samples.length, sampleRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);

        // Small lead-in on the first packet so the next one is always queued in time
        const when = Math.max(ctx.currentTime + (this.startAt === null ? 0.06 : 0.01), this.nextTime);
        src.start(when);
        this.sources.push(src);
        this.nextTime = when + buffer.duration;
        this.totalSec += buffer.duration;

        if (this.startAt === null) {
            this.startAt = when;
            this.active = true;
            this.startTimer = setTimeout(() => this.onStart?.(), Math.max(0, (when - ctx.currentTime) * 1000));
        }
        if (this.finished) this.scheduleEnd();
    }

    /** Backend finished sending; fire onEnd once the queued audio has played out. */
    end() {
        this.finished = true;
        this.scheduleEnd();
    }

    scheduleEnd() {
        clearTimeout(this.endTimer);
        if (!this.ctx || this.startAt === null) {
            if (this.finished) this.onEnd?.();
            return;
        }
        const ms = Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000) + 50;
        this.endTimer = setTimeout(() => {
            this.active = false;
            this.onEnd?.();
        }, ms);
    }

    /** How far into the utterance the listener is. */
    progress() {
        if (!this.ctx || this.startAt === null) return { played: 0, total: this.totalSec, finished: this.finished, text: this.text };
        return {
            played: Math.max(0, this.ctx.currentTime - this.startAt),
            total: this.totalSec,
            finished: this.finished,
            text: this.text
        };
    }

    stopSources() {
        for (const s of this.sources) {
            try { s.stop(); } catch { /* already stopped */ }
        }
        this.sources = [];
    }

    stop() {
        this.stopSources();
        this.reset();
    }

    // The shared context stays open for the next call
    close() {
        this.stop();
    }
}
