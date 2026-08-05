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
        this.browser = await chromium.launch({
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-setuid-sandbox',
                '--disable-infobars',
            ]
        });
        const context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 },
            locale: 'en-US',
        });
        // Remove the 'webdriver' property so bot-detection scripts won't find it
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        this.page = await context.newPage();
        console.log('🌐 Browser launched (stealth mode)');
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

    async login(url, loginSteps, email, password, sessionCookies, demoStartUrl) {
        try {
            // ── Cookie-Based Login (Bypass) ──────────────────────────────
            // If the user has imported their session cookies via the dashboard,
            // we load them directly into the browser and skip the login form entirely.
            if (sessionCookies) {
                try {
                    let cookies = JSON.parse(sessionCookies);
                    if (Array.isArray(cookies) && cookies.length > 0) {
                        // Normalize cookies from extensions like Cookie Editor for Playwright
                        cookies = cookies.map(c => {
                            const cookie = { ...c };
                            if (cookie.sameSite === 'no_restriction') cookie.sameSite = 'None';
                            if (cookie.sameSite === 'unspecified') delete cookie.sameSite;
                            if (cookie.expirationDate) {
                                cookie.expires = cookie.expirationDate;
                                delete cookie.expirationDate;
                            }
                            // Playwright doesn't accept these
                            delete cookie.hostOnly;
                            delete cookie.session;
                            delete cookie.storeId;
                            delete cookie.id;
                            return cookie;
                        });

                        await this.page.context().addCookies(cookies);
                        const target = demoStartUrl || url;
                        await this.page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        console.log(`✅ Cookie-based login successful — navigated to: ${this.page.url()}`);
                        return; // Skip automated login entirely
                    }
                } catch (cookieErr) {
                    console.log('⚠️ Cookie parse/load failed, falling back to form login:', cookieErr.message);
                }
            }

            // ── Automated Form Login (fallback) ──────────────────────────
            await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            console.log(`🔑 Attempting form login on: ${this.page.url()}`);

            // Smart email field discovery — try many common patterns
            const emailSelectors = [
                loginSteps?.emailSelector,
                '#login_id',
                'input[name="login_id"]',
                'input[type="email"]',
                'input[name="email"]',
                '#email',
                '#user-name',
                'input[name="username"]',
                'input[name="user"]',
                'input[placeholder*="email" i]',
                'input[placeholder*="username" i]',
                'input[placeholder*="mobile" i]',
            ].filter(Boolean);

            // Smart password field discovery
            const passwordSelectors = [
                loginSteps?.passwordSelector,
                'input[type="password"]',
                '#password',
                'input[name="password"]',
                'input[name="passwd"]',
                'input[placeholder*="password" i]',
            ].filter(Boolean);

            // Smart submit button discovery
            const submitSelectors = [
                loginSteps?.submitSelector,
                'button#nextbtn',
                'button[type="submit"]',
                'input[type="submit"]',
                '#login-button',
                'button:has-text("Next")',
                'button:has-text("Sign in")',
                'button:has-text("Log in")',
                'button:has-text("Continue")',
                '[type="submit"]',
            ].filter(Boolean);

            // Helper: find first working selector on the page
            const findSelector = async (selectors) => {
                for (const sel of selectors) {
                    try {
                        const loc = this.page.locator(sel).first();
                        const visible = await loc.isVisible({ timeout: 1000 }).catch(() => false);
                        if (visible) return sel;
                    } catch { /* try next */ }
                }
                return null;
            };

            // Helper: directly set value on React-controlled inputs bypassing React
            // Standard .fill() doesn't work because React controls the input's state internally
            const reactFill = async (selector, value) => {
                await this.page.evaluate(({ sel, val }) => {
                    const el = document.querySelector(sel);
                    if (!el) return;
                    // Use React's internal setter to properly update state
                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
                    if (nativeSetter) nativeSetter.call(el, val);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }, { sel: selector, val: value });
            };

            // STEP 1: Fill in email — try React setter first, then fallback to keystrokes
            const emailSel = await findSelector(emailSelectors);
            if (emailSel) {
                console.log(`📧 Found email field: ${emailSel}`);
                const emailLoc = this.page.locator(emailSel).first();
                await emailLoc.click({ timeout: 3000 });
                await reactFill(emailSel.split(',')[0].trim(), email);
                await emailLoc.pressSequentially('', { delay: 50 }); // trigger any remaining listeners
                // Verify value was set
                const val = await emailLoc.inputValue().catch(() => '');
                if (!val) {
                    console.log('React fill failed, falling back to pressSequentially...');
                    await emailLoc.clear();
                    await emailLoc.pressSequentially(email, { delay: 80 });
                }
            } else {
                console.log('⚠️ Could not find email field');
            }

            // Small delay to let React update state after typing
            await this.page.waitForTimeout(800);

            // STEP 2: Check if password is visible NOW — if not, click Next first
            let passSel = await findSelector(passwordSelectors);
            if (!passSel) {
                console.log('🔄 Password field not visible — assuming 2-step login, clicking Next...');
                const submitSel = await findSelector(submitSelectors);
                if (submitSel) {
                    await this.page.locator(submitSel).first().click({ timeout: 5000 });
                } else {
                    await this.page.keyboard.press('Enter');
                }
                // Wait up to 5 seconds for password field to appear
                await this.page.waitForTimeout(3000);
                passSel = await findSelector(passwordSelectors);
            }

            // STEP 3: Fill in password using real keystrokes
            if (passSel) {
                console.log(`🔒 Found password field: ${passSel}`);
                const passLoc = this.page.locator(passSel).first();
                await passLoc.click({ timeout: 3000 });
                await passLoc.clear();
                await passLoc.pressSequentially(password, { delay: 50 });
            } else {
                console.log('⚠️ Could not find password field after Next click');
            }

            await this.page.waitForTimeout(500);

            // STEP 4: Submit login form
            const finalSubmitSel = await findSelector(submitSelectors);
            if (finalSubmitSel) {
                console.log(`✅ Submitting with: ${finalSubmitSel}`);
                await this.page.locator(finalSubmitSel).first().click({ timeout: 5000 });
            } else {
                await this.page.keyboard.press('Enter');
            }

            // Wait for navigation to complete
            await this.page.waitForLoadState('domcontentloaded', { timeout: 20000 });
            console.log(`✅ Navigator logged in — now on: ${this.page.url()}`);

        } catch (err) {
            console.log('❌ Navigator login failed:', err.message);
            // Don't throw — let the demo start anyway, user can manually guide
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