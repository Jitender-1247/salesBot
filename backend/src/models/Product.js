import mongoose from 'mongoose';

const pageSchema = new mongoose.Schema({
  name: String,
  url: String,
  description: String,
  keyFeatures: [String],
  talkingPoints: [String],
  commonQuestions: [String],
  demoTip: String,
  howToReach: String,
  screenshot: String
});

// Shoppable item the agent can show as a card during a call
const catalogItemSchema = new mongoose.Schema({
  sku: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  price: { type: Number, default: null },
  currency: { type: String, default: 'USD' },
  image: { type: String, default: '' },
  url: { type: String, default: '' },
  ctaLabel: { type: String, default: 'View product' },
  tags: [String]
}, { _id: false });

// The AI agent's identity: face (Keyframe persona), voice and conversational style
const personaSchema = new mongoose.Schema({
  name: { type: String, default: 'Sofia' },
  role: { type: String, default: 'AI Sales Specialist' },
  industry: { type: String, default: 'saas' },
  keyframePersonaSlug: { type: String, default: '' },
  keyframePersonaId: { type: String, default: '' },
  voiceProvider: { type: String, enum: ['deepgram', 'elevenlabs', 'openai'], default: 'deepgram' },
  voiceId: { type: String, default: '' },
  posterImage: { type: String, default: '' },
  accentColor: { type: String, default: '' },
  greeting: { type: String, default: '' },
  tone: { type: String, default: '' },
  goals: { type: String, default: '' },
  language: { type: String, default: 'en' }
}, { _id: false });

// Proactive engagement ("Strike"): when the bubble nudges or auto-opens on the host page
const nudgeRuleSchema = new mongoose.Schema({
  urlContains: { type: String, default: '' },
  message: { type: String, default: '' }
}, { _id: false });

const nudgesSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  message: { type: String, default: '' },
  delaySeconds: { type: Number, default: 8 },
  scrollPercent: { type: Number, default: 0 },
  exitIntent: { type: Boolean, default: false },
  exitMessage: { type: String, default: '' },
  autoOpen: { type: Boolean, default: false },
  urlRules: [nudgeRuleSchema]
}, { _id: false });

// Human-in-the-loop: AI first with human escalation, or human first with AI as backup
const handoverSchema = new mongoose.Schema({
  mode: { type: String, enum: ['off', 'ai_first', 'human_first'], default: 'ai_first' },
  waitSeconds: { type: Number, default: 45 }
}, { _id: false });

// Known way to reach an in-page feature (a tab, a button that opens a panel/dialog, a link):
// recorded while exploring the product, or learned when a live demo click worked.
const routeSchema = new mongoose.Schema({
  name: { type: String, required: true },      // what the agent sees, e.g. "Enterprise (tab on Pricing)"
  pageUrl: { type: String, required: true },   // page the control lives on
  role: { type: String, default: '' },         // ARIA role used to find it again (tab, button, link…)
  label: { type: String, required: true },     // its accessible name
  toUrl: { type: String, default: '' },        // where it led, if it navigated
  source: { type: String, enum: ['explored', 'learned'], default: 'explored' },
  uses: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const productSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  name: { type: String, required: true },
  url: { type: String, required: true },
  credentials: {
    email: { type: String, default: '' },
    password: { type: String, default: '' }
  },
  extraKnowledge: { type: String, default: '' },
  knowledgeMap: {
    productSummary: String,
    extraKnowledge: String,
    suggestedDemoFlow: [{
      step: Number,
      page: String,
      talkingPoint: String
    }],
    loginSteps: {
      emailSelector: String,
      passwordSelector: String,
      submitSelector: String
    },
    pages: [pageSchema]
  },
  sessionCookies: { type: String, default: '' }, // JSON array of cookies for bypassing login
  demoStartUrl: { type: String, default: '' },     // URL to navigate to after login (overrides product.url)
  persona: { type: personaSchema, default: () => ({}) },
  catalog: [catalogItemSchema],
  nudges: { type: nudgesSchema, default: () => ({}) },
  handover: { type: handoverSchema, default: () => ({}) },
  recordingEnabled: { type: Boolean, default: false },
  routes: [routeSchema],
  explorationStatus: {
    type: String,
    enum: ['pending', 'exploring', 'ready', 'failed'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

// Compound indexes for high-traffic query performance
productSchema.index({ clientId: 1, explorationStatus: 1 });

export default mongoose.model('Product', productSchema);