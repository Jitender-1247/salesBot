import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Client from '../models/Client.js';
import { JWT_ALGORITHM } from '../utils/authMiddleware.js';

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt ignores bytes beyond 72

// Used to keep login timing the same whether or not the email exists (prevents account enumeration)
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-real-password', 12);

const signToken = (clientId) => jwt.sign(
    { clientId },
    process.env.JWT_SECRET,
    { expiresIn: '7d', algorithm: JWT_ALGORITHM }
);

const publicClient = (client) => ({
    id: client._id,
    name: client.name,
    email: client.email,
    plan: client.plan
});

// Register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body || {};

        if (typeof name !== 'string' || !name.trim() || name.length > 100) {
            return res.status(400).json({ message: 'Please enter your name (max 100 characters)' });
        }
        if (typeof email !== 'string' || email.length > 320 || !EMAIL_RE.test(email.trim())) {
            return res.status(400).json({ message: 'Please enter a valid email address' });
        }
        if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
            return res.status(400).json({ message: `Password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters` });
        }

        const cleanEmail = email.trim();
        const existing = await Client.findOne({ email: cleanEmail });
        if (existing) {
            return res.status(400).json({ message: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const client = await Client.create({
            name: name.trim(),
            email: cleanEmail,
            password: hashedPassword
        });

        res.status(201).json({
            message: 'Account created successfully',
            token: signToken(client._id),
            client: publicClient(client)
        });

    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (typeof email !== 'string' || typeof password !== 'string' || !email || !password || email.length > 320 || password.length > 1024) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const client = await Client.findOne({ email: email.trim() });
        const isMatch = await bcrypt.compare(password, client ? client.password : DUMMY_HASH);

        if (!client || !isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        res.json({
            message: 'Login successful',
            token: signToken(client._id),
            client: publicClient(client)
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
