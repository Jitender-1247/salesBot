// Gets headless browsers past cookie-consent walls so they see the real page, not the banner.
// Prefers "reject" (no tracking needed to read a page), falls back to "accept".

// Google/YouTube remember the choice in these cookies; with them set the EU consent wall never appears.
const GOOGLE_CONSENT_COOKIES = ['.youtube.com', '.google.com'].flatMap(domain => [
    { name: 'SOCS', value: 'CAESEwgDEgk0ODE3Nzc3NzAaAmVuIAEaBgiA_LyaBg', domain, path: '/' },
    { name: 'CONSENT', value: 'YES+cb.20210328-17-p0.en+FX+417', domain, path: '/' }
]);

// Known consent platforms, reject buttons first. Ids are stable across every site using the platform.
const CMP_SELECTORS = [
    'form[action*="consent.youtube.com"] button[aria-label^="Reject" i]',
    'form[action*="consent.google."] button[aria-label^="Reject" i]',
    '#onetrust-reject-all-handler',
    '#CybotCookiebotDialogBodyButtonDecline',
    '#didomi-notice-disagree-button',
    '.fc-cta-do-not-consent',
    'button[data-testid="uc-deny-all-button"]',
    '#truste-consent-required',
    'form[action*="consent.youtube.com"] button',
    'form[action*="consent.google."] button',
    '#onetrust-accept-btn-handler',
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    '#didomi-notice-agree-button',
    '.fc-cta-consent',
    'button[data-testid="uc-accept-all-button"]',
    '#truste-consent-button'
];

// Generic banners: whole-label matches only, so "Accept invitation" or "Agree to terms & pay" never match.
// Strings, because they're matched inside the page.
const BUTTON_TEXT = [
    '^(reject|decline|refuse|deny) (all|all cookies|optional cookies|non-essential cookies)$',
    '^(only|use) (necessary|essential|required) cookies( only)?$',
    '^(accept|allow|agree to) (all|all cookies|cookies)$',
    '^(i agree|i accept|agree|accept|got it|ok, got it)$'
];
const MARK = 'data-zyx-consent';

const CONSENT_FRAME = /consent|cookie|privacy|cmp|onetrust|cookiebot|didomi|usercentrics|trustarc/i;

export async function primeConsentCookies(context) {
    await context.addCookies(GOOGLE_CONSENT_COOKIES).catch(() => {});
}

async function visible(locator) {
    return locator.isVisible().catch(() => false);
}

async function findButton(frame, isConsentContext) {
    for (const sel of CMP_SELECTORS) {
        const btn = frame.locator(sel).first();
        if (await visible(btn)) return { btn, label: sel };
    }
    // Text matching only where a consent banner is likely: a consent frame, or a page showing a cookie notice
    if (!isConsentContext) return null;
    // One pass in the page: per-locator role queries take seconds on pages with hundreds of buttons
    const label = await frame.evaluate(({ patterns, mark }) => {
        document.querySelectorAll(`[${mark}]`).forEach(el => el.removeAttribute(mark));
        const buttons = [...document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')]
            .filter(el => el.offsetParent !== null || getComputedStyle(el).position === 'fixed');
        for (const p of patterns) {
            const re = new RegExp(p, 'i');
            const el = buttons.find(b => re.test((b.innerText || b.value || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')));
            if (el) { el.setAttribute(mark, ''); return (el.innerText || el.value || el.getAttribute('aria-label')).trim(); }
        }
        return null;
    }, { patterns: BUTTON_TEXT, mark: MARK }).catch(() => null);
    return label ? { btn: frame.locator(`[${MARK}]`).first(), label: `button "${label}"` } : null;
}

/**
 * Click past a cookie-consent banner or wall if one is showing. Returns what was clicked, or null.
 * Cheap when there is no banner: visibility checks don't wait.
 */
export async function dismissConsent(page) {
    try {
        const pageText = await page.evaluate(() => (document.body?.innerText || '').slice(0, 20000)).catch(() => '');
        const pageMentionsCookies = /cookie|consent|privacy settings|before you continue/i.test(pageText);
        const onConsentHost = /^consent\./i.test(new URL(page.url()).hostname);

        for (const frame of page.frames().slice(0, 12)) {
            const isMain = frame === page.mainFrame();
            const frameIsConsent = !isMain && CONSENT_FRAME.test(frame.url());
            if (!isMain && !frameIsConsent) continue;
            const found = await findButton(frame, onConsentHost || frameIsConsent || pageMentionsCookies);
            if (!found) continue;

            const urlBefore = page.url();
            await found.btn.click({ timeout: 3000 });
            // Consent walls (Google, YouTube) submit a form and redirect back to the page; banners just close
            await page.waitForURL(u => u.href !== urlBefore, { timeout: onConsentHost ? 8000 : 1500 }).catch(() => {});
            await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
            await page.waitForTimeout(500);
            return found.label;
        }
    } catch { /* a banner we can't handle shouldn't stop the caller */ }
    return null;
}
