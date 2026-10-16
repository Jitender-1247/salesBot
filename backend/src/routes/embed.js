import express from 'express';
import Product from '../models/Product.js';
import { objectIdParam } from '../utils/validate.js';

const router = express.Router();
router.param('productId', objectIdParam);

// Public route — get product info for widget
router.get('/:productId', async (req, res) => {
    try {
        const product = await Product.findById(req.params.productId)
            .select('name explorationStatus knowledgeMap.productSummary');

        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        if (product.explorationStatus !== 'ready') {
            return res.status(400).json({ message: 'Product not ready yet' });
        }

        res.json({
            productId: product._id,
            name: product.name,
            summary: product.knowledgeMap?.productSummary
        });
    } catch (err) {
        console.error('Embed route error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;