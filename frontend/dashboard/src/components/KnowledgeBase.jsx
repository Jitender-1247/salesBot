import { useState, useEffect, useCallback } from 'react';
import api from '../api';

const SOURCE_LABELS = {
    page: 'Website pages',
    document: 'Documents',
    map: 'Page summaries',
    extra: 'Owner notes',
    catalog: 'Catalog items'
};

const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Text from a PDF, read in the browser (no upload of the binary). The PDF library loads only when needed. */
async function pdfToText(file) {
    const pdfjs = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const pages = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 300); i++) {
        const content = await (await pdf.getPage(i)).getTextContent();
        pages.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join(''));
    }
    return pages.join('\n\n');
}

function formatMs(ms) {
    if (!ms && ms !== 0) return '—';
    return ms >= 60000 ? `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s` : `${(ms / 1000).toFixed(1)}s`;
}

const label = 'block text-xs font-semibold mb-1.5';

/** Knowledge base (RAG): what the agent can look up, adding documents, testing questions, exploration timing. */
export default function KnowledgeBase({ productId, explorationStatus, onReexplore }) {
    const [overview, setOverview] = useState(null);
    const [mode, setMode] = useState('text');
    const [title, setTitle] = useState('');
    const [text, setText] = useState('');
    const [url, setUrl] = useState('');
    const [busy, setBusy] = useState('');
    const [status, setStatus] = useState(null); // { ok, message }
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState(null);
    const [showPages, setShowPages] = useState(false);

    // Bumped after every change; the effect below re-fetches
    const [reloadKey, setReloadKey] = useState(0);
    const load = useCallback(() => setReloadKey(k => k + 1), []);

    useEffect(() => {
        let cancelled = false;
        api.get(`/products/${productId}/knowledge`)
            .then(res => { if (!cancelled) setOverview(res.data); })
            .catch(() => { if (!cancelled) setStatus({ ok: false, message: 'Could not load the knowledge base' }); });
        return () => { cancelled = true; };
    }, [productId, explorationStatus, reloadKey]);

    const run = async (key, fn, okMessage) => {
        setBusy(key);
        setStatus(null);
        try {
            await fn();
            if (okMessage) setStatus({ ok: true, message: okMessage });
            await load();
        } catch (err) {
            setStatus({ ok: false, message: err.response?.data?.message || err.message || 'Something went wrong' });
        } finally {
            setBusy('');
        }
    };

    const addDocument = () => run('add', async () => {
        const body = mode === 'url' ? { title, url } : { title, text, kind: mode === 'file' ? 'file' : 'text' };
        const res = await api.post(`/products/${productId}/knowledge/documents`, body);
        setTitle(''); setText(''); setUrl('');
        setStatus({ ok: true, message: `Added "${res.data.title}" (${res.data.chunkCount} passages). The agent can use it right away.` });
    });

    const readFile = async (file) => {
        if (!file) return;
        if (file.size > MAX_FILE_BYTES) { setStatus({ ok: false, message: 'File is larger than 15 MB' }); return; }
        setBusy('read');
        setStatus(null);
        try {
            const content = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? await pdfToText(file) : await file.text();
            if (content.trim().length < 20) throw new Error('No readable text found in this file (scanned PDFs need OCR first)');
            setText(content);
            setTitle(t => t || file.name.replace(/\.[^.]+$/, ''));
            setStatus({ ok: true, message: `Read ${content.length.toLocaleString()} characters from ${file.name}. Click "Add to knowledge base".` });
        } catch (err) {
            setStatus({ ok: false, message: err.message });
        } finally {
            setBusy('');
        }
    };

    const removeDocument = (doc) => {
        if (!window.confirm(`Remove "${doc.title}" from the knowledge base?`)) return;
        run('del', () => api.delete(`/products/${productId}/knowledge/documents/${doc._id}`), 'Document removed');
    };

    const ask = () => run('ask', async () => {
        const res = await api.post(`/products/${productId}/knowledge/search`, { question });
        setAnswer(res.data);
    });

    const stats = overview?.explorationStats;
    const sources = overview?.sources || {};
    const total = Object.values(sources).reduce((a, b) => a + b, 0);
    const canAdd = mode === 'url' ? url.trim() : (title.trim() && text.trim().length >= 20);

    return (
        <div className="ultra-card p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <span className="text-2xl">📚</span>
                    <div>
                        <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>
                            Knowledge Base
                            <span className="status-pill status-pill-purple text-[10px] ml-2">
                                {overview?.search === 'hybrid' ? 'Hybrid search (keyword + semantic)' : 'Keyword search'}
                            </span>
                        </h2>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>
                            On every question the agent looks up the most relevant passages here and answers from them.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    <button className="ultra-btn-secondary text-xs" disabled={!!busy}
                        onClick={() => run('reindex', () => api.post(`/products/${productId}/knowledge/reindex`), 'Knowledge base re-indexed')}>
                        {busy === 'reindex' ? 'Re-indexing…' : '↻ Re-index'}
                    </button>
                    <button className="ultra-btn-secondary text-xs" disabled={!!busy || explorationStatus === 'exploring'}
                        onClick={() => { if (window.confirm('Re-explore the website? The agent re-reads every page (about 1–3 minutes). Documents and learned shortcuts are kept.')) onReexplore?.(); }}>
                        {explorationStatus === 'exploring' ? 'Exploring…' : '🔍 Re-explore website'}
                    </button>
                </div>
            </div>

            {/* Index contents */}
            <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>{total.toLocaleString()} passages</span>
                {Object.entries(SOURCE_LABELS).map(([key, name]) => sources[key] ? (
                    <span key={key} className="status-pill status-pill-purple text-[10px]">{name}: {sources[key]}</span>
                ) : null)}
                {!sources.page && (
                    <span className="status-pill status-pill-yellow text-[10px]">No full page text yet: re-explore to index the website's pages</span>
                )}
            </div>

            {/* Exploration timing */}
            {stats?.durationMs ? (
                <div className="p-3 rounded-xl text-xs" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)' }}>
                    <div className="flex items-center justify-between">
                        <span style={{ color: 'var(--text-sub)' }}>
                            ⏱️ Last exploration took <b style={{ color: 'var(--text-main)' }}>{formatMs(stats.durationMs)}</b> for {stats.pageCount} pages
                            {stats.finishedAt && <> · {new Date(stats.finishedAt).toLocaleString()}</>}
                        </span>
                        {stats.pages?.length > 0 && (
                            <button className="text-xs font-semibold cursor-pointer" style={{ color: 'var(--accent-primary)' }} onClick={() => setShowPages(v => !v)}>
                                {showPages ? 'Hide pages' : 'Show pages'}
                            </button>
                        )}
                    </div>
                    {showPages && (
                        <div className="mt-2 space-y-1">
                            {stats.pages.map((p, i) => (
                                <div key={i} className="flex justify-between gap-3">
                                    <span className="truncate" style={{ color: 'var(--text-main)' }} title={p.url}>{p.name}</span>
                                    <span className="font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                                        {formatMs(p.ms)} · {(p.chars || 0).toLocaleString()} chars
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}

            {/* Add a document */}
            <div className="space-y-3">
                <div className="flex gap-2">
                    {[['text', 'Paste text'], ['url', 'Import URL'], ['file', 'Upload file']].map(([key, name]) => (
                        <button key={key} type="button" onClick={() => { setMode(key); setStatus(null); }}
                            className={mode === key ? 'ultra-btn-primary text-xs' : 'ultra-btn-secondary text-xs'}>{name}</button>
                    ))}
                </div>

                {mode !== 'url' && (
                    <div>
                        <label className={label} style={{ color: 'var(--text-sub)' }}>Title</label>
                        <input className="ultra-input text-xs" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Pricing FAQ, Return policy, Spec sheet" />
                    </div>
                )}
                {mode === 'text' && (
                    <textarea className="ultra-input text-xs h-32 resize-y" value={text} onChange={e => setText(e.target.value)}
                        placeholder="Paste FAQs, policies, specs, objection handling, competitor comparisons…" />
                )}
                {mode === 'url' && (
                    <div className="space-y-2">
                        <input className="ultra-input text-xs" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://help.example.com/article/shipping" />
                        <input className="ultra-input text-xs" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional: the page title is used)" />
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Public web pages and text files. Some sites refuse imports; paste the text instead.</p>
                    </div>
                )}
                {mode === 'file' && (
                    <div className="space-y-2">
                        <input type="file" accept=".pdf,.txt,.md,.csv,.json,.html,application/pdf,text/*"
                            className="text-xs" style={{ color: 'var(--text-sub)' }}
                            onChange={e => readFile(e.target.files?.[0])} />
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>PDF, TXT, Markdown, CSV (max 15 MB). Text is extracted in your browser.</p>
                        {text && <p className="text-[11px]" style={{ color: 'var(--text-sub)' }}>Preview: {text.slice(0, 200).replace(/\s+/g, ' ')}…</p>}
                    </div>
                )}
                <button className="ultra-btn-primary text-xs" disabled={!canAdd || !!busy} onClick={addDocument}>
                    {busy === 'add' ? (mode === 'url' ? 'Importing…' : 'Adding…') : busy === 'read' ? 'Reading file…' : 'Add to knowledge base'}
                </button>
            </div>

            {status && <p className="text-xs font-semibold" style={{ color: status.ok ? '#10b981' : '#f43f5e' }}>{status.message}</p>}

            {/* Documents */}
            {overview?.documents?.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>Documents ({overview.documents.length})</h3>
                    {overview.documents.map(doc => (
                        <div key={doc._id} className="flex items-center justify-between gap-3 p-3 rounded-xl text-xs"
                            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)' }}>
                            <div className="min-w-0">
                                <p className="font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                                    {doc.kind === 'url' ? '🔗' : doc.kind === 'file' ? '📄' : '📝'} {doc.title}
                                </p>
                                <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                                    {(doc.chars || 0).toLocaleString()} chars · {doc.chunkCount} passages · {new Date(doc.createdAt).toLocaleDateString()}
                                    {doc.sourceUrl ? ` · ${doc.sourceUrl}` : ''}
                                </p>
                            </div>
                            <button className="text-xs font-semibold cursor-pointer flex-shrink-0" style={{ color: '#f43f5e' }} disabled={!!busy} onClick={() => removeDocument(doc)}>Remove</button>
                        </div>
                    ))}
                </div>
            )}

            {/* Test a question */}
            <div className="space-y-2">
                <h3 className="text-xs font-bold" style={{ color: 'var(--text-main)' }}>Test a question</h3>
                <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (question.trim()) ask(); }}>
                    <input className="ultra-input text-xs" value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. Do you offer refunds?" />
                    <button className="ultra-btn-secondary text-xs" disabled={!question.trim() || !!busy}>{busy === 'ask' ? 'Searching…' : 'Search'}</button>
                </form>
                {answer && (
                    <div className="space-y-2">
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            What the agent would read before answering · {answer.results.length} passages in {answer.ms}ms
                        </p>
                        {answer.results.length === 0 && (
                            <p className="text-xs" style={{ color: '#f59e0b' }}>Nothing relevant found: the agent would say it doesn't know. Add a document that covers this.</p>
                        )}
                        {answer.results.map((r, i) => (
                            <div key={i} className="p-3 rounded-xl text-xs" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)' }}>
                                <div className="flex justify-between gap-2 mb-1">
                                    <span className="font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                                        {i + 1}. {r.title} <span className="status-pill status-pill-purple text-[10px] ml-1">{SOURCE_LABELS[r.sourceType] || r.sourceType}</span>
                                    </span>
                                    <span className="font-mono flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{r.score}</span>
                                </div>
                                <p className="leading-relaxed" style={{ color: 'var(--text-sub)' }}>{r.text.length > 400 ? `${r.text.slice(0, 400)}…` : r.text}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
