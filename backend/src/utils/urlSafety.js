import dns from 'dns/promises';
import net from 'net';

// ── SSRF protection ──
// The explorer and the live-demo browser load URLs supplied by customers (product URL)
// and by the LLM (which anonymous visitors can steer). Without these checks, a visitor
// could make the server's browser open http://169.254.169.254/ (cloud credentials),
// http://localhost:6379 or other internal services, and watch the result via screenshots.
//
// Set ALLOW_PRIVATE_URLS=true only for local development against apps on localhost/LAN.

export const allowPrivateUrls = () => process.env.ALLOW_PRIVATE_URLS === 'true';

function ipv4ToInt(ip) {
    return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

const PRIVATE_V4 = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
].map(([base, bits]) => [ipv4ToInt(base), bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0]);

export function isPrivateAddress(ip) {
    if (net.isIPv4(ip)) {
        const n = ipv4ToInt(ip);
        return PRIVATE_V4.some(([base, mask]) => (n & mask) === (base & mask));
    }
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return isPrivateAddress(mapped[1]);
        return lower === '::' || lower === '::1' ||
            /^f[cd][0-9a-f]{2}:/.test(lower) ||   // fc00::/7 unique local
            /^fe[89ab][0-9a-f]:/.test(lower) ||   // fe80::/10 link local
            /^ff[0-9a-f]{2}:/.test(lower);        // multicast
    }
    return true; // unknown format → treat as unsafe
}

const lookupCache = new Map(); // hostname → { privateHost, expires }

async function hostResolvesToPrivate(hostname) {
    const host = hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host)) return isPrivateAddress(host);
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return true;

    const cached = lookupCache.get(host);
    if (cached && cached.expires > Date.now()) return cached.privateHost;

    let privateHost;
    try {
        const addrs = await dns.lookup(host, { all: true });
        privateHost = addrs.length === 0 || addrs.some(a => isPrivateAddress(a.address));
    } catch {
        privateHost = true; // unresolvable → block
    }
    lookupCache.set(host, { privateHost, expires: Date.now() + 60_000 });
    return privateHost;
}

/**
 * Returns null if the URL is safe to load, otherwise a human-readable reason.
 */
export async function checkUrl(urlString) {
    let url;
    try {
        url = new URL(urlString);
    } catch {
        return 'Invalid URL';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'Only http and https URLs are allowed';
    }
    if (url.username || url.password) {
        return 'URLs with embedded credentials are not allowed';
    }
    if (!allowPrivateUrls() && await hostResolvesToPrivate(url.hostname)) {
        return 'URL points to a private or internal network address';
    }
    return null;
}

const siteHost = (hostname) => hostname.toLowerCase().replace(/^www\./, '');

/**
 * True when `target` belongs to the site of `allowed`: same host ignoring "www.", or a
 * subdomain of it (app.example.com under example.com). Scheme and port are ignored so
 * http→https upgrades and www redirects don't block a legitimate demo page.
 */
export function sameSite(allowed, target) {
    try {
        const a = siteHost(new URL(allowed).hostname);
        const t = siteHost(new URL(target).hostname);
        return t === a || t.endsWith(`.${a}`);
    } catch {
        return false;
    }
}

export function sameOrigin(a, b) {
    try {
        return new URL(a).origin === new URL(b).origin;
    } catch {
        return false;
    }
}

/**
 * Block any page or frame navigation inside a Playwright context that would hit an
 * internal address or a non-web scheme. Covers redirects and links clicked by the agent.
 */
export async function guardBrowserContext(context) {
    await context.route('**/*', async (route) => {
        const request = route.request();
        if (!request.isNavigationRequest()) return route.continue();
        const reason = await checkUrl(request.url());
        if (reason) {
            console.warn(`🛡️ Blocked browser navigation to ${request.url()}: ${reason}`);
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });
}
