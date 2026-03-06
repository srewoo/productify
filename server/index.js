/**
 * Productify — Backend Server (index.js)
 * Express API: /transcribe, /process, /process/refine, /intents, /library, /health
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { transcribeRoute } from './routes/transcribe.js';
import { processRoute, refineRoute } from './routes/process.js';
import { intentsRoute } from './routes/intents.js';
import { libraryRoute } from './routes/library.js';
import { healthRoute } from './routes/health.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORS ──
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow Chrome extensions and configured origins
    if (!origin || origin.startsWith('chrome-extension://') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (process.env.NODE_ENV !== 'production') {
      callback(null, true); // Allow all in dev
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-openai-key', 'x-google-stt-key', 'Authorization']
}));

// ── BODY PARSING ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── RATE LIMITING ──
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '60'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});
app.use(limiter);

// ── AUTH MIDDLEWARE ──
app.use(authMiddleware);

// ── ROUTES ──
app.get('/health', healthRoute);
app.get('/intents', intentsRoute);
app.post('/transcribe', transcribeRoute);
app.post('/process', processRoute);
app.post('/process/refine', refineRoute);
app.use('/library', libraryRoute);

// ── ERROR HANDLER ──
app.use(errorHandler);

// ── START ──
app.listen(PORT, () => {
  console.log(`\n🚀 Productify backend running on http://localhost:${PORT}`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   API model: BYOK (Bring Your Own Key)\n`);
});

export default app;
