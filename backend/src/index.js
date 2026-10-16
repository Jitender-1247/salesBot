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
import { assertEncryptionKey } from './utils/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

// ── Fail fast on missing / weak security config ──
const isProduction = process.env.NODE_ENV === 'production';
const configErrors = [];
if (!process.env.JWT_SECRET) configErrors.push('JWT_SECRET is not set');
else if (isProduction && process.env.JWT_SECRET.length < 32) configErrors.push('JWT_SECRET must be at least 32 characters in production');
try { assertEncryptionKey(); } catch (e) { configErrors.push(e.message); }
if (!process.env.MONGODB_URI) configErrors.push('MONGODB_URI is not set');
if (configErrors.length) {
    console.error('❌ Refusing to start — fix backend/.env:\n  - ' + configErrors.join('\n  - '));
    process.exit(1);
}

const app = express();
const server = createServer(app);

// Behind nginx (same host or Docker bridge), trust X-Forwarded-For only from private-network
// proxies. Without this, every visitor shares nginx's IP and one abuser rate-limits everyone.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');

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
// D-ID streaming sends base64 audio; everything else is small JSON
app.use('/api/did-stream', express.json({ limit: '10mb' }));
app.use(express.json({ limit: '200kb' }));

// Rate limiting — protect public API routes from abuse under high traffic
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute window
    max: 100, // limit each IP to 100 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again shortly.' }
});
app.use('/api/', apiLimiter);

// Brute-force protection for login / signup
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { message: 'Too many attempts. Please wait 15 minutes and try again.' }
});
app.use('/api/auth/', authLimiter);

// Public routes that spend money on third-party APIs (D-ID)
const paidApiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again shortly.' }
});
app.use('/api/avatar', paidApiLimiter);
app.use('/api/did-stream', paidApiLimiter);

// Serve public folder (agent.js + test.html)
app.use(express.static(join(__dirname, '../public')));
app.use('/widget3', express.static(join(__dirname, '../../frontend/widget3/dist')));
app.use('/widget2', express.static(join(__dirname, '../../frontend/widget2/dist')));

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

// Unknown API routes → JSON 404
app.use('/api/', (req, res) => res.status(404).json({ message: 'Not found' }));

// Central error handler: never leak stack traces or internals to clients
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' });
    if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request body too large' });
    if (err.message?.startsWith('CORS:')) return res.status(403).json({ message: 'Origin not allowed' });
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Server error' });
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