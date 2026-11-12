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
                    description: { type: 'string', description: 'What this element does' },
                    dataZyxId: { type: 'string', description: 'The [N] id of the element exactly as listed in INTERACTABLE ELEMENTS, e.g. "12" or "f1_3" (inside a frame). Prefer this over selector.' }
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
    },
    {
        type: 'function',
        function: {
            name: 'open_shortcut',
            description: 'Open a known in-page feature from KNOWN SHORTCUTS (goes to its page if needed and clicks it). Most reliable way to show a listed feature.',
            parameters: {
                type: 'object',
                properties: {
                    shortcutId: { type: 'string', description: 'Shortcut id from KNOWN SHORTCUTS, e.g. "S3"' }
                },
                required: ['shortcutId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'scroll_dir',
            description: 'Scroll the browser viewport up or down',
            parameters: {
                type: 'object',
                properties: {
                    direction: { type: 'string', enum: ['up', 'down'], description: 'Direction to scroll' }
                },
                required: ['direction']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'type_text',
            description: 'Type text into a focused input field',
            parameters: {
                type: 'object',
                properties: {
                    dataZyxId: { type: 'string', description: 'The [N] id of the input as listed in INTERACTABLE ELEMENTS. Prefer this over selector.' },
                    selector: { type: 'string', description: 'CSS selector or placeholder text of the input (fallback)' },
                    text: { type: 'string', description: 'Text to type' }
                },
                required: ['text']
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
    return (text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// ── Knowledge-map page matching ──
// LLMs rarely reproduce URLs byte-for-byte (www, trailing slash, relative path, page name),
// so compare pages by host-without-www + path instead of exact string equality.
function urlKey(url, base) {
    try {
        const u = new URL(url, base);
        return u.hostname.toLowerCase().replace(/^www\./, '') + (u.pathname.replace(/\/+$/, '') || '/');
    } catch {
        return null;
    }
}

const cleanNavTarget = (raw) => String(raw || '').trim()
    .replace(/^[\s'"`<(\[]+/, '')
    .replace(/[\s'"`>)\].,;!?]+$/, '');

/** Map what the LLM wrote in [NAVIGATE: …] to a known page (by URL, path or page name). */
function matchKnownPage(raw, pages, currentUrl) {
    const target = cleanNavTarget(raw);
    if (!target) return null;
    const exact = pages.find(p => p.url === target);
    if (exact) return exact;
    // "www.acme.com/pricing" has no scheme and would otherwise resolve as a relative path
    const absolute = /^[\w-]+(\.[\w-]+)+(\/|$)/.test(target) ? `https://${target}` : target;
    const key = urlKey(absolute, currentUrl || pages[0]?.url);
    const byPath = key && pages.find(p => urlKey(p.url) === key);
    if (byPath) return byPath;
    const name = target.toLowerCase();
    return pages.find(p => p.name && p.name.toLowerCase() === name) || null;
}

/** The knowledge-map page the browser is on: exact path match, else the deepest parent path. */
function findCurrentPage(pages, currentUrl) {
    const current = urlKey(currentUrl);
    if (!current) return null;
    let best = null;
    let bestLength = -1;
    for (const page of pages) {
        const key = urlKey(page.url);
        if (!key) continue;
        if (key === current) return page;
        const isParent = key.endsWith('/') ? current.startsWith(key) : current.startsWith(`${key}/`);
        if (isParent && key.length > bestLength) {
            best = page;
            bestLength = key.length;
        }
    }
    return best;
}

/**
 * Format feedback about action execution outcomes into a structured system message.
 */
export function buildActionFeedback(outcomes) {
    if (!outcomes || outcomes.length === 0) return '';

    const lines = outcomes.map((item, index) => {
        const num = index + 1;
        const tool = item.tool;
        const args = item.args || {};
        const res = item.result || {};

        let label = tool;
        if (tool === 'click_element') {
            const desc = args.description || (args.dataZyxId ? `element #${args.dataZyxId}` : args.selector) || '';
            label = `click_element "${desc}"`;
        } else if (tool === 'navigate_to') {
            const name = args.pageName || args.url || '';
            label = `navigate_to "${name}"`;
        } else if (tool === 'type_text') {
            label = `type_text into "${args.selector}"`;
        } else if (tool === 'scroll_dir') {
            label = `scroll_dir ${args.direction}`;
        } else if (tool === 'open_shortcut') {
            label = `open_shortcut ${args.shortcutId || ''}`;
        }

        if (res.ok === false) {
            return `${num}. ${label} → Failed: ${res.error || 'Action failed'}`;
        }

        const parts = [];
        if (res.urlChanged) {
            parts.push(`URL changed to ${res.newUrl}`);
        } else {
            parts.push('No URL change');
        }

        if (res.titleChanged && res.newTitle) {
            parts.push(`Title: "${res.newTitle}"`);
        }

        if (res.dialogVisible) {
            const dText = res.dialogText ? `: "${res.dialogText}"` : '';
            parts.push(`New dialog appeared${dText}`);
        }

        return `${num}. ${label} → ${parts.join(' | ')}`;
    });

    return `[System: Action results after your last turn:\n${lines.join('\n')}\n]`;
}

/**
 * Build a structured system prompt with numbered element list and page outline.
 * This gives the LLM precise targets for clicking — like a real browser agent.
 */
function buildSystemPrompt(language, knowledgeMap, productName, pageContext, shortcuts = [], knowledge) {
    const lang = language || 'en';
    const langName = languageNames[lang] || 'English';
    const persona = culturalPersona[lang] || culturalPersona.en;

    // Build a lean page list (just name + url)
    const pages = knowledgeMap?.pages || [];
    const pageList = pages
        .map(p => `  • ${p.name}: ${p.url}`)
        .join('\n');

    // Build a RICH feature summary with talking points and descriptions
    const featureSummary = pages
        .map(p => {
            let entry = `📄 ${p.name}`;
            if (p.description) entry += `\n   ${p.description}`;
            if (p.keyFeatures?.length) entry += `\n   Features: ${p.keyFeatures.join(', ')}`;
            if (p.talkingPoints?.length) entry += `\n   💬 Talk about: ${p.talkingPoints.join(' | ')}`;
            if (p.demoTip) entry += `\n   💡 Demo tip: ${p.demoTip}`;
            return entry;
        })
        .join('\n');

    // Build demo flow if available
    let demoFlowSection = '';
    if (knowledgeMap.suggestedDemoFlow?.length) {
        demoFlowSection = '\nSUGGESTED DEMO FLOW (use when user says "show me around" or "give me a tour"):';
        for (const step of knowledgeMap.suggestedDemoFlow) {
            demoFlowSection += `\n  ${step.step}. ${step.page} — ${step.talkingPoint}`;
        }
    }

    // Inject client-provided extra knowledge (sales context, FAQs, competitive info)
    // Knowledge base (RAG) active: only the passages relevant to this question (owner notes are indexed too)
    let extraKnowledgeSection = '';
    if (knowledge !== undefined) {
        if (knowledge) extraKnowledgeSection = `\n═══ RELEVANT KNOWLEDGE FOR THIS QUESTION (from the product's website, documents and notes — prefer these exact facts, never invent numbers) ═══\n${knowledge}`;
    } else if (knowledgeMap.extraKnowledge || '') {
        extraKnowledgeSection = `\n═══ ADDITIONAL PRODUCT KNOWLEDGE (from the product owner) ═══\n${knowledgeMap.extraKnowledge}`;
    }

    // Current page context with numbered element list
    let currentPageSection = '';
    if (pageContext) {
        currentPageSection = `\n═══ CURRENT PAGE STATE ═══\nURL: ${pageContext.url}\nTitle: ${pageContext.title}\nHeadings: ${pageContext.headings?.join(', ') || 'none'}`;

        // Page outline
        if (pageContext.outline && pageContext.outline.length > 0) {
            currentPageSection += '\n\nPAGE OUTLINE (sections ranked by interactables):';
            for (const sec of pageContext.outline) {
                const headingStr = sec.headings?.length ? ` | Headings: ${sec.headings.join('; ')}` : '';
                currentPageSection += `\n  • <${sec.tag}> (${sec.interactableCount} elements)${headingStr}`;
            }
        }

        // Match current page to knowledge map for contextual talking points
        const currentPageKnowledge = findCurrentPage(pages, pageContext.url);
        if (currentPageKnowledge) {
            if (currentPageKnowledge.talkingPoints?.length) {
                currentPageSection += `\n\n💬 TALKING POINTS FOR THIS PAGE:`;
                currentPageKnowledge.talkingPoints.forEach(tp => {
                    currentPageSection += `\n  • ${tp}`;
                });
            }
            if (currentPageKnowledge.commonQuestions?.length) {
                currentPageSection += `\n\n❓ COMMON QUESTIONS USERS ASK ON THIS PAGE:`;
                currentPageKnowledge.commonQuestions.forEach(q => {
                    currentPageSection += `\n  • ${q}`;
                });
            }
        }

        // Build the numbered element list
        if (pageContext.elements && pageContext.elements.length > 0) {
            currentPageSection += '\n\nINTERACTABLE ELEMENTS ON THIS PAGE:';
            for (const el of pageContext.elements) {
                let line = `[${el.id}] ${el.tag}`;
                if (el.role && el.role !== el.tag) line += ` (role="${el.role}")`;
                const textVal = el.accessibleName || el.text || '';
                if (textVal) line += ` "${textVal}"`;
                if (el.testId) line += ` (data-test="${el.testId}")`;
                if (el.selector && !el.testId) line += ` (${el.selector})`;
                if (el.href && el.href !== '#') line += ` → ${el.href}`;
                if (!el.visible) line += ' [off-screen]';
                currentPageSection += `\n${line}`;
            }
        }
    }

    // Recorded / learned ways to open in-page features: one deterministic call instead of picking elements
    if (shortcuts.length > 0) {
        currentPageSection += '\n\nKNOWN SHORTCUTS (verified ways to open a feature; prefer open_shortcut / [SHORTCUT: Sn] when one matches):';
        for (const sc of shortcuts) {
            currentPageSection += `\n[${sc.id}] ${sc.name} → ${sc.pageUrl}`;
        }
    }

    return `You are Sofia, a friendly AI sales demo specialist for ${productName}.
You are on a live voice call, navigating a real browser to demo the product.
Your goal is not just to show pages — you are SELLING. Highlight value, solve pain points, and create excitement.

LANGUAGE: Respond ONLY in ${langName}. Style: ${persona}

PRODUCT SUMMARY: ${knowledgeMap.productSummary || ''}

PRODUCT PAGES:
${pageList}

PRODUCT KNOWLEDGE:
${featureSummary}
${demoFlowSection}
${extraKnowledgeSection}
${currentPageSection}

═══ SALES DEMO BEHAVIOR ═══

1. Don't just describe what you see — explain WHY it matters to the user.
   BAD: "This is the dashboard page."
   GOOD: "This dashboard gives you a real-time view of everything — most teams tell us this saves them hours of manual checking."

2. Use the TALKING POINTS above when available. They contain product-specific knowledge.

3. When the user asks "show me around", follow the SUGGESTED DEMO FLOW if available.

4. Anticipate questions — if a page has COMMON QUESTIONS listed, proactively address them.

5. After showing a feature, ask an engaging follow-up:
   "Would you like to see how this works with your specific use case?"
   "Want me to show you the feature that most customers love?"

═══ OUTPUT FORMAT (STRICT RULES) ═══

1. ALWAYS start with a short spoken sentence (1-3 sentences max) to explain to the user what you are doing or showing.
2. FUNCTION CALLING: You may call up to 4 tools in one turn for steps on THIS page (e.g. type_text then click_element "Search"). Element ids only exist for the current page: after navigate_to (or a click that opens a new page) stop; you will get the new page's elements in the next step.
3. After function calls execute, you will receive a system message with what changed. Use that to continue.
4. When clicking, always use dataZyxId matching the [N] id number from INTERACTABLE ELEMENTS list. This is the most reliable way to click.
5. If a KNOWN SHORTCUT matches what the user wants to see, use open_shortcut with its id (it also opens the right page first).
6. If no browser interaction is required, just provide your spoken response.

FALLBACK ACTION TAGS (for models without native tool calling):
• [NAVIGATE: full_url] — Go to a different page. Use exact URLs from PRODUCT PAGES above.
• [CLICK: #id] — Click element by its ID number from the INTERACTABLE ELEMENTS list above. PREFERRED method.
• [CLICK: visible text] — Click by visible text (fallback if no ID match).
• [SHORTCUT: S3] — Open a feature from KNOWN SHORTCUTS (goes to its page and clicks it).
• [SCROLL_DOWN] — Scroll the page down.
• [SCROLL_UP] — Scroll the page up.
• [TYPE: css_selector | text to type] — Type text into an input field.
• [WAIT] — Waiting for user response.

═══ CRITICAL RULES ═══

1. When clicking, always use dataZyxId matching the [N] id number from INTERACTABLE ELEMENTS list. This is the most reliable way to click.
2. PREFER dataZyxId / [CLICK: #id] over text-based clicks. Always check the INTERACTABLE ELEMENTS list first.
3. NEVER repeat an action you already took. If you're already on a page, describe what you see instead.
4. NEVER output an action tag without spoken text before it. Always say something first.
5. If the user asks a general question, just answer it and output [WAIT] (or no tools). Do NOT navigate.
6. Keep spoken text SHORT — you are on a live call. Max 2-3 sentences.

/no_think`.trim();
}

export async function think(transcript, language, knowledgeMap, conversationHistory, productName, pageContext, shortcuts = [], knowledge) {
    const systemPrompt = buildSystemPrompt(language, knowledgeMap, productName, pageContext, shortcuts, knowledge);

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

        // ── Native Function Calling (OpenAI / Groq) ──
        if (USE_REMOTE_LLM && (PROVIDER_NAME === 'OpenAI' || PROVIDER_NAME === 'Groq')) {
            const response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${LLM_API_KEY}`
                },
                body: JSON.stringify({
                    model: LLM_MODEL,
                    messages,
                    max_tokens: 500,
                    temperature: 0.4,
                    tools: navigationTools,
                    tool_choice: 'auto'
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log(`❌ ${PROVIDER_NAME} error:`, errorText);
                throw new Error(`${PROVIDER_NAME} error: ${response.status}`);
            }

            const data = await response.json();
            const choice = data.choices?.[0];
            const msg = choice?.message || {};
            const rawContent = msg.content || '';
            const spokenText = stripThinkBlocks(rawContent).replace(/\[WAIT\]/gi, '').trim();
            const rawToolCalls = msg.tool_calls || [];

            console.log(`\n--- RAW ${PROVIDER_NAME} (${LLM_MODEL}) OUTPUT ---`);
            console.log('Spoken:', spokenText);
            if (rawToolCalls.length > 0) {
                console.log('Tool calls:', JSON.stringify(rawToolCalls, null, 2));
            }
            console.log('-------------------------------------------\n');

            const toolCalls = [];
            for (const tc of rawToolCalls) {
                let args = tc.function.arguments;
                // Same URL snapping as the text-tag path: small LLM typos still land on the real page
                if (tc.function.name === 'navigate_to') {
                    try {
                        const parsed = typeof args === 'string' ? JSON.parse(args) : { ...args };
                        const pages = knowledgeMap.pages || [];
                        const page = matchKnownPage(parsed.url, pages, pageContext?.url)
                            || matchKnownPage(parsed.pageName, pages, pageContext?.url);
                        if (page) {
                            parsed.url = page.url;
                            parsed.pageName = parsed.pageName || page.name;
                        }
                        if (pageContext && urlKey(pageContext.url) === urlKey(parsed.url, pageContext.url)) {
                            console.log(`⚠️ Skipping duplicate navigation to current page: ${parsed.url}`);
                            continue;
                        }
                        args = JSON.stringify(parsed);
                    } catch { /* leave as-is; the navigator validates the URL */ }
                }
                toolCalls.push({
                    id: tc.id,
                    type: tc.type || 'function',
                    function: { name: tc.function.name, arguments: args }
                });
            }

            const finish_reason = toolCalls.length > 0 ? 'tool_calls' : (choice?.finish_reason || 'stop');

            return {
                finish_reason,
                message: {
                    content: spokenText,
                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined
                }
            };

        } else if (USE_REMOTE_LLM) {
            // ── OpenRouter Fallback (Text-based Tag Parsing) ──
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
            // ── Ollama Local Fallback (Text-based Tag Parsing) ──
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

        // ── Text-based Tag Parsing (Fallback for Ollama and OpenRouter) ──
        const toolCalls = [];
        let wantsToWait = false;

        if (/\[WAIT\]/i.test(content)) {
            wantsToWait = true;
        }

        // Parse [NAVIGATE: url] tags
        const navRegex = /\[NAVIGATE:\s*(.+?)\]/gi;
        let match;
        while ((match = navRegex.exec(content)) !== null) {
            const raw = match[1].trim();
            const page = matchKnownPage(raw, knowledgeMap.pages || [], pageContext?.url);
            const url = page ? page.url : cleanNavTarget(raw);
            if (page && page.url !== raw) {
                console.log(`🎯 Resolved [NAVIGATE: ${raw}] → ${page.name} (${page.url})`);
            }
            if (pageContext && urlKey(pageContext.url) === urlKey(url, pageContext.url)) {
                console.log(`⚠️ Skipping duplicate navigation to current page: ${url}`);
                continue;
            }
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
            const idMatch = raw.match(/^#?(\d+)$/);
            if (idMatch && pageContext?.elements) {
                const elementId = parseInt(idMatch[1], 10);
                const element = pageContext.elements.find(el => el.id === elementId || String(el.id) === String(elementId));
                if (element) {
                    const selector = element.selector || `[data-zyx-id="${element.id}"]`;
                    console.log(`🎯 Resolved [CLICK: #${elementId}] → "${element.accessibleName || element.text}" (${selector})`);
                    toolCalls.push({
                        function: {
                            name: 'click_element',
                            arguments: JSON.stringify({
                                dataZyxId: elementId,
                                selector,
                                description: element.accessibleName || element.text || `Element ${elementId}`,
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

        // Parse [SHORTCUT: S3]
        const shortcutRegex = /\[SHORTCUT:\s*(S\d+)\s*\]/gi;
        while ((match = shortcutRegex.exec(content)) !== null) {
            toolCalls.push({
                function: { name: 'open_shortcut', arguments: JSON.stringify({ shortcutId: match[1].toUpperCase() }) }
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
            .replace(/\[SHORTCUT:\s*.+?\]/gi, '')
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
