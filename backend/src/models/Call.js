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
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Call', callSchema);