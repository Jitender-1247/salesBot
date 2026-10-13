import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from './models/Product.js';

dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const products = await Product.find({}).lean();
    console.log('PRODUCTS_FOUND_COUNT:', products.length);
    for (const p of products) {
        console.log(`PRODUCT: id=${p._id} name=${p.name} status=${p.explorationStatus} summary=${p.knowledgeMap?.productSummary?.substring(0, 40)}`);
    }
    process.exit(0);
}

run().catch(console.error);
