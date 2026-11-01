import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  // 'agent' = AI persona, 'human' = live specialist who took over the call
  role: { type: String, enum: ['user', 'agent', 'human'], required: true },
  content: { type: String, required: true },
  author: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
});

const callSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  roomUrl: String,
  messages: [messageSchema],
  transcript: { type: String, default: '' },
  language: { type: String, default: 'en' },
  duration: { type: Number, default: 0 },
  summary: { type: String, default: '' },

  // Lead qualification
  qualified: { type: Boolean, default: false },
  qualificationReason: { type: String, default: '' },

  // Visitor satisfaction (inferred from transcript at call end)
  satisfaction: {
    type: String,
    enum: ['positive', 'neutral', 'negative', 'unknown'],
    default: 'unknown'
  },
  satisfactionReason: { type: String, default: '' },

  // Buying temperature graded from the transcript at call end
  leadScore: {
    type: String,
    enum: ['hot', 'warm', 'cold', 'unknown'],
    default: 'unknown'
  },
  leadScoreReason: { type: String, default: '' },

  // Commerce attribution: catalog items the agent showed, and which ones the visitor clicked
  productsShown: [String],
  productClicks: [{
    sku: String,
    at: { type: Date, default: Date.now }
  }],

  // Human handover
  handover: {
    requested: { type: Boolean, default: false },
    requestedAt: Date,
    reason: { type: String, default: '' },
    outcome: {
      type: String,
      enum: ['none', 'accepted', 'timeout', 'unavailable', 'cancelled'],
      default: 'none'
    },
    agentName: { type: String, default: '' },
    acceptedAt: Date
  },

  // LiveKit Egress recording (when enabled for the product and storage is configured)
  recording: {
    egressId: { type: String, default: '' },
    url: { type: String, default: '' },
    status: { type: String, enum: ['none', 'recording', 'completed', 'failed'], default: 'none' }
  },

  prospectEmail: { type: String, default: '' },
  prospectName: { type: String, default: '' },

  status: {
    type: String,
    enum: ['active', 'completed', 'failed'],
    default: 'active'
  },

  // Session mode: 'demo' (live browser walkthrough) or 'chat' (1-on-1 avatar conversation)
  mode: {
    type: String,
    enum: ['demo', 'chat'],
    default: 'demo'
  },

  // Why the session ended (for analytics & resource tracking)
  endReason: {
    type: String,
    enum: ['user', 'max_duration', 'inactive', 'disconnect', 'error'],
    default: 'user'
  },

  createdAt: { type: Date, default: Date.now }
});

// Compound indexes for high-traffic query performance
callSchema.index({ clientId: 1, status: 1, createdAt: -1 });
callSchema.index({ productId: 1, createdAt: -1 });

export default mongoose.model('Call', callSchema);