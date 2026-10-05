import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initSocket } from './socket/index.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import callRoutes from './routes/calls.js';
import embedRoutes from './routes/embed.js';
import avatarRoutes from './routes/avatar.js';
import didStreamRoutes from './routes/did-stream.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const app = express();
const server = createServer(app);

// CORS — in production, only allow listed frontend origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:5174'];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. Postman, mobile apps, same-server requests)
        if (!origin) return callback(null, true);
        // In development, allow all
        if (process.env.NODE_ENV !== 'production') return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true
}));

// Allow microphone in iframes
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'microphone=*, camera=*');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
});
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(express.json());

// Rate limiting — protect public API routes from abuse under high traffic
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 100, // limit each IP to 100 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again shortly.' }
});
app.use('/api/', apiLimiter);

// Serve public folder (agent.js + test.html)
app.use(express.static(join(__dirname, '../public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/embed', embedRoutes);
app.use('/api/avatar', avatarRoutes);
app.use('/api/did-stream', didStreamRoutes);

// Test route
app.get('/', (req, res) => {
    res.json({ message: 'SalesBot backend running!' });
});

// Init Socket.IO
initSocket(server);

// Connect to MongoDB with connection pooling for high traffic
mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 50,                // Allow up to 50 concurrent connections (default: 5)
    serverSelectionTimeoutMS: 5000, // Fail fast if DB is unreachable
    socketTimeoutMS: 45000,         // Close sockets after 45s of inactivity
})
    .then(() => console.log('✅ MongoDB connected (pool: 50)'))
    .catch(err => console.log('❌ MongoDB error:', err));

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});