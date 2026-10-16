import express from 'express';
import Product from '../models/Product.js';
import Call from '../models/Call.js';
import Lead from '../models/Lead.js';
import { encrypt, decryptIfEncrypted } from '../utils/encryption.js';
import { exploreProduct } from '../explorer/index.js';
import { protect } from '../utils/authMiddleware.js';
import { checkUrl } from '../utils/urlSafety.js';
import { optionalString, objectIdParam } from '../utils/validate.js';

const router = express.Router();
router.param('id', objectIdParam);

const MAX_COOKIES_LENGTH = 100_000;
const MAX_KNOWLEDGE_LENGTH = 20_000;

// Session cookies are a live login for the customer's product: store them encrypted.
const encryptCookies = (cookies) => (cookies ? encrypt(cookies) : '');

async function validateDemoStartUrl(demoStartUrl, productUrl) {
  if (!demoStartUrl) return null;
  const reason = await checkUrl(demoStartUrl);
  if (reason) return `Demo start URL: ${reason}`;
  if (new URL(demoStartUrl).origin !== new URL(productUrl).origin) {
    return 'Demo start URL must be on the same site as the product URL';
  }
  return null;
}

// Submit a new product
router.post('/', protect, async (req, res) => {
  try {
    const body = req.body || {};
    const name = optionalString(body.name, 200);
    const url = optionalString(body.url, 2048);
    const email = optionalString(body.email, 320);
    const password = optionalString(body.password, 500);
    const extraKnowledge = optionalString(body.extraKnowledge, MAX_KNOWLEDGE_LENGTH);
    const sessionCookies = optionalString(body.sessionCookies, MAX_COOKIES_LENGTH);
    const demoStartUrl = optionalString(body.demoStartUrl, 2048);

    if ([name, url, email, password, extraKnowledge, sessionCookies, demoStartUrl].includes(null)) {
      return res.status(400).json({ message: 'One or more fields are invalid or too long' });
    }
    if (!name || !url) {
      return res.status(400).json({ message: 'Name and URL are required' });
    }

    const urlProblem = await checkUrl(url);
    if (urlProblem) return res.status(400).json({ message: `Product URL: ${urlProblem}` });
    const startProblem = await validateDemoStartUrl(demoStartUrl, url);
    if (startProblem) return res.status(400).json({ message: startProblem });

    const product = await Product.create({
      clientId: req.clientId,
      name,
      url,
      credentials: {
        email: email ? encrypt(email) : '',
        password: password ? encrypt(password) : ''
      },
      sessionCookies: encryptCookies(sessionCookies),
      demoStartUrl,
      extraKnowledge,
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
    console.error('Create product error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all products for this client
router.get('/', protect, async (req, res) => {
  try {
    const products = await Product.find({ clientId: req.clientId })
      .select('-credentials -knowledgeMap -sessionCookies');
    res.json(products);
  } catch (err) {
    console.error('List products error:', err);
    res.status(500).json({ message: 'Server error' });
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
    console.error('Product status error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Save session cookies + demo start URL (bypasses login automation)
router.patch('/:id/session', protect, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, clientId: req.clientId });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const body = req.body || {};
    const sessionCookies = optionalString(body.sessionCookies, MAX_COOKIES_LENGTH);
    const demoStartUrl = optionalString(body.demoStartUrl, 2048);
    if (sessionCookies === null || demoStartUrl === null) {
      return res.status(400).json({ message: 'One or more fields are invalid or too long' });
    }

    const update = {};
    if (body.sessionCookies !== undefined) update.sessionCookies = encryptCookies(sessionCookies);
    if (body.demoStartUrl !== undefined) {
      const startProblem = await validateDemoStartUrl(demoStartUrl, product.url);
      if (startProblem) return res.status(400).json({ message: startProblem });
      update.demoStartUrl = demoStartUrl;
    }

    await Product.findByIdAndUpdate(product._id, update);
    res.json({ message: 'Session saved successfully' });
  } catch (err) {
    console.error('Save session error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get full product with knowledge map (owner only)
router.get('/:id', protect, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      clientId: req.clientId
    }).select('-credentials');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const obj = product.toObject();
    obj.sessionCookies = decryptIfEncrypted(obj.sessionCookies || '');
    res.json(obj);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Re-trigger exploration (retry after failure)
router.post('/:id/explore', protect, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      clientId: req.clientId
    });

    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Reset status to exploring
    await Product.findByIdAndUpdate(product._id, {
      explorationStatus: 'exploring',
      'knowledgeMap.productSummary': '',
      'knowledgeMap.pages': []
    });

    // Fire exploration in background
    exploreProduct(product._id).catch(err =>
      console.log('Retry exploration error:', err.message)
    );

    res.json({ message: 'Exploration re-triggered', status: 'exploring' });
  } catch (err) {
    console.error('Retry exploration error:', err);
    res.status(500).json({ message: 'Server error' });
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
    console.error('Delete product error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
