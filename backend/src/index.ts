import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import { router as apiRouter } from './routes/api.js';
import { router as authRouter } from './routes/auth.js';
import { router as photosRouter } from './routes/photos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.PORT;

// Trust reverse proxy (NearlyFreeSpeech runs Node behind a proxy)
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// Middleware
app.use(
  cors({
    origin: config.CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(express.json());
app.use(compression({ filter: (req, _res) => {
  // Only compress API responses, not already-compressed images
  if (req.path.startsWith('/images') || req.path.startsWith('/thumbnails')) {
    return false;
  }
  return compression.filter(req, _res);
}}));

app.use(
  session({
    name: '__session',
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      maxAge: 30 * 60 * 1000, // 30 minutes
    },
  }),
);

// Health check (before auth)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (before requireAuth)
app.use('/api', authRouter);

// Serve frontend static assets in production (before auth barrier so login page is accessible)
if (config.NODE_ENV === 'production') {
  const frontendDir = path.join(__dirname, '../frontend-dist');
  app.use(express.static(frontendDir));

  // SPA catch-all: serve index.html for any non-API/asset route
  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/images') ||
      req.path.startsWith('/thumbnails') ||
      req.path === '/health'
    ) {
      return next();
    }
    res.sendFile(path.join(frontendDir, 'index.html'));
  });
}

// Auth barrier — everything below requires authentication
app.use(requireAuth);

// Serve static files (protected) with immutable caching
const staticCacheOptions = { maxAge: '1y', immutable: true };
app.use('/images', express.static(path.join(__dirname, '../public/images'), staticCacheOptions));
app.use(
  '/thumbnails',
  express.static(path.join(__dirname, '../public/thumbnails'), staticCacheOptions),
);

// Routes (protected)
app.use('/api', apiRouter);
app.use('/api', photosRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
