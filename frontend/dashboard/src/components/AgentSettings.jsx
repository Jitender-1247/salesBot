import { useState, useEffect } from 'react';
import api from '../api';

const VOICE_SUGGESTIONS = {
    deepgram: ['aura-2-thalia-en', 'aura-2-andromeda-en', 'aura-2-helena-en', 'aura-2-luna-en', 'aura-2-apollo-en', 'aura-2-orion-en', 'aura-2-zeus-en'],
    elevenlabs: [],
    openai: ['nova', 'alloy', 'shimmer', 'echo', 'onyx', 'fable']
};

const EMPTY_ITEM = { sku: '', name: '', price: '', currency: 'USD', image: '', url: '', ctaLabel: 'View product', description: '' };

const label = 'block text-xs font-semibold mb-1.5';
const hint = 'text-[11px] mt-1';

function Field({ title, help, children }) {
    return (
        <div>
            <label className={label} style={{ color: 'var(--text-sub)' }}>{title}</label>
            {children}
            {help && <p className={hint} style={{ color: 'var(--text-muted)' }}>{help}</p>}
        </div>
    );
}

function Section({ icon, title, subtitle, children }) {
    return (
        <div className="ultra-card p-6 space-y-4">
            <div className="flex items-start gap-3">
                <span className="text-2xl">{icon}</span>
                <div>
                    <h2 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>{title}</h2>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-sub)' }}>{subtitle}</p>
                </div>
            </div>
            {children}
        </div>
    );
}

/** Persona, shoppable catalog, proactive nudges, human handover and recording for one product. */
export default function AgentSettings({ product, onSaved }) {
    const [options, setOptions] = useState({ industries: [], defaultVoices: {}, recordingAvailable: false });
    const [persona, setPersona] = useState(product.persona || {});
    const [catalog, setCatalog] = useState(product.catalog || []);
    const [nudges, setNudges] = useState(product.nudges || {});
    const [handover, setHandover] = useState(product.handover || { mode: 'ai_first', waitSeconds: 45 });
    const [recordingEnabled, setRecordingEnabled] = useState(Boolean(product.recordingEnabled));
    const [importText, setImportText] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null); // { ok, message }

    useEffect(() => {
        api.get('/products/meta/persona-options').then(res => setOptions(res.data)).catch(() => {});
    }, []);

    const setP = (key) => (e) => setPersona(prev => ({ ...prev, [key]: e.target.value }));
    const setN = (key, parse = v => v) => (e) => setNudges(prev => ({ ...prev, [key]: parse(e.target.type === 'checkbox' ? e.target.checked : e.target.value) }));
    const industry = options.industries.find(i => i.key === (persona.industry || 'saas'));
    const voiceProvider = persona.voiceProvider || 'deepgram';

    const updateItem = (index, key, value) => {
        setCatalog(prev => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
    };

    const importCatalog = () => {
        try {
            const parsed = JSON.parse(importText);
            if (!Array.isArray(parsed)) throw new Error('Expected a JSON array');
            setCatalog(parsed.map(item => ({ ...EMPTY_ITEM, ...item, price: item.price ?? '' })));
            setImportText('');
            setShowImport(false);
            setStatus({ ok: true, message: `Imported ${parsed.length} items. Click Save to apply.` });
        } catch (err) {
            setStatus({ ok: false, message: `Import failed: ${err.message}` });
        }
    };

    const rules = nudges.urlRules || [];
    const setRules = (next) => setNudges(prev => ({ ...prev, urlRules: next }));

    const save = async () => {
        setSaving(true);
        setStatus(null);
        try {
            const res = await api.patch(`/products/${product._id}/config`, {
                persona,
                catalog: catalog.map(item => ({
                    ...item,
                    price: item.price === '' || item.price === null ? null : Number(item.price),
                    tags: typeof item.tags === 'string' ? item.tags.split(',') : item.tags
                })),
                nudges,
                handover,
                recordingEnabled
            });
            setStatus({ ok: true, message: 'Agent settings saved. New conversations use them right away.' });
            onSaved?.(res.data);
        } catch (err) {
            setStatus({ ok: false, message: err.response?.data?.message || 'Could not save settings' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* ── Persona ── */}
            <Section icon="🧑‍💼" title="AI Persona" subtitle="Who the visitor meets: name, face, voice and how they sell.">
                <div className="grid grid-cols-2 gap-4">
                    <Field title="Name">
                        <input className="ultra-input text-xs" value={persona.name || ''} onChange={setP('name')} placeholder="Sofia" />
                    </Field>
                    <Field title="Role">
                        <input className="ultra-input text-xs" value={persona.role || ''} onChange={setP('role')} placeholder="AI Sales Specialist" />
                    </Field>
                    <Field title="Industry template" help={industry ? `Default tone: ${industry.tone}` : ''}>
                        <select className="ultra-input text-xs" value={persona.industry || 'saas'} onChange={setP('industry')}>
                            {options.industries.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                        </select>
                    </Field>
                    <Field title="Language" help="Spoken language code, e.g. en, hi, es">
                        <input className="ultra-input text-xs" value={persona.language || ''} onChange={setP('language')} placeholder="en" />
                    </Field>
                    <Field title="Keyframe persona slug" help="The live avatar face. Leave empty for the server default (public:cassidy_persona-1.5-live).">
                        <input className="ultra-input ultra-input-mono text-xs" value={persona.keyframePersonaSlug || ''} onChange={setP('keyframePersonaSlug')} placeholder="public:cassidy_persona-1.5-live" />
                    </Field>
                    <Field title="…or custom Keyframe persona ID" help="Use this for a custom face built in Keyframe.">
                        <input className="ultra-input ultra-input-mono text-xs" value={persona.keyframePersonaId || ''} onChange={setP('keyframePersonaId')} />
                    </Field>
                    <Field title="Voice provider">
                        <select className="ultra-input text-xs" value={voiceProvider} onChange={setP('voiceProvider')}>
                            <option value="deepgram">Deepgram Aura</option>
                            <option value="elevenlabs">ElevenLabs</option>
                            <option value="openai">OpenAI</option>
                        </select>
                    </Field>
                    <Field title="Voice ID" help={`Default: ${options.defaultVoices[voiceProvider] || '—'}`}>
                        <input className="ultra-input ultra-input-mono text-xs" list="voice-suggestions" value={persona.voiceId || ''} onChange={setP('voiceId')} placeholder={options.defaultVoices[voiceProvider] || ''} />
                        <datalist id="voice-suggestions">
                            {VOICE_SUGGESTIONS[voiceProvider].map(v => <option key={v} value={v} />)}
                        </datalist>
                    </Field>
                    <Field title="Poster image URL" help="A still of the same face, shown on the bubble and before the video connects.">
                        <input className="ultra-input text-xs" value={persona.posterImage || ''} onChange={setP('posterImage')} placeholder="https://…/sofia.png" />
                    </Field>
                    <Field title="Accent color">
                        <div className="flex gap-2">
                            <input type="color" value={persona.accentColor || '#8b5cf6'} onChange={setP('accentColor')} className="h-9 w-12 rounded cursor-pointer" style={{ background: 'transparent' }} />
                            <input className="ultra-input ultra-input-mono text-xs" value={persona.accentColor || ''} onChange={setP('accentColor')} placeholder="#8b5cf6" />
                        </div>
                    </Field>
                </div>
                <Field title="Opening line" help="Leave empty for an automatic greeting.">
                    <input className="ultra-input text-xs" value={persona.greeting || ''} onChange={setP('greeting')} placeholder={`Hi! I'm ${persona.name || 'Sofia'}. What can I help you with today?`} />
                </Field>
                <Field title="Tone & style" help="Leave empty to use the industry template.">
                    <textarea className="ultra-input text-xs h-16 resize-none" value={persona.tone || ''} onChange={setP('tone')} placeholder={industry?.tone || ''} />
                </Field>
                <Field title="Sales goals" help="What the agent should find out and steer towards.">
                    <textarea className="ultra-input text-xs h-16 resize-none" value={persona.goals || ''} onChange={setP('goals')} placeholder={industry?.goals || ''} />
                </Field>
            </Section>

            {/* ── Catalog ── */}
            <Section icon="🛍️" title="Shoppable Catalog" subtitle="Products the agent can recommend as cards with a buy / view button during the call.">
                <div className="flex gap-2">
                    <button type="button" className="ultra-btn-secondary text-xs" onClick={() => setCatalog(prev => [...prev, { ...EMPTY_ITEM }])}>+ Add product</button>
                    <button type="button" className="ultra-btn-secondary text-xs" onClick={() => setShowImport(v => !v)}>Import JSON</button>
                </div>
                {showImport && (
                    <div className="space-y-2">
                        <textarea className="ultra-input ultra-input-mono text-xs h-28 resize-none" value={importText} onChange={e => setImportText(e.target.value)}
                            placeholder='[{"sku":"RING-01","name":"Solitaire Ring","price":1299,"currency":"USD","image":"https://…","url":"https://…","description":"…","tags":["rings","gold"]}]' />
                        <button type="button" className="ultra-btn-primary text-xs" onClick={importCatalog}>Replace catalog with this JSON</button>
                    </div>
                )}
                {catalog.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No products yet. Without a catalog the agent still answers from your knowledge base.</p>
                ) : (
                    <div className="space-y-3">
                        {catalog.map((item, i) => (
                            <div key={i} className="p-3 rounded-xl grid grid-cols-6 gap-2" style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)' }}>
                                <input className="ultra-input ultra-input-mono text-xs" placeholder="SKU" value={item.sku} onChange={e => updateItem(i, 'sku', e.target.value)} />
                                <input className="ultra-input text-xs col-span-2" placeholder="Name" value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} />
                                <input className="ultra-input text-xs" placeholder="Price" type="number" min="0" step="any" value={item.price ?? ''} onChange={e => updateItem(i, 'price', e.target.value)} />
                                <input className="ultra-input text-xs" placeholder="USD" value={item.currency || ''} onChange={e => updateItem(i, 'currency', e.target.value.toUpperCase())} />
                                <button type="button" className="text-xs font-semibold cursor-pointer" style={{ color: '#f43f5e' }} onClick={() => setCatalog(prev => prev.filter((_, j) => j !== i))}>Remove</button>
                                <input className="ultra-input text-xs col-span-3" placeholder="Product / add-to-cart URL" value={item.url || ''} onChange={e => updateItem(i, 'url', e.target.value)} />
                                <input className="ultra-input text-xs col-span-2" placeholder="Image URL" value={item.image || ''} onChange={e => updateItem(i, 'image', e.target.value)} />
                                <input className="ultra-input text-xs" placeholder="Button label" value={item.ctaLabel || ''} onChange={e => updateItem(i, 'ctaLabel', e.target.value)} />
                                <input className="ultra-input text-xs col-span-4" placeholder="Short description (the agent uses this to recommend)" value={item.description || ''} onChange={e => updateItem(i, 'description', e.target.value)} />
                                <input className="ultra-input text-xs col-span-2" placeholder="Tags, comma separated" value={Array.isArray(item.tags) ? item.tags.join(', ') : (item.tags || '')} onChange={e => updateItem(i, 'tags', e.target.value)} />
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            {/* ── Nudges ── */}
            <Section icon="🎯" title="Proactive Nudges" subtitle="Engage visitors before they ask: the bubble speaks up based on their behaviour on your site.">
                <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-main)' }}>
                    <input type="checkbox" checked={nudges.enabled !== false} onChange={setN('enabled')} /> Enable nudges
                </label>
                <div className="grid grid-cols-2 gap-4">
                    <Field title="Nudge message">
                        <input className="ultra-input text-xs" value={nudges.message || ''} onChange={setN('message')} placeholder={`Hi! I'm ${persona.name || 'Sofia'}. Want a quick 1-on-1 video walkthrough?`} />
                    </Field>
                    <Field title="Show after (seconds on page)">
                        <input className="ultra-input text-xs" type="number" min="0" max="600" value={nudges.delaySeconds ?? 8} onChange={setN('delaySeconds', Number)} />
                    </Field>
                    <Field title="…or after scrolling (% of page)" help="0 = off">
                        <input className="ultra-input text-xs" type="number" min="0" max="100" value={nudges.scrollPercent ?? 0} onChange={setN('scrollPercent', Number)} />
                    </Field>
                    <div className="space-y-2 pt-5">
                        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-sub)' }}>
                            <input type="checkbox" checked={Boolean(nudges.autoOpen)} onChange={setN('autoOpen')} /> Auto-open the video agent when the nudge fires
                        </label>
                        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-sub)' }}>
                            <input type="checkbox" checked={Boolean(nudges.exitIntent)} onChange={setN('exitIntent')} /> Exit intent (opens when the visitor is about to leave)
                        </label>
                    </div>
                </div>
                {nudges.exitIntent && (
                    <Field title="Exit-intent message">
                        <input className="ultra-input text-xs" value={nudges.exitMessage || ''} onChange={setN('exitMessage')} placeholder="Before you go: any questions I can answer in 30 seconds?" />
                    </Field>
                )}
                <Field title="Page-specific messages" help='Shown when the page URL contains the text, e.g. "/pricing".'>
                    <div className="space-y-2">
                        {rules.map((rule, i) => (
                            <div key={i} className="flex gap-2">
                                <input className="ultra-input ultra-input-mono text-xs" style={{ maxWidth: 180 }} placeholder="/pricing" value={rule.urlContains} onChange={e => setRules(rules.map((r, j) => j === i ? { ...r, urlContains: e.target.value } : r))} />
                                <input className="ultra-input text-xs" placeholder="Comparing plans? I can help you pick in a minute." value={rule.message} onChange={e => setRules(rules.map((r, j) => j === i ? { ...r, message: e.target.value } : r))} />
                                <button type="button" className="text-xs font-semibold cursor-pointer px-2" style={{ color: '#f43f5e' }} onClick={() => setRules(rules.filter((_, j) => j !== i))}>✕</button>
                            </div>
                        ))}
                        <button type="button" className="ultra-btn-secondary text-xs" onClick={() => setRules([...rules, { urlContains: '', message: '' }])}>+ Add page rule</button>
                    </div>
                </Field>
            </Section>

            {/* ── Handover + recording ── */}
            <Section icon="🤝" title="Human Handover & Recording" subtitle="Bring your team into live calls from the Live Console.">
                <div className="grid grid-cols-3 gap-3">
                    {[
                        { key: 'ai_first', title: 'AI first → human', desc: 'The AI handles every call and hands over when the visitor asks or needs a person.' },
                        { key: 'human_first', title: 'Human first → AI backup', desc: 'Specialists are paged on every call; the AI covers until someone accepts.' },
                        { key: 'off', title: 'AI only', desc: 'No handover. The AI collects details for a follow-up instead.' }
                    ].map(m => (
                        <button key={m.key} type="button" onClick={() => setHandover(h => ({ ...h, mode: m.key }))}
                            className="p-4 rounded-xl text-left cursor-pointer transition-all"
                            style={{
                                background: handover.mode === m.key ? 'rgba(139, 92, 246, 0.15)' : 'var(--bg-input)',
                                border: `1px solid ${handover.mode === m.key ? 'var(--accent-primary)' : 'var(--border-light)'}`
                            }}>
                            <h3 className="font-bold text-xs" style={{ color: 'var(--text-main)' }}>{m.title}</h3>
                            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--text-sub)' }}>{m.desc}</p>
                        </button>
                    ))}
                </div>
                {handover.mode !== 'off' && (
                    <Field title="Wait for a specialist (seconds)" help="After this, the AI tells the visitor the team will follow up and carries on.">
                        <input className="ultra-input text-xs" style={{ maxWidth: 160 }} type="number" min="10" max="300" value={handover.waitSeconds ?? 45} onChange={e => setHandover(h => ({ ...h, waitSeconds: Number(e.target.value) }))} />
                    </Field>
                )}
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-sub)' }}>
                    <input type="checkbox" checked={recordingEnabled} onChange={e => setRecordingEnabled(e.target.checked)} />
                    Record calls (video + audio)
                    {!options.recordingAvailable && (
                        <span className="status-pill status-pill-yellow text-[10px]">Storage not configured on the server: no recordings will be made</span>
                    )}
                </label>
            </Section>

            <div className="flex items-center gap-4">
                <button onClick={save} disabled={saving} className="ultra-btn-primary text-xs">
                    {saving ? 'Saving...' : 'Save Agent Settings'}
                </button>
                {status && (
                    <p className="text-xs font-semibold" style={{ color: status.ok ? '#10b981' : '#f43f5e' }}>{status.message}</p>
                )}
            </div>
        </div>
    );
}
