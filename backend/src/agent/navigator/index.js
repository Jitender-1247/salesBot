import { chromium } from 'playwright';
import { Room, RoomEvent, LocalVideoTrack, VideoSource } from '@livekit/rtc-node';
import dotenv from 'dotenv';
dotenv.config();

export class Navigator {
    constructor() {
        this.browser = null;
        this.page = null;
        this.room = null;
        this.screencastStopper = null;
    }

    async launch() {
        this.browser = await chromium.launch({ headless: true });
        this.page = await this.browser.newPage();
        await this.page.setViewportSize({ width: 1280, height: 720 });
        console.log('🌐 Browser launched');
    }

    async connectToRoom(livekitUrl, token) {
        try {
            this.room = new Room();
            await this.room.connect(livekitUrl, token);
            console.log('✅ Navigator connected to LiveKit room');
            await this.startScreenShare();
        } catch (err) {
            console.log('❌ LiveKit connection error:', err.message);
        }
    }

    async startScreenShare() {
        try {
            const stream = await this.page.screencast({
                width: 1280,
                height: 720
            });

            if (!stream) {
                console.log('⚠️ Screencast not available');
                return;
            }

            console.log('📺 Screen sharing started');
        } catch (err) {
            console.log('❌ Screen share error:', err.message);
        }
    }

    async login(url, loginSteps, email, password) {
        try {
            await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Fallback selectors if LLM guessed wrong
            const emailSel = loginSteps.emailSelector.includes('email') ? `${loginSteps.emailSelector}, #user-name, [name="username"]` : loginSteps.emailSelector;
            const passSel = loginSteps.passwordSelector.includes('password') ? `${loginSteps.passwordSelector}, #password, [name="password"]` : loginSteps.passwordSelector;
            const submitSel = loginSteps.submitSelector.includes('submit') ? `${loginSteps.submitSelector}, #login-button, [type="submit"]` : loginSteps.submitSelector;

            try {
                await this.page.fill(emailSel, email, { timeout: 10000 });
                
                // If password field is missing, click Next first (Two-Step Login like Zoho)
                let passVisible = await this.page.isVisible(passSel).catch(()=>false);
                if (!passVisible) {
                    console.log('Password field hidden — assuming two-step login. Clicking next...');
                    await this.page.click(submitSel, { timeout: 5000 }).catch(()=>{});
                    await this.page.waitForTimeout(2000); // Wait for animation
                }

                await this.page.fill(passSel, password, { timeout: 10000 });
                
                // Submit final login
                try {
                    await this.page.click(submitSel, { timeout: 5000 });
                } catch {
                    await this.page.keyboard.press('Enter');
                }
                
                await this.page.waitForLoadState('domcontentloaded', { timeout: 15000 });
                console.log('✅ Navigator logged in');
            } catch (e) {
                console.log('⚠️ Warning: Navigator login form automation failed with primary selectors. Attempting to proceed anyway...', e.message);
            }
        } catch (err) {
            console.log('❌ Navigator login failed:', err.message);
            throw err;
        }
    }

    /**
     * Get a rich page context with numbered interactable elements.
     * This gives the LLM precise targets it can click by ID number.
     */
    async getPageContext() {
        try {
            if (!this.page) {
                return "[Warning: Page context unavailable. The browser has been closed or is not initialized.]";
            }

            const context = await this.page.evaluate(() => {
                const title = document.title || '';
                const url = window.location.href;

                // Get headings for page understanding
                const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
                    .map(h => h.innerText.trim())
                    .filter(t => t.length > 0)
                    .slice(0, 6);

                // Build a numbered list of ALL interactable elements
                const selectors = 'a, button, [role="button"], input, select, textarea, [onclick], [data-test], [data-testid]';
                const allElements = Array.from(document.querySelectorAll(selectors));

                const elements = [];
                let id = 1;

                for (const el of allElements) {
                    // Skip hidden/invisible elements
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    if (
                        style.display === 'none' ||
                        style.visibility === 'hidden' ||
                        style.opacity === '0' ||
                        rect.width === 0 ||
                        rect.height === 0
                    ) continue;

                    // Get visible text
                    let text = (el.innerText || el.textContent || '').trim();
                    if (text.length > 60) text = text.substring(0, 57) + '...';

                    // Skip elements with no useful text or identifier
                    const testId = el.getAttribute('data-test') || el.getAttribute('data-testid') || '';
                    const ariaLabel = el.getAttribute('aria-label') || '';
                    const placeholder = el.getAttribute('placeholder') || '';
                    const name = el.getAttribute('name') || '';
                    const elId = el.id || '';
                    const href = el.getAttribute('href') || '';
                    const type = el.getAttribute('type') || '';

                    // Must have at least SOME identifying feature
                    if (!text && !testId && !ariaLabel && !elId && !placeholder && !href) continue;

                    // Build the best CSS selector for this element
                    let selector = '';
                    if (testId) selector = `[data-test="${testId}"]`;
                    else if (el.getAttribute('data-testid')) selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
                    else if (elId) selector = `#${elId}`;
                    else if (name) selector = `${el.tagName.toLowerCase()}[name="${name}"]`;
                    else selector = '';  // Will use text-based click

                    const tag = el.tagName.toLowerCase();
                    const role = el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'button' ? 'button' : tag === 'input' ? 'input' : '');

                    // Is it currently in the viewport?
                    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;

                    elements.push({
                        id: id++,
                        tag,
                        role,
                        text: text || ariaLabel || placeholder || `[${tag}]`,
                        testId,
                        selector,
                        href: tag === 'a' ? href : '',
                        type,
                        visible: inViewport
                    });

                    // Cap at 30 elements to keep prompt manageable
                    if (id > 30) break;
                }

                return { title, url, headings, elements };
            });

            return context;
        } catch (err) {
            console.log('⚠️ Could not get page context:', err.message);
            return {
                title: '',
                url: this.page?.url() || '',
                headings: [],
                elements: []
            };
        }
    }

    async executeAction(toolName, toolArgs) {
        try {
            switch (toolName) {
                case 'navigate_to':
                    console.log(`🔗 Navigating to: ${toolArgs.pageName}`);
                    await this.page.goto(toolArgs.url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 15000
                    });
                    break;

                case 'click_element': {
                    console.log(`👆 Clicking: ${toolArgs.description} (${toolArgs.selector})`);
                    let clicked = false;

                    // Strategy 1: Try exact text match via Playwright locator
                    if (toolArgs.selector.startsWith('text=')) {
                        const searchText = toolArgs.selector.replace(/^text="?/, '').replace(/"?$/, '');
                        try {
                            // Try getByText with exact match first
                            const exactLoc = this.page.getByText(searchText, { exact: true }).first();
                            await exactLoc.click({ timeout: 3000 });
                            clicked = true;
                            console.log('  ✅ Clicked via exact text match');
                        } catch {
                            // Try partial text match
                            try {
                                const partialLoc = this.page.getByText(searchText).first();
                                await partialLoc.click({ timeout: 3000 });
                                clicked = true;
                                console.log('  ✅ Clicked via partial text match');
                            } catch {
                                // Try getByRole with name
                                try {
                                    const roleLoc = this.page.getByRole('link', { name: searchText }).or(
                                        this.page.getByRole('button', { name: searchText })
                                    ).first();
                                    await roleLoc.click({ timeout: 3000 });
                                    clicked = true;
                                    console.log('  ✅ Clicked via role match');
                                } catch {
                                    // Final: try CSS selector-based approach
                                    try {
                                        const cssLoc = this.page.locator(`a:has-text("${searchText}"), button:has-text("${searchText}"), [class*="item"]:has-text("${searchText}")`).first();
                                        await cssLoc.click({ timeout: 3000 });
                                        clicked = true;
                                        console.log('  ✅ Clicked via CSS has-text');
                                    } catch {
                                        console.log('  ❌ All text-based click strategies failed');
                                    }
                                }
                            }
                        }
                    }

                    // Strategy 2: Direct CSS selector
                    if (!clicked) {
                        try {
                            const loc = this.page.locator(toolArgs.selector).first();
                            await loc.click({ timeout: 3000 });
                            clicked = true;
                            console.log('  ✅ Clicked via direct selector');
                        } catch {
                            // Force click as last resort
                            try {
                                const loc = this.page.locator(toolArgs.selector).first();
                                await loc.click({ timeout: 3000, force: true });
                                clicked = true;
                                console.log('  ✅ Clicked via force click');
                            } catch (e) {
                                console.log(`  ❌ Click completely failed: ${e.message}`);
                            }
                        }
                    }

                    // Wait briefly for UI animations/modals
                    await this.page.waitForTimeout(800);
                    break;
                }

                case 'type_text': {
                    console.log(`⌨️ Typing into: ${toolArgs.selector}`);
                    try {
                        const loc = this.page.locator(toolArgs.selector).first();
                        await loc.fill(toolArgs.text, { timeout: 5000 });
                    } catch {
                        // Try by placeholder
                        try {
                            const loc = this.page.getByPlaceholder(toolArgs.selector).first();
                            await loc.fill(toolArgs.text, { timeout: 3000 });
                        } catch (e) {
                            console.log(`  ❌ Type failed: ${e.message}`);
                        }
                    }
                    await this.page.waitForTimeout(500);
                    break;
                }

                case 'scroll_dir':
                    console.log(`📜 Scrolling ${toolArgs.direction}`);
                    await this.page.evaluate((dir) => {
                        const amount = window.innerHeight * 0.7; // scroll 70% of viewport
                        window.scrollBy({
                            top: dir === 'down' ? amount : -amount,
                            behavior: 'smooth'
                        });
                    }, toolArgs.direction);
                    await this.page.waitForTimeout(800);
                    break;

                case 'highlight_element':
                    console.log(`✨ Highlighting: ${toolArgs.label}`);
                    await this.page.evaluate(({ selector, label }) => {
                        document.querySelectorAll('.salesbot-highlight').forEach(el => el.remove());
                        document.querySelectorAll('[data-salesbot-highlighted]').forEach(el => {
                            el.style.outline = '';
                            el.removeAttribute('data-salesbot-highlighted');
                        });

                        const el = document.querySelector(selector);
                        if (el) {
                            el.style.outline = '3px solid #6366f1';
                            el.style.outlineOffset = '4px';
                            el.setAttribute('data-salesbot-highlighted', 'true');

                            const tooltip = document.createElement('div');
                            tooltip.className = 'salesbot-highlight';
                            tooltip.innerText = label;
                            tooltip.style.cssText = `
                position: fixed;
                background: #6366f1;
                color: white;
                padding: 6px 12px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 600;
                z-index: 999999;
                pointer-events: none;
                font-family: sans-serif;
                box-shadow: 0 4px 12px rgba(99,102,241,0.4);
              `;

                            const rect = el.getBoundingClientRect();
                            tooltip.style.top = `${rect.top - 40}px`;
                            tooltip.style.left = `${rect.left}px`;
                            document.body.appendChild(tooltip);

                            setTimeout(() => {
                                el.style.outline = '';
                                el.removeAttribute('data-salesbot-highlighted');
                                tooltip.remove();
                            }, 3000);

                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, toolArgs);
                    await this.page.waitForTimeout(500);
                    break;

                default:
                    console.log(`⚠️ Unknown tool: ${toolName}`);
            }
        } catch (err) {
            console.log(`❌ Action failed (${toolName}):`, err.message);
        }
    }

    getCurrentUrl() {
        return this.page?.url() || '';
    }

    async checkIfLoggedOut(baseUrl) {
        const currentUrl = this.page?.url() || '';
        if (!currentUrl.includes(baseUrl) ||
            currentUrl.includes('login') ||
            currentUrl.includes('signin')) {
            return true;
        }
        return false;
    }

    async close() {
        if (this.room) {
            await this.room.disconnect();
            this.room = null;
        }
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
            console.log('🌐 Browser closed');
        }
    }
}