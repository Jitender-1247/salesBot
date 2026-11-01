import express from 'express';
import Product from '../models/Product.js';
import { objectIdParam } from '../utils/validate.js';
import { publicWidgetConfig } from '../agent/persona.js';
import { hasOnlineAgents } from '../call/liveAgents.js';

const router = express.Router();
router.param('productId', objectIdParam);

// Public route — persona, nudges and handover config for the widget.
// 1-on-1 chat works before exploration finishes, so readiness is reported rather than enforced.
router.get('/:productId', async (req, res) => {
    try {
        const product = await Product.findById(req.params.productId)
            .select('name clientId explorationStatus knowledgeMap.productSummary persona nudges handover');

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        res.json({
            ...publicWidgetConfig(product, { humanAvailable: hasOnlineAgents(product.clientId.toString()) }),
            ready: product.explorationStatus === 'ready'
        });
    } catch (err) {
        console.error('Embed route error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
