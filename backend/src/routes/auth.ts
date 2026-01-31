import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

export const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

router.post('/auth/login', loginLimiter, (req, res) => {
  const { password } = req.body;
  const appPassword = process.env.APP_PASSWORD;

  if (!appPassword) {
    res.status(500).json({ error: 'APP_PASSWORD not configured' });
    return;
  }

  if (typeof password !== 'string') {
    res.status(400).json({ error: 'Password is required' });
    return;
  }

  // Hash both values to normalize length, then constant-time compare
  const passwordHash = crypto.createHash('sha256').update(password).digest();
  const appPasswordHash = crypto
    .createHash('sha256')
    .update(appPassword)
    .digest();

  const isValid = crypto.timingSafeEqual(passwordHash, appPasswordHash);

  if (isValid) {
    req.session.authenticated = true;
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to logout' });
      return;
    }
    res.clearCookie('__session');
    res.json({ authenticated: false });
  });
});

router.get('/auth/check', (req, res) => {
  res.json({ authenticated: req.session?.authenticated === true });
});
