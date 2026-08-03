import express from 'express';
import Product from '../models/Product.js';
import Call from '../models/Call.js';
import Lead from '../models/Lead.js';
import { encrypt } from '../utils/encryption.js';
import { exploreProduct } from '../explorer/index.js';
import { protect } from '../utils/authMiddleware.js';

const router = express.Router();

// Submit a new product
router.post('/', protect, async (req, res) => {
  try {
    const { name, url, email, password, extraKnowledge } = req.body;

    const product = await Product.create({
      clientId: req.clientId,
      name,
      url,
      credentials: {
        email: encrypt(email),
        password: encrypt(password)
      },
      extraKnowledge: extraKnowledge || '',
      explorationStatus: 'pending'
    });

    // explore in background
    exploreProduct(product._id).catch(err =>
      console.log('Background exploration error:', err.message)
    );

    res.status(201).json({
      message: 'Product submitted — exploration started',
      productId: product._id,
      status: 'exploring'
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get all products for this client
router.get('/', protect, async (req, res) => {
  try {
    const products = await Product.find({ clientId: req.clientId })
      .select('-credentials -knowledgeMap');
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get exploration status
router.get('/:id/status', protect, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      clientId: req.clientId
    }).select('name explorationStatus knowledgeMap.productSummary knowledgeMap.pages');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({
      status: product.explorationStatus,
      productSummary: product.knowledgeMap?.productSummary,
      pagesExplored: product.knowledgeMap?.pages?.length || 0
    });

  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Get full product with knowledge map
router.get('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      clientId: req.clientId
    }).select('-credentials');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// Delete a product (bot) — cascades to its calls and leads
router.delete('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      clientId: req.clientId
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await Call.deleteMany({ productId: product._id, clientId: req.clientId });
    await Lead.deleteMany({ productId: product._id, clientId: req.clientId });
    await Product.deleteOne({ _id: product._id });

    res.json({ message: 'Bot removed successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;