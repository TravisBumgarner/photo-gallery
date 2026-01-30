import express from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { router as apiRouter } from './routes/api.js';
import { router as photosRouter } from './routes/photos.js';
import { router as authRouter } from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.PORT;

// Trust reverse proxy (NearlyFreeSpeech runs Node behind a proxy)
app.set('trust proxy', 1);

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
}));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 60 * 1000, // 30 minutes
    },
}));

// Health check (before auth)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (before requireAuth)
app.use('/api', authRouter);

// Serve frontend static assets in production (before auth barrier so login page is accessible)
if (process.env.NODE_ENV === 'production') {
    const frontendDir = path.join(__dirname, '../frontend-dist');
    app.use(express.static(frontendDir));

    // SPA catch-all: serve index.html for any non-API/asset route
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/images') || req.path.startsWith('/thumbnails') || req.path === '/health') {
            return next();
        }
        res.sendFile(path.join(frontendDir, 'index.html'));
    });
}

// Auth barrier — everything below requires authentication
app.use(requireAuth);

// Serve static files (protected)
app.use('/images', express.static(path.join(__dirname, '../public/images')));
app.use('/thumbnails', express.static(path.join(__dirname, '../public/thumbnails')));

// Routes (protected)
app.use('/api', apiRouter);
app.use('/api', photosRouter);

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
