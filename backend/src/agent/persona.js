/**
 * Persona resolution — one place that turns a Product's (possibly sparse) persona
 * settings into the full identity used by the brain, the Keyframe avatar, TTS and the widget.
 */

const DEFAULT_KEYFRAME_SLUG = process.env.KEYFRAME_PERSONA_SLUG || 'public:cassidy_persona-1.5-live';

export const DEFAULT_VOICES = {
    deepgram: 'aura-2-thalia-en',
    elevenlabs: process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL',
    openai: 'nova'
};

// Industry templates: default tone, goals and opener when the merchant leaves them blank
export const INDUSTRY_PRESETS = {
    saas: {
        label: 'SaaS / Software',
        tone: 'Consultative, confident and concise. Translate features into business outcomes.',
        goals: 'Understand the visitor\'s use case, team size and timeline. Recommend the right plan and offer a follow-up with the team.'
    },
    luxury_retail: {
        label: 'Luxury Retail & Jewellery',
        tone: 'Elegant, warm and unhurried, like a private boutique advisor. Never pushy.',
        goals: 'Learn the occasion, recipient and budget. Recommend 1-2 pieces from the catalog and invite them to view or reserve.'
    },
    fashion: {
        label: 'Fashion & Apparel',
        tone: 'Friendly, upbeat stylist. Short, visual descriptions.',
        goals: 'Ask about occasion, style and size. Show matching items from the catalog and guide them to add to cart.'
    },
    electronics: {
        label: 'Electronics',
        tone: 'Knowledgeable and clear. Compare specs in plain language.',
        goals: 'Find out how they will use the device and their budget. Recommend the best-fit model and address objections.'
    },
    real_estate: {
        label: 'Real Estate',
        tone: 'Professional, reassuring and precise.',
        goals: 'Qualify location, budget, configuration and move-in timeline. Offer a site visit or callback with a property advisor.'
    },
    automotive: {
        label: 'Automotive',
        tone: 'Enthusiastic but trustworthy.',
        goals: 'Understand needs (family, commute, budget, fuel type). Recommend a model and offer a test drive booking.'
    },
    banking: {
        label: 'Banking & Financial Services',
        tone: 'Calm, precise and compliant. Never promise returns or give personalised financial advice.',
        goals: 'Identify the product they need, check eligibility basics and hand over to an advisor for applications.'
    },
    insurance: {
        label: 'Insurance',
        tone: 'Empathetic and clear. Avoid jargon.',
        goals: 'Understand who needs cover and why. Explain plan options and connect them to an advisor for a quote.'
    },
    healthcare: {
        label: 'Healthcare',
        tone: 'Caring, calm and careful. Never diagnose; direct medical questions to professionals.',
        goals: 'Help visitors find the right service or appointment and capture contact details for follow-up.'
    },
    travel: {
        label: 'Travel & Hospitality',
        tone: 'Warm, inspiring and helpful.',
        goals: 'Learn destination, dates, travellers and budget. Suggest packages and offer to have an expert finalise the booking.'
    }
};

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Full persona for a product with every field filled in. */
export function resolvePersona(product) {
    const p = product?.persona || {};
    const industry = INDUSTRY_PRESETS[p.industry] ? p.industry : 'saas';
    const preset = INDUSTRY_PRESETS[industry];
    const voiceProvider = DEFAULT_VOICES[p.voiceProvider] ? p.voiceProvider : 'deepgram';
    const name = str(p.name) || 'Sofia';
    const productName = product?.name || 'our product';

    return {
        name,
        role: str(p.role) || 'AI Sales Specialist',
        industry,
        keyframePersonaSlug: str(p.keyframePersonaSlug) || (str(p.keyframePersonaId) ? '' : DEFAULT_KEYFRAME_SLUG),
        keyframePersonaId: str(p.keyframePersonaId),
        voiceProvider,
        voiceId: str(p.voiceId) || DEFAULT_VOICES[voiceProvider],
        posterImage: str(p.posterImage),
        accentColor: str(p.accentColor),
        greeting: str(p.greeting) || `Hi! I'm ${name}, your ${str(p.role) || 'AI specialist'} for ${productName}. What can I help you with today?`,
        tone: str(p.tone) || preset.tone,
        goals: str(p.goals) || preset.goals,
        language: str(p.language) || 'en'
    };
}

/** Sent to the Keyframe sidecar as agent dispatch metadata: which face and which voice to use. */
export function avatarDispatchMetadata(persona) {
    return JSON.stringify({
        personaSlug: persona.keyframePersonaSlug,
        personaId: persona.keyframePersonaId,
        voice: { provider: persona.voiceProvider, id: persona.voiceId }
    });
}

/** Safe subset for the public widget: nothing here may be secret. */
export function publicWidgetConfig(product, { humanAvailable = false } = {}) {
    const persona = resolvePersona(product);
    const n = product?.nudges || {};
    const handoverMode = product?.handover?.mode || 'ai_first';

    return {
        productId: product._id,
        name: product.name,
        summary: product.knowledgeMap?.productSummary || '',
        persona: {
            name: persona.name,
            role: persona.role,
            posterImage: persona.posterImage,
            accentColor: persona.accentColor
        },
        nudges: {
            enabled: n.enabled !== false,
            message: str(n.message) || `Hi! I'm ${persona.name}. Want a quick 1-on-1 video walkthrough?`,
            delaySeconds: Number.isFinite(n.delaySeconds) ? n.delaySeconds : 8,
            scrollPercent: n.scrollPercent || 0,
            exitIntent: Boolean(n.exitIntent),
            exitMessage: str(n.exitMessage) || `Before you go: any questions I can answer in 30 seconds?`,
            autoOpen: Boolean(n.autoOpen),
            urlRules: (n.urlRules || []).filter(r => r.urlContains && r.message).map(r => ({ urlContains: r.urlContains, message: r.message }))
        },
        handover: {
            mode: handoverMode,
            humanAvailable: handoverMode !== 'off' && humanAvailable
        }
    };
}
