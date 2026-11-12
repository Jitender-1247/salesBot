/**
 * RAG over a product's knowledge: page text, documents, knowledge-map summaries, extra knowledge, catalog.
 *
 * Retrieval is BM25 (keyword) by default — no extra service or API key, a few ms per query.
 * When OPENAI_API_KEY is set, passages also get embeddings and retrieval becomes hybrid
 * (keyword + semantic, fused by rank), which also matches paraphrases.
 */
import KnowledgeChunk from '../../models/KnowledgeChunk.js';
import Product from '../../models/Product.js';
import { chunkText, tokenize, Bm25Index, queryWeights, cosine, fuseRankings, stripBoilerplate } from './text.js';

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMS = 512;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHED_PRODUCTS = 30;

export function embeddingsEnabled() {
    const key = process.env.OPENAI_API_KEY;
    return Boolean(key && !key.includes('your-openai'));
}

async function embed(texts, { timeoutMs = 20000 } = {}) {
    if (!embeddingsEnabled() || !texts.length) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: EMBED_MODEL, input: texts.map(t => t.slice(0, 8000)), dimensions: EMBED_DIMS }),
            signal: controller.signal
        });
        if (!res.ok) {
            console.warn(`⚠️ [RAG] Embeddings ${res.status}: ${(await res.text()).slice(0, 120)}`);
            return null;
        }
        const data = await res.json();
        return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
    } catch (err) {
        if (err.name !== 'AbortError') console.warn(`⚠️ [RAG] Embeddings error: ${err.message}`);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// ── Writing the index ──

const catalogText = (item) => [
    `Product: ${item.name}`,
    item.price !== null && item.price !== undefined ? `Price: ${item.currency || ''} ${item.price}`.trim() : '',
    item.tags?.length ? `Tags: ${item.tags.join(', ')}` : '',
    item.description || ''
].filter(Boolean).join('\n');

const mapText = (page) => [
    page.description,
    page.keyFeatures?.length ? `Key features: ${page.keyFeatures.join('; ')}` : '',
    page.talkingPoints?.length ? `Talking points: ${page.talkingPoints.join(' ')}` : '',
    page.commonQuestions?.length ? `Common questions: ${page.commonQuestions.join(' ')}` : '',
    page.demoTip ? `Tip: ${page.demoTip}` : ''
].filter(Boolean).join('\n');

/** Make running servers reload the product's passages, and record the size of the index. */
async function bumpVersion(productId) {
    const chunkCount = await KnowledgeChunk.countDocuments({ productId });
    await Product.updateOne({ _id: productId }, {
        $inc: { 'knowledgeIndex.version': 1 },
        $set: {
            'knowledgeIndex.chunkCount': chunkCount,
            'knowledgeIndex.embeddingModel': embeddingsEnabled() ? EMBED_MODEL : '',
            'knowledgeIndex.updatedAt': new Date()
        }
    });
    cache.delete(String(productId));
    return chunkCount;
}

/** Add embeddings to passages that don't have them yet (background; no-op without a provider). */
async function embedMissing(productId) {
    if (!embeddingsEnabled()) return;
    for (let round = 0; round < 50; round++) {
        const batch = await KnowledgeChunk.find({ productId, embeddingModel: { $ne: EMBED_MODEL } }).select('title text').limit(96).lean();
        if (!batch.length) break;
        const vectors = await embed(batch.map(c => `${c.title}\n${c.text}`));
        if (!vectors) return;
        await KnowledgeChunk.bulkWrite(batch.map((c, i) => ({
            updateOne: { filter: { _id: c._id }, update: { $set: { embedding: vectors[i], embeddingModel: EMBED_MODEL } } }
        })));
    }
    await bumpVersion(productId);
}

const embedInBackground = (productId) => embedMissing(productId).catch(err => console.warn('⚠️ [RAG] embedMissing:', err.message));

/** Rebuild the passages derived from the product record: map summaries, extra knowledge, catalog. */
export async function syncDerivedChunks(product) {
    const productId = product._id;
    const docs = [];
    for (const page of product.knowledgeMap?.pages || []) {
        const text = mapText(page);
        if (text) docs.push({ sourceType: 'map', sourceId: page.url || '', title: page.name || 'Page', url: page.url || '', text });
    }
    const extra = product.extraKnowledge || product.knowledgeMap?.extraKnowledge || '';
    chunkText(extra).forEach((text, i) => docs.push({ sourceType: 'extra', sourceId: String(i), title: 'Product owner knowledge', text }));
    for (const item of product.catalog || []) {
        docs.push({ sourceType: 'catalog', sourceId: item.sku, title: item.name, url: item.url || '', text: catalogText(item) });
    }

    await KnowledgeChunk.deleteMany({ productId, sourceType: { $in: ['map', 'extra', 'catalog'] } });
    if (docs.length) await KnowledgeChunk.insertMany(docs.map(d => ({ ...d, productId })));
    const count = await bumpVersion(productId);
    embedInBackground(productId);
    return count;
}

/** Replace the explored pages' full text (repeated menus/footers removed first). Returns passages written. */
export async function replacePageChunks(productId, pages) {
    const cleaned = stripBoilerplate(pages.filter(p => p.text?.trim()));
    const docs = [];
    for (const page of cleaned) {
        for (const text of chunkText(page.text)) {
            docs.push({ productId, sourceType: 'page', sourceId: page.url, title: page.name || page.url, url: page.url, text });
        }
    }
    await KnowledgeChunk.deleteMany({ productId, sourceType: 'page' });
    if (docs.length) await KnowledgeChunk.insertMany(docs);
    return docs.length;
}

export async function addDocumentChunks(doc) {
    const docs = chunkText(doc.text).map(text => ({
        productId: doc.productId, sourceType: 'document', sourceId: String(doc._id), title: doc.title, url: doc.sourceUrl || '', text
    }));
    await KnowledgeChunk.deleteMany({ productId: doc.productId, sourceType: 'document', sourceId: String(doc._id) });
    if (docs.length) await KnowledgeChunk.insertMany(docs);
    await bumpVersion(doc.productId);
    embedInBackground(doc.productId);
    return docs.length;
}

export async function removeDocumentChunks(productId, docId) {
    await KnowledgeChunk.deleteMany({ productId, sourceType: 'document', sourceId: String(docId) });
    return bumpVersion(productId);
}

/** Products indexed before RAG existed get their derived passages on first use. */
export async function ensureIndexed(product) {
    if (product.knowledgeIndex?.version) return;
    await syncDerivedChunks(product);
}

// ── Reading the index ──

const cache = new Map(); // productId -> { version, loadedAt, chunks, bm25, hasEmbeddings }
const queryVectors = new Map(); // small LRU of question -> embedding

async function loadIndex(productId, version) {
    const key = String(productId);
    const hit = cache.get(key);
    if (hit && hit.version === version && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit;

    const chunks = await KnowledgeChunk.find({ productId }).select('sourceType sourceId title url text embedding').lean();
    const entry = {
        version,
        loadedAt: Date.now(),
        chunks,
        // Titles count too: "Pricing" in a page title is a strong signal
        bm25: new Bm25Index(chunks.map(c => tokenize(`${c.title}\n${c.title}\n${c.text}`))),
        hasEmbeddings: chunks.some(c => c.embedding?.length)
    };
    cache.set(key, entry);
    if (cache.size > MAX_CACHED_PRODUCTS) cache.delete(cache.keys().next().value);
    return entry;
}

async function embedQuery(text) {
    if (queryVectors.has(text)) return queryVectors.get(text);
    const vectors = await embed([text], { timeoutMs: 1500 }); // never hold up a live reply for long
    const v = vectors?.[0] || null;
    if (v) {
        queryVectors.set(text, v);
        if (queryVectors.size > 500) queryVectors.delete(queryVectors.keys().next().value);
    }
    return v;
}

/**
 * Most relevant passages for a question.
 * @param {object} opts { question, context, limit, types: ['page', …] | null, version }
 */
export async function retrieve(productId, { question, context = '', limit = 6, types = null, version } = {}) {
    if (!question?.trim()) return [];
    let v = version;
    if (v === undefined) v = (await Product.findById(productId).select('knowledgeIndex.version').lean())?.knowledgeIndex?.version || 0;
    const index = await loadIndex(productId, v);
    if (!index.chunks.length) return [];

    const allowed = (i) => !types || types.includes(index.chunks[i].sourceType);
    const keyword = index.bm25.search(queryWeights(question, context), 60).filter(r => allowed(r.index));
    let ranked = keyword;

    if (index.hasEmbeddings && embeddingsEnabled()) {
        const qv = await embedQuery(`${context}\n${question}`.trim());
        if (qv) {
            const semantic = index.chunks
                .map((c, i) => ({ index: i, score: c.embedding?.length && allowed(i) ? cosine(qv, c.embedding) : -1 }))
                .filter(r => r.score > 0.2)
                .sort((a, b) => b.score - a.score)
                .slice(0, 60);
            ranked = fuseRankings([keyword.map(r => r.index), semantic.map(r => r.index)]);
        }
    }

    const seen = new Set();
    const results = [];
    for (const { index: i, score } of ranked) {
        const c = index.chunks[i];
        const key = c.text.slice(0, 200);
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ sourceType: c.sourceType, sourceId: c.sourceId, title: c.title, url: c.url, text: c.text, score: Number(score.toFixed(4)) });
        if (results.length >= limit) break;
    }
    return results;
}

/** Passages formatted for a system prompt, within a character budget. */
export function formatKnowledge(passages, maxChars = 4500) {
    let used = 0;
    const blocks = [];
    for (const p of passages) {
        const label = { page: 'Website', document: 'Document', map: 'Page summary', extra: 'Owner notes', catalog: 'Catalog' }[p.sourceType] || 'Source';
        const block = `[${label}: ${p.title}${p.url ? ` — ${p.url}` : ''}]\n${p.text}`;
        if (used + block.length > maxChars) break;
        blocks.push(block);
        used += block.length;
    }
    return blocks.join('\n\n');
}
