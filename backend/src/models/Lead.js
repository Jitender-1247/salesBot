import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema({
    callId: { type: mongoose.Schema.Types.ObjectId, ref: 'Call' },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    prospectName: String,
    prospectEmail: String,
    qualified: { type: Boolean, default: false },
    notes: String,

    // Lead lifecycle status (shown in dashboard Leads tab)
    status: {
        type: String,
        enum: ['Not Contacted', 'Contacted', 'Qualified', 'Lost', 'Converted'],
        default: 'Not Contacted'
    },

    // Zoho CRM sync fields
    zohoLeadId: { type: String, default: '' },
    zohoSyncStatus: {
        type: String,
        enum: ['pending', 'synced', 'failed', 'skipped'],
        default: 'pending'
    },
    zohoSyncError: { type: String, default: '' },

    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Lead', leadSchema);