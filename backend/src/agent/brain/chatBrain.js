import dotenv from 'dotenv';
dotenv.config();

const OPENAI_API_KEY     = process.env.OPENAI_API_KEY;
const OPENAI_MODEL       = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL   = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

const GROQ_API_KEY       = process.env.GROQ_API_KEY;
const GROQ_MODEL         = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const OLLAMA_BASE_URL    = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL       = process.env.OLLAMA_MODEL || 'qwen3:1.7b';

// Determine LLM Provider Priority: OpenAI > OpenRouter > Groq > Ollama
let PROVIDER_NAME = 'ollama';
let LLM_API_KEY = '';
let LLM_BASE_URL = '';
let LLM_MODEL = '';

if (OPENAI_API_KEY) {
    PROVIDER_NAME = 'OpenAI';
    LLM_API_KEY = OPENAI_API_KEY;
    LLM_BASE_URL = 'https://api.openai.com/v1';
    LLM_MODEL = OPENAI_MODEL;
} else if (OPENROUTER_API_KEY) {
    PROVIDER_NAME = 'OpenRouter';
    LLM_API_KEY = OPENROUTER_API_KEY;
    LLM_BASE_URL = 'https://openrouter.ai/api/v1';
    LLM_MODEL = OPENROUTER_MODEL;
} else if (GROQ_API_KEY) {
    PROVIDER_NAME = 'Groq';
    LLM_API_KEY = GROQ_API_KEY;
    LLM_BASE_URL = 'https://api.groq.com/openai/v1';
    LLM_MODEL = GROQ_MODEL;
}

const USE_REMOTE_LLM = Boolean(LLM_API_KEY);

const languageNames = {
    en: 'English', hi: 'Hindi', es: 'Spanish',
    fr: 'French', de: 'German', ja: 'Japanese',
    ar: 'Arabic', pt: 'Portuguese', zh: 'Chinese',
    ko: 'Korean', it: 'Italian', ru: 'Russian'
};

const culturalPersona = {
    en: 'Direct, confident, consultative, and warm',
    hi: 'Warm, relationship-first, and respectful',
    es: 'Energetic, personable, and engaging',
    fr: 'Thoughtful, elegant, and articulate',
    de: 'Clear, structured, and precise',
    ja: 'Polite, patient, and thorough',
    ar: 'Respectful, consultative, and hospitable',
    pt: 'Friendly, enthusiastic, and approachable'
};

function stripThinkBlocks(text) {
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

const MAX_CATALOG_IN_PROMPT = 60;

function formatCatalog(catalog = []) {
    return catalog.slice(0, MAX_CATALOG_IN_PROMPT).map(item => {
        const price = item.price !== null && item.price !== undefined ? ` | ${item.currency || ''} ${item.price}` : '';
        const tags = item.tags?.length ? ` | tags: ${item.tags.join(', ')}` : '';
        const desc = item.description ? ` — ${item.description.slice(0, 160)}` : '';
        return `- [${item.sku}] ${item.name}${price}${tags}${desc}`;
    }).join('\n');
}

/**
 * Build system prompt for 1-on-1 Avatar Chat.
 * The persona (name, role, tone, goals) comes from the product's settings.
 * No browser navigation; the only actions are product cards and human handover.
 */
export function buildChatSystemPrompt(language, knowledgeMap, productName, { persona, catalog = [], handoverAvailable = false } = {}) {
    const lang = language || 'en';
    const langName = languageNames[lang] || 'English';
    const culture = culturalPersona[lang] || culturalPersona.en;
    const agentName = persona?.name || 'Sofia';
    const agentRole = persona?.role || 'AI product specialist';

    const pages = knowledgeMap?.pages || [];
    const featureSummary = pages
        .map(p => {
            let entry = `📄 Section/Page: ${p.name}`;
            if (p.description) entry += `\n   Overview: ${p.description}`;
            if (p.keyFeatures?.length) entry += `\n   Key Capabilities: ${p.keyFeatures.join(', ')}`;
            if (p.talkingPoints?.length) entry += `\n   💬 Talking Points: ${p.talkingPoints.join(' | ')}`;
            if (p.commonQuestions?.length) entry += `\n   ❓ FAQs/Common Questions: ${p.commonQuestions.join(' | ')}`;
            if (p.demoTip) entry += `\n   💡 Sales Insight: ${p.demoTip}`;
            return entry;
        })
        .join('\n\n');

    let extraKnowledgeSection = '';
    if (knowledgeMap?.extraKnowledge) {
        extraKnowledgeSection = `\n═══ PRODUCT OWNER KNOWLEDGE BASE ═══\n${knowledgeMap.extraKnowledge}\n`;
    }

    let demoFlowSection = '';
    if (knowledgeMap?.suggestedDemoFlow?.length) {
        demoFlowSection = '\nRECOMMENDED VALUE HIGHLIGHTS:\n' + knowledgeMap.suggestedDemoFlow
            .map(s => `  ${s.step}. ${s.page}: ${s.talkingPoint}`)
            .join('\n');
    }

    const catalogSection = catalog.length
        ? `\n═══ PRODUCT CATALOG (you can show these as cards) ═══\n${formatCatalog(catalog)}\n`
        : '';

    const actionRules = [];
    if (catalog.length) {
        actionRules.push('- When recommending a specific catalog item, append [SHOW_PRODUCT: SKU] at the very end of your reply (max 2 per reply, exact SKUs from the catalog only). The visitor sees a product card with a buy/view button. Never read the SKU or the tag aloud.');
    }
    if (handoverAvailable) {
        actionRules.push('- If the visitor asks for a human, a real person, a specialist or a sales rep, or needs something you cannot do (custom quote, order issue, negotiation), say you will connect them and append [HANDOVER] at the very end of your reply.');
    } else {
        actionRules.push('- If the visitor asks for a human, explain that the team is not online right now and offer to note their details for a follow-up.');
    }

    return `You are ${agentName}, ${agentRole} for ${productName}.
You are having an engaging, friendly, one-on-one conversation with a prospective customer via your video avatar.

═══ MISSION & ROLE ═══
- You are ${agentName}: articulate, warm, confident, consultative, and deeply knowledgeable about ${productName}.
- In this 1-on-1 avatar chat mode, you communicate ONLY through speech and text. You do NOT have a browser screen or navigation controls.
- Your goal is to answer questions thoroughly, solve customer pain points, highlight core benefits, qualify the prospect, and help them make a confident purchase decision.
- Speak directly, naturally, and personably as if talking to a prospect over a live 1-on-1 video call.

LANGUAGE & PERSONA:
- Primary Language: Respond in ${langName}.
- Cultural style: ${culture}.
- Brand tone: ${persona?.tone || 'Natural, conversational, and helpful.'}

SALES GOALS:
${persona?.goals || 'Answer questions, qualify interest, and guide the visitor to the next step.'}

═══ STORED PRODUCT KNOWLEDGE ═══
PRODUCT SUMMARY:
${knowledgeMap?.productSummary || 'An innovative solution designed to empower teams and streamline workflows.'}
${extraKnowledgeSection}
FEATURES & CAPABILITIES:
${featureSummary || 'No specific page details provided.'}
${demoFlowSection}
${catalogSection}
═══ CONVERSATION RULES ═══
1. Keep each spoken turn CONCISE (1 to 3 sentences). Overly long paragraphs feel unnatural over voice.
2. Directly answer the user's specific inquiry first using the stored knowledge, then offer value or insight.
3. If asked about pricing, features, integrations, or use cases, draw directly from the stored knowledge above.
4. If a question is not covered in your knowledge base, be honest and offer to connect them with a human specialist or record their details.
5. Always end your response with an open, engaging follow-up question to keep the dialogue natural and friendly (e.g. "Does that match what you're trying to build?", "Would you like me to dive deeper into any of those features?").
6. NEVER output browser tags like [NAVIGATE], [CLICK], [TYPE], [SCROLL], or [WAIT].

═══ ACTIONS ═══
${actionRules.join('\n')}
/no_think`.trim();
}

/** Pull [SHOW_PRODUCT: x] / [HANDOVER] actions out of the reply, leaving clean speech. */
export function extractActions(text, catalog = []) {
    const skus = new Set(catalog.map(c => c.sku));
    const showProducts = [];
    let handover = false;

    const speech = text
        .replace(/\[SHOW_PRODUCT:\s*([^\]]+?)\s*\]/gi, (_, sku) => {
            if (skus.has(sku) && !showProducts.includes(sku) && showProducts.length < 2) showProducts.push(sku);
            return '';
        })
        .replace(/\[HANDOVER\]/gi, () => { handover = true; return ''; })
        .replace(/\s{2,}/g, ' ')
        .trim();

    return { speech, showProducts, handover };
}

/**
 * Execute 1-on-1 conversational thinking for the avatar chat.
 * Returns { content, showProducts: [sku], handover: boolean }.
 */
export async function thinkChat(transcript, language, knowledgeMap, conversationHistory, productName, options = {}) {
    const systemPrompt = buildChatSystemPrompt(language, knowledgeMap, productName, options);

    const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : m.role,
            content: m.content
        })),
        {
            role: 'user',
            content: transcript
        }
    ];

    try {
        let content = '';

        if (USE_REMOTE_LLM) {
            const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${LLM_API_KEY}`
                },
                body: JSON.stringify({
                    model: LLM_MODEL,
                    messages,
                    max_tokens: 300,
                    temperature: 0.5
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log(`❌ [ChatBrain] ${PROVIDER_NAME} error:`, errorText);
                throw new Error(`${PROVIDER_NAME} error: ${response.status}`);
            }

            const data = await response.json();
            content = data.choices?.[0]?.message?.content || '';
            content = stripThinkBlocks(content);
        } else {
            const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    messages,
                    stream: false,
                    think: false,
                    options: {
                        num_predict: 200,
                        num_ctx: 2048,
                        temperature: 0.5
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log('❌ [ChatBrain] Ollama error:', errorText);
                throw new Error(`Ollama error: ${response.status}`);
            }

            const data = await response.json();
            const message = data.message || {};
            content = message.content || '';
            content = stripThinkBlocks(content);
        }

        // Clean any stray brackets or formatting
        const cleanText = content
            .replace(/\[NAVIGATE:\s*.+?\]/gi, '')
            .replace(/\[CLICK:\s*.+?\]/gi, '')
            .replace(/\[TYPE:\s*.+?\]/gi, '')
            .replace(/\[SCROLL_DOWN\]/gi, '')
            .replace(/\[SCROLL_UP\]/gi, '')
            .replace(/\[SCROLL:\s*(.+?)\]/gi, '')
            .replace(/\[WAIT\]/gi, '')
            .trim();

        const { speech, showProducts, handover } = extractActions(cleanText, options.catalog);
        console.log(`\n💬 [ChatBrain] ${options.persona?.name || 'Agent'} said: "${speech}"${showProducts.length ? ` | products: ${showProducts.join(', ')}` : ''}${handover ? ' | HANDOVER' : ''}\n`);

        return {
            content: speech,
            showProducts,
            handover: handover && Boolean(options.handoverAvailable)
        };

    } catch (err) {
        console.log('❌ [ChatBrain] Error:', err.message);
        return {
            content: `I'd love to tell you more about ${productName}. What specific feature or question can I help you with?`,
            showProducts: [],
            handover: false
        };
    }
}
