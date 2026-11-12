import mongoose from 'mongoose';

/** A document the merchant added to a product's knowledge base (kept so the index can be rebuilt). */
const knowledgeDocumentSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    title: { type: String, required: true },
    kind: { type: String, enum: ['text', 'url', 'file'], default: 'text' },
    sourceUrl: { type: String, default: '' },
    text: { type: String, required: true },
    chars: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('KnowledgeDocument', knowledgeDocumentSchema);
