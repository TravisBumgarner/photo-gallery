import crypto from 'node:crypto';
import { Router } from 'express';

export const router = Router();

router.post('/auth/login', (req, res) => {
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

  // Constant-time comparison to prevent timing attacks
  const passwordBuffer = Buffer.from(password);
  const appPasswordBuffer = Buffer.from(appPassword);

  const isValid =
    passwordBuffer.length === appPasswordBuffer.length &&
    crypto.timingSafeEqual(passwordBuffer, appPasswordBuffer);

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
    res.clearCookie('connect.sid');
    res.json({ authenticated: false });
  });
});

router.get('/auth/check', (req, res) => {
  res.json({ authenticated: req.session?.authenticated === true });
});
