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
        this.browser = await chromium.launch({ headless: false });
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
                await this.page.fill(passSel, password, { timeout: 10000 });
                await this.page.click(submitSel, { timeout: 10000 });
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

                case 'click_element':
                    console.log(`👆 Clicking: ${toolArgs.description} (${toolArgs.selector})`);
                    try {
                        const loc = this.page.locator(toolArgs.selector).first();
                        await loc.click({ timeout: 5000 });
                    } catch (e) {
                        console.log('⚠️ Standard click failed, trying force click...');
                        const loc = this.page.locator(toolArgs.selector).first();
                        await loc.click({ timeout: 3000, force: true });
                    }
                    // Wait briefly for UI animations/modals, but DO NOT wait for full page load 
                    // since many clicks (like add to cart) don't trigger page reloads.
                    await this.page.waitForTimeout(800);
                    break;

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