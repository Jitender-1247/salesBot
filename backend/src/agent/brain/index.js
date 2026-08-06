import dotenv from 'dotenv';
dotenv.config();

const OPENAI_API_KEY     = process.env.OPENAI_API_KEY;
const OPENAI_MODEL       = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL   = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';

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

/**
 * Build a structured system prompt with numbered element list.
 * This gives the LLM precise targets for clicking — like a real browser agent.
 */
function buildSystemPrompt(language, knowledgeMap, productName, pageContext) {
    const lang = language || 'en';
    const langName = languageNames[lang] || 'English';
    const persona = culturalPersona[lang] || culturalPersona.en;

    // Build a lean page list (just name + url)
    const pageList = knowledgeMap.pages
        .map(p => `  • ${p.name}: ${p.url}`)
        .join('\n');

    // Build a lean feature summary
    const featureSummary = knowledgeMap.pages
        .map(p => `${p.name}: ${p.keyFeatures?.join(', ') || p.description || ''}`)
        .join('\n');

    // Current page context with numbered element list
    let currentPageSection = '';
    if (pageContext) {
        currentPageSection = `
═══ CURRENT PAGE STATE ═══
URL: ${pageContext.url}
Title: ${pageContext.title}
Headings: ${pageContext.headings?.join(', ') || 'none'}`;

        // Build the numbered element list
        if (pageContext.elements && pageContext.elements.length > 0) {
            currentPageSection += '\n\nINTERACTABLE ELEMENTS ON THIS PAGE:';
            for (const el of pageContext.elements) {
                let line = `[${el.id}] ${el.tag}`;
                if (el.text) line += ` "${el.text}"`;
                if (el.testId) line += ` (data-test="${el.testId}")`;
                if (el.selector && !el.testId) line += ` (${el.selector})`;
                if (el.href && el.href !== '#') line += ` → ${el.href}`;
                if (!el.visible) line += ' [off-screen]';
                currentPageSection += `\n${line}`;
            }
        }
    }

    return `You are Sofia, a friendly AI sales demo specialist for ${productName}.
You are on a live voice call, navigating a real browser to demo the product.

LANGUAGE: Respond ONLY in ${langName}. Style: ${persona}

PRODUCT PAGES:
${pageList}

PRODUCT FEATURES:
${featureSummary}

PRODUCT SUMMARY: ${knowledgeMap.productSummary || ''}
${currentPageSection}

═══ OUTPUT FORMAT (STRICT RULES) ═══

1. ALWAYS start with a short spoken sentence (1-3 sentences max).
2. If you need to interact with the browser, append ONE action tag at the END of your message.
3. After your spoken text + action, you MUST end with either:
   - [WAIT] → You are done and waiting for the user to speak next.
   - (no [WAIT]) → You want to take another action immediately without waiting.

ACTION TAGS (use exactly one per turn, only if needed):
• [NAVIGATE: full_url] — Go to a different page. Use exact URLs from PRODUCT PAGES above.
• [CLICK: #id] — Click element by its ID number from the INTERACTABLE ELEMENTS list above. PREFERRED method.
• [CLICK: visible text] — Click by visible text (fallback if no ID match).
• [SCROLL_DOWN] — Scroll the page down.
• [SCROLL_UP] — Scroll the page up.
• [TYPE: css_selector | text to type] — Type text into an input field.

═══ CRITICAL RULES ═══

1. PREFER [CLICK: #id] over text-based clicks. Always check the INTERACTABLE ELEMENTS list first.
2. NEVER repeat an action you already took. If you're already on a page, describe what you see instead.
3. NEVER output an action tag without spoken text before it. Always say something first.
4. If the user asks a general question, just answer it and output [WAIT]. Do NOT navigate.
5. Keep spoken text SHORT — you are on a live call. Max 2-3 sentences.
6. For multi-step tasks (like "add X to cart"), do ONE step per turn:
   Turn 1: "Let me open that item for you." [CLICK: #5]
   Turn 2: "Now I'll add it to your cart." [CLICK: #3]
   Turn 3: "Done! It's in your cart. What else would you like to see?" [WAIT]

═══ EXAMPLES ═══

User: "Show me the products"
(If already on products page) → "You're looking at all our products right now! We have items like the Backpack, Bike Light, and more. Want me to show you any specific one?" [WAIT]
(If on a different page) → "Let me take you to our products page." [NAVIGATE: https://www.saucedemo.com/inventory.html]

User: "Click on the backpack"
(Sees [5] a "Sauce Labs Backpack" in element list) → "Sure, let me open the Backpack for you." [CLICK: #5]

User: "Add it to my cart"
(Sees [3] button "Add to cart" in element list) → "Adding it to your cart now!" [CLICK: #3]

User: "What's the most popular item?"
→ "Based on what I can see, the Sauce Labs Backpack is one of the most popular items — great quality and very practical!" [WAIT]

User: "Go back"
→ "Let me take you back." [NAVIGATE: https://www.saucedemo.com/inventory.html]

/no_think`.trim();
}

export async function think(transcript, language, knowledgeMap, conversationHistory, productName, pageContext) {
    const systemPrompt = buildSystemPrompt(language, knowledgeMap, productName, pageContext);

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
            // ── OpenAI-Compatible API (OpenAI / OpenRouter / Groq) ──
            const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${LLM_API_KEY}`
                },
                body: JSON.stringify({
                    model: LLM_MODEL,
                    messages,
                    max_tokens: 350,
                    temperature: 0.4
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log(`❌ ${PROVIDER_NAME} error:`, errorText);
                throw new Error(`${PROVIDER_NAME} error: ${response.status}`);
            }

            const data = await response.json();
            content = data.choices?.[0]?.message?.content || '';
            content = stripThinkBlocks(content);
            console.log(`\n--- RAW ${PROVIDER_NAME} (${LLM_MODEL}) OUTPUT ---`);
            console.log(content);
            console.log('-------------------------------------------\n');

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
                        num_predict: 250,
                        num_ctx: 2048,
                        temperature: 0.4
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

        // Parse [NAVIGATE: url] tags — handle various LLM formatting quirks
        const navRegex = /\[NAVIGATE:\s*(.+?)\]/gi;
        let match;
        while ((match = navRegex.exec(content)) !== null) {
            const url = match[1].trim();
            // Skip if the URL is the same as the current page
            if (pageContext && pageContext.url === url) {
                console.log(`⚠️ Skipping duplicate navigation to current page: ${url}`);
                continue;
            }
            const page = knowledgeMap.pages.find(p => p.url === url);
            toolCalls.push({
                function: {
                    name: 'navigate_to',
                    arguments: JSON.stringify({ url, pageName: page ? page.name : 'Page' })
                }
            });
        }

        // Parse [CLICK: #id] or [CLICK: text] tags
        const clickRegex = /\[CLICK:\s*(.+?)\]/gi;
        while ((match = clickRegex.exec(content)) !== null) {
            const raw = match[1].trim();

            // Check if it's an element ID reference like #5 or #12
            const idMatch = raw.match(/^#(\d+)$/);
            if (idMatch && pageContext?.elements) {
                const elementId = parseInt(idMatch[1]);
                const element = pageContext.elements.find(el => el.id === elementId);
                if (element) {
                    // Use the best selector available for this element
                    const selector = element.selector || `text="${element.text}"`;
                    console.log(`🎯 Resolved [CLICK: #${elementId}] → "${element.text}" (${selector})`);
                    toolCalls.push({
                        function: {
                            name: 'click_element',
                            arguments: JSON.stringify({
                                selector,
                                description: element.text,
                                elementId
                            })
                        }
                    });
                } else {
                    console.log(`⚠️ Element #${elementId} not found in page context — falling back to text`);
                    toolCalls.push({
                        function: {
                            name: 'click_element',
                            arguments: JSON.stringify({ selector: `text="${raw}"`, description: raw })
                        }
                    });
                }
            } else {
                // Legacy text-based click
                toolCalls.push({
                    function: {
                        name: 'click_element',
                        arguments: JSON.stringify({ selector: `text="${raw}"`, description: raw })
                    }
                });
            }
        }

        // Parse [TYPE: selector | text] tags
        const typeRegex = /\[TYPE:\s*(.+?)\s*\|\s*(.+?)\]/gi;
        while ((match = typeRegex.exec(content)) !== null) {
            const selector = match[1].trim();
            const text = match[2].trim();
            toolCalls.push({
                function: {
                    name: 'type_text',
                    arguments: JSON.stringify({ selector, text })
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
            .replace(/\[NAVIGATE:\s*.+?\]/gi, '')
            .replace(/\[CLICK:\s*.+?\]/gi, '')
            .replace(/\[TYPE:\s*.+?\]/gi, '')
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