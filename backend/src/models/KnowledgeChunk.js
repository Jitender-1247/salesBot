import mongoose from 'mongoose';

/**
 * One retrievable passage of a product's knowledge (RAG).
 *   page     — full text of an explored page (written by the explorer)
 *   document — a document the merchant added (text / URL / file)
 *   map      — a knowledge-map page summary (features, talking points, FAQs)
 *   extra    — the product's "extra knowledge" text
 *   catalog  — one shoppable catalog item (sourceId = SKU)
 */
const knowledgeChunkSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sourceType: { type: String, enum: ['page', 'document', 'map', 'extra', 'catalog'], required: true },
    sourceId: { type: String, default: '' },
    title: { type: String, default: '' },
    url: { type: String, default: '' },
    text: { type: String, required: true },
    // Optional semantic vector (only when an embedding provider is configured)
    embedding: { type: [Number], default: undefined },
    embeddingModel: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

knowledgeChunkSchema.index({ productId: 1, sourceType: 1 });

export default mongoose.model('KnowledgeChunk', knowledgeChunkSchema);
