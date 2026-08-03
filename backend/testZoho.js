// testZoho.js — standalone test for the Zoho CRM integration.
// Run with: node testZoho.js
// Confirms OAuth refresh + upsertLead() work end-to-end before wiring into a real call.

import { isZohoConfigured, upsertLead } from './src/integrations/zoho.js';

async function main() {
    console.log('Zoho configured?', isZohoConfigured());

    if (!isZohoConfigured()) {
        console.log('❌ Missing one of ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN in .env');
        return;
    }

    try {
        const result = await upsertLead({
            name: 'Test Prospect',
            email: 'test.prospect@example.com',
            productName: 'SalesBot Test Product',
            status: 'Not Contacted',
            notes: 'This is a test lead created by testZoho.js — safe to delete from Zoho CRM.'
        });

        console.log('✅ Success! Zoho Lead ID:', result.id);
        console.log('Go check your Zoho CRM → Leads module to confirm it appeared.');
    } catch (err) {
        console.log('❌ upsertLead failed:', err.message);
    }
}

main();