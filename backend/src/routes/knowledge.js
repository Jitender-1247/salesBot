import express from 'express';
import Product from '../models/Product.js';
import KnowledgeChunk from '../models/KnowledgeChunk.js';
import KnowledgeDocument from '../models/KnowledgeDocument.js';
import { protect } from '../utils/authMiddleware.js';
import { objectIdParam, isObjectId, optionalString } from '../utils/validate.js';
import { checkUrl } from '../utils/urlSafety.js';
import {
    retrieve, syncDerivedChunks, addDocumentChunks, removeDocumentChunks, embeddingsEnabled, ensureIndexed
} from '../agent/rag/knowledge.js';

// Mounted at /api/products/:id/knowledge
const router = express.Router({ mergeParams: true });
router.param('id', objectIdParam);

const MAX_DOC_CHARS = 400_000;
const MAX_FETCH_BYTES = 3 * 1024 * 1024;
const MAX_DOCS_PER_PRODUCT = 100;

async function ownedProduct(req, res) {
    if (!isObjectId(req.params.id)) { res.status(404).json({ message: 'Not found' }); return null; }
    const product = await Product.findOne({ _id: req.params.id, clientId: req.clientId });
    if (!product) res.status(404).json({ message: 'Product not found' });
    return product;
}

const decodeEntities = (s) => s
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16) || 32));

/** Readable text from HTML: drop scripts, styles and site chrome, keep block structure as line breaks. */
function htmlToText(html) {
    return decodeEntities(html
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style|noscript|svg|template|iframe|head|nav|header|footer)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre|dd|dt|table|ul|ol)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '\n• ')
        .replace(/<[^>]+>/g, ' '))
        .replace(/[ \t]+/g, ' ')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Fetch a public page or text file. Every redirect hop is re-checked against private addresses (SSRF). */
async function fetchUrlText(rawUrl) {
    let url = rawUrl;
    for (let hop = 0; hop < 4; hop++) {
        const problem = await checkUrl(url);
        if (problem) throw new Error(problem);
        const res = await fetch(url, {
            redirect: 'manual',
            signal: AbortSignal.timeout(15000),
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SalesBotKnowledgeImporter/1.0)', 'Accept': 'text/html,text/plain,*/*' }
        });
        if ([301, 302, 303, 307, 308].includes(res.status)) {
            const next = res.headers.get('location');
            if (!next) throw new Error('Redirect without a location');
            url = new URL(next, url).href;
            continue;
        }
        if ([401, 403, 429].includes(res.status)) {
            throw new Error(`the site refused the import (HTTP ${res.status}). Copy the page text into "Paste text", or upload it as a file.`);
        }
        if (!res.ok) throw new Error(`the page returned HTTP ${res.status}`);
        const type = res.headers.get('content-type') || '';
        if (!/text\/|json|xml/i.test(type)) throw new Error('Only web pages and text files can be imported by URL. Upload PDFs as a file.');

        const reader = res.body.getReader();
        const parts = [];
        let size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > MAX_FETCH_BYTES) { await reader.cancel().catch(() => {}); break; }
            parts.push(value);
        }
        const body = Buffer.concat(parts).toString('utf8');
        const isHtml = /html/i.test(type) || /^\s*<(!doctype|html)/i.test(body);
        const title = isHtml ? decodeEntities((body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim()) : '';
        return { text: isHtml ? htmlToText(body) : body.trim(), title, finalUrl: url };
    }
    throw new Error('Too many redirects');
}

// Overview: index size, sources, documents, exploration timing
router.get('/', protect, async (req, res) => {
    try {
        let product = await ownedProduct(req, res);
        if (!product) return;
        await ensureIndexed(product);
        product = await Product.findById(product._id).select('knowledgeIndex explorationStats explorationStatus');

        const [bySource, documents] = await Promise.all([
            KnowledgeChunk.aggregate([
                { $match: { productId: product._id } },
                { $group: { _id: '$sourceType', count: { $sum: 1 } } }
            ]),
            KnowledgeDocument.find({ productId: product._id }).select('-text').sort({ createdAt: -1 }).lean()
        ]);

        res.json({
            index: product.knowledgeIndex,
            sources: Object.fromEntries(bySource.map(s => [s._id, s.count])),
            documents,
            explorationStats: product.explorationStats,
            explorationStatus: product.explorationStatus,
            search: embeddingsEnabled() ? 'hybrid' : 'keyword'
        });
    } catch (err) {
        console.error('Knowledge overview error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add a document: pasted / uploaded text, or a URL to import
router.post('/documents', protect, async (req, res) => {
    try {
        const product = await ownedProduct(req, res);
        if (!product) return;

        if (await KnowledgeDocument.countDocuments({ productId: product._id }) >= MAX_DOCS_PER_PRODUCT) {
            return res.status(400).json({ message: `A product can have at most ${MAX_DOCS_PER_PRODUCT} documents` });
        }

        const body = req.body || {};
        let title = optionalString(body.title, 200);
        const url = optionalString(body.url, 2048);
        let text = typeof body.text === 'string' ? body.text : '';
        let kind = body.kind === 'file' ? 'file' : 'text';
        let sourceUrl = '';
        if (title === null || url === null) return res.status(400).json({ message: 'Title or URL is too long' });

        if (url) {
            try {
                const fetched = await fetchUrlText(url);
                text = fetched.text;
                title = title || fetched.title || url;
                sourceUrl = fetched.finalUrl;
                kind = 'url';
            } catch (err) {
                return res.status(400).json({ message: `Could not import that URL: ${err.message}` });
            }
        }

        text = text.replace(/\u0000/g, '').trim();
        if (text.length < 20) return res.status(400).json({ message: 'The document has no readable text' });
        if (text.length > MAX_DOC_CHARS) text = text.slice(0, MAX_DOC_CHARS);
        if (!title) return res.status(400).json({ message: 'A title is required' });

        const doc = await KnowledgeDocument.create({ productId: product._id, title, kind, sourceUrl, text, chars: text.length });
        const chunkCount = await addDocumentChunks(doc);
        doc.chunkCount = chunkCount;
        await KnowledgeDocument.updateOne({ _id: doc._id }, { chunkCount });

        const { text: _omit, ...meta } = doc.toObject();
        res.status(201).json(meta);
    } catch (err) {
        console.error('Add knowledge document error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/documents/:docId', protect, async (req, res) => {
    try {
        const product = await ownedProduct(req, res);
        if (!product) return;
        if (!isObjectId(req.params.docId)) return res.status(404).json({ message: 'Document not found' });
        const doc = await KnowledgeDocument.findOneAndDelete({ _id: req.params.docId, productId: product._id });
        if (!doc) return res.status(404).json({ message: 'Document not found' });
        await removeDocumentChunks(product._id, doc._id);
        res.json({ message: 'Document removed' });
    } catch (err) {
        console.error('Delete knowledge document error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Rebuild passages from the product record (summaries, owner notes, catalog) and re-chunk documents
router.post('/reindex', protect, async (req, res) => {
    try {
        const product = await ownedProduct(req, res);
        if (!product) return;
        for (const doc of await KnowledgeDocument.find({ productId: product._id })) {
            await addDocumentChunks(doc);
        }
        const total = await syncDerivedChunks(product);
        res.json({ message: 'Knowledge base re-indexed', chunkCount: total });
    } catch (err) {
        console.error('Reindex error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// "Test a question": what the agent would read before answering
router.post('/search', protect, async (req, res) => {
    try {
        const product = await ownedProduct(req, res);
        if (!product) return;
        const question = optionalString(req.body?.question, 500);
        if (!question) return res.status(400).json({ message: 'Ask a question' });
        await ensureIndexed(product);
        const t0 = Date.now();
        const results = await retrieve(product._id, { question, limit: 8 });
        res.json({ ms: Date.now() - t0, search: embeddingsEnabled() ? 'hybrid' : 'keyword', results });
    } catch (err) {
        console.error('Knowledge search error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
