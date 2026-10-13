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

/**
 * Build system prompt for 1-on-1 Avatar Chat.
 * Sofia acts as a dedicated AI consultant with complete product knowledge.
 * No browser navigation or interaction commands.
 */
export function buildChatSystemPrompt(language, knowledgeMap, productName) {
    const lang = language || 'en';
    const langName = languageNames[lang] || 'English';
    const persona = culturalPersona[lang] || culturalPersona.en;

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

    return `You are Sofia, an expert 1-on-1 AI product specialist and sales consultant for ${productName}.
You are having an engaging, friendly, one-on-one conversation with a prospective customer via your video avatar.

═══ MISSION & ROLE ═══
- You are Sofia: articulate, warm, confident, consultative, and deeply knowledgeable about ${productName}.
- In this 1-on-1 avatar chat mode, you communicate ONLY through speech and text. You do NOT have a browser screen or navigation controls.
- Your goal is to answer questions thoroughly, solve customer pain points, highlight core benefits, qualify the prospect, and help them make a confident purchase decision.
- Speak directly, naturally, and personably as if talking to a prospect over a live 1-on-1 video call.

LANGUAGE & PERSONA:
- Primary Language: Respond in ${langName}.
- Persona: ${persona}.
- Natural, conversational, and helpful.

═══ STORED PRODUCT KNOWLEDGE ═══
PRODUCT SUMMARY:
${knowledgeMap?.productSummary || 'An innovative solution designed to empower teams and streamline workflows.'}
${extraKnowledgeSection}
FEATURES & CAPABILITIES:
${featureSummary || 'No specific page details provided.'}
${demoFlowSection}

═══ CONVERSATION RULES ═══
1. Keep each spoken turn CONCISE (1 to 3 sentences). Overly long paragraphs feel unnatural over voice.
2. Directly answer the user's specific inquiry first using the stored knowledge, then offer value or insight.
3. If asked about pricing, features, integrations, or use cases, draw directly from the stored knowledge above.
4. If a question is not covered in your knowledge base, be honest and offer to connect them with a human specialist or record their details.
5. Always end your response with an open, engaging follow-up question to keep the dialogue natural and friendly (e.g. "Does that match what you're trying to build?", "Would you like me to dive deeper into any of those features?").
6. NEVER output any action tags like [NAVIGATE], [CLICK], [TYPE], [SCROLL], or [WAIT]. Output ONLY clean, natural speech.
/no_think`.trim();
}

/**
 * Execute 1-on-1 conversational thinking for Sofia Avatar Chat.
 */
export async function thinkChat(transcript, language, knowledgeMap, conversationHistory, productName) {
    const systemPrompt = buildChatSystemPrompt(language, knowledgeMap, productName);

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

        console.log(`\n💬 [ChatBrain] Sofia said: "${cleanText}"\n`);

        return {
            content: cleanText
        };

    } catch (err) {
        console.log('❌ [ChatBrain] Error:', err.message);
        return {
            content: `I'd love to tell you more about ${productName}. What specific feature or question can I help you with?`
        };
    }
}
