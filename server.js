import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import habitsHandler from './api/habits.js';
import goalsHandler from './api/goals.js';
import trackingHandler from './api/tracking.js';
import dashboardHandler from './api/dashboard.js';
import reportsHandler from './api/reports.js';
import remindersHandler from './api/reminders.js';
import milestonesHandler from './api/milestones.js';
import achievementsHandler from './api/achievements.js';
import heatmapHandler from './api/heatmap.js';
import digestHandler from './api/digest.js';
import pushSubscribeHandler from './api/push-subscribe.js';
import pushSendHandler from './api/push-send.js';
import learningHandler from './api/learning.js';
import accountHandler from './api/account.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || process.env.API_PORT || 3001;

// ── Security Headers Middleware ──────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ── Strict Body Size Limit (Prevent Memory Exhaustion DoS) ───────────────────
app.use(express.json({ limit: '100kb' }));

// ── Route-Level In-Memory Rate Limiter ────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 120;

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || req.path === '/api/health') {
    return next();
  }
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.startTime > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return next();
  }

  record.count++;
  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ error: 'Too many requests — please slow down' });
  }

  next();
});

// Clean up stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now - record.startTime > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

function wrap(handler) {
  return (req, res) => handler(req, res);
}

app.all('/api/health',         (req, res) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() }));
app.all('/api/habits',         wrap(habitsHandler));
app.all('/api/goals',          wrap(goalsHandler));
app.all('/api/tracking',       wrap(trackingHandler));
app.all('/api/dashboard',      wrap(dashboardHandler));
app.all('/api/reports',        wrap(reportsHandler));
app.all('/api/reminders',      wrap(remindersHandler));
app.all('/api/milestones',     wrap(milestonesHandler));
app.all('/api/achievements',   wrap(achievementsHandler));
app.all('/api/heatmap',        wrap(heatmapHandler));
app.all('/api/digest',         wrap(digestHandler));
app.all('/api/push-subscribe', wrap(pushSubscribeHandler));
app.all('/api/push-send',      wrap(pushSendHandler));
app.all('/api/learning',       wrap(learningHandler));
app.all('/api/learning/*',     wrap(learningHandler));
app.all('/api/account',        wrap(accountHandler));

// The AI module is absent and its implementation cannot be established from
// the project sources. Do not expose a route that would make startup fail or
// pretend to provide incomplete AI behavior.

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// JSON body limit error handler
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large — maximum body size is 100kb' });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
