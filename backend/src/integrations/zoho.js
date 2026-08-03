import dotenv from 'dotenv';
dotenv.config();

// ─── Token cache ─────────────────────────────────────────────────────────────
let cachedToken = null;
let tokenExpiresAt = 0;

const DC = process.env.ZOHO_DC || 'com';
const ZOHO_ACCOUNTS_URL = `https://accounts.zoho.${DC}/oauth/v2/token`;
const ZOHO_CRM_URL = `https://www.zohoapis.${DC}/crm/v8`;

// ─── Safe JSON parsing ────────────────────────────────────────────────────────

/**
 * Zoho's search endpoint (and some others) return a 204 No Content / empty
 * body when there are no results, instead of an empty JSON object or array.
 * res.json() throws "Unexpected end of JSON input" on an empty body, so we
 * read as text first and only parse if there's actually something there.
 */
async function safeJson(res) {
    const text = await res.text();
    if (!text || !text.trim()) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`Zoho returned non-JSON response: ${text.slice(0, 200)}`);
    }
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Returns true if all required Zoho env vars are present.
 * Call this before any Zoho operation to skip cleanly instead of throwing.
 */
export function isZohoConfigured() {
    return !!(
        process.env.ZOHO_CLIENT_ID &&
        process.env.ZOHO_CLIENT_SECRET &&
        process.env.ZOHO_REFRESH_TOKEN
    );
}

/**
 * Get a valid Zoho access token, refreshing if expired or missing.
 * Caches the token for ~55 minutes before refreshing.
 */
async function getAccessToken() {
    const now = Date.now();

    if (cachedToken && now < tokenExpiresAt - 60_000) {
        return cachedToken;
    }

    const params = new URLSearchParams({
        refresh_token: process.env.ZOHO_REFRESH_TOKEN,
        client_id: process.env.ZOHO_CLIENT_ID,
        client_secret: process.env.ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token',
    });

    const res = await fetch(`${ZOHO_ACCOUNTS_URL}?${params}`, { method: 'POST' });
    const data = await safeJson(res);

    if (!res.ok || !data.access_token) {
        throw new Error(`Zoho token refresh failed: ${JSON.stringify(data)}`);
    }

    cachedToken = data.access_token;
    tokenExpiresAt = now + (data.expires_in || 3600) * 1000;

    console.log('🔑 Zoho access token refreshed');
    return cachedToken;
}

// ─── Lead upsert ─────────────────────────────────────────────────────────────

/**
 * Search for an existing Zoho Lead by email, then update it or create a new one.
 * Returns { id: zohoLeadId }.
 *
 * @param {Object} opts
 * @param {string} opts.name          Full name of the prospect
 * @param {string} opts.email         Email address (used as dedup key)
 * @param {string} [opts.productName] Name of the product they demoed
 * @param {string} [opts.status]      Lead_Status value (default 'Not Contacted')
 * @param {string} [opts.notes]       Qualification reason / free-text notes
 */
export async function upsertLead({
    name = '',
    email = '',
    productName = '',
    status = 'Not Contacted',
    notes = ''
}) {
    const token = await getAccessToken();

    // Split full name into first / last (Zoho requires Last_Name)
    const parts = name.trim().split(/\s+/);
    const firstName = parts.shift() || '';
    const lastName = parts.join(' ') || firstName;

    // Search for existing lead by email
    const searchUrl = `${ZOHO_CRM_URL}/Leads/search?email=${encodeURIComponent(email)}`;
    const searchRes = await fetch(searchUrl, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });

    let existingId = null;
    if (searchRes.ok) {
        const searchData = await safeJson(searchRes);
        existingId = searchData?.data?.[0]?.id ?? null;
    }
    // searchRes.status === 204 means "no matching lead" — existingId stays null, which is correct.

    const payload = {
        data: [{
            First_Name: firstName,
            Last_Name: lastName,
            Email: email,
            Lead_Source: 'SalesBot Demo',
            Lead_Status: status,
            Company: productName || 'Unknown',
            Description: notes
                ? `SalesBot qualification: ${notes}`
                : `Qualified via SalesBot demo of ${productName}`,
        }]
    };

    if (existingId) {
        // Update existing lead
        const updateRes = await fetch(`${ZOHO_CRM_URL}/Leads/${existingId}`, {
            method: 'PUT',
            headers: {
                Authorization: `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const updateData = await safeJson(updateRes);

        if (!updateRes.ok) {
            throw new Error(`Zoho lead update failed: ${JSON.stringify(updateData)}`);
        }

        console.log(`📝 Zoho lead updated: ${existingId}`);
        return { id: existingId };

    } else {
        // Create new lead
        const createRes = await fetch(`${ZOHO_CRM_URL}/Leads`, {
            method: 'POST',
            headers: {
                Authorization: `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const createData = await safeJson(createRes);

        if (!createRes.ok) {
            throw new Error(`Zoho lead creation failed: ${JSON.stringify(createData)}`);
        }

        const newId = createData?.data?.[0]?.details?.id;
        if (!newId) {
            throw new Error(`Zoho returned no ID: ${JSON.stringify(createData)}`);
        }

        console.log(`✨ Zoho lead created: ${newId}`);
        return { id: newId };
    }
}