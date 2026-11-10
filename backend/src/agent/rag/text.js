/**
 * Text utilities for retrieval: chunking, tokenizing, BM25 ranking, rank fusion.
 * Pure functions (no DB, no network) so they are cheap to test.
 */

const STOPWORDS = new Set((
    'a an the and or but if then else of to in on at by for with from as is are was were be been being it its ' +
    'this that these those i you he she we they me my your our their them what which who whom how when where why ' +
    'do does did done have has had can could should would will shall may might must not no yes so than too very ' +
    'just about into over under up down out off again also any all each some such only own same both few more most ' +
    'other there here please tell show give get know want like need us am'
).split(' '));

/** Light, language-agnostic-ish normalisation: lowercase, strip accents, crude English plural/verb endings. */
function stem(token) {
    if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
    if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
    if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
    if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
    return token;
}

export function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter(t => t && (t.length > 1 || /\d/.test(t)) && !STOPWORDS.has(t))
        .map(stem);
}

/**
 * Split text into ~maxChars passages on paragraph / sentence boundaries, with a small overlap
 * so a fact that straddles a boundary is still found.
 */
export function chunkText(text, { maxChars = 900, overlap = 150 } = {}) {
    const clean = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (!clean) return [];
    if (clean.length <= maxChars) return [clean];

    // Units: paragraphs, and sentences of over-long paragraphs
    const units = [];
    for (const para of clean.split(/\n{2,}|\n(?=[-•*#\d])/)) {
        const p = para.trim();
        if (!p) continue;
        if (p.length <= maxChars) { units.push(p); continue; }
        for (const s of p.split(/(?<=[.!?])\s+/)) {
            if (s.length <= maxChars) units.push(s);
            else for (let i = 0; i < s.length; i += maxChars - overlap) units.push(s.slice(i, i + maxChars));
        }
    }

    const chunks = [];
    let current = '';
    for (const u of units) {
        if (current && current.length + u.length + 1 > maxChars) {
            chunks.push(current);
            const tail = current.slice(-overlap);
            const cut = tail.indexOf(' ');
            current = (cut > -1 ? tail.slice(cut + 1) : '') + (tail ? '\n' : '') + u;
        } else {
            current = current ? `${current}\n${u}` : u;
        }
    }
    if (current.trim()) chunks.push(current);
    return chunks;
}

/**
 * Remove lines repeated on many pages (menus, footers, cookie banners) before chunking:
 * they would otherwise match every query and crowd out real content.
 */
export function stripBoilerplate(pages, { minPages = 3, ratio = 0.5 } = {}) {
    if (pages.length < minPages) return pages;
    const seenOn = new Map();
    for (const p of pages) {
        for (const line of new Set(p.text.split('\n').map(l => l.trim()).filter(Boolean))) {
            seenOn.set(line, (seenOn.get(line) || 0) + 1);
        }
    }
    const limit = Math.max(2, Math.ceil(pages.length * ratio));
    return pages.map(p => ({
        ...p,
        text: p.text.split('\n').filter(l => (seenOn.get(l.trim()) || 0) < limit).join('\n')
    }));
}

/** Okapi BM25 over pre-tokenized documents. */
export class Bm25Index {
    constructor(docs, { k1 = 1.4, b = 0.75 } = {}) {
        this.k1 = k1;
        this.b = b;
        this.docs = docs.map(tokens => {
            const tf = new Map();
            for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
            return { tf, len: tokens.length };
        });
        this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
        this.df = new Map();
        for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
    }

    idf(term) {
        const n = this.df.get(term) || 0;
        return Math.log(1 + (this.docs.length - n + 0.5) / (n + 0.5));
    }

    /** weights: Map(term -> query weight), so follow-up context can count less than the new question. */
    search(weights, limit = 10) {
        const scores = [];
        this.docs.forEach((d, i) => {
            let score = 0;
            for (const [term, w] of weights) {
                const f = d.tf.get(term);
                if (!f) continue;
                score += w * this.idf(term) * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * d.len / this.avgLen));
            }
            if (score > 0) scores.push({ index: i, score });
        });
        return scores.sort((a, b) => b.score - a.score).slice(0, limit);
    }
}

/** Query terms: the new question at full weight, recent context (for "what about the second one?") at less. */
export function queryWeights(question, context = '') {
    const weights = new Map();
    for (const t of tokenize(context)) weights.set(t, Math.max(weights.get(t) || 0, 0.35));
    for (const t of tokenize(question)) weights.set(t, 1);
    return weights;
}

export function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Reciprocal rank fusion of several ranked lists of indexes. */
export function fuseRankings(rankings, k = 60) {
    const score = new Map();
    for (const list of rankings) {
        list.forEach((index, rank) => score.set(index, (score.get(index) || 0) + 1 / (k + rank + 1)));
    }
    return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([index, s]) => ({ index, score: s }));
}
