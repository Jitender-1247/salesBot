/**
 * Shortcuts ("routes") to in-page features: a control (tab, button, link) on a known page.
 * Opening one is deterministic: go to the page, find the control by role + name, click it,
 * so the agent doesn't have to pick the right element from scratch every time.
 */

const MAX_ROUTES = 80;
const MAX_IN_PROMPT = 25;

/** host-without-www + path, so trivial URL differences don't split one page into two. */
export function pageKey(url) {
    try {
        const u = new URL(url);
        return u.hostname.toLowerCase().replace(/^www\./, '') + (u.pathname.replace(/\/+$/, '') || '/');
    } catch {
        return '';
    }
}

const sameRoute = (a, b) => pageKey(a.pageUrl) === pageKey(b.pageUrl)
    && (a.role || '') === (b.role || '') && a.label.toLowerCase() === b.label.toLowerCase();

/**
 * The shortcuts to show the agent, with stable ids for this turn (S1, S2, …).
 * Ones on the current page come first, then the ones that worked most often.
 */
export function shortcutsForPrompt(routes = [], currentUrl = '') {
    const here = pageKey(currentUrl);
    return [...routes]
        .sort((a, b) => (pageKey(b.pageUrl) === here) - (pageKey(a.pageUrl) === here)
            || (b.uses || 0) - (a.uses || 0)
            || (a.source === 'learned' ? -1 : 1) - (b.source === 'learned' ? -1 : 1))
        .slice(0, MAX_IN_PROMPT)
        .map((r, i) => ({ id: `S${i + 1}`, name: r.name, pageUrl: r.pageUrl, role: r.role, label: r.label, toUrl: r.toUrl }));
}

/** Remember a click that worked (opened a new page or a dialog). Returns the updated list. */
export function recordLearnedRoute(routes = [], { pageUrl, pageName, role, label, toUrl }) {
    const clean = (label || '').trim();
    if (!pageUrl || !clean || clean.length > 60) return routes;
    const route = { pageUrl, role: role || '', label: clean, toUrl: toUrl || '' };
    const list = routes.map(r => (typeof r.toObject === 'function' ? r.toObject() : { ...r }));
    const existing = list.find(r => sameRoute(r, route));
    if (existing) {
        existing.uses = (existing.uses || 0) + 1;
        existing.updatedAt = new Date();
        if (toUrl) existing.toUrl = toUrl;
        return list;
    }
    list.push({
        ...route,
        name: `${clean} (${role || 'control'} on ${pageName || pageKey(pageUrl)})`,
        source: 'learned',
        uses: 1,
        updatedAt: new Date()
    });
    if (list.length <= MAX_ROUTES) return list;
    // Over the cap: drop the least useful learned route
    const learned = list.filter(r => r.source === 'learned').sort((a, b) => (a.uses || 0) - (b.uses || 0) || new Date(a.updatedAt) - new Date(b.updatedAt));
    return list.filter(r => r !== learned[0]);
}

/** Re-exploring replaces explored routes but keeps everything learned in live demos. */
export function mergeExploredRoutes(existing = [], explored = []) {
    const learned = existing
        .map(r => (typeof r.toObject === 'function' ? r.toObject() : r))
        .filter(r => r.source === 'learned');
    const fresh = explored.filter(e => !learned.some(l => sameRoute(l, e)));
    return [...learned, ...fresh].slice(0, MAX_ROUTES);
}
