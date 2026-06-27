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

// Security headers. Relax the CSP enough to serve the bundled Expo web build:
// it ships an inline bootstrap <script> and inline styles, loads fonts/images
// as data: URIs, and media may be redirected to an https CDN/bucket. Drop
// upgrade-insecure-requests so serving over http://localhost isn't broken.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        upgradeInsecureRequests: null,
      },
    },
  }),
);

// Middleware
// CORS is only needed in local dev, where the Expo web dev server (Metro, on a
// different origin/port) calls this backend. In production the backend serves the
// web build from its own origin, so requests are same-origin and CORS is omitted.
// Reflect the request origin (origin: true) rather than '*' so credentialed
// (cookie) requests are allowed.
if (config.NODE_ENV !== 'production') {
  app.use(cors({ origin: true, credentials: true }));
}
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
    // Slide the expiry on every response so an active user is never logged out
    // mid-use. Safe to keep long here: single user, self-hosted, and the server
    // is read-only at runtime — a leaked cookie can only view, never mutate.
    // (Sessions still reset on a backend restart: the default in-memory store is
    // intentional — a persistent store would write at runtime.)
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // 'auto' (with trust proxy) = secure only when actually served over
      // https. NODE_ENV=production was wrong: it dropped the cookie when serving
      // the gallery over http://localhost, so login never stuck (401 after login).
      secure: 'auto',
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
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

// Media — served straight from the file:// storage dir. The frontend always
// loads `${api}/images/<file>` and `${api}/thumbnails/<file>`.
const mediaRoot = config.STORAGE_URL?.startsWith('file://')
  ? config.STORAGE_URL.slice('file://'.length)
  : path.join(__dirname, '../public'); // legacy local layout

for (const dir of ['images', 'thumbnails']) {
  app.use(
    `/${dir}`,
    allowCrossOriginEmbed,
    express.static(path.join(mediaRoot, dir), staticCacheOptions),
  );
}

// Routes (protected)
app.use('/api', photosRouter);
app.use('/api', peopleRouter);
app.use('/api', dogsRouter);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
