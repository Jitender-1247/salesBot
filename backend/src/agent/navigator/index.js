import { chromium } from 'playwright';
import { Room, RoomEvent, LocalVideoTrack, VideoSource } from '@livekit/rtc-node';
import dotenv from 'dotenv';
import { checkUrl, sameSite, guardBrowserContext } from '../../utils/urlSafety.js';
dotenv.config();

export class Navigator {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.room = null;
        this.screencastStopper = null;
        this.isRemoteBrowser = false; // Track if using remote browser grid
        this.allowedSites = []; // Sites the LLM may navigate to (product URL, demo start URL, knowledge-map pages)
    }

    /**
     * Restrict LLM-driven navigation to the customer's own product. Visitors talk to the
     * LLM, so without this a visitor could make the demo browser open arbitrary sites.
     */
    setAllowedUrls(urls) {
        this.allowedSites = [];
        urls.forEach(u => this.addAllowedUrl(u));
    }

    addAllowedUrl(url) {
        if (!url) return;
        try {
            const { protocol, origin } = new URL(url);
            if ((protocol === 'http:' || protocol === 'https:') && !this.allowedSites.includes(origin)) {
                this.allowedSites.push(origin);
            }
        } catch { /* ignore malformed URLs */ }
    }

    isAllowedTarget(url) {
        return this.allowedSites.some(site => sameSite(site, url));
    }

    /**
     * Turn whatever the LLM wrote into an absolute URL: strips quotes/brackets/trailing
     * punctuation, adds a scheme to bare hosts ("example.com/pricing") and resolves
     * relative paths ("/pricing") against the page the browser is currently on.
     */
    resolveTarget(raw) {
        let s = String(raw || '').trim()
            .replace(/^[\s'"`<(\[]+/, '')
            .replace(/[\s'"`>)\].,;!?]+$/, '');
        if (!s) return null;

        const firstSegment = s.split('/')[0].toLowerCase().replace(/^www\./, '');
        const isBareHost = !/^[a-z][a-z0-9+.-]*:/i.test(s) && !s.startsWith('/') &&
            this.allowedSites.some(site => sameSite(site, `https://${firstSegment}`));
        if (isBareHost) s = `https://${s}`;

        let base = this.allowedSites[0];
        try {
            const current = this.page?.url();
            if (current && /^https?:/i.test(current)) base = current;
        } catch { /* page closed */ }

        try {
            return new URL(s, base).href;
        } catch {
            return null;
        }
    }

    async launch() {
        const remoteEndpoint = process.env.BROWSER_WS_ENDPOINT;

        if (remoteEndpoint) {
            // ── Remote Browser Grid (Browserless / Chrome pool) ──
            // Connects to a shared browser instance — does NOT launch a local Chromium process.
            // This eliminates the 300–600MB RAM per session that local Chromium consumes.
            this.browser = await chromium.connectOverCDP(remoteEndpoint);
            this.isRemoteBrowser = true;
            console.log(`🌐 Connected to remote browser grid: ${remoteEndpoint.substring(0, 50)}...`);
        } else {
            // ── Local Chromium (Dev/Single-server fallback) ──
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
            console.log('🌐 Browser launched locally (stealth mode)');
        }

        this.context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 },
            locale: 'en-US',
        });

        // Safety timeouts — prevent zombie pages from running forever
        this.context.setDefaultTimeout(30000);
        this.context.setDefaultNavigationTimeout(30000);

        // Block navigation to internal network addresses and non-web schemes (SSRF protection)
        await guardBrowserContext(this.context);

        // Remove the 'webdriver' property so bot-detection scripts won't find it
        await this.context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        this.page = await this.context.newPage();
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
            // Helper: Dismiss any cookie/consent/popup overlay on ANY website or iframe (100% site-agnostic)
            const dismissConsentBanners = async () => {
                try {
                    const universalOverlaySelectors = [
                        'button:has-text("Reject all")',
                        'button:has-text("Accept all")',
                        'button:has-text("Reject")',
                        'button:has-text("Accept")',
                        'button:has-text("I agree")',
                        'button:has-text("Agree")',
                        'button:has-text("Allow")',
                        'button:has-text("Got it")',
                        'button:has-text("Dismiss")',
                        'button[aria-label*="Reject" i]',
                        'button[aria-label*="Accept" i]',
                        'button[aria-label*="Close" i]',
                        'form[action*="consent"] button',
                    ];
                    
                    const frames = this.page.frames();
                    for (const frame of frames) {
                        for (const sel of universalOverlaySelectors) {
                            try {
                                const btn = frame.locator(sel).first();
                                if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
                                    console.log(`🛡️ Universal overlay auto-dismissed via: ${sel} in frame ${frame.url()}`);
                                    await btn.click({ timeout: 2000 }).catch(() => {});
                                    await this.page.waitForTimeout(1000);
                                    return;
                                }
                            } catch (e) {}
                        }
                    }
                } catch (e) { /* ignore */ }
            };

            // Pre-inject universal consent cookies (prevents Google/YouTube consent walls automatically)
            await this.page.context().addCookies([
                { name: 'SOCS', value: 'CAESEwgDEgk0ODE3Nzc3NzAaAmVuIAEaBgiA_LyaBg', domain: '.youtube.com', path: '/' },
                { name: 'SOCS', value: 'CAESEwgDEgk0ODE3Nzc3NzAaAmVuIAEaBgiA_LyaBg', domain: '.google.com', path: '/' },
                { name: 'CONSENT', value: 'YES+cb.20210328-17-p0.en+FX+417', domain: '.youtube.com', path: '/' },
                { name: 'CONSENT', value: 'YES+cb.20210328-17-p0.en+FX+417', domain: '.google.com', path: '/' }
            ]).catch(() => {});

            // ── 1. Cookie-Based Login (Primary — Universal for all sites) ──
            if (sessionCookies) {
                try {
                    let cookies = JSON.parse(sessionCookies);
                    if (Array.isArray(cookies) && cookies.length > 0) {
                        // Normalize cookies from any browser extension for Playwright
                        cookies = cookies.map(c => {
                            const cookie = { ...c };
                            if (cookie.sameSite === 'no_restriction') cookie.sameSite = 'None';
                            if (cookie.sameSite === 'lax') cookie.sameSite = 'Lax';
                            if (cookie.sameSite === 'strict') cookie.sameSite = 'Strict';
                            if (cookie.sameSite === 'none') cookie.sameSite = 'None';
                            if (!['Strict', 'Lax', 'None'].includes(cookie.sameSite)) {
                                delete cookie.sameSite;
                            }
                            if (cookie.expirationDate) {
                                cookie.expires = cookie.expirationDate;
                                delete cookie.expirationDate;
                            }
                            delete cookie.hostOnly;
                            delete cookie.session;
                            delete cookie.storeId;
                            delete cookie.id;
                            return cookie;
                        });

                        await this.page.context().addCookies(cookies);
                        const target = demoStartUrl || url;
                        await this.page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        
                        await dismissConsentBanners();
                        
                        // Universal check: Did the site accept the cookies or redirect back to a login page?
                        const finalUrl = this.page.url().toLowerCase();
                        const isRedirectedToLogin = finalUrl.includes('/signin') || 
                                                    finalUrl.includes('/login') || 
                                                    finalUrl.includes('/auth') ||
                                                    finalUrl.includes('/sso') ||
                                                    finalUrl.includes('accounts.');

                        if (isRedirectedToLogin) {
                            console.log(`⚠️ Cookies loaded but site redirected to auth page (${finalUrl}). Falling back to universal form login...`);
                        } else {
                            console.log(`✅ Cookie-based login successful — navigated to: ${this.page.url()}`);
                            return; // Skip form login
                        }
                    }
                } catch (cookieErr) {
                    console.log('⚠️ Cookie parse/load failed, falling back to universal form login:', cookieErr.message);
                }
            }

            // ── 2. Universal Automated Form Login (Fallback for any website) ──
            await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await dismissConsentBanners();
            console.log(`🔑 Attempting universal form login on: ${this.page.url()}`);

            // Universal Smart Discovery Selectors
            const emailSelectors = [
                loginSteps?.emailSelector,
                '#login_id', 'input[name="login_id"]',
                'input[type="email"]', 'input[name="email"]',
                '#email', '#user-name', '#username',
                'input[name="username"]', 'input[name="user"]',
                'input[placeholder*="email" i]', 'input[placeholder*="username" i]',
                'input[placeholder*="mobile" i]',
            ].filter(Boolean);

            const passwordSelectors = [
                loginSteps?.passwordSelector,
                'input[type="password"]', '#password',
                'input[name="password"]', 'input[name="passwd"]',
                'input[placeholder*="password" i]',
            ].filter(Boolean);

            const submitSelectors = [
                loginSteps?.submitSelector,
                'button#nextbtn', 'button[type="submit"]',
                'input[type="submit"]', '#login-button',
                'button:has-text("Next")', 'button:has-text("Sign in")',
                'button:has-text("Log in")', 'button:has-text("Continue")',
                'button:has-text("Submit")', '[type="submit"]',
            ].filter(Boolean);

            // Helper: find first working selector on the page
            const findSelector = async (selectors, perSelectorTimeout = 2000) => {
                for (const sel of selectors) {
                    try {
                        const loc = this.page.locator(sel).first();
                        await loc.waitFor({ state: 'visible', timeout: perSelectorTimeout });
                        return sel;
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
     * Get a rich page context with numbered interactable elements tagged with data-zyx-id.
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
                    .map(h => (h.innerText || h.textContent || '').trim())
                    .filter(t => t.length > 0)
                    .slice(0, 6);

                const interactableSelectors = 'a, button, [role="button"], input, select, textarea, [role="link"], [role="tab"], [role="menuitem"], [onclick], [data-test], [data-testid]';

                // ── 5. Page outline at top: sections (nav, header, main, footer, aside), section headings inside them, ranked by interactable count ──
                const sectionElements = Array.from(document.querySelectorAll('nav, header, main, footer, aside'));
                const outline = sectionElements.map(sec => {
                    const tag = sec.tagName.toLowerCase();
                    const secHeadings = Array.from(sec.querySelectorAll('h1, h2, h3, h4, h5, h6'))
                        .map(h => (h.innerText || h.textContent || '').trim())
                        .filter(Boolean)
                        .slice(0, 4);
                    const interactableCount = sec.querySelectorAll(interactableSelectors).length;
                    return {
                        tag,
                        headings: secHeadings,
                        interactableCount
                    };
                }).sort((a, b) => b.interactableCount - a.interactableCount);

                const elements = [];
                let nextId = 1;
                const MAX_ELEMENTS = 50;

                const isVisible = (el) => {
                    try {
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        if (
                            style.display === 'none' ||
                            style.visibility === 'hidden' ||
                            style.opacity === '0' ||
                            rect.width === 0 ||
                            rect.height === 0
                        ) return false;
                        return true;
                    } catch {
                        return false;
                    }
                };

                const computeAccessibleName = (el) => {
                    try {
                        const aria = el.getAttribute('aria-label');
                        if (aria && aria.trim()) return aria.trim();

                        const ariaLabelledBy = el.getAttribute('aria-labelledby');
                        if (ariaLabelledBy) {
                            const labelEl = document.getElementById(ariaLabelledBy);
                            if (labelEl && (labelEl.innerText || labelEl.textContent)) {
                                const lText = (labelEl.innerText || labelEl.textContent).trim();
                                if (lText) return lText;
                            }
                        }

                        const text = (el.innerText || el.textContent || '').trim();
                        if (text) return text;

                        const title = el.getAttribute('title');
                        if (title && title.trim()) return title.trim();

                        const alt = el.getAttribute('alt');
                        if (alt && alt.trim()) return alt.trim();

                        const placeholder = el.getAttribute('placeholder');
                        if (placeholder && placeholder.trim()) return placeholder.trim();

                        const val = el.value;
                        if (val && typeof val === 'string' && val.trim()) return val.trim();

                        return '';
                    } catch {
                        return '';
                    }
                };

                const computeRole = (el, tag) => {
                    try {
                        const r = el.getAttribute('role');
                        if (r && r.trim()) return r.trim();
                        if (tag === 'a') return 'link';
                        if (tag === 'button') return 'button';
                        if (tag === 'select') return 'combobox';
                        if (tag === 'textarea') return 'textbox';
                        if (tag === 'input') {
                            const type = (el.getAttribute('type') || 'text').toLowerCase();
                            if (['button', 'submit', 'reset'].includes(type)) return 'button';
                            if (['checkbox', 'radio'].includes(type)) return type;
                            return 'textbox';
                        }
                        return '';
                    } catch {
                        return '';
                    }
                };

                // Traverse DOM roots (including shadow DOM and iframes)
                const processRoot = (root, framePrefix = '') => {
                    if (elements.length >= MAX_ELEMENTS) return;

                    try {
                        const candidates = Array.from(root.querySelectorAll(interactableSelectors));
                        for (const el of candidates) {
                            if (elements.length >= MAX_ELEMENTS) break;
                            if (!isVisible(el)) continue;

                            let accessibleName = computeAccessibleName(el);
                            const testId = el.getAttribute('data-test') || el.getAttribute('data-testid') || '';
                            const elId = el.id || '';
                            const href = el.getAttribute('href') || '';
                            const tag = el.tagName.toLowerCase();
                            const type = el.getAttribute('type') || '';
                            const name = el.getAttribute('name') || '';

                            // Skip elements with no identifying feature
                            if (!accessibleName && !testId && !elId && !href && !name && tag !== 'input') continue;
                            if (accessibleName.length > 60) accessibleName = accessibleName.substring(0, 57) + '...';

                            const id = framePrefix ? `${framePrefix}${nextId++}` : nextId++;

                            // 1. Tag element with unique data-zyx-id attribute directly on DOM element
                            try {
                                el.setAttribute('data-zyx-id', String(id));
                            } catch {}

                            // 2. Selector preference: [data-zyx-id] first, then #id, then [name]
                            let selector = `[data-zyx-id="${id}"]`;
                            if (!selector) {
                                if (elId) selector = `#${elId}`;
                                else if (name) selector = `${tag}[name="${name}"]`;
                            }

                            const role = computeRole(el, tag);

                            const rect = el.getBoundingClientRect();
                            const inViewport = rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
                                              rect.bottom > 0 &&
                                              rect.left < (window.innerWidth || document.documentElement.clientWidth) &&
                                              rect.right > 0;

                            elements.push({
                                id,
                                tag,
                                role,
                                type,
                                accessibleName,
                                text: accessibleName || `[${tag}]`,
                                testId,
                                selector,
                                href: tag === 'a' ? href : '',
                                visible: inViewport
                            });
                        }
                    } catch {}

                    // 4. Shadow DOM roots traversal (use shadowRoot.querySelectorAll, skip errors silently)
                    try {
                        const allNodes = root.querySelectorAll('*');
                        for (const node of allNodes) {
                            if (elements.length >= MAX_ELEMENTS) break;
                            try {
                                if (node.shadowRoot) {
                                    processRoot(node.shadowRoot, framePrefix);
                                }
                            } catch {}
                        }
                    } catch {}
                };

                // Process main document
                processRoot(document, '');

                // 3. Traverses iframes (same-origin only, catch cross-origin errors silently) - prefix their id values
                try {
                    const iframes = Array.from(document.querySelectorAll('iframe'));
                    for (let fIdx = 0; fIdx < iframes.length; fIdx++) {
                        if (elements.length >= MAX_ELEMENTS) break;
                        try {
                            const iframe = iframes[fIdx];
                            const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
                            if (frameDoc) {
                                processRoot(frameDoc, `f${fIdx + 1}_`);
                            }
                        } catch {
                            // Cross-origin access silently ignored
                        }
                    }
                } catch {}

                return { title, url, headings, outline, elements };
            });

            return context;
        } catch (err) {
            console.log('⚠️ Could not get page context:', err.message);
            return {
                title: '',
                url: this.page?.url() || '',
                headings: [],
                outline: [],
                elements: []
            };
        }
    }

    async executeAction(toolName, toolArgs) {
        try {
            switch (toolName) {
                case 'navigate_to': {
                    const target = this.resolveTarget(toolArgs.url);
                    const unsafe = target ? await checkUrl(target) : 'Invalid URL';
                    if (unsafe || !this.isAllowedTarget(target)) {
                        const reason = unsafe || 'outside the product site';
                        console.warn(`🛡️ Refused navigation to ${toolArgs.url}: ${reason}`);
                        return { ok: false, error: `Navigation to ${toolArgs.url} refused (${reason})` };
                    }
                    console.log(`🔗 Navigating to: ${toolArgs.pageName} (${target})`);
                    await this.page.goto(target, {
                        waitUntil: 'domcontentloaded',
                        timeout: 15000
                    });
                    // Let client-side apps render before the next screenshot / page-context read
                    await this.page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
                    return { ok: true, url: this.page.url() };
                }

                case 'click_element': {
                    console.log(`👆 Clicking: ${toolArgs.description || ''} (dataZyxId: ${toolArgs.dataZyxId}, selector: ${toolArgs.selector})`);
                    let targetLoc = null;

                    // Strategy 1: If dataZyxId is present on toolArgs, use [data-zyx-id="N"] as primary target
                    if (toolArgs.dataZyxId !== undefined && toolArgs.dataZyxId !== null && toolArgs.dataZyxId !== '') {
                        const zyxSelector = `[data-zyx-id="${toolArgs.dataZyxId}"]`;
                        let loc = this.page.locator(zyxSelector).first();
                        let exists = await loc.count().catch(() => 0);
                        if (exists > 0) {
                            targetLoc = loc;
                        } else {
                            // Check iframes for the element
                            for (const frame of this.page.frames()) {
                                const frameLoc = frame.locator(zyxSelector).first();
                                if (await frameLoc.count().catch(() => 0) > 0) {
                                    targetLoc = frameLoc;
                                    break;
                                }
                            }
                        }
                    }

                    // Strategy 2: Fallback to selector or text-based locator
                    if (!targetLoc && toolArgs.selector) {
                        if (toolArgs.selector.startsWith('text=')) {
                            const searchText = toolArgs.selector.replace(/^text="?/, '').replace(/"?$/, '');
                            try {
                                const exactLoc = this.page.getByText(searchText, { exact: true }).first();
                                if (await exactLoc.count().catch(() => 0) > 0) {
                                    targetLoc = exactLoc;
                                }
                            } catch {}
                            if (!targetLoc) {
                                try {
                                    const partialLoc = this.page.getByText(searchText).first();
                                    if (await partialLoc.count().catch(() => 0) > 0) {
                                        targetLoc = partialLoc;
                                    }
                                } catch {}
                            }
                            if (!targetLoc) {
                                try {
                                    const roleLoc = this.page.getByRole('link', { name: searchText }).or(
                                        this.page.getByRole('button', { name: searchText })
                                    ).first();
                                    if (await roleLoc.count().catch(() => 0) > 0) {
                                        targetLoc = roleLoc;
                                    }
                                } catch {}
                            }
                            if (!targetLoc) {
                                targetLoc = this.page.locator(`a:has-text("${searchText}"), button:has-text("${searchText}"), [class*="item"]:has-text("${searchText}")`).first();
                            }
                        } else {
                            targetLoc = this.page.locator(toolArgs.selector).first();
                        }
                    }

                    if (targetLoc) {
                        try {
                            // 2. Before clicking, scroll the element into view using Playwright's scrollIntoViewIfNeeded()
                            await targetLoc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
                            // 3. Wait for it to be visible
                            await targetLoc.waitFor({ state: 'visible', timeout: 3000 });
                            // 4. Then click normally (no force: true)
                            await targetLoc.click({ timeout: 3000 });
                            console.log('  ✅ Clicked normally (no force)');
                        } catch (e) {
                            console.log(`  ❌ Click failed: ${e.message}`);
                            return { ok: false, error: e.message };
                        }
                    } else {
                        console.log('  ❌ Click target locator not found');
                        return { ok: false, error: 'Target element not found' };
                    }

                    // 5. After clicking, wait for networkidle for up to 1500ms (catch silently) so the page can settle
                    await this.page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});
                    await this.page.waitForTimeout(500);
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
                    return { ok: false, error: `Unknown tool ${toolName}` };
            }
            return { ok: true };
        } catch (err) {
            console.log(`❌ Action failed (${toolName}):`, err.message);
            return { ok: false, error: err.message };
        }
    }

    /**
     * Capture the outcome after an action execution by comparing against a previous snapshot.
     */
    async getActionOutcome(snapshot = {}) {
        try {
            const { prevUrl = '', prevTitle = '' } = snapshot;

            // Waits up to 2000ms for either load or networkidle (whichever comes first, both with try/catch)
            await Promise.race([
                this.page?.waitForLoadState('load', { timeout: 2000 }).catch(() => {}),
                this.page?.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {})
            ]).catch(() => {});

            const newUrl = this.page?.url() || '';
            const newTitle = await this.page?.title().catch(() => '') || '';

            const urlChanged = Boolean(prevUrl && newUrl && prevUrl !== newUrl);
            const titleChanged = Boolean(prevTitle && newTitle && prevTitle !== newTitle);

            // Dialog visible if any [role="dialog"], [role="alertdialog"], .modal, .drawer is visible
            const dialogInfo = await this.page?.evaluate(() => {
                const dialogSelectors = '[role="dialog"], [role="alertdialog"], .modal, .drawer';
                const dialogs = Array.from(document.querySelectorAll(dialogSelectors));
                for (const d of dialogs) {
                    const rect = d.getBoundingClientRect();
                    const style = window.getComputedStyle(d);
                    if (
                        style.display !== 'none' &&
                        style.visibility !== 'hidden' &&
                        parseFloat(style.opacity || '1') > 0 &&
                        rect.width > 0 &&
                        rect.height > 0
                    ) {
                        const text = (d.innerText || d.textContent || '').trim().replace(/\s+/g, ' ');
                        return {
                            visible: true,
                            text: text.substring(0, 100)
                        };
                    }
                }
                return { visible: false, text: '' };
            }).catch(() => ({ visible: false, text: '' })) || { visible: false, text: '' };

            return {
                urlChanged,
                newUrl,
                titleChanged,
                newTitle,
                dialogVisible: Boolean(dialogInfo.visible),
                dialogText: dialogInfo.text || ''
            };
        } catch (err) {
            return {
                urlChanged: false,
                newUrl: this.page?.url() || '',
                titleChanged: false,
                newTitle: '',
                dialogVisible: false,
                dialogText: ''
            };
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
        try {
            if (this.isRemoteBrowser) {
                // Remote browser grid: close only our context (not the shared browser)
                // This frees our session without affecting other users' sessions
                if (this.context) {
                    await this.context.close().catch(() => {});
                    this.context = null;
                    this.page = null;
                    console.log('🌐 Remote browser context closed');
                }
            } else {
                // Local browser: close entire browser process
                if (this.browser) {
                    await this.browser.close().catch(() => {});
                    this.browser = null;
                    this.context = null;
                    this.page = null;
                    console.log('🌐 Local browser closed');
                }
            }
        } catch (err) {
            console.log('⚠️ Browser close error (non-critical):', err.message);
            this.browser = null;
            this.context = null;
            this.page = null;
        }
    }
}
