import dotenv from 'dotenv';
dotenv.config();

const GROQ_API_KEY    = process.env.GROQ_API_KEY;
const GROQ_MODEL      = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const GROQ_BASE_URL   = 'https://api.groq.com/openai/v1';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL || 'qwen3:1.7b';

const USE_GROQ = Boolean(GROQ_API_KEY);

const languageNames = {
    en: 'English', hi: 'Hindi', es: 'Spanish',
    fr: 'French', de: 'German', ja: 'Japanese',
    ar: 'Arabic', pt: 'Portuguese', zh: 'Chinese',
    ko: 'Korean', it: 'Italian', ru: 'Russian'
};

const culturalPersona = {
    en: 'Direct, confident, and value-focused',
    hi: 'Warm, relationship-first, and respectful',
    es: 'Energetic, personable, and story-driven',
    fr: 'Elegant, thoughtful, and detail-oriented',
    de: 'Precise, technical, and no-fluff',
    ja: 'Formal, patient, and thorough',
    ar: 'Respectful, trust-building, and thorough',
    pt: 'Friendly, enthusiastic, and engaging'
};

export const navigationTools = [
    {
        type: 'function',
        function: {
            name: 'navigate_to',
            description: 'Navigate the browser to a specific page of the product',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'The URL to navigate to' },
                    pageName: { type: 'string', description: 'Name of the page being navigated to' }
                },
                required: ['url', 'pageName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'click_element',
            description: 'Click a button or element on the current page',
            parameters: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector of element to click' },
                    description: { type: 'string', description: 'What this element does' }
                },
                required: ['selector', 'description']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'scroll_to',
            description: 'Scroll to a section on the current page',
            parameters: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector of section to scroll to' },
                    description: { type: 'string', description: 'What section is being scrolled to' }
                },
                required: ['selector', 'description']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'highlight_element',
            description: 'Highlight a UI element to draw attention to it while explaining',
            parameters: {
                type: 'object',
                properties: {
                    selector: { type: 'string', description: 'CSS selector of element to highlight' },
                    label: { type: 'string', description: 'Label to show on the highlight' }
                },
                required: ['selector', 'label']
            }
        }
    }
];

// Convert OpenAI-style tools to Ollama's native tool format
function convertToolsForOllama(tools) {
    return tools.map(t => ({
        type: 'function',
        function: {
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters
        }
    }));
}

function stripThinkBlocks(text) {
    // Remove <think>...</think> blocks from model output
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export async function think(transcript, language, knowledgeMap, conversationHistory, productName) {
    const lang = language || 'en';
    const langName = languageNames[lang] || 'English';
    const persona = culturalPersona[lang] || culturalPersona.en;

    const availablePages = knowledgeMap.pages.map(p => `- ${p.name}: ${p.url}`).join('\n');

    const systemPrompt = `
You are Alex, an expert AI sales demo specialist for ${productName}.

LANGUAGE: You MUST respond ONLY in ${langName}. Never switch languages.
COMMUNICATION STYLE: ${persona}

PRODUCT KNOWLEDGE:
${JSON.stringify(knowledgeMap, null, 2)}

AVAILABLE PAGES TO NAVIGATE TO:
${availablePages}

YOUR ROLE:
- Give an engaging, personalized live demo of this product
- Navigate to features proactively — always SHOW before you explain
- When visitor asks about anything, navigate there immediately then explain
- Sound like a confident, friendly salesperson — not a robot
- Keep responses SHORT — max 2-3 sentences per turn (you are on a live call)

NAVIGATION & INTERACTION RULES (CRITICAL):
If the user asks you to do something on screen, you MUST include one of these exact tags anywhere in your message:
1. Change pages: [NAVIGATE: url]
2. Click a specific product or button: [CLICK: exact text to click]
   (CRITICAL: If asked to add a specific item to the cart, DO NOT just click "Add to cart" because there are many buttons. Instead, click the product name first using [CLICK: Product Name], and then on the next turn add it.)
3. Scroll down: [SCROLL_DOWN]
4. Scroll up: [SCROLL_UP]

AUTONOMY RULES (CRITICAL):
You can now take multiple actions in a row! 
- If you want to take an action, and then immediately take another action without waiting for the user to speak, DO NOT output [WAIT].
- If you have finished your explanation and are waiting for the user to reply or ask the next question, you MUST output: [WAIT]

EXAMPLE MULTI-STEP WORKFLOW:
User: "Show me how to add the jacket to my cart."
Agent (Turn 1): "Sure, first we open the jacket." [CLICK: Sauce Labs Fleece Jacket]
Agent (Turn 2): [CLICK: Add to cart]
Agent (Turn 3): "I've added it to the cart! Should we proceed to checkout?" [WAIT]

RULES:
- Never say you are an AI unless directly asked
- Never make up features that aren't in the knowledge map
- Always be enthusiastic and engaging

/no_think
`.trim();

    const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : m.role,
            content: m.content
        })),
        { 
            role: 'user', 
            content: transcript + '\n\n(SYSTEM REMINDER: If I asked you to interact with the screen, use [CLICK: text], [SCROLL_DOWN], or [NAVIGATE: url]. Remember to output [WAIT] if you want me to respond, or leave it out if you want to take another action automatically!)'
        }
    ];

    try {
        let content = '';

        if (USE_GROQ) {
            // ── Groq (OpenAI-compatible API) ──
            const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: GROQ_MODEL,
                    messages,
                    max_tokens: 300,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log('❌ Groq error:', errorText);
                throw new Error(`Groq error: ${response.status}`);
            }

            const data = await response.json();
            content = data.choices?.[0]?.message?.content || '';
            content = stripThinkBlocks(content);
            console.log('\n--- RAW GROQ OUTPUT ---');
            console.log(content);
            console.log('-----------------------\n');

        } else {
            // ── Ollama (local fallback) ──
            const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: OLLAMA_MODEL,
                    messages,
                    stream: false,
                    think: false,
                    options: {
                        num_predict: 300,
                        num_ctx: 2048,
                        temperature: 0.7
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log('❌ Ollama error:', errorText);
                throw new Error(`Ollama error: ${response.status}`);
            }

            const data = await response.json();
            const message = data.message || {};
            content = message.content || '';
            content = stripThinkBlocks(content);
            console.log('\n--- RAW OLLAMA OUTPUT ---');
            console.log(content);
            console.log('-------------------------\n');
        }


        const toolCalls = [];
        let wantsToWait = false;

        if (/\[WAIT\]/i.test(content)) {
            wantsToWait = true;
        }

        // Parse [NAVIGATE: url] tags
        const navRegex = /\[NAVIGATE:\s*(.+?)\]/gi;
        let match;
        while ((match = navRegex.exec(content)) !== null) {
            const url = match[1].trim();
            const page = knowledgeMap.pages.find(p => p.url === url);
            toolCalls.push({
                function: {
                    name: 'navigate_to',
                    arguments: JSON.stringify({ url, pageName: page ? page.name : 'Page' })
                }
            });
        }

        // Parse [CLICK: text] tags
        const clickRegex = /\[CLICK:\s*(.+?)\]/gi;
        while ((match = clickRegex.exec(content)) !== null) {
            const text = match[1].trim();
            toolCalls.push({
                function: {
                    name: 'click_element',
                    arguments: JSON.stringify({ selector: `text="${text}"`, description: text })
                }
            });
        }

        // Parse [SCROLL_DOWN]
        if (/\[SCROLL_DOWN\]/i.test(content)) {
            toolCalls.push({
                function: { name: 'scroll_dir', arguments: JSON.stringify({ direction: 'down' }) }
            });
        }

        // Parse [SCROLL_UP]
        if (/\[SCROLL_UP\]/i.test(content)) {
            toolCalls.push({
                function: { name: 'scroll_dir', arguments: JSON.stringify({ direction: 'up' }) }
            });
        }

        // Clean spoken text by removing all tags
        let spokenText = content
            .replace(navRegex, '')
            .replace(clickRegex, '')
            .replace(/\[SCROLL_DOWN\]/gi, '')
            .replace(/\[SCROLL_UP\]/gi, '')
            .replace(/\[SCROLL:\s*(.+?)\]/gi, '') 
            .replace(/\[WAIT\]/gi, '')
            .trim();

        // If no tool calls are made, assume it wants to wait by default to prevent infinite loops
        if (toolCalls.length === 0) {
            wantsToWait = true;
        }

        return {
            finish_reason: wantsToWait ? 'stop' : 'tool_calls',
            message: {
                content: spokenText,
                tool_calls: toolCalls.length > 0 ? toolCalls : undefined
            }
        };
    } catch (err) {
        console.log('❌ Brain error:', err.message);
        return {
            finish_reason: 'stop',
            message: {
                content: "I'm having a bit of trouble right now. Let me try that again.",
                tool_calls: undefined
            }
        };
    }
}