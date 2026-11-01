import express from 'express';
import Product from '../models/Product.js';
import Call from '../models/Call.js';
import Lead from '../models/Lead.js';
import { encrypt, decryptIfEncrypted } from '../utils/encryption.js';
import { exploreProduct } from '../explorer/index.js';
import { protect } from '../utils/authMiddleware.js';
import { checkUrl } from '../utils/urlSafety.js';
import { optionalString, objectIdParam } from '../utils/validate.js';
import { INDUSTRY_PRESETS, DEFAULT_VOICES } from '../agent/persona.js';
import { isRecordingConfigured } from '../call/recording.js';

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

// ── Agent settings: persona, catalog, nudges, handover, recording ──

const MAX_CATALOG_ITEMS = 200;
const isHttpUrl = (s) => {
  try { return ['http:', 'https:'].includes(new URL(s).protocol); } catch { return false; }
};
const urlOrEmpty = (v) => {
  const s = optionalString(v, 2048);
  return s === null || (s && !isHttpUrl(s)) ? null : s;
};
const boundedNumber = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Validate the settings body; returns { update } or { error }. Absent sections are left untouched. */
function parseAgentConfig(body) {
  const update = {};

  if (body.persona !== undefined) {
    const p = body.persona || {};
    const persona = {
      name: optionalString(p.name, 60),
      role: optionalString(p.role, 80),
      industry: INDUSTRY_PRESETS[p.industry] ? p.industry : 'saas',
      keyframePersonaSlug: optionalString(p.keyframePersonaSlug, 200),
      keyframePersonaId: optionalString(p.keyframePersonaId, 200),
      voiceProvider: DEFAULT_VOICES[p.voiceProvider] ? p.voiceProvider : 'deepgram',
      voiceId: optionalString(p.voiceId, 120),
      posterImage: urlOrEmpty(p.posterImage),
      accentColor: optionalString(p.accentColor, 20),
      greeting: optionalString(p.greeting, 500),
      tone: optionalString(p.tone, 1000),
      goals: optionalString(p.goals, 1000),
      language: optionalString(p.language, 10)
    };
    const bad = Object.entries(persona).find(([, v]) => v === null);
    if (bad) return { error: `Persona field "${bad[0]}" is invalid or too long` };
    if (persona.accentColor && !/^#[0-9a-fA-F]{3,8}$/.test(persona.accentColor)) {
      return { error: 'Accent color must be a hex value like #7c3aed' };
    }
    if (persona.voiceId && !/^[A-Za-z0-9_.\-]+$/.test(persona.voiceId)) {
      return { error: 'Voice ID may only contain letters, numbers, dots, dashes and underscores' };
    }
    update.persona = persona;
  }

  if (body.catalog !== undefined) {
    if (!Array.isArray(body.catalog) || body.catalog.length > MAX_CATALOG_ITEMS) {
      return { error: `Catalog must be a list of at most ${MAX_CATALOG_ITEMS} items` };
    }
    const seen = new Set();
    const catalog = [];
    for (const [i, raw] of body.catalog.entries()) {
      const item = raw || {};
      const sku = optionalString(item.sku, 80);
      const name = optionalString(item.name, 200);
      if (!sku || !name) return { error: `Catalog item ${i + 1} needs a SKU and a name` };
      if (seen.has(sku)) return { error: `Duplicate SKU "${sku}" in catalog` };
      seen.add(sku);
      const parsed = {
        sku,
        name,
        description: optionalString(item.description, 1000),
        currency: optionalString(item.currency, 8) || 'USD',
        image: urlOrEmpty(item.image),
        url: urlOrEmpty(item.url),
        ctaLabel: optionalString(item.ctaLabel, 40) || 'View product',
        price: item.price === '' || item.price === null || item.price === undefined ? null : Number(item.price),
        tags: Array.isArray(item.tags) ? item.tags.filter(t => typeof t === 'string').map(t => t.trim().slice(0, 40)).filter(Boolean).slice(0, 20) : []
      };
      if ([parsed.description, parsed.image, parsed.url].includes(null)) {
        return { error: `Catalog item "${sku}" has an invalid description, image or URL (use http/https links)` };
      }
      if (parsed.price !== null && (!Number.isFinite(parsed.price) || parsed.price < 0)) {
        return { error: `Catalog item "${sku}" has an invalid price` };
      }
      catalog.push(parsed);
    }
    update.catalog = catalog;
  }

  if (body.nudges !== undefined) {
    const n = body.nudges || {};
    const rules = Array.isArray(n.urlRules) ? n.urlRules.slice(0, 20) : [];
    const nudges = {
      enabled: n.enabled !== false,
      message: optionalString(n.message, 200),
      delaySeconds: boundedNumber(n.delaySeconds, 0, 600, 8),
      scrollPercent: boundedNumber(n.scrollPercent, 0, 100, 0),
      exitIntent: Boolean(n.exitIntent),
      exitMessage: optionalString(n.exitMessage, 200),
      autoOpen: Boolean(n.autoOpen),
      urlRules: rules.map(r => ({
        urlContains: optionalString(r?.urlContains, 200),
        message: optionalString(r?.message, 200)
      }))
    };
    if (nudges.message === null || nudges.exitMessage === null || nudges.urlRules.some(r => r.urlContains === null || r.message === null)) {
      return { error: 'A nudge message or URL rule is invalid or too long' };
    }
    nudges.urlRules = nudges.urlRules.filter(r => r.urlContains && r.message);
    update.nudges = nudges;
  }

  if (body.handover !== undefined) {
    const h = body.handover || {};
    update.handover = {
      mode: ['off', 'ai_first', 'human_first'].includes(h.mode) ? h.mode : 'ai_first',
      waitSeconds: boundedNumber(h.waitSeconds, 10, 300, 45)
    };
  }

  if (body.recordingEnabled !== undefined) update.recordingEnabled = Boolean(body.recordingEnabled);

  return { update };
}

// Industry presets + default voices for the persona editor
router.get('/meta/persona-options', protect, (req, res) => {
  res.json({
    industries: Object.entries(INDUSTRY_PRESETS).map(([key, p]) => ({ key, ...p })),
    defaultVoices: DEFAULT_VOICES,
    recordingAvailable: isRecordingConfigured()
  });
});

router.patch('/:id/config', protect, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, clientId: req.clientId });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const { update, error } = parseAgentConfig(req.body || {});
    if (error) return res.status(400).json({ message: error });

    const saved = await Product.findByIdAndUpdate(product._id, update, { new: true, runValidators: true })
      .select('persona catalog nudges handover recordingEnabled');
    res.json(saved);
  } catch (err) {
    console.error('Save agent config error:', err);
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
