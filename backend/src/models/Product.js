import mongoose from 'mongoose';

const pageSchema = new mongoose.Schema({
  name: String,
  url: String,
  description: String,
  keyFeatures: [String],
  howToReach: String,
  screenshot: String
});

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
    loginSteps: {
      emailSelector: String,
      passwordSelector: String,
      submitSelector: String
    },
    pages: [pageSchema]
  },
  sessionCookies: { type: String, default: '' }, // JSON array of cookies for bypassing login
  demoStartUrl: { type: String, default: '' },     // URL to navigate to after login (overrides product.url)
  explorationStatus: {
    type: String,
    enum: ['pending', 'exploring', 'ready', 'failed'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Product', productSchema);