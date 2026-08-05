import { chromium } from 'playwright';
import { decrypt } from '../utils/encryption.js';
import Product from '../models/Product.js';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function analyzePage(pageContent, prompt) {
    const response = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [
            {
                role: 'system',
                content: 'You are a product analyst. Analyze web page content and return ONLY valid JSON, no markdown, no backticks, no explanation.'
            },
            {
                role: 'user',
                content: `${prompt}\n\nPage content:\n${pageContent}`
            }
        ],
        temperature: 0.3,
        max_tokens: 500
    });

    let content = response.choices[0]?.message?.content || '';
    return content;
}

async function extractPageContent(page) {
    return await page.evaluate(() => {
        const title = document.title || '';
        const metaDesc = document.querySelector('meta[name="description"]')?.content || '';

        const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
            .map(h => h.innerText.trim())
            .filter(t => t.length > 0)
            .slice(0, 10)
            .join(', ');

        const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'))
            .map(b => b.innerText?.trim() || b.value?.trim())
            .filter(t => t && t.length > 0)
            .slice(0, 15)
            .join(', ');

        const navLinks = Array.from(document.querySelectorAll('nav a, header a, aside a'))
            .map(a => a.innerText.trim())
            .filter(t => t.length > 0)
            .slice(0, 15)
            .join(', ');

        const allLinks = Array.from(document.querySelectorAll('a'))
            .map(a => ({ text: a.innerText.trim(), href: a.href }))
            .filter(l => l.text.length > 0)
            .slice(0, 20)
            .map(l => l.text)
            .join(', ');

        const mainText = document.querySelector('main')?.innerText?.slice(0, 500) ||
            document.body?.innerText?.slice(0, 500) || '';

        return `
      Title: ${title}
      Meta Description: ${metaDesc}
      Headings: ${headings}
      Navigation Links: ${navLinks}
      All Links: ${allLinks}
      Buttons: ${buttons}
      Main Content: ${mainText}
    `.trim();
    });
}

async function getInternalLinks(page, baseUrl) {
    return await page.$$eval('a[href]', (anchors, base) =>
        [...new Set(
            anchors
                .map(a => a.href)
                .filter(href =>
                    href &&
                    href.startsWith(base) &&
                    !href.includes('logout') &&
                    !href.includes('signout') &&
                    !href.includes('#') &&
                    !href.includes('javascript') &&
                    !href.endsWith('.pdf') &&
                    !href.endsWith('.zip')
                )
        )].slice(0, 10),
        baseUrl
    );
}

async function explorePage(page, knowledgeMap, visitedUrls, baseUrl) {
    const currentUrl = page.url();

    if (visitedUrls.has(currentUrl)) return;
    visitedUrls.add(currentUrl);

    try {
        await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

        const pageContent = await extractPageContent(page);

        const analysis = await analyzePage(pageContent, `
      Analyze this web page and return ONLY this JSON:
      {
        "pageName": "short name for this page",
        "description": "what this page does in 2 sentences",
        "keyFeatures": ["feature1", "feature2", "feature3"],
        "howToReach": "how to navigate to this page"
      }
    `);

        let pageData;
        try {
            const cleaned = analysis.replace(/```json|```/g, '').trim();
            pageData = JSON.parse(cleaned);
        } catch {
            pageData = {
                pageName: 'Page',
                description: 'A page in this product',
                keyFeatures: [],
                howToReach: 'Navigate from main menu'
            };
        }

        knowledgeMap.pages.push({
            name: pageData.pageName,
            url: currentUrl,
            description: pageData.description,
            keyFeatures: pageData.keyFeatures,
            howToReach: pageData.howToReach
        });

        console.log(`✅ Explored: ${pageData.pageName} — ${currentUrl}`);

        if (knowledgeMap.pages.length >= 15) return;

        // Get all internal links on this page
        const links = await getInternalLinks(page, baseUrl);
        console.log(`   Found ${links.length} internal links`);

        for (const link of links) {
            if (knowledgeMap.pages.length >= 15) break;
            if (!visitedUrls.has(link)) {
                try {
                    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await explorePage(page, knowledgeMap, visitedUrls, baseUrl);
                    // Go back to continue finding more links
                    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => { });
                } catch {
                    console.log(`⚠️ Skipping ${link} — failed to load`);
                }
            }
        }

        // Also try clicking nav buttons to discover JS-rendered pages
        if (knowledgeMap.pages.length < 15) {
            const navButtons = await page.$$('nav button, header button, [role="navigation"] button').catch(() => []);
            for (const button of navButtons.slice(0, 5)) {
                if (knowledgeMap.pages.length >= 15) break;
                try {
                    await button.click();
                    await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
                    const newUrl = page.url();
                    if (!visitedUrls.has(newUrl) && newUrl.startsWith(baseUrl)) {
                        await explorePage(page, knowledgeMap, visitedUrls, baseUrl);
                    }
                } catch {
                    // skip failed button clicks
                }
            }
        }

    } catch (err) {
        console.log(`❌ Error exploring ${currentUrl}:`, err.message);
    }
}

export async function exploreProduct(productId) {
    const product = await Product.findById(productId);
    if (!product) throw new Error('Product not found');

    await Product.findByIdAndUpdate(productId, { explorationStatus: 'exploring' });

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const knowledgeMap = { pages: [], loginSteps: {}, productSummary: '' };
    const visitedUrls = new Set();

    try {
        console.log(`🔍 Starting exploration of ${product.url}`);

        await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const loginContent = await extractPageContent(page);

        const loginAnalysis = await analyzePage(loginContent, `
      This is a login page. Find the CSS selectors for login inputs.
      Return ONLY this JSON:
      {
        "emailSelector": "css selector for email or username field",
        "passwordSelector": "css selector for password field",
        "submitSelector": "css selector for submit or login button"
      }
    `);

        let loginSteps;
        try {
            const cleaned = loginAnalysis.replace(/```json|```/g, '').trim();
            loginSteps = JSON.parse(cleaned);
        } catch {
            console.log('⚠️ Could not parse login JSON, generating default login steps.');
            loginSteps = {
                emailSelector: "#email",
                passwordSelector: "#password",
                submitSelector: "[type='submit']"
            };
        }

        console.log('🔑 Login selectors found:', loginSteps);

        const email = decrypt(product.credentials.email);
        const password = decrypt(product.credentials.password);

        // Unconditional fallback selectors to guarantee we can find the inputs even if LLM guessed wrong
        const emailSel = `${loginSteps.emailSelector}, #user-name, [name="username"], [name="login_id"], input[type="email"], input[name="email"], #login_id`;
        const passSel = `${loginSteps.passwordSelector}, #password, [name="password"], input[type="password"]`;
        const submitSel = `${loginSteps.submitSelector}, #login-button, [type="submit"], button#nextbtn, button#submit, .login-btn`;

        try {
            await page.fill(emailSel, email, { timeout: 10000 });
            
            // If password field is missing, click Next first (Two-Step Login like Zoho)
            let passVisible = await page.isVisible(passSel).catch(()=>false);
            if (!passVisible) {
                console.log('Password field hidden — assuming two-step login. Clicking next...');
                await page.click(submitSel, { timeout: 5000 }).catch(()=>{});
                await page.waitForTimeout(2000); // Wait for animation
            }

            await page.fill(passSel, password, { timeout: 10000 });
            
            // Submit final login
            try {
                await page.click(submitSel, { timeout: 5000 });
            } catch {
                await page.keyboard.press('Enter');
            }
            
            await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
        } catch (e) {
            console.log('⚠️ Warning: Login form automation failed with primary selectors. Attempting to proceed anyway...', e.message);
        }

        console.log('✅ Logged in — starting page exploration');

        knowledgeMap.loginSteps = loginSteps;

        await explorePage(page, knowledgeMap, visitedUrls, product.url);

        // Generate product summary via Groq
        const summary = await analyzePage(
            knowledgeMap.pages.map(p => `${p.name}: ${p.description}`).join('\n'),
            'Based on these pages from a product, write a 3 sentence summary of what this product does and its key value proposition.'
        );
        knowledgeMap.productSummary = summary;

        await Product.findByIdAndUpdate(productId, {
            knowledgeMap,
            explorationStatus: 'ready'
        });

        console.log(`\n🎉 Exploration complete — ${knowledgeMap.pages.length} pages mapped`);
        return knowledgeMap;

    } catch (err) {
        console.log('❌ Exploration failed:', err.message);
        await Product.findByIdAndUpdate(productId, { explorationStatus: 'failed' });
        throw err;
    } finally {
        await browser.close();
    }
}