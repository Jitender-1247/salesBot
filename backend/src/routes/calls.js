import express from 'express';
import Call from '../models/Call.js';
import Lead from '../models/Lead.js';
import { protect } from '../utils/authMiddleware.js';

const router = express.Router();

// Get all calls with filters
router.get('/', protect, async (req, res) => {
    try {
        const { language, qualified, productId, startDate, endDate } = req.query;
        let query = { clientId: req.clientId };

        if (language) query.language = language;
        if (qualified !== undefined) query.qualified = qualified === 'true';
        if (productId) query.productId = productId;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const calls = await Call.find(query)
            .populate('productId', 'name url')
            .sort({ createdAt: -1 });

        res.json(calls);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Analytics endpoint
router.get('/analytics', protect, async (req, res) => {
    try {
        const { productId } = req.query;
        const filter = { clientId: req.clientId };
        if (productId) filter.productId = productId;

        const calls = await Call.find(filter);

        const totalCalls = calls.length;
        const completedCalls = calls.filter(c => c.status === 'completed');
        const incompleteCalls = calls.filter(c => c.status !== 'completed');
        const qualifiedCalls = calls.filter(c => c.qualified);
        const avgDuration = completedCalls.length > 0
            ? Math.floor(completedCalls.reduce((sum, c) => sum + c.duration, 0) / completedCalls.length)
            : 0;
        const conversionRate = totalCalls > 0
            ? Math.round((qualifiedCalls.length / totalCalls) * 100)
            : 0;

        // Visitor satisfaction breakdown (sensed from the transcript at call end)
        const satisfactionMap = { positive: 0, neutral: 0, negative: 0, unknown: 0 };
        calls.forEach(c => {
            const label = c.satisfaction || 'unknown';
            satisfactionMap[label] = (satisfactionMap[label] || 0) + 1;
        });

        // Calls per day last 7 days
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const count = calls.filter(c => {
                return new Date(c.createdAt).toISOString().split('T')[0] === dateStr;
            }).length;
            last7Days.push({
                date: date.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }),
                count
            });
        }

        // Language breakdown
        const languageMap = {};
        calls.forEach(c => {
            const lang = c.language || 'en';
            languageMap[lang] = (languageMap[lang] || 0) + 1;
        });
        const languages = Object.entries(languageMap)
            .map(([language, count]) => ({ language, count }))
            .sort((a, b) => b.count - a.count);

        res.json({
            totalCalls,
            completedCalls: completedCalls.length,
            incompleteCalls: incompleteCalls.length,
            qualifiedLeads: qualifiedCalls.length,
            avgDuration,
            conversionRate,
            callsPerDay: last7Days,
            languages,
            satisfaction: satisfactionMap
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Export CSV
router.get('/export', protect, async (req, res) => {
    try {
        const { productId } = req.query;
        const filter = { clientId: req.clientId };
        if (productId) filter.productId = productId;

        const calls = await Call.find(filter)
            .populate('productId', 'name');

        const headers = [
            'Date', 'Product', 'Prospect Name', 'Prospect Email',
            'Duration (s)', 'Language', 'Qualified', 'Status', 'Messages Count'
        ];

        const rows = calls.map(c => [
            new Date(c.createdAt).toLocaleDateString(),
            c.productId?.name || '',
            c.prospectName || '',
            c.prospectEmail || '',
            c.duration || 0,
            c.language || 'en',
            c.qualified ? 'Yes' : 'No',
            c.status,
            c.messages?.length || 0
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(val => `"${val}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=salesbot-sessions.csv');
        res.send(csv);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Get single call with transcript
router.get('/leads/all', protect, async (req, res) => {
    try {
        const { productId } = req.query;
        const filter = { clientId: req.clientId };
        if (productId) filter.productId = productId;

        const leads = await Lead.find(filter)
            .populate('productId', 'name')
            .sort({ createdAt: -1 });
        res.json(leads);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Get single call detail
router.get('/:id', protect, async (req, res) => {
    try {
        const call = await Call.findOne({
            _id: req.params.id,
            clientId: req.clientId
        }).populate('productId', 'name url');

        if (!call) return res.status(404).json({ message: 'Call not found' });
        res.json(call);
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

export default router;