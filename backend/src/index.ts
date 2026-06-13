import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import { router as authRouter } from './routes/auth.js';
import { router as dogsRouter } from './routes/dogs.js';
import { router as peopleRouter } from './routes/people.js';
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
const allowedOrigins = config.CORS_ORIGIN.split(',').map((o) => o.trim());
app.use(
  cors({
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json());
app.use(
  compression({
    filter: (req, _res) => {
      // Only compress API responses, not already-compressed images
      if (
        req.path.startsWith('/images') ||
        req.path.startsWith('/thumbnails')
      ) {
        return false;
      }
      return compression.filter(req, _res);
    },
  }),
);

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

// Serve static files (protected) with immutable caching.
// CORP override: helmet's default `same-origin` blocks embedding from other origins
// (e.g. the frontend dev server on a different port). These are public media URLs,
// so `cross-origin` is appropriate.
const staticCacheOptions = { maxAge: '1y', immutable: true };
const allowCrossOriginEmbed = (
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
};
app.use(
  '/images',
  allowCrossOriginEmbed,
  express.static(path.join(__dirname, '../public/images'), staticCacheOptions),
);
app.use(
  '/thumbnails',
  allowCrossOriginEmbed,
  express.static(
    path.join(__dirname, '../public/thumbnails'),
    staticCacheOptions,
  ),
);

// Routes (protected)
app.use('/api', photosRouter);
app.use('/api', peopleRouter);
app.use('/api', dogsRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
