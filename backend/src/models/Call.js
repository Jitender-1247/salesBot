import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'agent'], required: true },
  content: { type: String, required: true },
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

  prospectEmail: { type: String, default: '' },
  prospectName: { type: String, default: '' },

  status: {
    type: String,
    enum: ['active', 'completed', 'failed'],
    default: 'active'
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